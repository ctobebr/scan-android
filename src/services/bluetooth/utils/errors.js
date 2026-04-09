/**
 * @fileoverview 蓝牙服务错误处理模块
 *
 * 提供蓝牙相关的自定义错误类和错误处理工具。
 *
 * @module @/services/bluetooth/utils/errors
 */

// ========== 错误码定义 ==========

/**
 * 蓝牙错误码枚举
 * @readonly
 * @enum {string}
 */
export const BluetoothErrorCode = {
  // 通用错误
  UNKNOWN_ERROR: 'BLUETOOTH_UNKNOWN_ERROR',
  NOT_INITIALIZED: 'BLUETOOTH_NOT_INITIALIZED',
  ALREADY_INITIALIZED: 'BLUETOOTH_ALREADY_INITIALIZED',

  // 连接错误
  CONNECTION_FAILED: 'BLUETOOTH_CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'BLUETOOTH_CONNECTION_TIMEOUT',
  CONNECTION_LOST: 'BLUETOOTH_CONNECTION_LOST',
  ALREADY_CONNECTED: 'BLUETOOTH_ALREADY_CONNECTED',
  NOT_CONNECTED: 'BLUETOOTH_NOT_CONNECTED',
  DEVICE_NOT_FOUND: 'BLUETOOTH_DEVICE_NOT_FOUND',

  // 扫描错误
  SCAN_FAILED: 'BLUETOOTH_SCAN_FAILED',
  SCAN_TIMEOUT: 'BLUETOOTH_SCAN_TIMEOUT',
  SCAN_ALREADY_IN_PROGRESS: 'BLUETOOTH_SCAN_ALREADY_IN_PROGRESS',

  // 权限错误
  PERMISSION_DENIED: 'BLUETOOTH_PERMISSION_DENIED',
  PERMISSION_NOT_REQUESTED: 'BLUETOOTH_PERMISSION_NOT_REQUESTED',

  // 协议错误
  PROTOCOL_ERROR: 'BLUETOOTH_PROTOCOL_ERROR',
  INVALID_COMMAND: 'BLUETOOTH_INVALID_COMMAND',
  INVALID_DATA: 'BLUETOOTH_INVALID_DATA',
  CHECKSUM_ERROR: 'BLUETOOTH_CHECKSUM_ERROR',

  // 读写错误
  WRITE_FAILED: 'BLUETOOTH_WRITE_FAILED',
  READ_FAILED: 'BLUETOOTH_READ_FAILED',
  NOTIFICATION_FAILED: 'BLUETOOTH_NOTIFICATION_FAILED',

  // 参数错误
  INVALID_PARAMETER: 'BLUETOOTH_INVALID_PARAMETER',
  MISSING_PARAMETER: 'BLUETOOTH_MISSING_PARAMETER',
  INVALID_DEVICE_ID: 'BLUETOOTH_INVALID_DEVICE_ID',
  INVALID_UUID: 'BLUETOOTH_INVALID_UUID',
}

// ========== 基础错误类 ==========

/**
 * 蓝牙基础错误类
 * 所有蓝牙相关错误的基类
 */
export class BluetoothError extends Error {
  /**
   * 创建蓝牙错误实例
   * @param {string} code - 错误码
   * @param {string} message - 错误消息
   * @param {Object} [details] - 错误详情
   * @param {Error} [cause] - 原始错误
   */
  constructor(code, message, details = {}, cause = null) {
    super(message)
    this.name = 'BluetoothError'
    this.code = code
    this.details = details
    this.cause = cause
    this.timestamp = new Date().toISOString()

    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BluetoothError)
    }
  }

  /**
   * 转换为 JSON 对象
   * @returns {Object} 错误对象的 JSON 表示
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      cause: this.cause ? this.cause.message : null,
      timestamp: this.timestamp,
      stack: this.stack,
    }
  }

  /**
   * 获取用户友好的错误消息
   * @returns {string} 用户友好的错误消息
   */
  getUserMessage() {
    const userMessages = {
      [BluetoothErrorCode.NOT_INITIALIZED]: '蓝牙服务未初始化，请先初始化',
      [BluetoothErrorCode.CONNECTION_FAILED]: '连接蓝牙设备失败，请检查设备是否可用',
      [BluetoothErrorCode.CONNECTION_TIMEOUT]: '连接超时，请重试',
      [BluetoothErrorCode.CONNECTION_LOST]: '蓝牙连接已断开',
      [BluetoothErrorCode.DEVICE_NOT_FOUND]: '未找到指定的蓝牙设备',
      [BluetoothErrorCode.SCAN_FAILED]: '扫描蓝牙设备失败',
      [BluetoothErrorCode.PERMISSION_DENIED]: '蓝牙权限被拒绝，请在设置中开启权限',
      [BluetoothErrorCode.PROTOCOL_ERROR]: '蓝牙协议错误',
      [BluetoothErrorCode.INVALID_PARAMETER]: '参数无效',
    }

    return userMessages[this.code] || this.message || '蓝牙操作失败'
  }
}

// ========== 特定错误类 ==========

/**
 * 连接错误
 */
export class ConnectionError extends BluetoothError {
  constructor(code, message, details = {}, cause = null) {
    super(code, message, details, cause)
    this.name = 'ConnectionError'
  }
}

/**
 * 协议错误
 */
export class ProtocolError extends BluetoothError {
  constructor(code, message, details = {}, cause = null) {
    super(code, message, details, cause)
    this.name = 'ProtocolError'
  }
}

/**
 * 参数错误
 */
export class ParameterError extends BluetoothError {
  constructor(code, message, details = {}, cause = null) {
    super(code, message, details, cause)
    this.name = 'ParameterError'
  }
}

/**
 * 权限错误
 */
export class PermissionError extends BluetoothError {
  constructor(code, message, details = {}, cause = null) {
    super(code, message, details, cause)
    this.name = 'PermissionError'
  }
}

// ========== 错误处理工具 ==========

/**
 * 包装异步操作，统一错误处理
 * @template T
 * @param {Function} operation - 异步操作函数
 * @param {string} errorCode - 错误码
 * @param {string} errorMessage - 错误消息
 * @param {Object} [context] - 上下文信息
 * @returns {Promise<T>} 操作结果
 * @throws {BluetoothError}
 */
export async function wrapAsyncOperation(operation, errorCode, errorMessage, context = {}) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof BluetoothError) {
      throw error
    }

    throw new BluetoothError(
      errorCode,
      errorMessage,
      { ...context, originalError: error.message },
      error
    )
  }
}

/**
 * 包装同步操作，统一错误处理
 * @template T
 * @param {Function} operation - 同步操作函数
 * @param {string} errorCode - 错误码
 * @param {string} errorMessage - 错误消息
 * @param {Object} [context] - 上下文信息
 * @returns {T} 操作结果
 * @throws {BluetoothError}
 */
export function wrapSyncOperation(operation, errorCode, errorMessage, context = {}) {
  try {
    return operation()
  } catch (error) {
    if (error instanceof BluetoothError) {
      throw error
    }

    throw new BluetoothError(
      errorCode,
      errorMessage,
      { ...context, originalError: error.message },
      error
    )
  }
}

/**
 * 创建连接错误
 * @param {string} message - 错误消息
 * @param {Object} [details] - 错误详情
 * @param {Error} [cause] - 原始错误
 * @returns {ConnectionError}
 */
export function createConnectionError(message, details = {}, cause = null) {
  return new ConnectionError(
    BluetoothErrorCode.CONNECTION_FAILED,
    message,
    details,
    cause
  )
}

/**
 * 创建参数错误
 * @param {string} paramName - 参数名称
 * @param {*} actualValue - 实际值
 * @param {string} expectedType - 期望类型
 * @returns {ParameterError}
 */
export function createParameterError(paramName, actualValue, expectedType) {
  return new ParameterError(
    BluetoothErrorCode.INVALID_PARAMETER,
    `参数 "${paramName}" 类型错误: 期望 ${expectedType}, 实际为 ${typeof actualValue}`,
    { paramName, actualValue, expectedType }
  )
}

/**
 * 创建缺失参数错误
 * @param {string} paramName - 参数名称
 * @returns {ParameterError}
 */
export function createMissingParameterError(paramName) {
  return new ParameterError(
    BluetoothErrorCode.MISSING_PARAMETER,
    `缺少必需参数: "${paramName}"`,
    { paramName }
  )
}

/**
 * 判断错误是否为蓝牙错误
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
export function isBluetoothError(error) {
  return error instanceof BluetoothError
}

/**
 * 判断错误是否为连接错误
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
export function isConnectionError(error) {
  return error instanceof ConnectionError
}

/**
 * 判断错误是否需要重试
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
export function isRetryableError(error) {
  if (!isBluetoothError(error)) {
    return true
  }

  const retryableCodes = [
    BluetoothErrorCode.CONNECTION_TIMEOUT,
    BluetoothErrorCode.CONNECTION_LOST,
    BluetoothErrorCode.WRITE_FAILED,
    BluetoothErrorCode.READ_FAILED,
    BluetoothErrorCode.SCAN_FAILED,
  ]

  return retryableCodes.includes(error.code)
}

// ========== 默认导出 ==========

export default {
  BluetoothError,
  ConnectionError,
  ProtocolError,
  ParameterError,
  PermissionError,
  BluetoothErrorCode,
  wrapAsyncOperation,
  wrapSyncOperation,
  createConnectionError,
  createParameterError,
  createMissingParameterError,
  isBluetoothError,
  isConnectionError,
  isRetryableError,
}
