/**
 * @fileoverview 全景照片查看器 Composable
 * 基于 Three.js 的球体映射全景展示方案
 * 参考优秀实现优化：相机微偏移 + OrbitControls
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

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
  let raycaster = null
  let mouse = null
  let controls = null

  let isInitialized = false
  let currentTexture = null
  let animationId = null
  let hotspotClickCallback = null

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

    console.log('[PanoramaViewer] 渲染器创建完成, 尺寸:', container.clientWidth, 'x', container.clientHeight)

    createSphere()

    hotspotGroup = new THREE.Group()
    scene.add(hotspotGroup)

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
      loader.load(
        url,
        (texture) => {
          console.log('[PanoramaViewer] 纹理加载成功:', url)
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
          console.log('[PanoramaViewer] 纹理加载进度:', progress)
        },
        (error) => {
          console.error('[PanoramaViewer] 纹理加载失败:', url, error)
          reject(error)
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

    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')

    ctx.beginPath()
    ctx.arc(32, 32, 28, 0, Math.PI * 2)
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(32, 32, 12, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(material)

    sprite.position.set(x, y, z)
    sprite.scale.set(20, 20, 1)
    sprite.userData = { id, label, type: 'hotspot' }

    hotspotGroup.add(sprite)
    console.log('[PanoramaViewer] 锚点添加完成:', id, '位置:', x, y, z)
    return sprite
  }

  function clearHotspots() {
    while (hotspotGroup.children.length > 0) {
      const sprite = hotspotGroup.children[0]
      if (sprite.material.map) {
        sprite.material.map.dispose()
      }
      sprite.material.dispose()
      hotspotGroup.remove(sprite)
    }
    console.log('[PanoramaViewer] 锚点已清除')
  }

  function onHotspotClick(callback) {
    hotspotClickCallback = callback
  }

  function switchView(target, duration = 1000) {
    const { theta, phi } = target
    const targetThetaRad = (theta * Math.PI) / 180
    const targetPhiRad = (phi * Math.PI) / 180

    const targetY = -targetThetaRad
    const targetX = targetPhiRad - Math.PI / 2

    console.log('[PanoramaViewer] 切换视角到:', theta, phi)

    const startX = camera.rotation.x
    const startY = camera.rotation.y
    const startTime = Date.now()

    function animate() {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2

      camera.rotation.x = startX + (targetX - startX) * eased
      camera.rotation.y = startY + (targetY - startY) * eased

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    animate()
  }

  function bindEvents() {
    renderer.domElement.addEventListener('click', onMouseClick)
    window.addEventListener('resize', onResize)

    renderer.domElement.addEventListener('touchstart', (e) => {
      e.preventDefault()
    }, { passive: false })
  }

  function onMouseClick(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    checkHotspotClick()
  }

  function checkHotspotClick() {
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObjects(hotspotGroup.children)

    if (intersects.length > 0 && hotspotClickCallback) {
      const hotspot = intersects[0].object
      console.log('[PanoramaViewer] 锚点点击:', hotspot.userData)
      hotspotClickCallback(hotspot.userData)
    }
  }

  function onResize() {
    if (!camera || !renderer) return
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
    console.log('[PanoramaViewer] 窗口大小变化:', container.clientWidth, 'x', container.clientHeight)
  }

  function startRenderLoop() {
    function render() {
      animationId = requestAnimationFrame(render)
      if (controls && controls.enabled) {
        controls.update()
      }
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
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

    if (renderer && renderer.domElement) {
      const element = renderer.domElement
      element.removeEventListener('click', onMouseClick)
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
      renderer.dispose()
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      renderer = null
    }

    if (scene) {
      scene.clear()
      scene = null
    }

    camera = null
    hotspotGroup = null
    raycaster = null
    mouse = null
    controls = null
    isInitialized = false
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
