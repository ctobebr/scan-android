/**
 * @fileoverview 点云渲染器主入口
 * 整合所有模块，提供统一的渲染器接口
 */

import { mergeConfig } from './config.js'
import { createColorCalculator } from './colorTable.js'
import { createBufferManager } from './bufferManager.js'
import { createRendererCore } from './rendererCore.js'
import { createResourceManager } from './resourceManager.js'

/**
 * 创建点云渲染器
 * @param {HTMLElement} container - 渲染容器元素
 * @param {Object} [options] - 配置选项
 * @param {number} [options.maxPoints] - 最大点云数量上限
 * @param {number} [options.initialCapacity] - 初始缓冲区容量
 * @param {number} [options.targetFps] - 目标渲染帧率
 * @param {number} [options.pixelRatioMax] - 最大像素比
 * @param {number} [options.cameraFov] - 相机视野角度
 * @param {number} [options.pointSize] - 点云基础大小
 * @returns {Object} 渲染器接口
 */
export function usePointCloudRenderer(container, options = {}) {
  // 合并配置
  const config = mergeConfig(options)

  // 创建颜色计算器
  const colorCalculator = createColorCalculator()

  // 创建缓冲区管理器
  const bufferManager = createBufferManager(config)

  // 创建渲染核心
  const rendererCore = createRendererCore({
    container,
    config,
    bufferManager,
    colorCalculator,
  })

  // 创建资源管理器
  const resourceManager = createResourceManager({
    rendererCore,
    bufferManager,
  })

  // 初始化
  function init() {
    rendererCore.init()
  }

  // 返回统一的接口
  return {
    init,
    addPoints: rendererCore.addPoints,
    setTargetFps: rendererCore.setTargetFps,
    resetPointCloud: rendererCore.resetPointCloud,
    dispose: resourceManager.dispose,
    onResize: rendererCore.onResize,
    markNeedsRender: rendererCore.markNeedsRender,
    getMemoryStats: resourceManager.getMemoryStats,
    isWebGLContextValid: rendererCore.isWebGLContextValid,
  }
}

// 导出子模块（供高级用户使用）
export { mergeConfig } from './config.js'
export { ColorLookupTable, createColorCalculator } from './colorTable.js'
export { createBufferManager } from './bufferManager.js'
export { createRendererCore } from './rendererCore.js'
export { createResourceManager } from './resourceManager.js'
