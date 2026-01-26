import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { showToast } from '@/utils/toast'

export function usePointCloudRenderer(container) {
  // 定义场景，相机，渲染器
  let scene, camera, renderer, controls, animationId
  let pointsGeometry // 存储点云几何体
  let pointsMaterial
  let pointCloud // THREE.Points 对象
  // 全局：记录当前点云的 Y 范围（用于动态归一化）
  let globalMinY = Infinity
  let globalMaxY = -Infinity

  // === 新增：预分配上限和计数器 ===
  const MAX_POINTS = 100_000
  let currentPointCount = 0

  // 初始化
  const init = () => {

    // 移动端：降低渲染质量保流畅
    const pixelRatio = Math.min(window.devicePixelRatio, 2) // 最多 2x，避免过耗电

    // 场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a1a)

    // 相机（FOV 稍大，适合手机）
    camera = new THREE.PerspectiveCamera(
      70, // 更宽视角
      container.clientWidth / container.clientHeight,
      0.1,
      200 // 缩短远裁剪面，提升性能  200
    )
    // 50  0  0
    camera.position.set(50, 0, 0)
    // camera.position.set(0, 5, 20)
    camera.lookAt(0, 0, 0)

    // 渲染器
    renderer = new THREE.WebGLRenderer({
      antialias: false, // 移动端关闭抗锯齿（性能优先）
      alpha: true
    })
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    // Canvas画布插入到HTML元素中
    container.appendChild(renderer.domElement)

    // === 修改：预分配最大 buffer ===
    const positions = new Float32Array(MAX_POINTS * 3)
    const colors = new Float32Array(MAX_POINTS * 3) // 使用 Float32Array 避免驱动问题

    // 点云几何体(形状和材质)
    pointsGeometry = new THREE.BufferGeometry()
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
    pointsMaterial = new THREE.PointsMaterial({
      size: 0.3,  // 0.3
      // color: 0x00ffff,  // 固定颜色
      vertexColors: true,   // 使用 geometry 中的 color attribute
      sizeAttenuation: true // 远小近大
    })
    pointCloud = new THREE.Points(pointsGeometry, pointsMaterial)
    scene.add(pointCloud)

    // 坐标轴（红=X右，绿=Y上，蓝=Z后） （缩小，避免遮挡）
    const axesHelper = new THREE.AxesHelper(10)
    scene.add(axesHelper)

    // 网格（更稀疏）
    const gridHelper = new THREE.GridHelper(40, 20, 0x444444, 0x222222)
    gridHelper.position.y = -10
    scene.add(gridHelper)

    // 简单灯光（无阴影）
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    // 触摸控制（支持双指缩放、单指旋转）
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.screenSpacePanning = false
    controls.minDistance = 5
    controls.maxDistance = 160
    // 移动端优化：禁用右键/滚轮
    controls.enableZoom = true
    // controls.enablePan = false // 禁用平移，避免误触

    // 启动渲染循环
    animate()
  }
  // 更新全局 Y 范围（增量式）
  const updateYRange = (newPoints) => {
    for (const p of newPoints) {
      if (p.y < globalMinY) globalMinY = p.y
      if (p.y > globalMaxY) globalMaxY = p.y
    }
  }
  // 根据 Y 值(高度)生成颜色（归一化到 [0,1] 后映射到彩虹色）
  const getColorByHeight = (y) => {
    // 防止除零
    if (globalMinY === globalMaxY) {
      return { r: 0.5, g: 0.5, b: 0.5 } // 灰色
    }

    // 归一化 y 到 [0, 1]
    let t = (y - globalMinY) / (globalMaxY - globalMinY)
    t = Math.max(0, Math.min(1, t)) // clamp
    // 对应高度  地面-> 矮柜 -> 桌面 -> 开关 -> 天花板
    // 彩虹渐变：蓝  -> 青   -> 绿   -> 黄 -> 红
    let r, g, b
    if (t < 0.25) {
      // 蓝 -> 青
      r = 0
      g = t * 4
      b = 1
    } else if (t < 0.5) {
      // 青 -> 绿
      r = 0
      g = 1
      b = 1 - (t - 0.25) * 4
    } else if (t < 0.75) {
      // 绿 -> 黄
      r = (t - 0.5) * 4
      g = 1
      b = 0
    } else {
      // 黄 -> 红
      r = 1
      g = 1 - (t - 0.75) * 4
      b = 0
    }

    return { r, g, b }
  }

  // === 修改：改为增量写入，不再重建 buffer ===
  const addPoints = (newPoints) => {
    try {
      if (!pointsGeometry || newPoints.length === 0) return

      if (currentPointCount + newPoints.length > MAX_POINTS) {
        showToast(`点云数量已达上限  $ {MAX_POINTS} 点`)
        return
      }

      // 1. 更新全局 Y 范围
      updateYRange(newPoints)

      // 2. 获取预分配数组（直接写入！）
      const posArr = pointsGeometry.attributes.position.array // Float32Array
      const colArr = pointsGeometry.attributes.color.array     // Float32Array

      let offset = currentPointCount * 3

      // 3. 写入新点（直接操作 array）
      for (let i = 0; i < newPoints.length; i++) {
        const p = newPoints[i]
        posArr[offset] = p.x
        posArr[offset + 1] = p.y
        posArr[offset + 2] = p.z

        const color = getColorByHeight(p.y)
        colArr[offset] = color.r     // 直接存 [0,1]，因为 color 是 Float32Array
        colArr[offset + 1] = color.g
        colArr[offset + 2] = color.b

        offset += 3
      }

      // 4. 更新状态
      currentPointCount += newPoints.length

      // 5. 标记需要更新（Three.js 会增量上传）
      pointsGeometry.attributes.position.needsUpdate = true
      pointsGeometry.attributes.color.needsUpdate = true

      // 6. 只渲染有效点
      pointsGeometry.setDrawRange(0, currentPointCount)

    } catch (err) {
      console.error('addPoints 失败:', err)
      showToast('点云数据异常')
    }
  }

  // === 修改：重置只改 drawRange，不重建 buffer ===
  const resetPointCloud = () => {
    currentPointCount = 0
    globalMinY = Infinity
    globalMaxY = -Infinity
    pointsGeometry.setDrawRange(0, 0) // 关键：不渲染任何点
    // 不要调用 setAttribute！
  }

  // 限制帧率（节省电量）
  let lastFrameTime = 0
  const TARGET_FPS = 30
  const FRAME_INTERVAL = 1000 / TARGET_FPS // 30 FPS
  const animate = () => {
    animationId = requestAnimationFrame((time) => {
      try {
        if (time - lastFrameTime >= FRAME_INTERVAL) {
          controls.update() // 必须调用 damping
          renderer.render(scene, camera)
          lastFrameTime = time
        }
      } catch (err) {
        console.error('渲染循环崩溃:', err)
        showToast('3D 渲染异常，请重启应用')
        return // 停止循环
      }
      animate()
    })
  }

  const dispose = () => {
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
    if (renderer) {
      container.removeChild(renderer.domElement)
      renderer.dispose()
    }
    if (controls) {
      controls.dispose()
    }
    // 清理 geometry/material
    if (pointsGeometry) pointsGeometry.dispose()
    if (pointsMaterial) pointsMaterial.dispose()
  }

  const onResize = () => {
    if (!camera || !renderer || container.clientWidth <= 0 || container.clientHeight <= 0) return
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
    if (animationId) {
      console.log(animationId)
    }
  }
  return {
    init,
    addPoints,
    TARGET_FPS,
    resetPointCloud,
    dispose,
    onResize
  }
}
