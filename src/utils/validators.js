/**
 * @fileoverview 参数验证工具模块
 * 提供统一的参数验证函数和错误处理类
 */

import {
  ErrorCodes,
  SESSION_ID_PATTERN,
  SESSION_ID_MIN_LENGTH,
  SESSION_ID_MAX_LENGTH,
  POINTCLOUD_ROOT
} from '@/constants/fileSystem'

/**
 * 文件路径工具错误类
 * 提供结构化的错误信息，包含错误码、消息和时间戳
 */
export class FilePathError extends Error {
  /**
   * @param {string} code - 错误码，来自 ErrorCodes
   * @param {string} message - 错误消息
   * @param {Object} [details={}] - 额外的错误详情
   */
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'FilePathError'
    this.code = code
    this.details = details
    this.timestamp = new Date().toISOString()

    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FilePathError)
    }
  }

  /**
   * 将错误转换为JSON对象
   * @returns {Object} 错误对象的JSON表示
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    }
  }
}

/**
 * 验证会话ID是否有效
 * @param {*} sessionId - 要验证的会话ID
 * @param {boolean} [throwOnError=true] - 验证失败时是否抛出错误
 * @returns {boolean} 验证是否通过
 * @throws {FilePathError} 当验证失败且 throwOnError 为 true 时抛出
 */
export function validateSessionId(sessionId, throwOnError = true) {
  // 检查空值
  if (!sessionId) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.INVALID_SESSION_ID,
        '会话ID不能为空'
      )
    }
    return false
  }

  // 检查类型
  if (typeof sessionId !== 'string') {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.INVALID_SESSION_ID,
        `会话ID必须是字符串，当前类型: ${typeof sessionId}`
      )
    }
    return false
  }

  // 检查非法字符（路径遍历攻击防护）- 放在长度检查之前
  if (/[\\/:*?"<>|]/.test(sessionId)) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.INVALID_SESSION_ID,
        '会话ID包含非法字符: \\ / : * ? " < > |'
      )
    }
    return false
  }

  // 检查长度
  if (sessionId.length < SESSION_ID_MIN_LENGTH || sessionId.length > SESSION_ID_MAX_LENGTH) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.INVALID_SESSION_ID,
        `会话ID长度必须在 ${SESSION_ID_MIN_LENGTH}-${SESSION_ID_MAX_LENGTH} 之间，当前长度: ${sessionId.length}`
      )
    }
    return false
  }

  return true
}

/**
 * 验证批次ID是否有效
 * 支持数字或数字字符串，必须是非负整数
 * @param {*} batchId - 要验证的批次ID
 * @param {boolean} [throwOnError=true] - 验证失败时是否抛出错误
 * @returns {boolean} 验证是否通过
 * @throws {FilePathError} 当验证失败且 throwOnError 为 true 时抛出
 */
export function validateBatchId(batchId, throwOnError = true) {
  // 检查空值
  if (batchId === undefined || batchId === null) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.INVALID_BATCH_ID,
        '批次ID不能为空'
      )
    }
    return false
  }

  // 数字类型验证
  if (typeof batchId === 'number') {
    if (!Number.isInteger(batchId)) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.INVALID_BATCH_ID,
          '批次ID必须是整数'
        )
      }
      return false
    }
    if (batchId < 0) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.INVALID_BATCH_ID,
          '批次ID必须是非负整数'
        )
      }
      return false
    }
    if (batchId > 999) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.INVALID_BATCH_ID,
          '批次ID不能超过999'
        )
      }
      return false
    }
    return true
  }

  // 字符串类型验证
  if (typeof batchId === 'string') {
    // 支持 "001" 这样的补零格式
    if (!/^\d{1,3}$/.test(batchId)) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.INVALID_BATCH_ID,
          '批次ID字符串必须是1-3位数字'
        )
      }
      return false
    }
    const numValue = parseInt(batchId, 10)
    if (numValue < 0 || numValue > 999) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.INVALID_BATCH_ID,
          '批次ID数值范围必须在0-999之间'
        )
      }
      return false
    }
    return true
  }

  // 其他类型
  if (throwOnError) {
    throw new FilePathError(
      ErrorCodes.INVALID_BATCH_ID,
      `批次ID必须是数字或字符串，当前类型: ${typeof batchId}`
    )
  }
  return false
}

/**
 * 验证路径安全性
 * 防止目录遍历攻击，确保路径在允许的范围内
 * @param {string} inputPath - 要验证的路径
 * @param {boolean} [throwOnError=true] - 验证失败时是否抛出错误
 * @returns {string|null} 清理后的路径，验证失败返回 null
 * @throws {FilePathError} 当验证失败且 throwOnError 为 true 时抛出
 */
export function sanitizePath(inputPath, throwOnError = true) {
  // 检查空值
  if (!inputPath) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '路径不能为空'
      )
    }
    return null
  }

  // 检查类型
  if (typeof inputPath !== 'string') {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        `路径必须是字符串，当前类型: ${typeof inputPath}`
      )
    }
    return null
  }

  // 移除 null 字节（防止空字节注入攻击）
  let sanitized = inputPath.replace(/\0/g, '')

  // 规范化路径分隔符
  sanitized = sanitized.replace(/\\/g, '/')

  // 移除开头的斜杠
  sanitized = sanitized.replace(/^\/+/, '')

  // 防止路径遍历攻击
  // 检查是否包含 ../ 或 .. 开头
  if (sanitized.startsWith('../') || sanitized.startsWith('..')) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '路径包含非法的目录遍历序列'
      )
    }
    return null
  }
  
  // 检查路径中间是否包含 ../
  if (sanitized.includes('/../') || sanitized.endsWith('/..')) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '路径包含非法的目录遍历序列'
      )
    }
    return null
  }
  
  // 移除 ./ 当前目录标记
  sanitized = sanitized.replace(/\.\/+/g, '')
  
  // 移除多余的 ../ （如果存在）
  sanitized = sanitized.replace(/\.\.\//g, '')

  // 检查是否为空
  if (!sanitized.trim()) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '路径不能为空或仅包含分隔符'
      )
    }
    return null
  }

  return sanitized
}

/**
 * 验证文件夹名称是否有效
 * @param {string} folderName - 要验证的文件夹名称
 * @param {boolean} [throwOnError=true] - 验证失败时是否抛出错误
 * @returns {boolean} 验证是否通过
 * @throws {FilePathError} 当验证失败且 throwOnError 为 true 时抛出
 */
export function validateFolderName(folderName, throwOnError = true) {
  if (!folderName) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '文件夹名称不能为空'
      )
    }
    return false
  }

  if (typeof folderName !== 'string') {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        `文件夹名称必须是字符串，当前类型: ${typeof folderName}`
      )
    }
    return false
  }

  const trimmed = folderName.trim()
  if (!trimmed) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '文件夹名称不能为空或仅包含空白字符'
      )
    }
    return false
  }

  // 检查非法字符
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '文件夹名称包含非法字符: \\ / : * ? " < > |'
      )
    }
    return false
  }

  // 检查长度
  if (trimmed.length > 100) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        '文件夹名称长度不能超过100个字符'
      )
    }
    return false
  }

  return true
}

/**
 * 验证照片数组格式
 * @param {Array} photos - 要验证的照片数组
 * @param {boolean} [throwOnError=true] - 验证失败时是否抛出错误
 * @returns {boolean} 验证是否通过
 * @throws {FilePathError} 当验证失败且 throwOnError 为 true 时抛出
 */
export function validatePhotosArray(photos, throwOnError = true) {
  if (!Array.isArray(photos)) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        `照片必须是数组，当前类型: ${typeof photos}`
      )
    }
    return false
  }

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]

    // MODIFIED: 修复 - 先检查是否为对象（包括排除 null）
    if (!photo || typeof photo !== 'object' || Array.isArray(photo)) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.VALIDATION_ERROR,
          `照片[${i}]必须是对象`
        )
      }
      return false
    }

    // 检查是否有有效的照片数据
    const hasFilePath = photo.filePath && typeof photo.filePath === 'string'
    const hasBase64 = photo.base64 && typeof photo.base64 === 'string'
    const hasName = photo.name && typeof photo.name === 'string'

    if (!hasFilePath && !hasBase64) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.VALIDATION_ERROR,
          `照片[${i}]必须包含 filePath 或 base64 属性`
        )
      }
      return false
    }

    if (hasBase64 && !hasName) {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.VALIDATION_ERROR,
          `照片[${i}]使用base64时必须提供 name 属性`
        )
      }
      return false
    }
  }

  return true
}

/**
 * 验证数据行数组格式
 * @param {Array} dataLines - 要验证的数据行数组
 * @param {boolean} [throwOnError=true] - 验证失败时是否抛出错误
 * @returns {boolean} 验证是否通过
 * @throws {FilePathError} 当验证失败且 throwOnError 为 true 时抛出
 */
export function validateDataLines(dataLines, throwOnError = true) {
  if (!Array.isArray(dataLines)) {
    if (throwOnError) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        `数据行必须是数组，当前类型: ${typeof dataLines}`
      )
    }
    return false
  }

  // 允许空数组
  if (dataLines.length === 0) {
    return true
  }

  // 验证每一项都是字符串
  for (let i = 0; i < dataLines.length; i++) {
    if (typeof dataLines[i] !== 'string') {
      if (throwOnError) {
        throw new FilePathError(
          ErrorCodes.VALIDATION_ERROR,
          `数据行[${i}]必须是字符串，当前类型: ${typeof dataLines[i]}`
        )
      }
      return false
    }
  }

  return true
}

/**
 * 统一的参数验证入口
 * 根据函数类型执行相应的验证
 * @param {string} functionName - 函数名称，用于错误消息
 * @param {Object} params - 参数对象
 * @param {Object} schema - 验证模式
 * @returns {boolean} 验证是否通过
 * @throws {FilePathError} 当验证失败时抛出
 */
export function validateParams(functionName, params, schema) {
  for (const [key, validator] of Object.entries(schema)) {
    const value = params[key]

    if (validator.required && (value === undefined || value === null)) {
      throw new FilePathError(
        ErrorCodes.VALIDATION_ERROR,
        `${functionName}: 参数 ${key} 是必需的`
      )
    }

    if (value !== undefined && value !== null) {
      if (validator.type && typeof value !== validator.type) {
        throw new FilePathError(
          ErrorCodes.VALIDATION_ERROR,
          `${functionName}: 参数 ${key} 必须是 ${validator.type} 类型`
        )
      }

      if (validator.validator && typeof validator.validator === 'function') {
        const result = validator.validator(value)
        if (result !== true) {
          throw new FilePathError(
            ErrorCodes.VALIDATION_ERROR,
            `${functionName}: 参数 ${key} 验证失败 - ${result}`
          )
        }
      }
    }
  }

  return true
}
