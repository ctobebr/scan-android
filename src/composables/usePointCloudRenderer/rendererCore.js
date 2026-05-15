/**
 * @fileoverview 渲染核心模块
 * 负责场景初始化、渲染循环和点云添加
 *
 * 性能优化版本：
 * - 支持俯视相机配置
 * - 优化视锥剔除参数
 * - 添加相机外部配置接口
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
   * 支持外部传入相机位置和视角配置
   */
  function init(customCameraConfig = null) {
    const pixelRatio = Math.min(window.devicePixelRatio, config.pixelRatioMax)

    // 场景
    scene = new THREE.Scene()
    scene.background = null

    // 相机参数
    const cameraFov = config.cameraFov || 60
    const cameraNear = config.cameraNear || 0.1
    const cameraFar = config.cameraFar || 200

    camera = new THREE.PerspectiveCamera(
      cameraFov,
      container.clientWidth / container.clientHeight,
      cameraNear,
      cameraFar,
    )

    // ========== 关键：处理俯视相机配置 ==========
    if (customCameraConfig && customCameraConfig.position) {
      // 使用传入的俯视相机配置
      const { x = 0, y = 80, z = 0 } = customCameraConfig.position
      camera.position.set(x, y, z)

      const { x: tx = 0, y: ty = 0, z: tz = 0 } = customCameraConfig.target || {}
      camera.lookAt(tx, ty, tz)

      console.log(`[RendererCore] ✅ 俯视相机配置已应用: 位置(${x}, ${y}, ${z})`)
    } else {
      // 默认相机位置（向后兼容）
      camera.position.set(50, 0, 0)
      camera.lookAt(0, 0, 0)
      console.log(
        '[RendererCore] ⚠️ 使用默认相机位置（未收到俯视配置）',
        JSON.stringify(customCameraConfig),
      )
    }

    camera.updateProjectionMatrix()

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
    controls.screenSpacePanning = true
    controls.enableZoom = true
    controls.enablePan = true

    // ========== 应用控制器限制 ==========
    if (customCameraConfig?.controls) {
      controls.minDistance = customCameraConfig.controls.minDistance || 20
      controls.maxDistance = customCameraConfig.controls.maxDistance || 120
      controls.maxPolarAngle = customCameraConfig.controls.maxPolarAngle || Math.PI / 2.2
      logger.info('✅使用自定义设置', JSON.stringify(customCameraConfig.controls))
    } else {
      controls.minDistance = 4
      controls.maxDistance = 100
      controls.maxPolarAngle = Math.PI / 2
      logger.info('⚠️使用通用相机设置设置', JSON.stringify(customCameraConfig))
    }
    // // 初始相机高度20米，缩放范围控制为初始的两倍：10米-40米
    // controls.minDistance = 10 // 最近距离10米（初始的1/2）
    // controls.maxDistance = 40 // 最远距离40米（初始的2倍）
    // controls.maxPolarAngle = Math.PI / 2

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

      // 前置检查 WebGL 上下文有效性
      if (!isWebGLContextValid()) {
        logger.error('[addPoints] WebGL 上下文已失效，跳过添加')
        showToast({ message: '3D 渲染上下文丢失，请刷新页面', position: 'bottom' })
        return
      }

      // 首次添加时添加到场景
      if (currentPointCount === 0 && !scene.children.includes(pointCloud)) {
        scene.add(pointCloud)
      }

      if (currentPointCount + newPoints.length > config.maxPoints) {
        logger.warn('Point limit reached', {
          current: currentPointCount,
          incoming: newPoints.length,
          max: config.maxPoints,
        })
        showToast({ message: `点云数量已达上限 ${config.maxPoints} 点`, position: 'bottom' })
        return
      }
      bufferManager.ensureCapacity(newPoints.length, currentPointCount)
      colorCalculator.updateYRange(newPoints)

      // 扩容后必须重新获取 geometry.attributes，因为 BufferAttribute 已被替换
      const positionAttr = geometry.attributes.position
      const colorAttr = geometry.attributes.color
      const posArr = positionAttr.array
      const colArr = colorAttr.array
      let offset = currentPointCount * 3

      for (let i = 0; i < newPoints.length; i++) {
        const p = newPoints[i]
        posArr[offset] = p.x
        posArr[offset + 1] = p.y
        posArr[offset + 2] = p.z

        // 如果点数据包含自定义颜色，则使用自定义颜色，否则根据高度计算颜色
        if (p.r !== undefined && p.g !== undefined && p.b !== undefined) {
          colArr[offset] = p.r
          colArr[offset + 1] = p.g
          colArr[offset + 2] = p.b
        } else {
          const color = colorCalculator.getColorByHeight(p.y)
          colArr[offset] = color.r
          colArr[offset + 1] = color.g
          colArr[offset + 2] = color.b
        }

        offset += 3
      }

      currentPointCount += newPoints.length

      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true
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

      if (controls) {
        controls.update()
      }

      if (needsRender) {
        renderer.render(scene, camera)
        needsRender = false
      }

      lastFrameTime = time
    } catch (err) {
      const gl = renderer ? renderer.getContext() : null
      const glError = gl ? gl.getError() : 'N/A'
      logger.error('[animate] 渲染循环崩溃', {
        errorName: err?.name,
        errorMessage: err?.message,
        errorStack: err?.stack,
        currentPointCount,
        webglError: glError,
        sceneChildren: scene ? scene.children.length : 'N/A',
        geometryCount: pointCloud?.geometry?.attributes?.position?.count,
        drawRange: pointCloud?.geometry?.drawRange,
      })
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

  /**
   * 设置相机位置（外部调用）
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} z - Z坐标
   */
  function setCameraPosition(x, y, z) {
    if (camera) {
      camera.position.set(x, y, z)
      camera.lookAt(0, 0, 0)
      markNeedsRender()
    }
  }

  /**
   * 设置控制器目标
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} z - Z坐标
   */
  function setControlsTarget(x, y, z) {
    if (controls) {
      controls.target.set(x, y, z)
      controls.update()
      markNeedsRender()
    }
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
    setCameraPosition,
    setControlsTarget,
  }
}
