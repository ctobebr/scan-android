/**
 * @fileoverview 渲染核心模块
 * 负责场景初始化、渲染循环和点云添加
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { showToast } from 'vant'
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger } from '@/utils/logger'

const logger = createLogger('RendererCore')

/**
 * 创建渲染核心
 * @param {Object} params - 参数对象
 * @param {HTMLElement} params.container - 渲染容器
 * @param {Object} params.config - 配置对象
 * @param {Object} params.bufferManager - 缓冲区管理器
 * @param {Object} params.colorCalculator - 颜色计算器
 * @returns {Object} 渲染核心对象
 */
export function createRendererCore({ container, config, bufferManager, colorCalculator }) {
  let scene = null
  let camera = null
  let renderer = null
  let controls = null
  let pointCloud = null
  let pointsMaterial = null
  let animationId = null
  let currentPointCount = 0

  // 渲染状态
  let lastFrameTime = 0
  let targetFps = config.targetFps
  let frameInterval = 1000 / targetFps
  let needsRender = true

  /**
   * 初始化渲染器
   */
  function init() {
    const pixelRatio = Math.min(window.devicePixelRatio, config.pixelRatioMax)

    // 场景
    scene = new THREE.Scene()
    scene.background = null

    // 相机
    camera = new THREE.PerspectiveCamera(
      config.cameraFov,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    )
    camera.position.set(50, 0, 0)
    camera.lookAt(0, 0, 0)

    // 渲染器
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    // 材质
    pointsMaterial = new THREE.PointsMaterial({
      size: config.pointSize,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: false,
      opacity: 1.0,
    })

    // 点云对象
    const geometry = bufferManager.getGeometry()
    pointCloud = new THREE.Points(geometry, pointsMaterial)
    pointCloud.frustumCulled = true

    // 坐标轴
    const axesHelper = new THREE.AxesHelper(10)
    scene.add(axesHelper)

    // 网格
    const gridHelper = new THREE.GridHelper(40, 20, 0x444444, 0x222222)
    gridHelper.position.y = -10
    scene.add(gridHelper)

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    // 控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.screenSpacePanning = false
    controls.minDistance = 5
    controls.maxDistance = 300
    controls.enableZoom = true

    controls.addEventListener('change', () => {
      markNeedsRender()
    })

    // 启动渲染循环
    animate()
  }

  /**
   * 批量添加点云数据
   * @param {Array} newPoints - 点云数据数组
   */
  function addPoints(newPoints) {
    if (!Array.isArray(newPoints)) {
      logger.error('addPoints: expected array, got', typeof newPoints)
      return
    }

    try {
      if (newPoints.length === 0) return

      const geometry = bufferManager.getGeometry()
      if (!geometry) return

      // 首次添加时添加到场景
      if (currentPointCount === 0 && !scene.children.includes(pointCloud)) {
        scene.add(pointCloud)
      }

      if (currentPointCount + newPoints.length > config.maxPoints) {
        logger.warn('Point limit reached', { current: currentPointCount, incoming: newPoints.length, max: config.maxPoints })
        showToast({ message: `点云数量已达上限 ${config.maxPoints} 点`, position: 'bottom' })
        return
      }

      bufferManager.ensureCapacity(newPoints.length, currentPointCount)
      colorCalculator.updateYRange(newPoints)

      const posArr = geometry.attributes.position.array
      const colArr = geometry.attributes.color.array
      let offset = currentPointCount * 3

      for (let i = 0; i < newPoints.length; i++) {
        const p = newPoints[i]
        posArr[offset] = p.x
        posArr[offset + 1] = p.y
        posArr[offset + 2] = p.z

        const color = colorCalculator.getColorByHeight(p.y)
        colArr[offset] = color.r
        colArr[offset + 1] = color.g
        colArr[offset + 2] = color.b

        offset += 3
      }

      currentPointCount += newPoints.length

      geometry.attributes.position.needsUpdate = true
      geometry.attributes.color.needsUpdate = true
      bufferManager.updateDrawRange(currentPointCount)

      markNeedsRender()
    } catch (err) {
      logger.error('addPoints failed', err)
      showToast({ message: '点云数据异常，请重试', position: 'bottom' })
    }
  }

  /**
   * 重置点云
   */
  function resetPointCloud() {
    if (scene && pointCloud && scene.children.includes(pointCloud)) {
      scene.remove(pointCloud)
    }

    currentPointCount = 0
    colorCalculator.resetYRange()
    bufferManager.reset()

    logger.info('Point cloud reset and removed from scene')
  }

  /**
   * 设置目标帧率
   * @param {number} fps - 目标帧率
   */
  function setTargetFps(fps) {
    if (typeof fps !== 'number' || fps <= 0) return
    targetFps = fps
    frameInterval = 1000 / targetFps
  }

  /**
   * 标记需要重新渲染
   */
  function markNeedsRender() {
    needsRender = true
  }

  /**
   * 检查 WebGL 上下文是否有效
   * @returns {boolean} 上下文是否有效
   */
  function isWebGLContextValid() {
    if (!renderer) return false
    try {
      const gl = renderer.getContext()
      return gl != null && !gl.isContextLost()
    } catch {
      return false
    }
  }

  /**
   * 渲染循环
   */
  function animate() {
    animationId = requestAnimationFrame(animate)

    const time = performance.now()

    if (time - lastFrameTime < frameInterval) {
      return
    }

    try {
      if (!isWebGLContextValid()) {
        logger.error('WebGL context lost')
        showToast({ message: '3D 渲染上下文丢失，请刷新页面', position: 'bottom' })
        if (animationId) {
          cancelAnimationFrame(animationId)
          animationId = null
        }
        return
      }

      controls.update()

      if (needsRender) {
        renderer.render(scene, camera)
        needsRender = false
      }

      lastFrameTime = time
    } catch (err) {
      logger.error('渲染循环崩溃', err)
      showToast({ message: '3D 渲染异常，请重启应用', position: 'bottom' })
      if (animationId) {
        cancelAnimationFrame(animationId)
        animationId = null
      }
    }
  }

  /**
   * 处理窗口大小变化
   */
  function onResize() {
    if (!camera || !renderer || container.clientWidth <= 0 || container.clientHeight <= 0) return
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
    markNeedsRender()
  }

  /**
   * 获取当前点数
   * @returns {number} 当前点数
   */
  function getCurrentPointCount() {
    return currentPointCount
  }

  /**
   * 获取场景对象
   * @returns {THREE.Scene} 场景
   */
  function getScene() {
    return scene
  }

  /**
   * 获取相机对象
   * @returns {THREE.Camera} 相机
   */
  function getCamera() {
    return camera
  }

  /**
   * 获取渲染器对象
   * @returns {THREE.WebGLRenderer} 渲染器
   */
  function getRenderer() {
    return renderer
  }

  /**
   * 获取控制器对象
   * @returns {OrbitControls} 控制器
   */
  function getControls() {
    return controls
  }

  /**
   * 获取点云对象
   * @returns {THREE.Points} 点云
   */
  function getPointCloud() {
    return pointCloud
  }

  /**
   * 获取动画帧ID
   * @returns {number} 动画帧ID
   */
  function getAnimationId() {
    return animationId
  }

  /**
   * 设置动画帧ID
   * @param {number} id - 动画帧ID
   */
  function setAnimationId(id) {
    animationId = id
  }

  return {
    init,
    addPoints,
    resetPointCloud,
    setTargetFps,
    markNeedsRender,
    isWebGLContextValid,
    onResize,
    getCurrentPointCount,
    getScene,
    getCamera,
    getRenderer,
    getControls,
    getPointCloud,
    getAnimationId,
    setAnimationId,
  }
}
