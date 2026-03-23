/**
 * @fileoverview 路径工具模块
 * 提供路径解析、构建和验证相关的纯函数
 * 所有函数都是无副作用的纯函数
 */

import {
  POINTCLOUD_ROOT,
  TEMP_PREFIX,
  BATCH_PREFIX,
  BATCH_NUMBER_LENGTH,
  SESSION_ID_PATTERN,
} from '@/constants/storage'

// ========== 会话ID相关函数 ==========

/**
 * 判断字符串是否是系统生成的会话ID
 * 会话ID格式：纯小写字母数字，8-12位
 * @param {string} str - 要判断的字符串
 * @returns {boolean} 是否是会话ID
 */
export function isSessionId(str) {
  if (!str || typeof str !== 'string') return false
  return SESSION_ID_PATTERN.test(str)
}

/**
 * 判断是否是"项目名_会话ID"格式
 * @param {string} folderName - 文件夹名
 * @returns {boolean} 是否是项目名_会话ID格式
 */
export function isProjectWithSessionFormat(folderName) {
  if (!folderName || typeof folderName !== 'string') return false

  const parts = folderName.split('_')
  // MODIFIED: 修复 - 确保项目名不为空
  return parts.length === 2 && parts[0].length > 0 && isSessionId(parts[1])
}

/**
 * 判断是否是纯用户自定义文件夹
 * @param {string} folderName - 文件夹名
 * @returns {boolean} 是否是自定义文件夹
 */
export function isCustomFolder(folderName) {
  if (!folderName || typeof folderName !== 'string') return false

  // MODIFIED: 修复 - 排除临时会话
  if (isTempSession(folderName)) return false

  // 如果不是会话ID格式，也不是"项目_会话ID"格式，就是自定义文件夹
  return !isSessionId(folderName) && !isProjectWithSessionFormat(folderName)
}

/**
 * 解析文件夹名，获取详细信息
 * @param {string} folderName - 原始文件夹名
 * @returns {Object} 文件夹信息对象
 * @returns {string} result.original - 原始文件夹名
 * @returns {string} result.type - 文件夹类型 (temp_session|session_only|project_with_session|custom|unknown)
 * @returns {string|null} result.projectName - 项目名称（如果有）
 * @returns {string|null} result.sessionId - 会话ID（如果有）
 * @returns {string} result.displayName - 显示名称
 * @returns {boolean} result.shouldShow - 是否应该显示
 * @returns {boolean} result.isTemp - 是否是临时文件夹
 */
export function parseFolderName(folderName) {
  const result = {
    original: folderName,
    type: 'unknown',
    projectName: null,
    sessionId: null,
    displayName: folderName,
    shouldShow: true,
    isTemp: false,
  }

  if (!folderName || typeof folderName !== 'string') {
    result.shouldShow = false
    return result
  }

  // 情况0：临时文件夹（a7f3c9d1-开头）
  if (isTempSession(folderName)) {
    result.type = 'temp_session'
    result.sessionId = extractSessionIdFromTemp(folderName)
    result.displayName = '未保存项目'
    result.isTemp = true
    return result
  }

  // 情况1：纯会话ID
  if (isSessionId(folderName)) {
    result.type = 'session_only'
    result.sessionId = folderName
    result.displayName = '未命名项目'
    result.isTemp = false
    return result
  }

  // 情况2：项目名_会话ID
  if (isProjectWithSessionFormat(folderName)) {
    const [project, sessionId] = folderName.split('_')
    result.type = 'project_with_session'
    result.projectName = project
    result.sessionId = sessionId
    result.displayName = project
    result.isTemp = false
    return result
  }

  // 情况3：纯用户自定义（不显示）
  result.type = 'custom'
  result.displayName = folderName
  result.shouldShow = false
  result.isTemp = false

  return result
}

/**
 * 获取适合显示的文件夹名
 * @param {string} folderName - 原始文件夹名
 * @returns {string} 显示用的文件夹名
 */
export function getDisplayName(folderName) {
  const info = parseFolderName(folderName)
  return info.displayName
}

// ========== 路径构建函数 ==========

/**
 * 根据会话ID构建会话文件夹路径
 * @param {string} sessionId - 会话ID
 * @returns {string} 会话文件夹的相对路径（相对于 Documents）
 * @example
 * sessionFolder('abc123') // 'pointcloud/abc123'
 */
export function sessionFolder(sessionId) {
  return `${POINTCLOUD_ROOT}/${sessionId}`
}

/**
 * 在会话文件夹下构建批次文件夹路径
 * @param {string} sessionId - 会话ID
 * @param {number|string} batchId - 批次ID（数字或字符串）
 * @returns {string} 批次文件夹的相对路径
 * @example
 * batchFolder('abc123', 1) // 'pointcloud/abc123/Batch_001'
 * batchFolder('abc123', '005') // 'pointcloud/abc123/Batch_005'
 */
export function batchFolder(sessionId, batchId) {
  const num = String(batchId).padStart(BATCH_NUMBER_LENGTH, '0')
  return `${sessionFolder(sessionId)}/${BATCH_PREFIX}${num}`
}

/**
 * 构建点云数据文件名
 * @param {Date} [date=new Date()] - 日期对象，默认为当前时间
 * @returns {string} 文件名，格式：pointCloud_data_YYYYMMDDHHmmss.txt
 */
export function buildPointCloudDataFileName(date = new Date()) {
  // UTC+8 时区调整
  const timestamp = new Date(date.getTime() + 28800000)
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
  return `pointCloud_data_${timestamp}.txt`
}

// ========== 临时会话相关函数 ==========

/**
 * 判断是否是临时会话（未保存）
 * @param {string} folderName - 文件夹名
 * @returns {boolean} 是否是临时会话
 */
export function isTempSession(folderName) {
  if (!folderName || typeof folderName !== 'string') return false
  return folderName.startsWith(TEMP_PREFIX)
}

/**
 * 生成临时会话文件夹名
 * @param {string} sessionId - 会话ID
 * @returns {string} 临时会话文件夹名
 */
export function getTempSessionName(sessionId) {
  return `${TEMP_PREFIX}${sessionId}`
}

/**
 * 从临时会话名中提取会话ID
 * @param {string} tempName - 临时会话文件夹名
 * @returns {string} 会话ID
 */
export function extractSessionIdFromTemp(tempName) {
  if (!tempName || typeof tempName !== 'string') return ''
  return tempName.replace(TEMP_PREFIX, '')
}

// ========== 文件名解析函数 ==========

/**
 * 解析照片文件名，提取批次和角度信息
 * @param {string} fileName - 文件名（如 "Batch_001_45.23_89.56====1.jpg"）
 * @returns {Object|null} 解析结果
 * @returns {string} result.batch - 批次号字符串（如 "001"）
 * @returns {number} result.batchNum - 数字形式的批次号
 * @returns {number} result.pitch - 俯仰角
 * @returns {number} result.yaw - 偏航角
 * @returns {string} result.format - 图片格式
 * @returns {boolean} result.hasDuplicate - 是否有重名标记
 */
export function parsePhotoFileName(fileName) {
  if (!fileName) return null

  // 匹配格式：Batch_XXX_角度_角度[====X].jpg 或 .jpeg 或 .png
  const pattern = /^Batch_(\d+)_([0-9.]+)_([0-9.]+)(?:====\d+)?\.(jpe?g|png|webp)$/i
  const match = fileName.match(pattern)

  if (match) {
    return {
      batch: match[1],
      batchNum: parseInt(match[1], 10),
      pitch: parseFloat(match[2]),
      yaw: parseFloat(match[3]),
      format: match[4],
      hasDuplicate: fileName.includes('===='),
    }
  }

  return null
}

/**
 * 规范化批次ID为补零字符串格式
 * @param {number|string} batchId - 批次ID
 * @returns {string} 补零后的批次ID（如 "001"）
 */
export function normalizeBatchId(batchId) {
  return String(batchId).padStart(BATCH_NUMBER_LENGTH, '0')
}

/**
 * 从批次文件夹名中提取批次号
 * @param {string} batchFolderName - 批次文件夹名（如 "Batch_001"）
 * @returns {number|null} 批次号，解析失败返回 null
 */
export function extractBatchNumber(batchFolderName) {
  if (!batchFolderName || typeof batchFolderName !== 'string') return null
  const match = batchFolderName.match(/^Batch_(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

// ========== 路径工具函数 ==========

/**
 * 从完整路径中提取文件名
 * @param {string} path - 文件路径
 * @returns {string} 文件名
 */
export function getFileNameFromPath(path) {
  if (!path || typeof path !== 'string') return ''
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * 从完整路径中提取目录路径
 * @param {string} path - 文件路径
 * @returns {string} 目录路径（不含末尾的文件名）
 */
export function getDirectoryFromPath(path) {
  if (!path || typeof path !== 'string') return ''
  const lastSlashIndex = path.lastIndexOf('/')
  return lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : ''
}

/**
 * 获取文件扩展名
 * @param {string} fileName - 文件名
 * @returns {string} 扩展名（小写，包含点，如 ".jpg"）
 */
export function getFileExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return ''
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex > 0 ? fileName.substring(lastDotIndex).toLowerCase() : ''
}

/**
 * 检查是否是图片文件
 * @param {string} fileName - 文件名
 * @returns {boolean} 是否是图片文件
 */
export function isImageFile(fileName) {
  const ext = getFileExtension(fileName)
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)
}

/**
 * 检查是否是数据文件
 * @param {string} fileName - 文件名
 * @returns {boolean} 是否是数据文件
 */
export function isDataFile(fileName) {
  const ext = getFileExtension(fileName)
  return ['.txt', '.csv', '.json'].includes(ext)
}

/**
 * 构建完整的文件路径
 * @param {...string} parts - 路径各部分
 * @returns {string} 合并后的路径
 * @example
 * buildPath('pointcloud', 'session123', 'Batch_001', 'data.txt')
 * // 'pointcloud/session123/Batch_001/data.txt'
 */
export function buildPath(...parts) {
  return parts.filter((part) => part && typeof part === 'string').join('/')
}
