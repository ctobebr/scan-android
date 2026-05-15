/**
 * @fileoverview 存储相关常量配置
 * 集中管理文件系统操作的所有配置参数
 *
 * @module @/constants/storage
 */

// ========== 路径相关常量 =========-

/**
 * 点云数据根目录名称
 * @constant {string}
 */
export const POINTCLOUD_ROOT = 'pointcloud'

/**
 * 临时会话文件夹前缀
 * @constant {string}
 */
export const TEMP_PREFIX = 'a7f3c9d1-'

/**
 * 批次文件夹前缀
 * @constant {string}
 */
export const BATCH_PREFIX = 'Batch_'

export const PICTURE_FOLDER = 'allPicture'

/**
 * 批次编号长度（补零后的位数）
 * @constant {number}
 */
export const BATCH_NUMBER_LENGTH = 3

// ========== 会话ID验证相关常量 ==========

/**
 * 会话ID的正则模式：纯小写字母数字，8-12位
 * 由 dateToSessionId 生成的字符串符合此规则
 * @constant {RegExp}
 */
export const SESSION_ID_PATTERN = /^[0-9a-z]{8,12}$/

/**
 * 会话ID最小长度
 * @constant {number}
 */
export const SESSION_ID_MIN_LENGTH = 8

/**
 * 会话ID最大长度
 * @constant {number}
 */
export const SESSION_ID_MAX_LENGTH = 50

// ========== 文件类型相关常量 ==========

/**
 * 支持的图片文件扩展名列表
 * @constant {string[]}
 */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']

/**
 * 支持的数据文件扩展名列表
 * @constant {string[]}
 */
export const DATA_EXTENSIONS = ['.txt', '.csv', '.json']

/**
 * 点云数据文件前缀
 * @constant {string}
 */
export const POINTCLOUD_DATA_PREFIX = 'pointCloud_data_'

// ========== 递归和性能限制常量 ==========

/**
 * 最大递归深度限制，防止栈溢出
 * @constant {number}
 */
export const MAX_RECURSION_DEPTH = 100

/**
 * 最大批处理大小
 * @constant {number}
 */
export const MAX_BATCH_SIZE = 1000

// ========== 重试机制配置 ==========

/**
 * 重试配置
 * @constant {Object}
 */
export const RETRY_CONFIG = {
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  /** 基础延迟时间（毫秒） */
  BASE_DELAY: 100,
  /** 最大延迟时间（毫秒） */
  MAX_DELAY: 5000
}

// ========== 错误码常量 ==========

/**
 * 错误码枚举
 * @constant {Object}
 */
export const ErrorCodes = {
  /** 无效的会话ID */
  INVALID_SESSION_ID: 'INVALID_SESSION_ID',
  /** 无效的批次ID */
  INVALID_BATCH_ID: 'INVALID_BATCH_ID',
  /** 路径不存在 */
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  /** 权限被拒绝 */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  /** 文件系统错误 */
  FILESYSTEM_ERROR: 'FILESYSTEM_ERROR',
  /** 验证错误 */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 操作超时 */
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  /** 资源不足 */
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED'
}

// ========== 功能开关配置 ==========

/**
 * 功能开关配置
 * @constant {Object}
 */
export const FeatureFlags = {
  /** 启用重试机制 */
  ENABLE_RETRY_MECHANISM: true,
  /** 启用缓存 */
  ENABLE_CACHING: false,
  /** 启用压缩 */
  ENABLE_COMPRESSION: true,
  /** 严格验证模式 */
  STRICT_VALIDATION: true,
  /** 启用详细日志 */
  ENABLE_DETAILED_LOGGING: true
}

// ========== 模块名称（用于日志前缀）==========

/**
 * 模块名称（用于日志前缀）
 * @constant {string}
 */
export const MODULE_NAME = 'storage'
