/**
 * @fileoverview 蓝牙服务配置管理
 *
 * 集中管理蓝牙服务的配置项，支持自定义配置和运行时调整。
 *
 * @module @/services/bluetooth/config
 * @version 1.0.0
 * @since 2026-03-24
 */

// 导入协议常量，避免重复定义
// 原因：统一常量管理，消除重复定义
import {
  PROTOCOL_HEADER_HIGH,
  PROTOCOL_HEADER_LOW,
  MAX_DATA_LENGTH,
  MAX_PACKET_SIZE,
} from '@/constants/bluetooth'

// ========== 默认配置 ==========

/**
 * 蓝牙服务默认配置
 * @readonly
 * @type {Object}
 */
export const DEFAULT_CONFIG = {
  // 扫描配置
  scan: {
    // 默认扫描时长（毫秒）
    duration: 5000,
    // 最小扫描时长（毫秒）
    minDuration: 1000,
    // 最大扫描时长（毫秒）
    maxDuration: 30000,
    // 是否允许重复设备
    allowDuplicates: false,
  },

  // 连接配置
  connection: {
    // 连接超时时间（毫秒）
    timeout: 10000,
    // 是否自动重连
    autoReconnect: false,
    // 最大重连次数
    maxReconnectAttempts: 3,
    // 重连间隔（毫秒）
    reconnectInterval: 2000,
  },

  // 读写配置
  io: {
    // 写入超时时间（毫秒）
    writeTimeout: 5000,
    // 读取超时时间（毫秒）
    readTimeout: 5000,
    // 最大数据包大小（字节）
    // 使用导入的常量
    maxPacketSize: MAX_PACKET_SIZE,
    // 服务缓存持续时间（毫秒）
    cacheDuration: 60000,
  },

  // 协议配置
  protocol: {
    // 协议头高字节
    // 使用导入的常量
    headerHigh: PROTOCOL_HEADER_HIGH,
    // 协议头低字节
    // 使用导入的常量
    headerLow: PROTOCOL_HEADER_LOW,
    // 最大数据长度
    // 使用导入的常量
    maxDataLength: MAX_DATA_LENGTH,
    // 校验和计算方式
    checksumMode: 'sum', // 'sum' | 'crc8' | 'crc16'
  },

  // 功能开关
  features: {
    // 启用详细日志
    enableDetailedLogging: false,
    // 启用重试机制
    enableRetry: true,
    // 启用自动清理
    enableAutoCleanup: true,
    // 启用连接状态监控
    enableConnectionMonitoring: true,
  },

  // 缓存配置
  cache: {
    // 设备缓存时间（毫秒）
    deviceCacheDuration: 30000,
    // 服务发现缓存时间（毫秒）
    serviceCacheDuration: 60000,
    // 最大缓存设备数
    maxCachedDevices: 100,
  },
}

// ========== 当前配置 ==========

let currentConfig = { ...DEFAULT_CONFIG }

// ========== 配置管理函数 ==========

/**
 * 获取当前配置
 * @returns {Object} 当前配置对象的深拷贝
 */
export function getConfig() {
  return deepClone(currentConfig)
}

/**
 * 更新配置
 * @param {Object} newConfig - 新的配置对象
 * @param {Object} [options] - 配置选项
 * @param {boolean} [options.merge=true] - 是否合并配置（true=合并，false=替换）
 * @param {boolean} [options.validate=true] - 是否验证配置
 * @returns {Object} 更新后的配置
 * @throws {Error} 配置验证失败时抛出错误
 */
export function updateConfig(newConfig, options = {}) {
  const { merge = true, validate = true } = options

  if (validate) {
    validateConfig(newConfig)
  }

  if (merge) {
    currentConfig = deepMerge(currentConfig, newConfig)
  } else {
    currentConfig = deepMerge({ ...DEFAULT_CONFIG }, newConfig)
  }

  return getConfig()
}

/**
 * 重置为默认配置
 */
export function resetConfig() {
  currentConfig = { ...DEFAULT_CONFIG }
}

/**
 * 获取特定配置项
 * @param {string} key - 配置键，支持点号分隔的路径（如 'scan.duration'）
 * @param {*} [defaultValue] - 默认值
 * @returns {*} 配置值
 */
export function getConfigValue(key, defaultValue = undefined) {
  const keys = key.split('.')
  let value = currentConfig

  for (const k of keys) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return defaultValue
    }
    value = value[k]
  }

  return value !== undefined ? value : defaultValue
}

/**
 * 设置特定配置项
 * @param {string} key - 配置键，支持点号分隔的路径
 * @param {*} value - 配置值
 * @returns {boolean} 是否设置成功
 */
export function setConfigValue(key, value) {
  const keys = key.split('.')
  let target = currentConfig

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (!(k in target) || typeof target[k] !== 'object') {
      target[k] = {}
    }
    target = target[k]
  }

  target[keys[keys.length - 1]] = value
  return true
}

// ========== 配置验证 ==========

/**
 * 验证配置对象
 * @param {Object} config - 要验证的配置对象
 * @throws {Error} 验证失败时抛出错误
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('配置必须是一个对象')
  }

  // 验证扫描配置
  if (config.scan) {
    validateScanConfig(config.scan)
  }

  // 验证连接配置
  if (config.connection) {
    validateConnectionConfig(config.connection)
  }

  // 验证 IO 配置
  if (config.io) {
    validateIoConfig(config.io)
  }

  // 验证协议配置
  if (config.protocol) {
    validateProtocolConfig(config.protocol)
  }
}

/**
 * 验证扫描配置
 * @private
 * @param {Object} scanConfig - 扫描配置
 * @throws {Error} 验证失败时抛出错误
 */
function validateScanConfig(scanConfig) {
  if (scanConfig.duration !== undefined) {
    if (typeof scanConfig.duration !== 'number' || scanConfig.duration < 0) {
      throw new Error('scan.duration 必须是正数')
    }
  }

  if (scanConfig.minDuration !== undefined && scanConfig.maxDuration !== undefined) {
    if (scanConfig.minDuration > scanConfig.maxDuration) {
      throw new Error('scan.minDuration 不能大于 scan.maxDuration')
    }
  }
}

/**
 * 验证连接配置
 * @private
 * @param {Object} connectionConfig - 连接配置
 * @throws {Error} 验证失败时抛出错误
 */
function validateConnectionConfig(connectionConfig) {
  if (connectionConfig.timeout !== undefined) {
    if (typeof connectionConfig.timeout !== 'number' || connectionConfig.timeout < 0) {
      throw new Error('connection.timeout 必须是正数')
    }
  }

  if (connectionConfig.maxReconnectAttempts !== undefined) {
    if (
      !Number.isInteger(connectionConfig.maxReconnectAttempts) ||
      connectionConfig.maxReconnectAttempts < 0
    ) {
      throw new Error('connection.maxReconnectAttempts 必须是非负整数')
    }
  }
}

/**
 * 验证 IO 配置
 * @private
 * @param {Object} ioConfig - IO 配置
 * @throws {Error} 验证失败时抛出错误
 */
function validateIoConfig(ioConfig) {
  if (ioConfig.maxPacketSize !== undefined) {
    if (!Number.isInteger(ioConfig.maxPacketSize) || ioConfig.maxPacketSize <= 0) {
      throw new Error('io.maxPacketSize 必须是正整数')
    }
  }
}

/**
 * 验证协议配置
 * @private
 * @param {Object} protocolConfig - 协议配置
 * @throws {Error} 验证失败时抛出错误
 */
function validateProtocolConfig(protocolConfig) {
  if (protocolConfig.maxDataLength !== undefined) {
    if (!Number.isInteger(protocolConfig.maxDataLength) || protocolConfig.maxDataLength <= 0) {
      throw new Error('protocol.maxDataLength 必须是正整数')
    }
  }

  const validChecksumModes = ['sum', 'crc8', 'crc16']
  if (
    protocolConfig.checksumMode !== undefined &&
    !validChecksumModes.includes(protocolConfig.checksumMode)
  ) {
    throw new Error(`protocol.checksumMode 必须是以下之一: ${validChecksumModes.join(', ')}`)
  }
}

// ========== 工具函数 ==========

/**
 * 深克隆对象
 * @private
 * @param {*} obj - 要克隆的对象
 * @returns {*} 克隆后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item))
  }

  const cloned = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key])
    }
  }

  return cloned
}

/**
 * 深度合并对象
 * @private
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target }

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
  }

  return result
}

// ========== 便捷配置获取函数 ==========

/**
 * 获取扫描配置
 * @returns {Object} 扫描配置
 */
export function getScanConfig() {
  return getConfigValue('scan', DEFAULT_CONFIG.scan)
}

/**
 * 获取连接配置
 * @returns {Object} 连接配置
 */
export function getConnectionConfig() {
  return getConfigValue('connection', DEFAULT_CONFIG.connection)
}

/**
 * 获取 IO 配置
 * @returns {Object} IO 配置
 */
export function getIoConfig() {
  return getConfigValue('io', DEFAULT_CONFIG.io)
}

/**
 * 获取协议配置
 * @returns {Object} 协议配置
 */
export function getProtocolConfig() {
  return getConfigValue('protocol', DEFAULT_CONFIG.protocol)
}

/**
 * 获取功能开关配置
 * @returns {Object} 功能开关配置
 */
export function getFeaturesConfig() {
  return getConfigValue('features', DEFAULT_CONFIG.features)
}

/**
 * 检查功能是否启用
 * @param {string} featureName - 功能名称
 * @returns {boolean} 是否启用
 */
export function isFeatureEnabled(featureName) {
  return getConfigValue(`features.${featureName}`, false)
}

// ========== 默认导出 ==========

export default {
  DEFAULT_CONFIG,
  getConfig,
  updateConfig,
  resetConfig,
  getConfigValue,
  setConfigValue,
  validateConfig,
  getScanConfig,
  getConnectionConfig,
  getIoConfig,
  getProtocolConfig,
  getFeaturesConfig,
  isFeatureEnabled,
}
