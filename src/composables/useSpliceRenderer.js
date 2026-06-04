/**
 * @fileoverview 手动拼接专用 Three.js 渲染器
 * 包含：双模型渲染（固定/可移动）、正交相机、
 * 水平调整（正方形盒子平移+旋转）和高度调整（Y轴移动）两种模式
 *
 * 架构：
 *   scene
 *   ├── fixedGroup            (固定模型：其他站位合并点云)
 *   ├── pivotGroup            (旋转/平移枢轴，锚点位置)
 *   │   ├── moveableGroup     (可移动模型：选中锚点站位点云)
 *   │   └── squareGroup       (正方形盒子+旋转icon，与模型同步旋转)
 *   └── anchorSprite          (锚点 Sprite，跟随平移但不跟随旋转)
 *
 * 旋转中心：pivotGroup 的世界位置 = 锚点位置
 * - 平移时移动 pivotGroup.position，squareGroup 和 moveableGroup 自动跟随
 * - 旋转时旋转 pivotGroup.rotation.y，squareGroup 和 moveableGroup 同步旋转
 * - 锚点 Sprite 位置由 syncAnchorPosition 同步到 pivotGroup.position（不旋转）
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * 创建手动拼接渲染器
 * @param {HTMLElement} container - 渲染容器
 * @param {Object} options - 配置选项
 * @param {number} options.anchorBid - 锚点站位编号
 * @returns {Object} 渲染器控制接口
 */
export function useSpliceRenderer(container, options = {}) {
  const anchorBid = options.anchorBid || 1
  console.log('[SpliceRenderer] 初始化渲染器, anchorBid:', anchorBid)

  // ==================== 核心对象 ====================
  let scene, camera, renderer, orbitControls
  let animationId = null

  // 模型
  let fixedGroup = null       // 固定模型组（其他站位）
  let pivotGroup = null       // 旋转/平移枢轴（锚点位置）
  let moveableGroup = null    // 可移动模型组（选中锚点站位，pivotGroup 的子节点）
  let moveablePoints = null   // 可移动模型的点云对象

  // 正方形盒子相关（水平模式）
  let squareGroup = null
  let squareEdges = null
  let squarePlane = null
  let rotationIcon = null
  let anchorSprite = null     // 锚点 Sprite（不跟随旋转）

  // 模式
  let currentMode = 'horizontal'
  const SQUARE_SIZE = 3.0

  // 动画
  let isAnimating = false
  let animStartPos = new THREE.Vector3()
  let animEndPos = new THREE.Vector3()
  let animStartTarget = new THREE.Vector3()
  let animEndTarget = new THREE.Vector3()
  let animDuration = 800
  let animStartTime = 0

  // 旋转状态
  let isRotating = false
  let rotateStartAngle = 0
  let pivotStartRotationY = 0
  let rotationCenter = new THREE.Vector3()

  // 拖动状态（水平模式）
  let isDragging = false
  let dragStartPoint = new THREE.Vector3()
  let pivotStartPos = new THREE.Vector3()

  // 高度模式位置记录
  let currentHeightX = 0
  let currentHeightZ = 0

  // 初始位姿（用于计算相对偏移量）
  const _initialPose = { position: new THREE.Vector3(), rotationY: 0 }

  // 射线检测
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  // 事件处理器引用（用于解绑）
  let onPointerDownDrag = null
  let onPointerMoveDrag = null
  let onPointerUpDrag = null
  let onPointerDownRotate = null
  let onPointerMoveRotate = null
  let onPointerUpRotate = null

  // 高度模式手势状态
  let heightDragging = false
  let heightStartPointerY = 0
  let heightStartModelY = 0
  let onPointerDownHeight = null
  let onPointerMoveHeight = null
  let onPointerUpHeight = null

  // ==================== 初始化场景 ====================

  /**
   * 初始化 Three.js 场景、相机、渲染器、灯光和基础元素
   */
  function initScene() {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1724)

    // 正交相机
    const aspect = container.clientWidth / container.clientHeight
    const frustumSize = 10
    camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000,
    )
    camera.position.set(0, 12, 0)
    camera.lookAt(0, 1.0, 0)

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // 轨道控制器（仅允许缩放）
    orbitControls = new OrbitControls(camera, renderer.domElement)
    orbitControls.enableDamping = true
    orbitControls.dampingFactor = 0.05
    orbitControls.screenSpacePanning = true
    orbitControls.enableRotate = false
    orbitControls.enablePan = false
    orbitControls.enableZoom = true
    orbitControls.zoomSpeed = 0.8

    // 光照
    scene.add(new THREE.AmbientLight(0x404060))
    const dirLight1 = new THREE.DirectionalLight(0xffeedd, 1.0)
    dirLight1.position.set(2, 5, 3)
    scene.add(dirLight1)
    const dirLight2 = new THREE.DirectionalLight(0xccddff, 0.7)
    dirLight2.position.set(-3, 4, -2)
    scene.add(dirLight2)

    // 固定模型组
    fixedGroup = new THREE.Group()
    fixedGroup.name = 'fixedGroup'
    scene.add(fixedGroup)

    // 可移动模型：pivotGroup（枢轴，用于旋转/平移） → moveableGroup（子节点，原点在枢轴处）
    pivotGroup = new THREE.Group()
    pivotGroup.name = 'pivotGroup'
    scene.add(pivotGroup)

    moveableGroup = new THREE.Group()
    moveableGroup.name = 'moveableGroup'
    pivotGroup.add(moveableGroup)
  }

  // ==================== 正方形盒子 ====================

  /**
   * 创建正方形选择框（边框线 + 不可见碰撞平面）
   * @returns {{ line: THREE.Line, plane: THREE.Mesh }}
   */
  function createSquareSelection() {
    const size = SQUARE_SIZE
    const half = size / 2
    const points = [
      new THREE.Vector3(-half, 0, -half),
      new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(half, 0, half),
      new THREE.Vector3(-half, 0, half),
      new THREE.Vector3(-half, 0, -half),
    ]
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00a8ff })
    const line = new THREE.Line(lineGeo, lineMat)

    const planeGeo = new THREE.PlaneGeometry(size, size)
    const planeMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    })
    const plane = new THREE.Mesh(planeGeo, planeMat)
    plane.rotation.x = -Math.PI / 2

    return { line, plane }
  }

  /**
   * 创建旋转操作图标（右上角圆形旋转按钮）
   * @returns {THREE.Group}
   */
  function createRotationIcon() {
    const group = new THREE.Group()
    const geometry = new THREE.CircleGeometry(0.25, 32)

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ff8800'
    ctx.beginPath()
    ctx.arc(64, 64, 60, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(64, 64, 35, 0.8, Math.PI * 1.6)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    const arrowX = 64 + Math.cos(Math.PI * 1.6) * 35
    const arrowY = 64 + Math.sin(Math.PI * 1.6) * 35
    ctx.moveTo(arrowX, arrowY)
    ctx.lineTo(arrowX - 10, arrowY - 15)
    ctx.lineTo(arrowX + 10, arrowY - 10)
    ctx.closePath()
    ctx.fill()

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.userData.isRotationIcon = true
    group.add(mesh)

    // 不可见碰撞区域
    const hitGeometry = new THREE.CircleGeometry(0.5, 32)
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthTest: false,
    })
    const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial)
    hitMesh.rotation.x = -Math.PI / 2
    hitMesh.userData.isRotationIcon = true
    hitMesh.userData.isHitArea = true
    group.add(hitMesh)

    return group
  }

  /**
   * 创建锚点 Sprite，与 pointCloud 页面样式一致
   * 白色圆形 + 蓝色边框 + 黑色数字，不跟随旋转
   * @returns {THREE.Sprite}
   */
  function createAnchorSprite() {
    const bidText = String(anchorBid)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')

    // 白色圆形背景
    ctx.beginPath()
    ctx.arc(128, 128, 112, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    // 蓝色边框（与 pointCloud 一致）
    ctx.strokeStyle = '#2a7aff'
    ctx.lineWidth = 12
    ctx.stroke()

    // 黑色数字
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 96px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(bidText, 128, 128)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(0.8, 0.8, 1)
    console.log('[SpliceRenderer] 创建锚点 Sprite, 编号:', bidText)
    return sprite
  }

  /**
   * 初始化正方形盒子组
   * squareGroup 作为 pivotGroup 的子节点，与模型同步平移和旋转
   */
  function initSquareGroup() {
    squareGroup = new THREE.Group()
    const { line, plane } = createSquareSelection()
    squareEdges = line
    squarePlane = plane
    squareGroup.add(squareEdges)
    squareGroup.add(squarePlane)

    rotationIcon = createRotationIcon()
    const half = SQUARE_SIZE / 2
    rotationIcon.position.set(half, 0.05, half)
    squareGroup.add(rotationIcon)

    // squareGroup 作为 pivotGroup 的子节点：与模型同步平移，旋转时反向旋转保持水平
    pivotGroup.add(squareGroup)

    // 锚点 Sprite 直接添加到场景（不跟随旋转，只跟随平移）
    anchorSprite = createAnchorSprite()
    scene.add(anchorSprite)
  }

  /**
   * 同步锚点 Sprite 位置到 pivotGroup 的世界位置
   * 锚点跟随平移但不跟随旋转（Sprite 始终面向相机）
   */
  function syncAnchorPosition() {
    if (!pivotGroup || !anchorSprite) return
    anchorSprite.position.copy(pivotGroup.position)
    anchorSprite.position.y += 0.05
  }

  // ==================== 点云加载 ====================

  /**
   * 从点数组创建点云对象
   * @param {Array<{x:number, y:number, z:number}>} points - 点数据
   * @param {number} colorHex - 颜色十六进制值
   * @returns {THREE.Points}
   */
  function createPointCloudFromData(points, colorHex = 0x2a7aff) {
    const geometry = new THREE.BufferGeometry()
    const count = points.length
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const baseColor = new THREE.Color(colorHex)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = points[i].x
      positions[i * 3 + 1] = points[i].y
      positions[i * 3 + 2] = points[i].z

      const shade = 0.7 + Math.random() * 0.3
      colors[i * 3] = baseColor.r * shade
      colors[i * 3 + 1] = baseColor.g * shade
      colors[i * 3 + 2] = baseColor.b * shade
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      sizeAttenuation: true,
    })
    return new THREE.Points(geometry, material)
  }

  /**
   * 降采样点云
   * @param {Array<{x:number, y:number, z:number}>} points - 原始点数据
   * @param {number} factor - 采样因子
   * @returns {THREE.Points}
   */
  function createDownsampledCloud(points, factor = 1) {
    const sampled = []
    for (let i = 0; i < points.length; i += factor) {
      sampled.push(points[i])
    }
    return createPointCloudFromData(sampled)
  }

  /**
   * 设置固定模型（其他站位合并点云）
   * @param {Array<{x:number, y:number, z:number}>} points - 点云数据
   */
  function setFixedModel(points) {
    console.log('[SpliceRenderer] setFixedModel 调用, 点数:', points?.length || 0)
    if (fixedGroup) {
      while (fixedGroup.children.length > 0) {
        const child = fixedGroup.children[0]
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
        fixedGroup.remove(child)
      }
    }

    if (!points || points.length === 0) return

    const factor = Math.max(1, Math.floor(points.length / 50000))
    const cloud = createDownsampledCloud(points, factor)
    fixedGroup.add(cloud)
  }

  /**
   * 设置可移动模型（选中锚点站位）
   * 模型点云相对于 pivotGroup 原点放置
   * @param {Array<{x:number, y:number, z:number}>} points - 点云数据
   */
  function setMoveableModel(points) {
    console.log('[SpliceRenderer] setMoveableModel 调用, 点数:', points?.length || 0)
    if (moveableGroup) {
      while (moveableGroup.children.length > 0) {
        const child = moveableGroup.children[0]
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
        moveableGroup.remove(child)
      }
    }

    if (!points || points.length === 0) return

    const factor = Math.max(1, Math.floor(points.length / 30000))
    const cloud = createDownsampledCloud(points, factor)
    cloud.name = 'moveablePoints'
    moveablePoints = cloud
    moveableGroup.add(cloud)

    // 计算模型包围盒中心，将 moveableGroup 偏移使模型中心在 pivotGroup 原点
    const box = new THREE.Box3().setFromObject(cloud)
    const center = box.getCenter(new THREE.Vector3())
    moveableGroup.position.set(-center.x, -center.y, -center.z)

    // pivotGroup 初始位置在原点
    pivotGroup.position.set(0, 0, 0)
    pivotGroup.rotation.set(0, 0, 0)
    squareGroup.rotation.set(0, 0, 0)

    syncAnchorPosition()
    console.log('[SpliceRenderer] 可移动模型中心偏移:', center.toArray().map(v => v.toFixed(3)))
  }

  // ==================== 交互事件 ====================

  /**
   * 设置所有交互事件监听器
   */
  function setupInteractions() {
    const dom = renderer.domElement

    // --- 高度模式：自定义手势拖动 ---
    onPointerDownHeight = (event) => {
      if (currentMode !== 'height' || isAnimating || heightDragging) return

      const rect = dom.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      if (moveableGroup) {
        const targets = []
        moveableGroup.traverse((child) => {
          if (child.isPoints || child.isMesh) targets.push(child)
        })
        const intersects = raycaster.intersectObjects(targets)

        if (intersects.length > 0) {
          heightDragging = true
          heightStartPointerY = event.clientY
          heightStartModelY = pivotGroup.position.y
          currentHeightX = pivotGroup.position.x
          currentHeightZ = pivotGroup.position.z
          orbitControls.enabled = false

          console.log('[SpliceRenderer] 高度拖动开始, 模型起始Y:', heightStartModelY.toFixed(3))

          dom.style.cursor = 'grabbing'
          event.preventDefault()
          event.stopPropagation()
        }
      }
    }

    onPointerMoveHeight = (event) => {
      if (!heightDragging) return

      const rect = dom.getBoundingClientRect()
      const frustumSize = 10
      const worldPerPixel = frustumSize / rect.height
      const pointerDeltaY = heightStartPointerY - event.clientY
      const worldDeltaY = pointerDeltaY * worldPerPixel * 0.5

      const newY = heightStartModelY + worldDeltaY
      pivotGroup.position.y = newY
      pivotGroup.position.x = currentHeightX
      pivotGroup.position.z = currentHeightZ
      pivotGroup.updateMatrixWorld()
      syncAnchorPosition()

      console.log('[SpliceRenderer] 高度拖动中, pointerDelta:', pointerDeltaY.toFixed(1), 'px, worldDelta:', worldDeltaY.toFixed(3), ', 模型Y:', newY.toFixed(3))
    }

    onPointerUpHeight = () => {
      if (!heightDragging) return
      heightDragging = false
      orbitControls.enabled = true
      dom.style.cursor = 'default'
      syncAnchorPosition()
      console.log('[SpliceRenderer] 高度拖动结束, 模型最终Y:', pivotGroup?.position.y.toFixed(3))
    }

    // --- 水平模式：正方形盒子内平移 ---
    onPointerDownDrag = (event) => {
      if (currentMode !== 'horizontal' || isAnimating || isRotating) return

      const rect = dom.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      const intersects = raycaster.intersectObject(squarePlane)
      if (intersects.length > 0) {
        // 排除旋转图标碰撞
        const iconIntersects = raycaster.intersectObjects(rotationIcon.children, true)
        if (iconIntersects.length > 0) return

        isDragging = true
        orbitControls.enabled = false

        dragStartPoint.copy(intersects[0].point)
        pivotStartPos.copy(pivotGroup.position)

        console.log('[SpliceRenderer] 水平拖动开始, 枢轴起始位置:', pivotStartPos.toArray().map(v => v.toFixed(3)))

        dom.style.cursor = 'grabbing'
        event.preventDefault()
        event.stopPropagation()
      }
    }

    onPointerMoveDrag = (event) => {
      if (!isDragging) return

      const rect = dom.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -dragStartPoint.y)
      const target = new THREE.Vector3()

      if (raycaster.ray.intersectPlane(plane, target)) {
        pivotGroup.position.x = pivotStartPos.x + (target.x - dragStartPoint.x)
        pivotGroup.position.z = pivotStartPos.z + (target.z - dragStartPoint.z)
        pivotGroup.updateMatrixWorld()
        syncAnchorPosition()
      }
    }

    onPointerUpDrag = () => {
      if (!isDragging) return
      isDragging = false
      orbitControls.enabled = true
      dom.style.cursor = 'default'
      console.log('[SpliceRenderer] 水平拖动结束, 枢轴最终位置:', pivotGroup?.position.toArray().map(v => v.toFixed(3)))
      syncAnchorPosition()
    }

    // --- 水平模式：旋转（以 pivotGroup 为中心） ---
    onPointerDownRotate = (event) => {
      if (currentMode !== 'horizontal' || isAnimating) return

      const rect = dom.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      if (rotationIcon && squareGroup && squareGroup.visible) {
        const targets = []
        rotationIcon.traverse((child) => {
          if (child.isMesh) targets.push(child)
        })
        const intersects = raycaster.intersectObjects(targets)

        if (intersects.length > 0) {
          isRotating = true
          orbitControls.enabled = false

          // 旋转中心是 pivotGroup 的世界位置
          rotationCenter.copy(pivotGroup.position)

          const planeY = pivotGroup.position.y
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
          const target = new THREE.Vector3()
          if (raycaster.ray.intersectPlane(plane, target)) {
            rotateStartAngle = Math.atan2(target.z - rotationCenter.z, target.x - rotationCenter.x)
          }
          pivotStartRotationY = pivotGroup.rotation.y

          console.log('[SpliceRenderer] 旋转开始, 枢轴起始角度:', (pivotStartRotationY * 180 / Math.PI).toFixed(2), '°')

          dom.style.cursor = 'grabbing'
          event.preventDefault()
          event.stopPropagation()
        }
      }
    }

    onPointerMoveRotate = (event) => {
      if (!isRotating) return

      const rect = dom.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const planeY = rotationCenter.y
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
      const target = new THREE.Vector3()

      if (raycaster.ray.intersectPlane(plane, target)) {
        const currentAngle = Math.atan2(target.z - rotationCenter.z, target.x - rotationCenter.x)
        const delta = rotateStartAngle - currentAngle
        pivotGroup.rotation.y = pivotStartRotationY + delta
        pivotGroup.updateMatrixWorld()
        syncAnchorPosition()
      }
    }

    onPointerUpRotate = () => {
      if (isRotating) {
        isRotating = false
        orbitControls.enabled = true
        dom.style.cursor = 'default'
        console.log('[SpliceRenderer] 旋转结束, 枢轴最终角度:', (pivotGroup?.rotation.y * 180 / Math.PI).toFixed(2), '°')
        syncAnchorPosition()
      }
    }

    // 绑定水平模式事件
    dom.addEventListener('pointerdown', onPointerDownDrag)
    dom.addEventListener('pointermove', onPointerMoveDrag)
    dom.addEventListener('pointerup', onPointerUpDrag)
    dom.addEventListener('pointerleave', onPointerUpDrag)

    enableRotationListeners(true)
  }

  /**
   * 启用/禁用旋转事件监听器
   * @param {boolean} enable - 是否启用
   */
  function enableRotationListeners(enable) {
    const dom = renderer.domElement
    if (enable) {
      dom.addEventListener('pointerdown', onPointerDownRotate)
      dom.addEventListener('pointermove', onPointerMoveRotate)
      dom.addEventListener('pointerup', onPointerUpRotate)
      dom.addEventListener('pointerleave', onPointerUpRotate)
    } else {
      dom.removeEventListener('pointerdown', onPointerDownRotate)
      dom.removeEventListener('pointermove', onPointerMoveRotate)
      dom.removeEventListener('pointerup', onPointerUpRotate)
      dom.removeEventListener('pointerleave', onPointerUpRotate)
      isRotating = false
    }
  }

  /**
   * 启用/禁用高度模式手势事件监听器
   * @param {boolean} enable - 是否启用
   */
  function enableHeightListeners(enable) {
    const dom = renderer.domElement
    if (enable) {
      dom.addEventListener('pointerdown', onPointerDownHeight)
      dom.addEventListener('pointermove', onPointerMoveHeight)
      dom.addEventListener('pointerup', onPointerUpHeight)
      dom.addEventListener('pointerleave', onPointerUpHeight)
    } else {
      dom.removeEventListener('pointerdown', onPointerDownHeight)
      dom.removeEventListener('pointermove', onPointerMoveHeight)
      dom.removeEventListener('pointerup', onPointerUpHeight)
      dom.removeEventListener('pointerleave', onPointerUpHeight)
      heightDragging = false
    }
  }

  // ==================== 模式切换 ====================

  /**
   * 平滑动画相机到目标位置
   * @param {THREE.Vector3} pos - 目标相机位置
   * @param {THREE.Vector3} target - 目标注视点
   * @param {number} duration - 动画时长（毫秒）
   */
  function animateCameraTo(pos, target, duration = 800) {
    isAnimating = true
    animStartPos.copy(camera.position)
    animEndPos.copy(pos)
    animStartTarget.copy(orbitControls.target)
    animEndTarget.copy(target)
    animDuration = duration
    animStartTime = performance.now()
    orbitControls.enabled = false
  }

  /**
   * 更新动画帧（由渲染循环调用）
   */
  function updateAnimation() {
    if (!isAnimating) return
    const now = performance.now()
    const elapsed = now - animStartTime
    let t = Math.min(elapsed / animDuration, 1)
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    camera.position.lerpVectors(animStartPos, animEndPos, t)
    orbitControls.target.lerpVectors(animStartTarget, animEndTarget, t)
    orbitControls.update()

    if (t >= 1) {
      isAnimating = false
      camera.position.copy(animEndPos)
      orbitControls.target.copy(animEndTarget)
      orbitControls.update()
      orbitControls.enabled = true
      applyModeSettings()
    }
  }

  /**
   * 切换调整模式
   * @param {string} mode - 'horizontal' | 'height'
   * @param {boolean} skipAnim - 是否跳过动画
   */
  function setMode(mode, skipAnim = false) {
    console.log('[SpliceRenderer] 切换模式:', mode, 'skipAnim:', skipAnim)
    currentMode = mode

    // 相机以锚点位置为中心，确保锚点显示在画面中间
    const anchorPos = pivotGroup ? pivotGroup.position.clone() : new THREE.Vector3(0, 0, 0)

    let targetPos, targetLook
    if (mode === 'horizontal') {
      targetPos = new THREE.Vector3(anchorPos.x, anchorPos.y + 12, anchorPos.z)
      targetLook = anchorPos.clone()
    } else {
      targetPos = new THREE.Vector3(anchorPos.x, anchorPos.y, anchorPos.z + 12)
      targetLook = anchorPos.clone()
    }

    if (skipAnim) {
      camera.position.copy(targetPos)
      orbitControls.target.copy(targetLook)
      orbitControls.update()
      applyModeSettings()
    } else {
      animateCameraTo(targetPos, targetLook, 800)
    }
  }

  /**
   * 应用当前模式的场景设置
   */
  function applyModeSettings() {
    if (currentMode === 'horizontal') {
      enableHeightListeners(false)
      if (squareGroup) squareGroup.visible = true
      syncAnchorPosition()
      enableRotationListeners(true)
      console.log('[SpliceRenderer] 水平模式已应用')
    } else {
      enableRotationListeners(false)
      if (pivotGroup) {
        currentHeightX = pivotGroup.position.x
        currentHeightZ = pivotGroup.position.z
      }
      if (squareGroup) squareGroup.visible = false
      // 高度模式也显示锚点
      syncAnchorPosition()
      enableHeightListeners(true)
      console.log('[SpliceRenderer] 高度模式已应用, 模型当前XZ: (', currentHeightX.toFixed(3), ',', currentHeightZ.toFixed(3), ')')
    }
  }

  // ==================== 获取变换结果 ====================

  /**
   * 获取可移动模型的当前变换（相对初始位姿的平移 + 旋转Y）
   * @returns {{ position: {x: number, y: number, z: number}, rotationY: number }}
   */
  function getMoveableTransform() {
    if (!pivotGroup) return { position: { x: 0, y: 0, z: 0 }, rotationY: 0 }

    const result = {
      position: {
        x: pivotGroup.position.x - _initialPose.position.x,
        y: pivotGroup.position.y - _initialPose.position.y,
        z: pivotGroup.position.z - _initialPose.position.z,
      },
      rotationY: pivotGroup.rotation.y - _initialPose.rotationY,
    }
    console.log('[SpliceRenderer] getMoveableTransform:', JSON.stringify(result, null, 2))
    return result
  }

  /**
   * 应用初始位姿到 pivotGroup
   * 用于从 global_poses_all.txt 恢复已保存的拼接调整
   * @param {number[][]} pose - 4x4 位姿矩阵
   */
  function applyInitialPose(pose) {
    if (!pivotGroup || !pose) return
    const position = new THREE.Vector3(pose[0][3], pose[1][3], pose[2][3])
    const rotY = Math.atan2(pose[0][2], pose[0][0])
    pivotGroup.position.copy(position)
    pivotGroup.rotation.y = rotY
    pivotGroup.updateMatrixWorld()
    // 记录初始位姿，getMoveableTransform 返回相对此位姿的偏移量
    _initialPose.position.copy(position)
    _initialPose.rotationY = rotY
    syncAnchorPosition()
    console.log('[SpliceRenderer] 应用初始位姿, position:', position.toArray().map(v => v.toFixed(3)), ', rotationY:', (rotY * 180 / Math.PI).toFixed(2), '°')
  }

  /**
   * 检查模型是否被用户移动过（超出阈值则视为有变化）
   * @returns {boolean}
   */
  function hasTransformChanged() {
    const t = getMoveableTransform()
    const eps = 0.001
    return (
      Math.abs(t.position.x) > eps ||
      Math.abs(t.position.y) > eps ||
      Math.abs(t.position.z) > eps ||
      Math.abs(t.rotationY) > eps
    )
  }

  // ==================== 渲染循环 ====================

  /**
   * 启动渲染循环
   */
  function startRenderLoop() {
    function animate() {
      animationId = requestAnimationFrame(animate)
      if (isAnimating) {
        updateAnimation()
      }
      orbitControls.update()
      renderer.render(scene, camera)
    }
    animate()
  }

  // ==================== 窗口大小调整 ====================

  /**
   * 响应窗口大小变化，更新相机和渲染器
   */
  function onResize() {
    if (!container || !camera || !renderer) return
    const aspect = container.clientWidth / container.clientHeight
    const frustumSize = 10
    camera.left = (-frustumSize * aspect) / 2
    camera.right = (frustumSize * aspect) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }

  // ==================== 初始化 ====================

  /**
   * 初始化渲染器：场景、盒子、交互、渲染循环
   */
  function init() {
    initScene()
    initSquareGroup()
    setupInteractions()
    startRenderLoop()
    window.addEventListener('resize', onResize)
  }

  // ==================== 销毁 ====================

  /**
   * 完全销毁渲染器，释放所有资源
   */
  function dispose() {
    window.removeEventListener('resize', onResize)

    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }

    const dom = renderer?.domElement
    if (dom) {
      dom.removeEventListener('pointerdown', onPointerDownDrag)
      dom.removeEventListener('pointermove', onPointerMoveDrag)
      dom.removeEventListener('pointerup', onPointerUpDrag)
      dom.removeEventListener('pointerleave', onPointerUpDrag)
      enableRotationListeners(false)
      enableHeightListeners(false)
    }

    if (orbitControls) {
      orbitControls.dispose()
      orbitControls = null
    }

    if (scene) {
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose()
          obj.material.dispose()
        }
      })
    }

    if (renderer) {
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
      renderer = null
    }

    scene = null
    camera = null
    fixedGroup = null
    pivotGroup = null
    moveableGroup = null
    moveablePoints = null
    squareGroup = null
    squareEdges = null
    squarePlane = null
    rotationIcon = null
    anchorSprite = null
  }

  // ==================== 公开接口 ====================
  return {
    init,
    dispose,
    setFixedModel,
    setMoveableModel,
    setMode,
    getMoveableTransform,
    hasTransformChanged,
    getCurrentMode: () => currentMode,
    applyInitialPose,
    onResize,
  }
}
