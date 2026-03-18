/**
 * @fileoverview 颜色查找表模块
 * 提供基于高度的颜色映射功能
 */

/**
 * 颜色查找表单例
 * 使用模块级单例避免重复初始化
 * @returns {Object} 颜色查找表实例
 */
export const ColorLookupTable = (() => {
  let instance = null

  /**
   * 创建颜色查找表
   * @returns {Array} 颜色查找表数组
   */
  function create() {
    const lut = new Array(256)
    for (let i = 0; i < 256; i++) {
      const t = i / 255
      let r, g, b
      if (t < 0.25) {
        r = 0
        g = t * 4
        b = 1
      } else if (t < 0.5) {
        r = 0
        g = 1
        b = 1 - (t - 0.25) * 4
      } else if (t < 0.75) {
        r = (t - 0.5) * 4
        g = 1
        b = 0
      } else {
        r = 1
        g = 1 - (t - 0.75) * 4
        b = 0
      }
      lut[i] = { r, g, b }
    }
    return lut
  }

  return {
    /**
     * 获取颜色查找表实例
     * @returns {Array} 颜色查找表
     */
    getInstance() {
      if (!instance) instance = create()
      return instance
    },
  }
})()

/**
 * 创建颜色计算器
 * @returns {Object} 颜色计算器对象
 * @returns {Function} return.getColorByHeight - 根据高度获取颜色
 * @returns {Function} return.updateYRange - 更新Y范围
 */
export function createColorCalculator() {
  // 全局：记录当前点云的 Y 范围（用于动态归一化）
  let globalMinY = Infinity
  let globalMaxY = -Infinity

  // 获取颜色查找表实例
  const colorLUT = ColorLookupTable.getInstance()

  /**
   * 更新全局 Y 范围
   * @param {Array} newPoints - 新添加的点云数据
   */
  function updateYRange(newPoints) {
    for (const p of newPoints) {
      if (p.y < globalMinY) globalMinY = p.y
      if (p.y > globalMaxY) globalMaxY = p.y
    }
  }

  /**
   * 根据高度获取颜色
   * @param {number} y - Y坐标值
   * @returns {Object} 颜色对象 {r, g, b}
   */
  function getColorByHeight(y) {
    if (globalMinY === globalMaxY) {
      return colorLUT[128] // 中灰色
    }
    const t = Math.max(0, Math.min(1, (y - globalMinY) / (globalMaxY - globalMinY)))
    return colorLUT[Math.floor(t * 255)]
  }

  /**
   * 重置Y范围
   */
  function resetYRange() {
    globalMinY = Infinity
    globalMaxY = -Infinity
  }

  return {
    updateYRange,
    getColorByHeight,
    resetYRange,
  }
}
