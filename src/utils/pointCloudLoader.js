/**
 * @fileoverview 点云数据加载工具
 * 预加载并解析多站点数据
 */

import { stations } from '@/config/pointCloudStations.js'

/**
 * 预加载所有点云文件
 * 使用 eager: true 在构建时预加载，运行时直接可用
 */
const pointCloudFiles = import.meta.glob('/src/assets/pointCloud/**/pointCloud_data_*.txt', {
  as: 'raw',
  eager: true
})

/**
 * 解析点云文本数据
 * @param {string} text - 文件内容
 * @param {Object} offset - 平移偏移量 {x, y, z}
 * @param {Object} color - 颜色 {r, g, b}
 * @returns {Array} 点云数据数组
 */
export function parsePointCloud(text, offset, color) {
  const lines = text.trim().split('\n')
  const points = []

  // 跳过文件头（第一行）
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split(/\s+/)
    if (parts.length >= 3) {
      points.push({
        x: parseFloat(parts[0]) + offset.x,
        y: parseFloat(parts[1]) + offset.y,
        z: parseFloat(parts[2]) + offset.z,
        r: color.r,
        g: color.g,
        b: color.b
      })
    }
  }

  return points
}

/**
 * 加载所有站点数据
 * @param {Array} stationList - 站点配置列表，默认使用 stations
 * @returns {Array} 所有站点的点云数据（已应用平移和颜色）
 */
export function loadAllStations(stationList = stations) {
  const allPoints = []

  for (const station of stationList) {
    // 查找匹配的文件路径
    const filePath = Object.keys(pointCloudFiles).find(path =>
      path.includes(station.folder)
    )

    if (filePath) {
      const content = pointCloudFiles[filePath]
      const points = parsePointCloud(content, station.offset, station.color)
      allPoints.push(...points)
    } else {
      console.warn(`[pointCloudLoader] 未找到站点 ${station.folder} 的数据文件`)
    }
  }

  return allPoints
}

/**
 * 加载单个站点数据
 * @param {Object} station - 站点配置
 * @returns {Array} 该站点的点云数据
 */
export function loadStation(station) {
  const filePath = Object.keys(pointCloudFiles).find(path =>
    path.includes(station.folder)
  )

  if (filePath) {
    const content = pointCloudFiles[filePath]
    return parsePointCloud(content, station.offset, station.color)
  }

  console.warn(`[pointCloudLoader] 未找到站点 ${station.folder} 的数据文件`)
  return []
}

/**
 * 获取所有预加载的文件路径
 * @returns {Array} 文件路径列表
 */
export function getLoadedFilePaths() {
  return Object.keys(pointCloudFiles)
}

/**
 * 获取预加载的文件数量
 * @returns {number} 文件数量
 */
export function getLoadedFileCount() {
  return Object.keys(pointCloudFiles).length
}
