/**
 * @fileoverview 多站点点云配置
 * 定义各站点的平移参数和颜色
 * 支持动态生成任意数量的站点，均匀分布在圆周上
 */

/**
 * HSL 转 RGB
 * @param {number} h - 色相 (0-1)
 * @param {number} s - 饱和度 (0-1)
 * @param {number} l - 明度 (0-1)
 * @returns {Object} RGB 对象 {r, g, b} (0-1范围)
 */
function hslToRgb(h, s, l) {
  let r, g, b

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return { r, g, b }
}

/**
 * RGB 转十六进制颜色字符串
 * @param {Object} rgb - RGB 对象 {r, g, b} (0-1范围)
 * @returns {string} 十六进制颜色字符串
 */
function rgbToHex(rgb) {
  const toHex = (n) => {
    const hex = Math.round(n * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/**
 * 生成均匀分布的站点配置（多层环形布局）
 * @param {number} count - 站点数量（包括中心站点）
 * @returns {Array} 站点配置数组
 */
function generateStations(count) {
  const stations = []

  // 中心站点（红色）
  stations.push({
    id: 0,
    folder: 'Batch_000',
    offset: { x: 0, y: 0, z: 0 },
    color: { r: 1, g: 0, b: 0 },
    name: '站点1',
    hexColor: '#ff0000',
  })

  // 周围站点数量
  const surroundCount = count - 1
  if (surroundCount <= 0) return stations

  // ========== 多层环形布局 ==========
  // 定义多个环的半径
  const rings = [
    { radius: 12, count: 8, name: '内环' },      // 半径12米，8个站点
    { radius: 24, count: 16, name: '中环' },     // 半径24米，16个站点
    { radius: 36, count: 25, name: '外环' },     // 半径36米，25个站点
  ]

  // 确保总站点数匹配
  let totalInRings = rings.reduce((sum, ring) => sum + ring.count, 0)
  if (totalInRings !== surroundCount) {
    // 调整外环数量
    rings[2].count = surroundCount - rings[0].count - rings[1].count
  }

  let globalId = 1

  for (const ring of rings) {
    const { radius, count: ringCount, name } = ring

    for (let i = 0; i < ringCount; i++) {
      // 角度：均匀分布（从 -90° 开始，让第一个站点在正右方）
      const angle = (i / ringCount) * Math.PI * 2 - Math.PI / 2

      // 计算 x 和 z 坐标
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius

      // 颜色：根据环和角度变化
      // 内环偏暖色，外环偏冷色
      const hue = (globalId / surroundCount) * 360
      let adjustedHue = hue
      if (adjustedHue >= 0 && adjustedHue < 30) {
        adjustedHue = 60
      } else if (adjustedHue >= 330 && adjustedHue < 360) {
        adjustedHue = 300
      }

      const rgb = hslToRgb(adjustedHue / 360, 0.8, 0.6)

      stations.push({
        id: globalId,
        folder: `Batch_${String(globalId).padStart(3, '0')}`,
        offset: { x: x, y: 0, z: z },
        color: { r: rgb.r, g: rgb.g, b: rgb.b },
        name: `站点${globalId + 1}`,
        hexColor: rgbToHex(rgb),
        ring: name,      // 添加环信息，便于调试
        radius: radius   // 添加半径信息
      })

      globalId++
    }
  }

  return stations
}

/**
 * 站点配置列表
 * 动态生成50个站点，中心1个 + 周围49个均匀分布在圆周上
 */
export const stations = generateStations(50)

/**
 * 根据站点ID获取颜色
 * @param {number} stationId - 站点ID
 * @returns {Object} RGB颜色对象 {r, g, b}
 */
export function getStationColor(stationId) {
  const station = stations.find((s) => s.id === stationId)
  return station ? station.color : { r: 1, g: 1, b: 1 }
}

/**
 * 根据站点ID获取站点配置
 * @param {number} stationId - 站点ID
 * @returns {Object|undefined} 站点配置对象
 */
export function getStationById(stationId) {
  return stations.find((s) => s.id === stationId)
}

/**
 * 根据文件夹名获取站点配置
 * @param {string} folder - 文件夹名
 * @returns {Object|undefined} 站点配置对象
 */
export function getStationByFolder(folder) {
  return stations.find((s) => s.folder === folder)
}

/**
 * 获取站点总数
 * @returns {number} 站点总数
 */
export function getStationCount() {
  return stations.length
}

/**
 * 获取指定范围内的站点配置
 * @param {number} startId - 起始站点ID（包含）
 * @param {number} endId - 结束站点ID（包含）
 * @returns {Array} 站点配置数组
 */
export function getStationsInRange(startId, endId) {
  return stations.filter((s) => s.id >= startId && s.id <= endId)
}

/**
 * 重新生成站点配置（用于动态修改站点数量）
 * @param {number} count - 新的站点数量
 * @returns {Array} 新的站点配置数组
 */
export function regenerateStations(count) {
  const newStations = generateStations(count)
  // 更新导出对象（注意：这会改变模块状态）
  Object.assign(stations, newStations)
  return stations
}
