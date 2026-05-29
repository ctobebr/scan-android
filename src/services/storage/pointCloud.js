/**
 * @fileoverview 点云服务模块
 * 提供点云数据的业务逻辑操作，包括会话管理、批次操作、缩略图生成等
 * 所有操作都基于文件系统服务，添加业务层验证和日志
 */

import { parseSessionIdToFormattedTime } from '@/utils/format/sessionId'
import {
  POINTCLOUD_ROOT,
  ErrorCodes,
  MODULE_NAME,
  FeatureFlags,
  IMAGE_EXTENSIONS,
} from '@/constants/storage'
import {
  FilePathError,
  validateSessionId,
  validateBatchId,
  sanitizePath,
  validatePhotosArray,
  validateDataLines,
} from '@/utils/storage/validate'
import {
  sessionFolder,
  batchFolder,
  parseFolderName,
  isTempSession,
  getTempSessionName,
  extractSessionIdFromTemp,
  buildPointCloudDataFileName,
  normalizeBatchId,
  extractBatchNumber,
  isImageFile,
} from '@/utils/storage/path'
import ZipPlugin from '@/plugins/zip'
import {
  readFile,
  writeFile,
  getUri,
  stat,
  readdir,
  ensureDir,
  deleteDirectory,
  listFilesRecursive,
  rename,
  exists,
} from './fileSystem'
// 使用全局日志工具替换独立实现
// 原因：统一日志管理，消除代码重复
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger, configureLogger } from '@/utils/logger'

// ========== 日志工具 ==========
// 使用全局日志工具创建模块专用记录器
const logger = createLogger('PointCloud')

// 根据 FeatureFlags 配置日志级别
// 保持与原有行为兼容
if (!FeatureFlags.ENABLE_DETAILED_LOGGING) {
  configureLogger({
    modules: {
      PointCloud: false,
    },
  })
}

// ========== 事件通知 ==========

/**
 * 触发文件夹更新自定义事件
 * 用于通知应用的其他部分 pointcloud 文件夹内容已更新
 * @param {string} type - 事件类型（统一使用 'partial_update'）
 * @param {object} data - 事件附带的数据，包含 action 和 folders 等字段
 * @returns {boolean} 事件是否成功触发
 */
export function dispatchFolderUpdate(type, data) {
  if (!type || typeof type !== 'string') {
    logger.warn('dispatchFolderUpdate: 事件类型无效', { type })
    return false
  }

  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('pointcloud-updated', {
          detail: {
            type,
            timestamp: Date.now(),
            ...data,
          },
        }),
      )
      logger.info('已触发 pointcloud-updated 事件', { type, data })
      return true
    }
    return false
  } catch (e) {
    logger.warn('触发 pointcloud-updated 事件失败', { type, error: e.message })
    return false
  }
}

// ========== 目录管理 ==========

/**
 * 确保会话目录存在
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @returns {Promise<string>} 会话目录路径
 * @throws {FilePathError} 当文件夹名无效或创建失败时抛出
 */
export async function ensureSessionDir(folderName) {
  validateSessionId(folderName)

  const path = sessionFolder(folderName)
  await ensureDir(path)
  return path
}

/**
 * 确保批次目录存在
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {string|number} batchId - 批次ID
 * @returns {Promise<string>} 批次目录路径
 * @throws {FilePathError} 当参数无效或创建失败时抛出
 */
export async function ensureBatchDir(folderName, batchId) {
  validateSessionId(folderName)
  validateBatchId(batchId)
  await ensureSessionDir(folderName)
  const path = batchFolder(folderName, batchId)
  await ensureDir(path)
  return path
}

// ========== 会话操作 ==========

/**
 * 列出 pointcloud 根目录下的所有文件夹（即所有会话）
 * @returns {Promise<string[]>} 会话名称数组
 */
export async function listSessions() {
  try {
    const res = await readdir(POINTCLOUD_ROOT)
    return (res.files || []).filter((f) => f.type === 'directory').map((f) => f.name)
  } catch (e) {
    // 如果根目录不存在，返回空数组
    if (e.message && e.message.includes('Directory does not exist')) {
      logger.debug('pointcloud根目录不存在，返回空列表')
      return []
    }
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `列出会话失败: ${e.message}`)
  }
}

/**
 * 列出 pointcloud 文件夹下的所有文件夹
 * @param {boolean} [includeAll=false] - 是否包含所有文件夹（包括自定义文件夹）
 * @returns {Promise<Array>} 文件夹信息数组
 */
export async function listPointCloudFolders(includeAll = false) {
  try {
    const result = await readdir(POINTCLOUD_ROOT)

    const folders = result.files
      .filter((item) => item.type === 'directory')
      .map((folder) => ({
        name: folder.name,
      }))

    if (includeAll) {
      return folders.map((folder) => {
        const info = parseFolderName(folder.name)
        const formattedTime = info.sessionId ? parseSessionIdToFormattedTime(info.sessionId) : null
        return {
          ...folder,
          info: {
            ...info,
            formattedTime,
            displayDate: info.sessionId ? formattedTime : null,
          },
          shouldShow: info.shouldShow,
        }
      })
    } else {
      return filterDisplayableFolders(folders)
    }
  } catch (error) {
    logger.error('读取文件夹列表失败', { error: error.message })
    if (error.message.includes('ENOENT')) {
      logger.warn(`文件夹 ${POINTCLOUD_ROOT} 不存在或路径错误`)
      return []
    }
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `读取文件夹列表失败: ${error.message}`)
  }
}

/**
 * 过滤掉不应显示的文件夹
 * @param {Array<{name: string}>} folders - 原始文件夹列表
 * @returns {Array} 过滤后的文件夹列表（附带解析信息）
 */
export function filterDisplayableFolders(folders) {
  if (!Array.isArray(folders)) return []

  return folders
    .map((folder) => {
      const info = parseFolderName(folder.name)
      const formattedTime = info.sessionId ? parseSessionIdToFormattedTime(info.sessionId) : null
      info.displayDate = formattedTime
      return {
        ...folder,
        info,
        shouldShow: info.shouldShow,
      }
    })
    .filter((item) => item.shouldShow)
}

/**
 * 重命名会话文件夹
 * @param {string} oldName - 原文件夹名称
 * @param {string} newName - 新文件夹名称
 * @returns {Promise<boolean>} 重命名是否成功
 * @throws {FilePathError} 当重命名失败时抛出
 */
export async function renameSession(oldName, newName) {
  if (!oldName?.trim() || !newName?.trim()) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '需要提供原名称和新名称')
  }

  const trimmedOldName = oldName.trim()
  const trimmedNewName = newName.trim()

  if (trimmedOldName === trimmedNewName) {
    return true
  }

  const oldPath = `${POINTCLOUD_ROOT}/${trimmedOldName}`
  const newPath = `${POINTCLOUD_ROOT}/${trimmedNewName}`

  logger.info('重命名会话', { oldPath, newPath })

  try {
    await rename(oldPath, newPath)

    // 触发文件夹更新事件
    dispatchFolderUpdate('partial_update', {
      action: 'folder_renamed',
      folders: [trimmedOldName],
      oldName: trimmedOldName,
      newName: trimmedNewName,
    })

    logger.info('重命名成功')
    return true
  } catch (e) {
    logger.error('重命名失败', { error: e.message, oldPath, newPath })
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `重命名失败: ${e.message}`)
  }
}

/**
 * 删除整个会话文件夹
 * 业务层删除函数，负责验证、事件通知和错误处理
 * 实际文件系统操作委托给 fileSystem.deleteDirectory
 *
 * @param {string} folderName - 要删除的文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @returns {Promise<void>}
 * @throws {FilePathError} 当删除失败时抛出
 */
export async function deleteSession(folderName) {
  // 步骤1: 验证文件夹名
  validateSessionId(folderName)

  // 步骤2: 构建完整路径
  const path = `${POINTCLOUD_ROOT}/${folderName}`

  logger.info('开始删除会话', { folderName, path })

  // 步骤3: 调用文件系统服务执行删除
  try {
    await deleteDirectory(path, {
      recursive: true,      // 递归删除所有内容
      includeSelf: true,    // 删除目录本身
      force: false,         // 不强制删除，遇到错误抛出
      maxDepth: 10,         // 最大递归深度
    })

    // 步骤4: 触发文件夹更新事件
    dispatchFolderUpdate('partial_update', {
      action: 'folder_deleted',
      folders: [folderName],
    })

    logger.info('会话删除成功', { folderName })
  } catch (e) {
    logger.error('删除会话失败', { folderName, error: e.message })
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `删除会话失败: ${e.message}`)
  }
}

/**
 * 批量删除文件夹（触发一次局部更新事件）
 * 用于批量删除时的局部刷新优化
 * @param {string[]} folders - 文件夹名称数组
 * @returns {Promise<{deleted: string[], failed: Array<{folder: string, error: string}>}>}
 */
export async function deleteFoldersBatch(folders) {
  const results = {
    deleted: [],
    failed: [],
  }

  for (const folder of folders) {
    try {
      const sanitizedPath = sanitizePath(folder)
      if (!sanitizedPath) {
        results.failed.push({ folder, error: '无效的文件夹名称' })
        continue
      }

      let rel = sanitizedPath
      if (rel.startsWith(`${POINTCLOUD_ROOT}/`)) {
        rel = rel.replace(`${POINTCLOUD_ROOT}/`, '')
      }

      const folderPath = `${POINTCLOUD_ROOT}/${rel}`
      await deleteDirectory(folderPath, {
        recursive: true,
        includeSelf: true,
        force: false,
        maxDepth: 10,
      })

      results.deleted.push(rel)
      logger.debug('批量删除成功', { folder: rel })
    } catch (e) {
      logger.error('批量删除失败', { folder, error: e.message })
      results.failed.push({ folder, error: e.message })
    }
  }

  if (results.deleted.length > 0) {
    dispatchFolderUpdate('partial_update', {
      action: 'folder_deleted',
      folders: results.deleted,
    })
  }

  return results
}

// ========== 批次操作 - 拆分后的函数 ==========

/**
 * 验证保存批次的参数
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {number|string} batchId - 批次ID
 * @param {string[]} dataLines - 数据行数组
 * @param {Array} photos - 照片数组
 */
function validateSaveBatchParams(folderName, batchId, dataLines, photos) {
  validateSessionId(folderName)
  validateBatchId(batchId)
  validateDataLines(dataLines)
  validatePhotosArray(photos)
}

/**
 * 准备批次保存路径
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {string} normalizedBatchId - 规范化后的批次ID
 * @returns {Promise<Object>} 路径信息对象
 */
async function prepareBatchPaths(folderName, normalizedBatchId) {
  const sessionPath = sessionFolder(folderName)
  await ensureBatchDir(folderName, normalizedBatchId)
  const batchFolderName = `Batch_${normalizedBatchId}`

  return {
    sessionPath,
    batchFolderName,
    txtFilePath: `${sessionPath}/${batchFolderName}/${buildPointCloudDataFileName()}`,
  }
}

/**
 * 保存批次数据文件
 * @param {string} txtFilePath - 数据文件路径
 * @param {string[]} dataLines - 数据行数组
 * @returns {Promise<Object>} 包含文件URI的结果
 */
async function saveBatchDataFile(txtFilePath, dataLines) {
  const content = dataLines.join('\n')
  await writeFile(txtFilePath, content, { encoding: 'utf8' })
  const uriResult = await getUri(txtFilePath)
  return { uri: uriResult.uri }
}

/**
 * 保存照片（从已有路径）
 * @param {string} filePath - 照片文件路径
 * @returns {Promise<string|null>} 照片URI或null
 */
async function saveExistingPhoto(filePath) {
  try {
    const uri = await getUri(filePath)
    return uri.uri
  } catch (e) {
    logger.warn('获取照片URI失败', { filePath, error: e.message })
    return null
  }
}

/**
 * 保存照片（从base64数据）
 * @param {string} sessionPath - 会话路径
 * @param {string} batchFolderName - 批次文件夹名
 * @param {Object} photo - 照片对象
 * @param {number} index - 照片索引
 * @returns {Promise<string|null>} 照片URI或null
 */
async function saveBase64Photo(sessionPath, batchFolderName, photo, index) {
  const target = photo.name || `photo_${index}.jpg`
  const photoPath = `${sessionPath}/${batchFolderName}/allPicture/${target}`

  try {
    await writeFile(photoPath, photo.base64)
    const uri = await getUri(photoPath)
    return uri.uri
  } catch (e) {
    logger.warn('保存照片失败', { photoPath, error: e.message })
    return null
  }
}

/**
 * 保存照片到批次目录
 * @param {string} sessionPath - 会话路径
 * @param {string} batchFolderName - 批次文件夹名
 * @param {Array} photos - 照片数组
 * @returns {Promise<string[]>} 保存的照片URI列表
 */
async function savePhotos(sessionPath, batchFolderName, photos) {
  const savedPhotoUris = []

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]

    if (!photo || typeof photo !== 'object' || Array.isArray(photo)) {
      continue
    }

    let uri = null

    // 情况1：照片已经保存在正确的位置
    if (photo.filePath && typeof photo.filePath === 'string') {
      uri = await saveExistingPhoto(photo.filePath)
    }
    // 情况2：照片通过base64数据提供
    else if (photo.base64 && typeof photo.base64 === 'string') {
      uri = await saveBase64Photo(sessionPath, batchFolderName, photo, i)
    }

    if (uri) {
      savedPhotoUris.push(uri)
    }
  }

  return savedPhotoUris
}

/**
 * 构建保存批次的结果对象
 * @param {Object} paths - 路径信息
 * @param {Object} dataResult - 数据保存结果
 * @param {string[]} photoUris - 照片URI列表
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {string} normalizedBatchId - 批次ID
 * @param {number} lineCount - 数据行数
 * @returns {Object} 完整的保存结果
 */
function buildSaveBatchResult(
  paths,
  dataResult,
  photoUris,
  folderName,
  normalizedBatchId,
  lineCount,
) {
  return {
    folder: paths.sessionPath,
    batchFolder: `${paths.sessionPath}/${paths.batchFolderName}`,
    filePath: paths.txtFilePath,
    fullUri: dataResult.uri,
    photoPaths: photoUris,
    lineCount,
    folderName: folderName,
    batchId: normalizedBatchId,
  }
}

/**
 * 保存单批次的数据行和照片
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {number|string} batchId - 批次ID
 * @param {string[]} dataLines - 数据行数组
 * @param {Array} photos - 照片信息数组
 * @returns {Promise<Object>} 保存结果
 * @throws {FilePathError} 当参数无效或保存失败时抛出
 */
export async function saveBatch(folderName, batchId, dataLines, photos = []) {
  // 步骤1: 验证参数
  validateSaveBatchParams(folderName, batchId, dataLines, photos)

  logger.info('开始保存批次', {
    folderName,
    batchId,
    lineCount: dataLines.length,
    photoCount: photos.length,
  })

  const normalizedBatchId = normalizeBatchId(batchId)

  try {
    // 步骤2: 准备路径
    const paths = await prepareBatchPaths(folderName, normalizedBatchId)
    // 步骤3: 保存数据文件
    const dataResult = await saveBatchDataFile(paths.txtFilePath, dataLines)

    // 步骤4: 保存照片
    const photoUris = await savePhotos(paths.sessionPath, paths.batchFolderName, photos)

    logger.info('批次保存成功', { filePath: paths.txtFilePath, photoCount: photoUris.length })

    // 步骤5: 触发事件
    dispatchFolderUpdate('partial_update', {
      action: 'batch_added',
      folders: [folderName],
    })

    // 步骤6: 返回结果
    return buildSaveBatchResult(
      paths,
      dataResult,
      photoUris,
      folderName,
      normalizedBatchId,
      dataLines.length,
    )
  } catch (error) {
    logger.error('批次保存失败', { folderName, batchId, error: error.message })
    throw error instanceof FilePathError
      ? error
      : new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `保存批次失败: ${error.message}`)
  }
}

/**
 * 列出指定会话下的所有批次
 * @param {string} sessionId - 会话ID
 * @returns {Promise<string[]>} 批次名称数组
 * @throws {FilePathError} 当文件夹名无效时抛出
 */
export async function listBatches(folderName) {
  validateSessionId(folderName)

  const path = sessionFolder(folderName)
  try {
    const res = await readdir(path)
    const dirs = (res.files || [])
      .filter((f) => f.type === 'directory' && /^Batch_\d{3}$/.test(f.name))
      .map((f) => f.name)
      .sort()
    return dirs
  } catch (e) {
    if (e.message && e.message.includes('Directory does not exist')) {
      logger.debug('会话目录不存在，返回空批次列表', { folderName })
      return []
    }
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `列出批次失败: ${e.message}`)
  }
}

export async function findLatestAlignedBlock(folderName) {
  validateSessionId(folderName)
  const batches = await listBatches(folderName)
  for (let i = batches.length - 1; i >= 0; i--) {
    const batchName = batches[i]
    const outputPath = `${sessionFolder(folderName)}/${batchName}/stitch/stitch_output/final_dense_registered_cloud.txt`
    try {
      await stat(outputPath)
      return outputPath
    } catch (_) {
      continue
    }
  }
  return null
}

/**
 * 读取单个批次的数据
 * @param {string} sessionId - 会话ID
 * @param {number|string} batchId - 批次ID
 * @returns {Promise<{lines:string[], photos:string[]}>}
 * @throws {FilePathError} 当参数无效时抛出
 */
// export async function readBatch(sessionId, batchId) {
//   validateSessionId(sessionId)
//   validateBatchId(batchId)

//   const folderName = batchFolder(sessionId, batchId)
//   const result = { lines: [], photos: [] }

//   try {
//     const allFiles = await listFilesRecursive(folderName)

//     for (const p of allFiles) {
//       if (p.endsWith('.txt')) {
//         try {
//           const read = await readFile(p, { encoding: 'utf8' })
//           if (read && read.data) {
//             result.lines = read.data.split('\n').filter((l) => l)
//           }
//         } catch (e) {
//           logger.warn('读取数据文件失败', { path: p, error: e.message })
//         }
//       } else if (isImageFile(p)) {
//         try {
//           const uri = await getUri(p)
//           result.photos.push(uri.uri)
//         } catch (e) {
//           // fallback to base64
//           try {
//             const read = await readFile(p)
//             if (read && read.data) {
//               const lower = p.toLowerCase()
//               const mime = lower.endsWith('.png')
//                 ? 'image/png'
//                 : lower.endsWith('.webp')
//                   ? 'image/webp'
//                   : 'image/jpeg'
//               result.photos.push(`data:${mime};base64,${read.data}`)
//             }
//           } catch (e2) {
//             logger.warn('读取照片失败', { path: p, error: e2.message })
//           }
//         }
//       }
//     }
//   } catch (e) {
//     logger.warn('读取批次失败', { sessionId, batchId, error: e.message })
//   }

//   return result
// }

/**
 * 删除指定批次并自动重排其他批次
 * 业务层删除函数，负责验证、事件通知和重索引
 * 实际文件系统操作委托给 fileSystem.deleteDirectory
 *
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {number|string} batchId - 批次ID
 * @returns {Promise<void>}
 * @throws {FilePathError} 当参数无效时抛出
 */
export async function deleteBatch(folderName, batchId) {
  // 步骤1: 验证参数
  validateSessionId(folderName)
  validateBatchId(batchId)

  // 步骤2: 构建批次文件夹路径
  const folder = batchFolder(folderName, batchId)

  logger.info('开始删除批次', { folderName, batchId, folder })

  // 步骤3: 调用文件系统服务执行删除
  try {
    await deleteDirectory(folder, {
      recursive: true,      // 递归删除批次内所有内容
      includeSelf: true,    // 删除批次文件夹本身
      force: false,         // 不强制删除，遇到错误抛出
      maxDepth: 5,          // 批次目录层级较浅
    })

    // 步骤4: 触发批次删除事件
    dispatchFolderUpdate('partial_update', {
      action: 'batch_deleted',
      folders: [folderName],
    })

    // 步骤5: 重索引其余批次
    await reindexBatches(folderName)

    logger.info('批次删除成功', { folderName, batchId })
  } catch (e) {
    logger.error('删除批次失败', { folderName, batchId, error: e.message })
    throw new FilePathError(ErrorCodes.FILESYSTEM_ERROR, `删除批次失败: ${e.message}`)
  }
}

/**
 * 按顺序重命名批次，保持连续编号
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @returns {Promise<void>}
 * @throws {FilePathError} 当文件夹名无效时抛出
 */
export async function reindexBatches(folderName) {
  validateSessionId(folderName)

  const batches = await listBatches(folderName)

  for (let i = 0; i < batches.length; i++) {
    // 批次编号从 0 开始：Batch_000, Batch_001, Batch_002...
    const desired = `Batch_${String(i).padStart(3, '0')}`
    if (batches[i] !== desired) {
      // sessionFolder 已经包含 POINTCLOUD_ROOT，不需要重复拼接
      const oldPath = `${sessionFolder(folderName)}/${batches[i]}`
      const newPath = `${sessionFolder(folderName)}/${desired}`
      try {
        await rename(oldPath, newPath)
        logger.info('重命名批次', { oldName: batches[i], newName: desired })
      } catch (e) {
        logger.warn('重命名批次失败', { oldPath, newPath, error: e.message })
      }
    }
  }

  dispatchFolderUpdate('partial_update', {
    action: 'batch_reindexed',
    folders: [folderName],
  })
}

// ========== 缩略图和项目信息 ==========

/**
 * 获取项目缩略图
 * thumbnail选择策略：按批次号升序，找到第一个有照片的批次，选择其中最新的照片
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @param {number} [retries=2] - 重试次数
 * @returns {Promise<{uri:string|null,hasPhoto:boolean}>}
 * @throws {FilePathError} 当文件夹名无效时抛出
 */
export async function getProjectThumbnail(folderName, retries = 2) {
  validateSessionId(folderName)

  const folderInfo = parseFolderName(folderName)
  if (!folderInfo.shouldShow) {
    logger.debug('跳过自定义文件夹', { folderName })
    return { uri: null, hasPhoto: false }
  }

  const folderPath = sessionFolder(folderName)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const items = await readdir(folderPath)
      const batchFolders = items.files
        .filter((f) => f.type === 'directory' && f.name.startsWith('Batch_'))
        .map((f) => ({
          name: f.name,
          batchNum: extractBatchNumber(f.name) || 999,
        }))
        .sort((a, b) => a.batchNum - b.batchNum)

      if (batchFolders.length === 0) {
        return { uri: null, hasPhoto: false }
      }

      for (const batch of batchFolders) {
        const thumbnail = await findThumbnailInBatch(folderPath, batch.name)
        if (thumbnail) {
          return {
            uri: thumbnail.uri,
            hasPhoto: true,
          }
        }
      }

      return { uri: null, hasPhoto: false }
    } catch (e) {
      if (attempt < retries) {
        logger.warn(`获取项目缩略图失败，剩余重试次数 ${retries - attempt}:`, e.message)
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      } else {
        logger.warn('获取项目缩略图最终失败', { folderName, error: e.message })
        return { uri: null, hasPhoto: false }
      }
    }
  }
}

/**
 * 在批次文件夹中查找缩略图
 * 选择批次中最早拍摄的第一张照片（按文件名排序）
 * @param {string} folderPath - 会话文件夹路径
 * @param {string} batchName - 批次名称
 * @returns {Promise<{uri:string}|null>}
 */
async function findThumbnailInBatch(folderPath, batchName) {
  const batchPath = `${folderPath}/${batchName}/allPicture`

  try {
    const batchItems = await readdir(batchPath)

    // 筛选照片文件
    const photoFiles = batchItems.files
      .filter((f) => f.type === 'file' && isImageFile(f.name))
      .map((f) => ({
        path: `${batchPath}/${f.name}`,
        name: f.name,
      }))

    if (photoFiles.length === 0) {
      return null
    }

    // 按文件名排序（最早拍摄的照片排在最前面）
    // 照片文件名通常包含序号或时间戳，如 dataBatch_000_0.00_0.00====1.jpg
    photoFiles.sort((a, b) => a.name.localeCompare(b.name))
    const selectedPhoto = photoFiles[0]

    const uriResult = await getUri(selectedPhoto.path)
    return { uri: uriResult?.uri || null }
  } catch (e) {
    logger.warn('读取批次文件夹失败', { batchPath, error: e.message })
    return null
  }
}

/**
 * 获取项目所有批次的信息
 * @param {string} folderName - 文件夹名（临时文件夹名如 a7f3c9d1-xxx 或正式文件夹名如 ProjectName_xxx）
 * @returns {Promise<Array>} 批次信息数组
 * @throws {FilePathError} 当文件夹名无效时抛出
 */
export async function getProjectBatchInfo(folderName) {
  validateSessionId(folderName)

  const folderPath = sessionFolder(folderName)
  const result = []

  try {
    const items = await readdir(folderPath)
    const batchFolders = items.files
      .filter((f) => f.type === 'directory' && f.name.startsWith('Batch_'))
      .map((f) => ({
        name: f.name,
        batchNum: extractBatchNumber(f.name) || 999,
      }))
      .sort((a, b) => a.batchNum - b.batchNum)

    for (const batch of batchFolders) {
      const batchPath = `${folderPath}/${batch.name}/allPicture`
      let photoCount = 0

      try {
        const batchItems = await readdir(batchPath)
        photoCount = batchItems.files.filter((f) => f.type === 'file' && isImageFile(f.name)).length
      } catch (e) {
        logger.warn('读取批次失败', { batch: batch.name, error: e.message })
      }

      result.push({
        batchNum: batch.batchNum,
        batchName: batch.name,
        photoCount,
        exists: true,
      })
    }

    return result
  } catch (e) {
    logger.warn('获取项目批次信息失败', { folderName, error: e.message })
    return []
  }
}

// ========== 压缩和导出 ==========

export async function zipSessionToFile(sessionFolderName, zipFileName) {
  if (!sessionFolderName) {
    throw new FilePathError(ErrorCodes.VALIDATION_ERROR, '需要提供会话文件夹名称')
  }

  const result = await ZipPlugin.createZip({
    sessionFolderName,
    zipFileName: zipFileName || sessionFolderName,
  })

  logger.info('原生ZIP生成完成', {
    uri: result.uri,
    path: result.path,
    cached: result.cached,
    fileCount: result.fileCount,
    zipSize: result.zipSize,
  })

  return {
    uri: result.uri,
    path: result.path,
    relativePath: result.relativePath,
  }
}


