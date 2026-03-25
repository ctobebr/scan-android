/**
 * @fileoverview 全局日志工具
 *
 * 提供统一的日志记录功能，支持日志级别控制、模块前缀、上下文信息等功能。
 * 供整个项目使用，避免各服务重复创建日志工具。
 *
 * @module @/utils/logger
 * @version 1.0.0
 * @since 2026-03-24
 */

// ========== 日志级别定义 ==========

/**
 * 日志级别枚举
 * @readonly
 * @enum {number}
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
}

/**
 * 日志级别名称映射
 * @readonly
 * @type {Object.<number, string>}
 */
const LOG_LEVEL_NAMES = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
}

// ========== 默认配置 ==========

/**
 * 默认日志配置
 * @readonly
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  // 全局日志级别
  // MODIFIED: 移除环境区分，默认使用 DEBUG 级别
  // 原因：项目目前只有一种环境，不需要区分生产和测试环境
  level: LogLevel.DEBUG,

  // 是否启用日志
  enabled: true,

  // 模块级别的日志开关
  modules: {},

  // 是否包含时间戳
  timestamp: true,

  // 格式化选项
  format: {
    showModule: true,
    showTimestamp: true,
    maxObjectDepth: 3,
  },
}

// ========== 当前配置 ==========

let currentConfig = { ...DEFAULT_CONFIG }

// ========== 私有函数 ==========

/**
 * 格式化时间戳
 * @private
 * @returns {string} 格式化后的时间戳
 */
function formatTimestamp() {
  const now = new Date()
  return now.toISOString().split('T')[1].split('.')[0]
}

/**
 * 序列化参数
 * @private
 * @param {*} arg - 要序列化的参数
 * @param {number} [depth=0] - 当前深度
 * @returns {string} 序列化后的字符串
 */
function serializeArg(arg, depth = 0) {
  if (depth > currentConfig.format.maxObjectDepth) {
    return '[Object]'
  }

  if (arg === null) return 'null'
  if (arg === undefined) return 'undefined'
  if (typeof arg === 'string') return arg
  if (typeof arg === 'number') return String(arg)
  if (typeof arg === 'boolean') return String(arg)
  if (typeof arg === 'function') return '[Function]'
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`

  if (Array.isArray(arg)) {
    const items = arg.map((item) => serializeArg(item, depth + 1))
    return `[${items.join(', ')}]`
  }

  if (typeof arg === 'object') {
    try {
      const entries = Object.entries(arg)
        .slice(0, 5)
        .map(([key, value]) => `${key}: ${serializeArg(value, depth + 1)}`)
      const suffix = Object.keys(arg).length > 5 ? ', ...' : ''
      return `{${entries.join(', ')}${suffix}}`
    } catch {
      return '[Object]'
    }
  }

  return String(arg)
}

/**
 * 格式化日志消息
 * @private
 * @param {string} levelName - 日志级别名称
 * @param {string} moduleName - 模块名称
 * @param {string} message - 日志消息
 * @param {Array} args - 额外参数
 * @returns {string} 格式化后的日志消息
 */
function formatMessage(levelName, moduleName, message, args) {
  const parts = []

  // 时间戳
  if (currentConfig.format.showTimestamp && currentConfig.timestamp) {
    parts.push(`[${formatTimestamp()}]`)
  }

  // 日志级别
  parts.push(`[${levelName}]`)

  // 模块名称
  if (currentConfig.format.showModule && moduleName) {
    parts.push(`[${moduleName}]`)
  }

  // 消息和参数
  const serializedArgs = args.map((arg) => serializeArg(arg))
  parts.push(message)

  if (serializedArgs.length > 0) {
    parts.push(serializedArgs.join(' '))
  }

  return parts.join(' ')
}

/**
 * 检查是否应该记录日志
 * @private
 * @param {number} level - 日志级别
 * @param {string} [moduleName] - 模块名称
 * @returns {boolean} 是否应该记录
 */
function shouldLog(level, moduleName) {
  // 检查全局启用状态
  if (!currentConfig.enabled) {
    return false
  }

  // 检查模块级别开关
  if (moduleName && currentConfig.modules[moduleName] === false) {
    return false
  }

  // 检查日志级别
  return level >= currentConfig.level
}

// ========== 日志记录器类 ==========

/**
 * 日志记录器类
 * 提供结构化的日志记录功能
 */
class Logger {
  /**
   * 创建日志记录器实例
   * @param {string} [moduleName] - 模块名称
   * @param {Object} [context] - 上下文信息
   */
  constructor(moduleName = '', context = {}) {
    this.moduleName = moduleName
    this.context = { ...context }
  }

  /**
   * 创建带模块前缀的日志记录器
   * @param {string} moduleName - 模块名称
   * @returns {Logger} 新的日志记录器实例
   */
  withModule(moduleName) {
    return new Logger(moduleName, this.context)
  }

  /**
   * 创建带上下文的日志记录器
   * @param {Object} context - 上下文信息
   * @returns {Logger} 新的日志记录器实例
   */
  withContext(context) {
    return new Logger(this.moduleName, { ...this.context, ...context })
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {...*} args - 额外参数
   */
  debug(message, ...args) {
    this._log(LogLevel.DEBUG, message, args)
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {...*} args - 额外参数
   */
  info(message, ...args) {
    this._log(LogLevel.INFO, message, args)
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {...*} args - 额外参数
   */
  warn(message, ...args) {
    this._log(LogLevel.WARN, message, args)
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {...*} args - 额外参数
   */
  error(message, ...args) {
    this._log(LogLevel.ERROR, message, args)
  }

  /**
   * 内部日志记录方法
   * @private
   * @param {number} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Array} args - 额外参数
   */
  _log(level, message, args) {
    if (!shouldLog(level, this.moduleName)) {
      return
    }

    const levelName = LOG_LEVEL_NAMES[level]
    const formattedMessage = formatMessage(levelName, this.moduleName, message, args)

    // 添加上下文信息
    let finalMessage = formattedMessage
    if (Object.keys(this.context).length > 0) {
      const contextStr = Object.entries(this.context)
        .map(([key, value]) => `${key}=${serializeArg(value)}`)
        .join(', ')
      finalMessage = `${formattedMessage} | Context: {${contextStr}}`
    }

    // 输出到控制台
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(finalMessage)
        break
      case LogLevel.INFO:
        console.info(finalMessage)
        break
      case LogLevel.WARN:
        console.warn(finalMessage)
        break
      case LogLevel.ERROR:
        console.error(finalMessage)
        break
    }
  }
}

// ========== 配置管理 ==========

/**
 * 配置日志工具
 * @param {Object} config - 配置对象
 * @param {number} [config.level] - 日志级别
 * @param {boolean} [config.enabled] - 是否启用日志
 * @param {Object} [config.modules] - 模块级别配置
 * @param {boolean} [config.timestamp] - 是否显示时间戳
 * @param {Object} [config.format] - 格式化选项
 */
export function configureLogger(config) {
  currentConfig = {
    ...currentConfig,
    ...config,
    format: {
      ...currentConfig.format,
      ...(config.format || {}),
    },
  }
}

/**
 * 获取当前配置
 * @returns {Object} 当前配置对象
 */
export function getLoggerConfig() {
  return { ...currentConfig }
}

/**
 * 重置为默认配置
 */
export function resetLoggerConfig() {
  currentConfig = { ...DEFAULT_CONFIG }
}

// ========== 导出实例 ==========

/**
 * 默认日志记录器实例
 * @type {Logger}
 */
export const logger = new Logger()

/**
 * 创建指定模块的日志记录器
 * @param {string} moduleName - 模块名称
 * @returns {Logger} 日志记录器实例
 */
export function createLogger(moduleName) {
  return new Logger(moduleName)
}
