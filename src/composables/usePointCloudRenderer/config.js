/**
 * @fileoverview 点云渲染器配置模块
 * 集中管理所有渲染器配置参数
 */

/**
 * 点云渲染器默认配置
 * @typedef {Object} RendererConfig
 * @property {number} maxPoints - 最大点云数量上限，防止内存无限增长
 * @property {number} initialCapacity - 初始缓冲区容量
 * @property {number} targetFps - 目标渲染帧率
 * @property {number} pixelRatioMax - 最大像素比，限制高分辨率屏幕的性能消耗
 * @property {number} cameraFov - 相机视野角度（度）
 * @property {number} pointSize - 点云基础大小
 * @property {number} maxBufferSize - accumulationBuffer 最大缓冲区大小
 */

// 设置初始缓冲区容量的目的是：一次性分配大内存的副作用确实大于 GPU 全量更新的开销 ，这就是我们选择动态扩容策略的原因

/** @type {RendererConfig} */
export const DEFAULT_RENDERER_CONFIG = Object.freeze({
  maxPoints: 500000,
  initialCapacity: 50000,
  targetFps: 30,
  pixelRatioMax: 2,
  cameraFov: 70,
  pointSize: 0.3,
  maxBufferSize: 10000,
})

/**
 * 合并用户配置与默认配置
 * @param {Object} options - 用户配置选项
 * @returns {RendererConfig} 合并后的配置
 */
export function mergeConfig(options = {}) {
  return { ...DEFAULT_RENDERER_CONFIG, ...options }
}
