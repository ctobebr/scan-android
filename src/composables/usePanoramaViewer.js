/**
 * @fileoverview 全景照片查看器 Composable
 * 基于 Three.js 的球体映射全景展示方案
 * 参考优秀实现优化：相机微偏移 + OrbitControls
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

/**
 * 创建全景查看器
 * @param {HTMLElement} container - 渲染容器元素
 * @param {Object} [options] - 配置选项
 * @returns {Object} 全景查看器接口
 */
export function usePanoramaViewer(container, options = {}) {
  const config = {
    sphereRadius: 500,
    sphereSegments: 64,
    cameraFov: 75,
    ...options,
  }

  let scene = null
  let camera = null
  let renderer = null
  let sphere = null
  let hotspotGroup = null
  let labelGroup = null
  let cssRenderer = null
  let raycaster = null
  let mouse = null
  let controls = null

  let isInitialized = false
  let currentTexture = null
  let animationId = null
  let hotspotClickCallback = null
  let hotspots = []
  let contextLostHandler = null
  let contextRestoredHandler = null
  let isContextLost = false

  function init() {
    if (isInitialized) return

    console.log('[PanoramaViewer] 初始化开始...')

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050b1a)

    camera = new THREE.PerspectiveCamera(
      config.cameraFov,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 0.01)
    camera.lookAt(0, 0, 0)
    console.log('[PanoramaViewer] 相机位置:', camera.position)

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // 初始化 CSS2DRenderer
    cssRenderer = new CSS2DRenderer()
    cssRenderer.setSize(container.clientWidth, container.clientHeight)
    cssRenderer.domElement.style.position = 'absolute'
    cssRenderer.domElement.style.top = '0'
    cssRenderer.domElement.style.left = '0'
    cssRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(cssRenderer.domElement)

    console.log('[PanoramaViewer] 渲染器创建完成, 尺寸:', container.clientWidth, 'x', container.clientHeight)

    contextLostHandler = (event) => {
      event.preventDefault()
      isContextLost = true
      stopRenderLoop()
      console.log('[PanoramaViewer] WebGL 上下文丢失')
    }
    contextRestoredHandler = () => {
      isContextLost = false
      if (animationId === null && isInitialized) {
        startRenderLoop()
      }
      console.log('[PanoramaViewer] WebGL 上下文已恢复')
    }
    renderer.domElement.addEventListener('webglcontextlost', contextLostHandler)
    renderer.domElement.addEventListener('webglcontextrestored', contextRestoredHandler)

    createSphere()

    hotspotGroup = new THREE.Group()
    scene.add(hotspotGroup)

    labelGroup = new THREE.Group()
    scene.add(labelGroup)

    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()

    initOrbitControls()
    bindEvents()
    startRenderLoop()

    isInitialized = true
    console.log('[PanoramaViewer] 初始化完成')
  }

  function createSphere() {
    const geometry = new THREE.SphereGeometry(config.sphereRadius, config.sphereSegments, config.sphereSegments)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.BackSide,
    })

    sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)
    console.log('[PanoramaViewer] 球体创建完成, 半径:', config.sphereRadius)
  }

  function initOrbitControls() {
    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableZoom = true
    controls.enablePan = false
    controls.zoomSpeed = 0.8
    controls.rotateSpeed = 1.0
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 0.01
    controls.maxDistance = 0.5

    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      controls.rotateSpeed = 1.2
      controls.zoomSpeed = 0.5
    }

    renderer.domElement.style.touchAction = 'none'
  }

  function loadPanorama(url) {
    return new Promise((resolve, reject) => {
      if (!isInitialized) {
        reject(new Error('Viewer not initialized'))
        return
      }

      console.log('[PanoramaViewer] 开始加载纹理:', url)

      const loader = new THREE.TextureLoader()
      loader.setCrossOrigin('anonymous')
      loader.load(
        url,
        (texture) => {
          console.log('[PanoramaViewer] 纹理加载成功:', url.substring(0, 80))
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.ClampToEdgeWrapping
          texture.repeat.set(1, 1)

          if (currentTexture) {
            currentTexture.dispose()
          }

          currentTexture = texture
          sphere.material.map = texture
          sphere.material.needsUpdate = true

          resolve()
        },
        (progress) => {
          if (progress.total) {
            console.log('[PanoramaViewer] 纹理加载进度:', Math.round((progress.loaded / progress.total) * 100), '%')
          }
        },
        (error) => {
          const errorDetail = error
            ? (error.message || error.toString ? error.toString() : JSON.stringify(error))
            : 'unknown'
          console.error('[PanoramaViewer] 纹理加载失败:', url.substring(0, 80), '错误:', errorDetail)
          reject(new Error(`纹理加载失败: ${errorDetail}`))
        }
      )
    })
  }

  function addHotspot(hotspot) {
    const { id, position, label, color = 0xff4444 } = hotspot
    const { theta, phi } = position

    const r = config.sphereRadius * 0.95
    const thetaRad = (theta * Math.PI) / 180
    const phiRad = (phi * Math.PI) / 180

    const x = r * Math.sin(phiRad) * Math.cos(thetaRad)
    const y = r * Math.cos(phiRad)
    const z = r * Math.sin(phiRad) * Math.sin(thetaRad)

    console.log(`[调试] 添加锚点: ${label}, 角度: theta=${theta}°, phi=${phi}°`)

    // 创建透明 Mesh 球体作为点击检测区域
    const geometry = new THREE.SphereGeometry(50, 16, 16)
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.userData = { id, label, color, position: { theta, phi }, type: 'hotspot' }
    hotspotGroup.add(mesh)

    // 创建 CSS2DObject 作为文字标签
    let labelObject = null
    if (label) {
      const div = document.createElement('div')
      div.className = 'hotspot-label'
      div.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
      div.style.color = '#ffffff'
      div.style.padding = '8px 12px'
      div.style.borderRadius = '4px'
      div.style.fontSize = '14px'
      div.style.fontWeight = 'bold'
      div.style.border = `2px solid #${color.toString(16).padStart(6, '0')}`
      div.style.whiteSpace = 'nowrap'
      div.style.pointerEvents = 'none'
      div.textContent = label

      labelObject = new CSS2DObject(div)
      // 计算标签位置（锚点上方 28 单位）
      const labelHeight = 28
      const labelX = x
      const labelY = y + labelHeight
      const labelZ = z
      labelObject.position.set(labelX, labelY, labelZ)
      labelGroup.add(labelObject)
    }

    // 保存锚点信息
    const hotspotInfo = {
      id,
      mesh,
      labelObject
    }
    hotspots.push(hotspotInfo)

    console.log('[PanoramaViewer] 锚点添加完成:', label)
    return hotspotInfo
  }

  function clearHotspots() {
    // 清理 Mesh 球体
    while (hotspotGroup.children.length > 0) {
      const mesh = hotspotGroup.children[0]
      if (mesh.geometry) {
        mesh.geometry.dispose()
      }
      if (mesh.material) {
        mesh.material.dispose()
      }
      hotspotGroup.remove(mesh)
    }

    // 清理 CSS2DObject
    while (labelGroup.children.length > 0) {
      const labelObject = labelGroup.children[0]
      labelGroup.remove(labelObject)
    }

    // 清空锚点数组
    hotspots = []

    console.log('[PanoramaViewer] 锚点已清除')
  }

  function onHotspotClick(callback) {
    hotspotClickCallback = callback
  }

function switchView(target, duration = 1000) {
  const { theta, phi } = target

  // 将角度转换为弧度
  const targetThetaRad = (theta * Math.PI) / 180
  const targetPhiRad = (phi * Math.PI) / 180

  // 计算目标相机位置（球面上的点）
  const radius = 0.5 // 相机到中心的距离
  const targetX = radius * Math.sin(targetPhiRad) * Math.sin(targetThetaRad)
  const targetY = radius * Math.cos(targetPhiRad)
  const targetZ = radius * Math.sin(targetPhiRad) * Math.cos(targetThetaRad)

  // 获取起始相机位置
  const startPos = camera.position.clone()
  const targetPos = new THREE.Vector3(targetX, targetY, targetZ)

  const startTime = Date.now()

  function animate() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased =
      progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2

    // 插值相机位置
    camera.position.lerpVectors(startPos, targetPos, eased)

    // 让相机始终看向中心
    controls.target.set(0, 0, 0)
    controls.update()

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  animate()
}

  function bindEvents() {
    renderer.domElement.addEventListener('click', onMouseClick)
    window.addEventListener('resize', onResize)

    // renderer.domElement.addEventListener('touchstart', (e) => {
    //   e.preventDefault()
    // }, { passive: false })
  }

  function onMouseClick(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    checkHotspotClick()
  }

function checkHotspotClick() {
  raycaster.setFromCamera(mouse, camera)

  // 调试：打印检测到的物体
  const intersects = raycaster.intersectObjects(hotspotGroup.children, true)
  console.log('[调试] 射线检测到的物体数量:', intersects.length)

  if (intersects.length > 0) {
    console.log('[调试] 第一个物体:', JSON.stringify(intersects[0].object.userData))
  }

  if (intersects.length > 0 && hotspotClickCallback) {
    const hotspot = intersects[0].object
    console.log('[PanoramaViewer] 锚点点击:', JSON.stringify(hotspot.userData))
    hotspotClickCallback(hotspot.userData)
  }
}

  function onResize() {
    if (!camera || !renderer) return
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
    if (cssRenderer) {
      cssRenderer.setSize(container.clientWidth, container.clientHeight)
    }
    console.log('[PanoramaViewer] 窗口大小变化:', container.clientWidth, 'x', container.clientHeight)
  }

  function startRenderLoop() {
    function render() {
      animationId = requestAnimationFrame(render)
      if (isContextLost) return
      if (controls && controls.enabled) {
        controls.update()
      }
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
      if (cssRenderer && scene && camera) {
        cssRenderer.render(scene, camera)
      }
    }
    render()
    console.log('[PanoramaViewer] 渲染循环已启动')
  }

  function stopRenderLoop() {
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  function resetView() {
    if (!camera || !controls) return
    camera.position.set(0, 0, 0.01)
    controls.target.set(0, 0, 0)
    controls.update()
    console.log('[PanoramaViewer] 视角已重置')
  }

  function dispose() {
    console.log('[PanoramaViewer] 开始释放资源...')
    stopRenderLoop()
    isInitialized = false

    if (renderer && renderer.domElement) {
      const element = renderer.domElement
      element.removeEventListener('click', onMouseClick)
      if (contextLostHandler) {
        element.removeEventListener('webglcontextlost', contextLostHandler)
        contextLostHandler = null
      }
      if (contextRestoredHandler) {
        element.removeEventListener('webglcontextrestored', contextRestoredHandler)
        contextRestoredHandler = null
      }
    }
    window.removeEventListener('resize', onResize)

    clearHotspots()

    if (currentTexture) {
      currentTexture.dispose()
      currentTexture = null
    }

    if (sphere) {
      sphere.geometry.dispose()
      sphere.material.dispose()
      scene.remove(sphere)
      sphere = null
    }

    if (renderer) {
      try {
        const gl = renderer.getContext()
        if (gl) {
          const loseContextExt = gl.getExtension('WEBGL_lose_context')
          if (loseContextExt) {
            loseContextExt.loseContext()
          }
        }
      } catch (e) {
        console.warn('[PanoramaViewer] 强制丢失上下文失败:', e)
      }
      renderer.dispose()
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      renderer = null
    }

    if (cssRenderer) {
      if (cssRenderer.domElement && cssRenderer.domElement.parentNode) {
        cssRenderer.domElement.parentNode.removeChild(cssRenderer.domElement)
      }
      cssRenderer = null
    }

    if (scene) {
      scene.clear()
      scene = null
    }

    camera = null
    hotspotGroup = null
    labelGroup = null
    raycaster = null
    mouse = null
    controls = null
    isContextLost = false
    console.log('[PanoramaViewer] 资源释放完成')
  }

  return {
    init,
    loadPanorama,
    addHotspot,
    clearHotspots,
    onHotspotClick,
    switchView,
    resetView,
    onResize,
    dispose,
  }
}
