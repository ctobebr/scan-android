/**
 * @fileoverview 文件系统服务模块
 * 封装 Capacitor Filesystem API，提供统一的文件操作接口
 * 包含错误处理、重试机制、日志记录等功能
 *
 * @module @/services/storage/fileSystem
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
import {
  ErrorCodes,
  MAX_RECURSION_DEPTH,
  RETRY_CONFIG,
  MODULE_NAME,
  FeatureFlags
} from '@/constants/storage'
import { FilePathError, sanitizePath } from '@/utils/storage/validate'
// MODIFIED: 使用全局日志工具替换独立实现
// 原因：统一日志管理，消除代码重复
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger, LogLevel, configureLogger } from '@/utils/logger'

// ========== 日志工具 ==========
// MODIFIED: 使用全局日志工具创建模块专用记录器
const logger = createLogger('FileSystem')

// MODIFIED: 根据 FeatureFlags 配置日志级别
// 保持与原有行为兼容
if (!FeatureFlags.ENABLE_DETAILED_LOGGING) {
  configureLogger({
    modules: {
      FileSystem: false
    }
  })
}

// ========== 辅助函数 ==========

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 错误包装函数
 * @param {Error} error - 原始错误
 * @param {string} code - 错误码
 * @param {string} context - 错误上下文
 * @returns {FilePathError} 包装后的错误
 */
function wrapError(error, code, context) {
  if (error instanceof FilePathError) return error
  return new FilePathError(
    code,
    `${context}: ${error.message}`,
    { originalError: error.message, stack: error.stack }
  )
}

/**
 * 重试操作包装器
 * @param {Function} operation - 要执行的操作
 * @param {string} context - 操作上下文（用于日志）
 * @param {number} [maxRetries=RETRY_CONFIG.MAX_RETRIES] - 最大重试次数
 * @returns {Promise<*>} 操作结果
 */
async function retryOperation(operation, context, maxRetries = RETRY_CONFIG.MAX_RETRIES) {
  if (!FeatureFlags.ENABLE_RETRY_MECHANISM) {
    return await operation()
  }

  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (i < maxRetries - 1) {
        const delay = Math.min(
          RETRY_CONFIG.BASE_DELAY * Math.pow(2, i),
          RETRY_CONFIG.MAX_DELAY
        )
        logger.warn(`${context} 失败，${delay}ms后重试 (${i + 1}/${maxRetries})`, error.message)
        await sleep(delay)
      }
    }
  }
  throw lastError
}

// ========== 基础文件操作 ==========

/**
 * 读取文件内容
 * @param {string} path - 文件路径（相对于 Documents）
 * @param {Object} [opts={}] - 可选参数
 * @param {string} [opts.encoding] - 编码格式（如 'utf8'）
 * @returns {Promise<Object>} Capacitor 读取结果
 * @throws {FilePathError} 当路径无效或读取失败时抛出
 */
export async function readFile(path, opts = {}) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '文件路径无效')
  }

  return retryOperation(
    () => Filesystem.readFile({
      path: sanitizedPath,
      directory: Directory.Documents,
      encoding: opts.encoding
    }),
    `读取文件 ${sanitizedPath}`
  )
}

/**
 * 写入文件
 * @param {string} path - 文件路径（相对于 Documents）
 * @param {string} data - 文件数据
 * @param {Object} [opts={}] - 可选参数
 * @param {string} [opts.encoding] - 编码格式
 * @returns {Promise<void>}
 * @throws {FilePathError} 当路径无效或写入失败时抛出
 */
export async function writeFile(path, data, opts = {}) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '文件路径无效')
  }

  return retryOperation(
    () => Filesystem.writeFile({
      path: sanitizedPath,
      data,
      directory: Directory.Documents,
      encoding: opts.encoding
    }),
    `写入文件 ${sanitizedPath}`
  )
}

/**
 * 删除文件
 * @param {string} path - 文件路径
 * @returns {Promise<void>}
 * @throws {FilePathError} 当删除失败时抛出
 */
export async function deleteFile(path) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '文件路径无效')
  }

  return retryOperation(
    () => Filesystem.deleteFile({
      path: sanitizedPath,
      directory: Directory.Documents
    }),
    `删除文件 ${sanitizedPath}`
  )
}

/**
 * 获取文件的 URI
 * @param {string} path - 文件路径
 * @returns {Promise<{uri: string}>} 包含文件 URI 的对象
 * @throws {FilePathError} 当路径无效或获取失败时抛出
 */
export async function getUri(path) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '文件路径无效')
  }

  return retryOperation(
    () => Filesystem.getUri({
      path: sanitizedPath,
      directory: Directory.Documents
    }),
    `获取URI ${sanitizedPath}`
  )
}

/**
 * 获取文件/目录的状态信息
 * @param {string} path - 文件/目录路径
 * @returns {Promise<Object>} 包含大小、修改时间等状态信息
 * @throws {FilePathError} 当路径无效或获取失败时抛出
 */
export async function stat(path) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '路径无效')
  }

  return retryOperation(
    () => Filesystem.stat({
      path: sanitizedPath,
      directory: Directory.Documents
    }),
    `获取状态 ${sanitizedPath}`
  )
}

// ========== 目录操作 ==========

/**
 * 读取目录内容
 * @param {string} path - 目录路径（相对于 Documents）
 * @returns {Promise<{files: Array}>} 目录中的文件列表
 * @throws {FilePathError} 当路径无效或读取失败时抛出
 */
export async function readdir(path) {
  const sanitizedPath = sanitizePath(path)
  if (sanitizedPath === null) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '目录路径无效')
  }

  return retryOperation(
    () => Filesystem.readdir({
      path: sanitizedPath,
      directory: Directory.Documents
    }),
    `读取目录 ${sanitizedPath}`
  )
}

/**
 * 创建目录
 * @param {string} path - 目录路径
 * @param {Object} [opts={}] - 可选参数
 * @param {boolean} [opts.recursive=false] - 是否递归创建
 * @returns {Promise<void>}
 * @throws {FilePathError} 当路径无效或创建失败时抛出
 */
export async function mkdir(path, opts = {}) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '目录路径无效')
  }

  return retryOperation(
    () => Filesystem.mkdir({
      path: sanitizedPath,
      directory: Directory.Documents,
      recursive: !!opts.recursive
    }),
    `创建目录 ${sanitizedPath}`
  )
}

/**
 * 删除目录
 * @param {string} path - 目录路径
 * @param {Object} [opts={}] - 可选参数
 * @param {boolean} [opts.recursive=false] - 是否递归删除
 * @returns {Promise<void>}
 * @throws {FilePathError} 当删除失败时抛出
 */
export async function rmdir(path, opts = {}) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '目录路径无效')
  }

  // 优先使用原生 rmdir
  if (Filesystem.rmdir) {
    return retryOperation(
      () => Filesystem.rmdir({
        path: sanitizedPath,
        directory: Directory.Documents,
        recursive: !!opts.recursive
      }),
      `删除目录 ${sanitizedPath}`
    )
  }

  // 降级方案
  return retryOperation(
    () => Filesystem.deleteFile({
      path: sanitizedPath,
      directory: Directory.Documents
    }),
    `删除目录(降级) ${sanitizedPath}`
  )
}

/**
 * 重命名文件或文件夹
 * @param {string} oldPath - 原路径
 * @param {string} newPath - 新路径
 * @returns {Promise<void>}
 * @throws {FilePathError} 当路径无效或重命名失败时抛出
 */
export async function rename(oldPath, newPath) {
  const sanitizedOldPath = sanitizePath(oldPath)
  const sanitizedNewPath = sanitizePath(newPath)

  if (!sanitizedOldPath || !sanitizedNewPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '路径无效')
  }

  if (!Filesystem.rename) {
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, '当前平台不支持重命名操作')
  }

  return retryOperation(
    () => Filesystem.rename({
      directory: Directory.Documents,
      from: sanitizedOldPath,
      to: sanitizedNewPath,
      path: sanitizedOldPath
    }),
    `重命名 ${sanitizedOldPath} -> ${sanitizedNewPath}`
  )
}

// ========== 高级文件操作 ==========

/**
 * 确保目录存在，如果不存在则递归创建
 * @param {string} path - 相对于 Documents 的路径
 * @returns {Promise<string>} 确保存在的目录路径
 * @throws {FilePathError} 当创建失败时抛出
 */
export async function ensureDir(path) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '目录路径无效')
  }

  try {
    await readdir(sanitizedPath)
    logger.debug('目录已存在', { path: sanitizedPath })
  } catch (e) {
    if (e.message && e.message.includes('Directory does not exist')) {
      logger.info('创建目录', { path: sanitizedPath })
      await mkdir(sanitizedPath, { recursive: true })
    } else {
      throw wrapError(e, ErrorCodes.FILESYSTEM_ERROR, '确保目录存在失败')
    }
  }
  return sanitizedPath
}

// ========== 删除操作拆分（符合单一职责）==========

/**
 * 使用原生 API 删除路径
 * @param {string} sanitizedPath - 已清理的路径
 * @returns {Promise<boolean>} 是否成功删除
 */
async function deleteWithNativeApi(sanitizedPath) {
  try {
    if (Filesystem.rmdir) {
      await Filesystem.rmdir({
        path: sanitizedPath,
        directory: Directory.Documents,
        recursive: true
      })
      logger.info('删除成功（使用rmdir）', { path: sanitizedPath })
      return true
    }

    await Filesystem.deleteFile({
      path: sanitizedPath,
      directory: Directory.Documents
    })
    logger.info('删除成功（使用deleteFile）', { path: sanitizedPath })
    return true
  } catch (e) {
    // 文件不存在不算错误
    if (e.message && e.message.includes('does not exist')) {
      logger.debug('文件不存在，跳过删除', { path: sanitizedPath })
      return true
    }
    return false
  }
}

/**
 * 手动递归删除目录内容
 * @param {string} sanitizedPath - 已清理的目录路径
 * @returns {Promise<void>}
 */
async function deleteDirectoryContents(sanitizedPath) {
  const items = await listFilesRecursive(sanitizedPath)

  for (const itemPath of items) {
    try {
      await Filesystem.deleteFile({
        path: itemPath,
        directory: Directory.Documents
      })
    } catch (err) {
      logger.warn('删除子文件失败', { path: itemPath, error: err.message })
    }
  }
}

/**
 * 删除空目录
 * @param {string} sanitizedPath - 已清理的目录路径
 * @returns {Promise<boolean>} 是否成功删除
 */
async function deleteEmptyDirectory(sanitizedPath) {
  try {
    if (Filesystem.rmdir) {
      await Filesystem.rmdir({
        path: sanitizedPath,
        directory: Directory.Documents,
        recursive: true
      })
    } else {
      await Filesystem.deleteFile({
        path: sanitizedPath,
        directory: Directory.Documents
      })
    }
    return true
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) {
      return true
    }
    return false
  }
}

/**
 * 递归删除文件或文件夹
 * @param {string} path - 要删除的路径
 * @returns {Promise<void>}
 * @throws {FilePathError} 当删除失败时抛出
 */
export async function deletePath(path) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '路径无效')
  }

  // 尝试使用原生 API 删除
  const nativeSuccess = await deleteWithNativeApi(sanitizedPath)
  if (nativeSuccess) {
    return
  }

  // 原生删除失败，使用手动递归删除
  logger.warn('原生删除失败，尝试手动递归', { path: sanitizedPath })

  try {
    await deleteDirectoryContents(sanitizedPath)
    const emptyDirSuccess = await deleteEmptyDirectory(sanitizedPath)

    if (!emptyDirSuccess) {
      throw new Error('删除空目录失败')
    }

    logger.info('手动递归删除成功', { path: sanitizedPath })
  } catch (e) {
    throw wrapError(e, ErrorCodes.FILESYSTEM_ERROR, '删除路径失败')
  }
}

// ========== 文件列表操作 ==========

/**
 * 递归列出指定路径下的所有文件
 * @param {string} path - 要列出的路径
 * @param {number} [maxDepth=MAX_RECURSION_DEPTH] - 最大递归深度
 * @returns {Promise<string[]>} 文件路径数组
 * @throws {FilePathError} 当路径无效时抛出
 */
export async function listFilesRecursive(path, maxDepth = MAX_RECURSION_DEPTH) {
  const sanitizedPath = sanitizePath(path)
  if (!sanitizedPath) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '路径无效')
  }

  if (maxDepth <= 0) {
    logger.warn('达到最大递归深度限制', { path: sanitizedPath, maxDepth })
    return []
  }

  const results = []

  async function walk(currentPath, currentDepth) {
    if (currentDepth <= 0) {
      logger.warn('目录层级过深，跳过', { path: currentPath })
      return
    }

    try {
      const res = await readdir(currentPath)
      for (const file of res.files || []) {
        const fullPath = `${currentPath}/${file.name}`
        if (file.type === 'directory') {
          await walk(fullPath, currentDepth - 1)
        } else {
          results.push(fullPath)
        }
      }
    } catch (e) {
      logger.warn('读取目录失败', { path: currentPath, error: e.message })
    }
  }

  await walk(sanitizedPath, maxDepth)
  return results
}

/**
 * 列出文件夹下的直接文件（非递归）
 * @param {string} path - 文件夹路径
 * @returns {Promise<Array>} 文件列表
 */
export async function listFilesInFolder(path) {
  try {
    const res = await readdir(path)
    return res.files || []
  } catch (e) {
    logger.warn('列出文件夹内容失败', { path, error: e.message })
    return []
  }
}

/**
 * 确保 no-media 标记存在，防止系统媒体扫描
 * @param {string} basePath - 相对于 Documents 的目录
 * @returns {Promise<void>}
 */
export async function ensureNoMedia(basePath) {
  const markerPath = `${basePath}/.nomedia`
  try {
    await writeFile(markerPath, '', { encoding: 'utf8' })
    logger.debug('创建.nomedia标记', { path: markerPath })
  } catch (e) {
    // 忽略错误，这不是关键操作
    logger.debug('创建.nomedia标记失败（可忽略）', { path: markerPath, error: e.message })
  }
}

/**
 * 检查文件是否存在
 * @param {string} path - 文件路径
 * @returns {Promise<boolean>} 是否存在
 */
export async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 复制文件
 * @param {string} fromPath - 源文件路径
 * @param {string} toPath - 目标文件路径
 * @returns {Promise<void>}
 * @throws {FilePathError} 当复制失败时抛出
 */
export async function copyFile(fromPath, toPath) {
  const sanitizedFrom = sanitizePath(fromPath)
  const sanitizedTo = sanitizePath(toPath)

  if (!sanitizedFrom || !sanitizedTo) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '路径无效')
  }

  // 读取源文件
  const content = await readFile(sanitizedFrom)
  // 写入目标文件
  await writeFile(sanitizedTo, content.data)
  logger.info('文件复制成功', { from: sanitizedFrom, to: sanitizedTo })
}

/**
 * 移动文件或目录
 * @param {string} fromPath - 源路径
 * @param {string} toPath - 目标路径
 * @returns {Promise<void>}
 * @throws {FilePathError} 当移动失败时抛出
 */
export async function move(fromPath, toPath) {
  try {
    // 优先使用重命名（同分区移动更快）
    await rename(fromPath, toPath)
  } catch (e) {
    // 如果重命名失败（跨分区），使用复制+删除
    logger.warn('重命名失败，尝试复制+删除方式', { error: e.message })
    await copyFile(fromPath, toPath)
    await deletePath(fromPath)
  }
}
