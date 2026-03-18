/**
 * @fileoverview 资源管理模块
 * 负责资源释放和内存统计
 */

/**
 * 创建资源管理器
 * @param {Object} params - 参数对象
 * @param {Object} params.rendererCore - 渲染核心
 * @param {Object} params.bufferManager - 缓冲区管理器
 * @returns {Object} 资源管理器
 */
export function createResourceManager({ rendererCore, bufferManager }) {
  /**
   * 释放所有资源
   */
  function dispose() {
    console.log('[Renderer] Disposing resources...')

    const animationId = rendererCore.getAnimationId()
    if (animationId) {
      cancelAnimationFrame(animationId)
      rendererCore.setAnimationId(null)
    }

    // 移除事件监听
    const controls = rendererCore.getControls()
    if (controls) {
      controls.removeEventListener('change', rendererCore.markNeedsRender)
      controls.dispose()
    }

    // 释放缓冲区
    bufferManager.dispose()

    // 释放渲染器
    const renderer = rendererCore.getRenderer()
    if (renderer) {
      renderer.dispose()
      // 移除canvas
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }

    console.log('[Renderer] Resources disposed')
  }

  /**
   * 获取内存统计信息
   * @returns {Object} 内存统计对象
   * @returns {number} return.currentPointCount - 当前点数
   * @returns {number} return.actualGeometrySize - 实际使用的位置缓冲区字节数
   * @returns {number} return.actualColorSize - 实际使用的颜色缓冲区字节数
   * @returns {number} return.totalActualSize - 实际使用的总字节数
   * @returns {number} return.maxBufferSize - 缓冲区总容量字节数
   * @returns {number} return.utilizationRate - 缓冲区使用率（百分比）
   */
  function getMemoryStats() {
    const currentPointCount = rendererCore.getCurrentPointCount()
    const capacity = bufferManager.getCapacity()

    // 每个点是 3 个 float（x, y, z），每个 float 4 字节 = 12 字节/点
    const bytesPerPoint = 3 * 4
    const actualGeometrySize = currentPointCount * bytesPerPoint
    const actualColorSize = currentPointCount * bytesPerPoint
    const maxBufferSize = capacity * bytesPerPoint * 2 // 位置和颜色两个缓冲区

    return {
      currentPointCount,
      actualGeometrySize,
      actualColorSize,
      totalActualSize: actualGeometrySize + actualColorSize,
      maxBufferSize,
      utilizationRate: capacity > 0 ? ((currentPointCount / capacity) * 100).toFixed(2) : 0,
    }
  }

  return {
    dispose,
    getMemoryStats,
  }
}
