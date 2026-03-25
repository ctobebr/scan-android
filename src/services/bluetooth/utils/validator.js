/**
 * @fileoverview 蓝牙服务参数验证工具
 *
 * 提供蓝牙相关的参数验证函数，确保输入数据的正确性和安全性。
 *
 * @module @/services/bluetooth/utils/validator
 * @version 1.0.0
 * @since 2026-03-24
 */

import {
  BluetoothErrorCode,
  createParameterError,
  createMissingParameterError,
} from './errors'

// ========== 常量定义 ==========

/**
 * UUID 格式正则表达式
 * @readonly
 * @type {RegExp}
 */
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * 设备 ID 格式正则表达式（简化版，支持 MAC 地址格式）
 * @readonly
 * @type {RegExp}
 */
const DEVICE_ID_REGEX = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$|^[0-9a-fA-F]{12}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * 有效的命令字范围
 * @readonly
 * @type {{min: number, max: number}}
 */
const VALID_COMMAND_RANGE = { min: 0, max: 255 }

/**
 * 有效的数据长度范围
 * @readonly
 * @type {{min: number, max: number}}
 */
const VALID_DATA_LENGTH_RANGE = { min: 0, max: 128 }

// ========== 基础验证函数 ==========

/**
 * 验证值是否为非空字符串
 * @param {*} value - 要验证的值
 * @param {string} paramName - 参数名称
 * @returns {string} 验证后的字符串值
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateNonEmptyString(value, paramName) {
  if (value === null || value === undefined) {
    throw createMissingParameterError(paramName)
  }

  if (typeof value !== 'string') {
    throw createParameterError(paramName, value, 'string')
  }

  if (value.trim().length === 0) {
    throw createParameterError(paramName, value, 'non-empty string')
  }

  return value.trim()
}

/**
 * 验证值是否为数字
 * @param {*} value - 要验证的值
 * @param {string} paramName - 参数名称
 * @param {Object} [options] - 验证选项
 * @param {number} [options.min] - 最小值
 * @param {number} [options.max] - 最大值
 * @param {boolean} [options.integer=false] - 是否必须为整数
 * @returns {number} 验证后的数值
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateNumber(value, paramName, options = {}) {
  const { min, max, integer = false } = options

  if (value === null || value === undefined) {
    throw createMissingParameterError(paramName)
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw createParameterError(paramName, value, 'number')
  }

  if (integer && !Number.isInteger(value)) {
    throw createParameterError(paramName, value, 'integer')
  }

  if (min !== undefined && value < min) {
    throw createParameterError(paramName, value, `number >= ${min}`)
  }

  if (max !== undefined && value > max) {
    throw createParameterError(paramName, value, `number <= ${max}`)
  }

  return value
}

/**
 * 验证值是否为布尔值
 * @param {*} value - 要验证的值
 * @param {string} paramName - 参数名称
 * @returns {boolean} 验证后的布尔值
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateBoolean(value, paramName) {
  if (value === null || value === undefined) {
    throw createMissingParameterError(paramName)
  }

  if (typeof value !== 'boolean') {
    throw createParameterError(paramName, value, 'boolean')
  }

  return value
}

/**
 * 验证值是否为函数
 * @param {*} value - 要验证的值
 * @param {string} paramName - 参数名称
 * @returns {Function} 验证后的函数
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateFunction(value, paramName) {
  if (value === null || value === undefined) {
    throw createMissingParameterError(paramName)
  }

  if (typeof value !== 'function') {
    throw createParameterError(paramName, value, 'function')
  }

  return value
}

/**
 * 验证值是否为 Uint8Array
 * @param {*} value - 要验证的值
 * @param {string} paramName - 参数名称
 * @param {Object} [options] - 验证选项
 * @param {number} [options.minLength] - 最小长度
 * @param {number} [options.maxLength] - 最大长度
 * @returns {Uint8Array} 验证后的 Uint8Array
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateUint8Array(value, paramName, options = {}) {
  const { minLength, maxLength } = options

  if (value === null || value === undefined) {
    throw createMissingParameterError(paramName)
  }

  if (!(value instanceof Uint8Array)) {
    throw createParameterError(paramName, value, 'Uint8Array')
  }

  if (minLength !== undefined && value.length < minLength) {
    throw createParameterError(paramName, `length=${value.length}`, `length >= ${minLength}`)
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw createParameterError(paramName, `length=${value.length}`, `length <= ${maxLength}`)
  }

  return value
}

// ========== 蓝牙特定验证函数 ==========

/**
 * 验证设备 ID
 * @param {*} deviceId - 设备 ID
 * @returns {string} 验证后的设备 ID
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateDeviceId(deviceId) {
  const validatedId = validateNonEmptyString(deviceId, 'deviceId')

  // 设备 ID 可以是 MAC 地址或 UUID，这里只做基本检查
  // 实际格式可能因平台而异
  if (validatedId.length < 1) {
    throw createParameterError('deviceId', deviceId, 'valid device ID')
  }

  return validatedId
}

/**
 * 验证 UUID 格式
 * @param {*} uuid - UUID 字符串
 * @param {string} [paramName='uuid'] - 参数名称
 * @returns {string} 验证后的 UUID
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateUUID(uuid, paramName = 'uuid') {
  const validatedUuid = validateNonEmptyString(uuid, paramName)

  // 标准化 UUID（转小写）
  const normalizedUuid = validatedUuid.toLowerCase()

  // 验证格式
  if (!UUID_REGEX.test(normalizedUuid)) {
    throw createParameterError(paramName, uuid, 'valid UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
  }

  return normalizedUuid
}

/**
 * 验证服务 UUID
 * @param {*} serviceUUID - 服务 UUID
 * @returns {string} 验证后的服务 UUID
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateServiceUUID(serviceUUID) {
  return validateUUID(serviceUUID, 'serviceUUID')
}

/**
 * 验证特征值 UUID
 * @param {*} characteristicUUID - 特征值 UUID
 * @returns {string} 验证后的特征值 UUID
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateCharacteristicUUID(characteristicUUID) {
  return validateUUID(characteristicUUID, 'characteristicUUID')
}

/**
 * 验证命令字
 * @param {*} command - 命令字
 * @returns {number} 验证后的命令字
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateCommand(command) {
  const validatedCommand = validateNumber(command, 'command', {
    min: VALID_COMMAND_RANGE.min,
    max: VALID_COMMAND_RANGE.max,
    integer: true,
  })

  return validatedCommand
}

/**
 * 验证数据长度
 * @param {*} length - 数据长度
 * @param {Object} [options] - 验证选项
 * @param {number} [options.maxLength=128] - 最大长度
 * @returns {number} 验证后的长度
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateDataLength(length, options = {}) {
  const { maxLength = VALID_DATA_LENGTH_RANGE.max } = options

  const validatedLength = validateNumber(length, 'length', {
    min: VALID_DATA_LENGTH_RANGE.min,
    max: maxLength,
    integer: true,
  })

  return validatedLength
}

/**
 * 验证数据负载
 * @param {*} data - 数据负载
 * @param {Object} [options] - 验证选项
 * @param {number} [options.maxLength=128] - 最大长度
 * @returns {Uint8Array|number[]} 验证后的数据
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateDataPayload(data, options = {}) {
  const { maxLength = VALID_DATA_LENGTH_RANGE.max } = options

  if (data === null || data === undefined) {
    return []
  }

  // 支持多种数据类型
  if (data instanceof Uint8Array) {
    if (data.length > maxLength) {
      throw createParameterError('data', `length=${data.length}`, `length <= ${maxLength}`)
    }
    return data
  }

  if (Array.isArray(data)) {
    if (data.length > maxLength) {
      throw createParameterError('data', `length=${data.length}`, `length <= ${maxLength}`)
    }
    // 验证数组元素是否为 0-255 的整数
    for (let i = 0; i < data.length; i++) {
      const byte = data[i]
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw createParameterError(`data[${i}]`, byte, 'integer (0-255)')
      }
    }
    return data
  }

  if (data instanceof ArrayBuffer) {
    const array = new Uint8Array(data)
    if (array.length > maxLength) {
      throw createParameterError('data', `length=${array.length}`, `length <= ${maxLength}`)
    }
    return array
  }

  throw createParameterError('data', typeof data, 'Uint8Array, Array, or ArrayBuffer')
}

/**
 * 验证扫描时长
 * @param {*} duration - 扫描时长（毫秒）
 * @param {Object} [options] - 验证选项
 * @param {number} [options.min=1000] - 最小时长
 * @param {number} [options.max=30000] - 最大时长
 * @returns {number} 验证后的时长
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateScanDuration(duration, options = {}) {
  const { min = 1000, max = 30000 } = options

  const validatedDuration = validateNumber(duration, 'duration', {
    min,
    max,
    integer: true,
  })

  return validatedDuration
}

/**
 * 验证超时时间
 * @param {*} timeout - 超时时间（毫秒）
 * @param {string} [paramName='timeout'] - 参数名称
 * @param {Object} [options] - 验证选项
 * @param {number} [options.min=1000] - 最小超时
 * @param {number} [options.max=60000] - 最大超时
 * @returns {number} 验证后的超时时间
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateTimeout(timeout, paramName = 'timeout', options = {}) {
  const { min = 1000, max = 60000 } = options

  const validatedTimeout = validateNumber(timeout, paramName, {
    min,
    max,
    integer: true,
  })

  return validatedTimeout
}

// ========== 批量验证函数 ==========

/**
 * 验证连接参数
 * @param {Object} params - 连接参数
 * @param {string} params.deviceId - 设备 ID
 * @returns {Object} 验证后的参数
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateConnectParams(params) {
  if (!params || typeof params !== 'object') {
    throw createParameterError('params', params, 'object')
  }

  return {
    deviceId: validateDeviceId(params.deviceId),
  }
}

/**
 * 验证写入参数
 * @param {Object} params - 写入参数
 * @param {string} params.deviceId - 设备 ID
 * @param {string} params.serviceUUID - 服务 UUID
 * @param {string} params.characteristicUUID - 特征值 UUID
 * @param {Uint8Array|Array} params.value - 要写入的值
 * @returns {Object} 验证后的参数
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateWriteParams(params) {
  if (!params || typeof params !== 'object') {
    throw createParameterError('params', params, 'object')
  }

  return {
    deviceId: validateDeviceId(params.deviceId),
    serviceUUID: validateServiceUUID(params.serviceUUID),
    characteristicUUID: validateCharacteristicUUID(params.characteristicUUID),
    value: validateDataPayload(params.value),
  }
}

/**
 * 验证读取参数
 * @param {Object} params - 读取参数
 * @param {string} params.deviceId - 设备 ID
 * @param {string} params.serviceUUID - 服务 UUID
 * @param {string} params.characteristicUUID - 特征值 UUID
 * @returns {Object} 验证后的参数
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateReadParams(params) {
  if (!params || typeof params !== 'object') {
    throw createParameterError('params', params, 'object')
  }

  return {
    deviceId: validateDeviceId(params.deviceId),
    serviceUUID: validateServiceUUID(params.serviceUUID),
    characteristicUUID: validateCharacteristicUUID(params.characteristicUUID),
  }
}

/**
 * 验证订阅参数
 * @param {Object} params - 订阅参数
 * @param {string} params.deviceId - 设备 ID
 * @param {string} params.serviceUUID - 服务 UUID
 * @param {string} params.characteristicUUID - 特征值 UUID
 * @param {Function} params.callback - 回调函数
 * @returns {Object} 验证后的参数
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateSubscribeParams(params) {
  if (!params || typeof params !== 'object') {
    throw createParameterError('params', params, 'object')
  }

  return {
    deviceId: validateDeviceId(params.deviceId),
    serviceUUID: validateServiceUUID(params.serviceUUID),
    characteristicUUID: validateCharacteristicUUID(params.characteristicUUID),
    callback: validateFunction(params.callback, 'callback'),
  }
}

/**
 * 验证数值范围
 * @param {number} value - 要验证的值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {string} paramName - 参数名称
 * @returns {number} 验证后的数值
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateNumberRange(value, min, max, paramName) {
  validateNumber(value, paramName)

  if (value < min || value > max) {
    throw createParameterError(paramName, value, `number between ${min} and ${max}`)
  }

  return value
}

/**
 * 验证轴类型（用于PID参数设置）
 * @param {string} axis - 轴类型
 * @param {string} paramName - 参数名称
 * @returns {string} 验证后的轴类型
 * @throws {ParameterError} 验证失败时抛出错误
 */
export function validateAxis(axis, paramName = 'axis') {
  if (axis === null || axis === undefined) {
    throw createMissingParameterError(paramName)
  }

  const validAxes = ['pitch', 'yaw']
  if (!validAxes.includes(axis)) {
    throw createParameterError(paramName, axis, `one of ${validAxes.join(', ')}`)
  }

  return axis
}

// ========== 默认导出 ==========

export default {
  validateNonEmptyString,
  validateNumber,
  validateBoolean,
  validateFunction,
  validateUint8Array,
  validateDeviceId,
  validateUUID,
  validateServiceUUID,
  validateCharacteristicUUID,
  validateCommand,
  validateDataLength,
  validateDataPayload,
  validateScanDuration,
  validateTimeout,
  validateConnectParams,
  validateWriteParams,
  validateReadParams,
  validateSubscribeParams,
  validateNumberRange,
  validateAxis,
}
