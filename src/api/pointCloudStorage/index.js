/**
 * @fileoverview PointCloudStorage API - 点云数据存储管理接口
 *
 * 提供点云数据的统一存储管理功能，包括：
 * - 会话（项目）管理
 * - 批次（点位）数据管理
 * - 文件系统操作
 * - 数据导出与分享
 *
 * ## 架构说明
 *
 * ```
 * src/
 * ├── api/pointCloudStorage/   # API 层 - 对外暴露的统一接口 (本模块)
 * │   ├── index.js             # 统一导出入口
 * │   ├── session.js           # 会话管理命名空间
 * │   ├── batch.js             # 批次管理命名空间
 * │   ├── file.js              # 文件操作命名空间
 * │   ├── export.js            # 导出功能命名空间
 * │   ├── path.js              # 路径工具命名空间
 * │   ├── validate.js          # 验证工具命名空间
 * │   └── README.md            # API使用文档
 * ├── services/                # Service 层 - 业务逻辑
 * │   └── storage/
 * │       ├── fileSystem.js
 * │       └── pointCloud.js
 * ├── utils/                   # Util 层 - 纯工具函数
 * │   └── storage/
 * │       ├── path.js
 * │       └── validate.js
 * └── constants/               # 常量层
 *     ├── storage.js
 *     └── bluetooth.js
 * ```
 *
 * ## 使用方式
 *
 * ### 命名空间导入
 * ```javascript
 * import * as pointCloudStorage from '@/api/pointCloudStorage'
 *
 * // 会话管理
 * const sessions = await pointCloudStorage.session.listAll()
 * await pointCloudStorage.session.rename('oldName', 'newName')
 *
 * // 批次管理
 * await pointCloudStorage.batch.save(sessionId, batchId, dataLines, photos)
 * const batches = await pointCloudStorage.batch.list(sessionId)
 *
 * // 导出功能
 * const zipResult = await pointCloudStorage.export.toZip(sessionName)
 * ```

 *
 * @module @/api/pointCloudStorage
 * @version 3.0.0
 * @since 2026-03-19
 */

// ============================================
// 会话管理命名空间 (Session Management)
// ============================================

import {
  listSessions as sessionListAll,
  listPointCloudFolders as sessionListFolders,
  filterDisplayableFolders as sessionFilterDisplayable,
  renameSession as sessionRename,
  deleteSession as sessionDelete,
  deletePointCloudFolder as sessionDeleteFolder,
  ensureSessionDir as sessionEnsureDir,
} from '@/services/storage/pointCloud'

/**
 * 会话管理命名空间
 * @namespace
 */
export const session = {
  /** 列出所有会话 */
  listAll: sessionListAll,
  /** 列出点云文件夹（带解析信息） */
  listFolders: sessionListFolders,
  /** 过滤可显示的文件夹 */
  filterDisplayable: sessionFilterDisplayable,
  /** 重命名会话 */
  rename: sessionRename,
  /** 删除会话 */
  delete: sessionDelete,
  /** 删除点云文件夹 */
  deleteFolder: sessionDeleteFolder,
  /** 确保会话目录存在 */
  ensureDir: sessionEnsureDir,
}

// ============================================
// 批次管理命名空间 (Batch Management)
// ============================================

import {
  saveBatch as batchSave,
  listBatches as batchList,
  readBatch as batchRead,
  deleteBatch as batchDelete,
  reindexBatches as batchReindex,
  ensureBatchDir as batchEnsureDir,
} from '@/services/storage/pointCloud'

/**
 * 批次管理命名空间
 * @namespace
 */
export const batch = {
  /** 保存批次数据 */
  save: batchSave,
  /** 列出会话下的所有批次 */
  list: batchList,
  /** 读取批次数据 */
  read: batchRead,
  /** 删除批次 */
  delete: batchDelete,
  /** 重索引批次（保持连续编号） */
  reindex: batchReindex,
  /** 确保批次目录存在 */
  ensureDir: batchEnsureDir,
}

// ============================================
// 文件操作命名空间 (File Operations)
// ============================================

import {
  readFile as fileRead,
  writeFile as fileWrite,
  deleteFile as fileDelete,
  getUri as fileGetUri,
  stat as fileStat,
  readdir as fileReadDir,
  mkdir as fileMakeDir,
  rmdir as fileRemoveDir,
  rename as fileRename,
  ensureDir as fileEnsureDir,
  deletePath as fileDeletePath,
  listFilesRecursive as fileListRecursive,
  listFilesInFolder as fileListInFolder,
  ensureNoMedia as fileEnsureNoMedia,
  exists as fileExists,
  copyFile as fileCopy,
  move as fileMove,
} from '@/services/storage/fileSystem'

/**
 * 文件操作命名空间
 * @namespace
 */
export const file = {
  /** 读取文件 */
  read: fileRead,
  /** 写入文件 */
  write: fileWrite,
  /** 删除文件 */
  delete: fileDelete,
  /** 获取文件 URI */
  getUri: fileGetUri,
  /** 获取文件状态 */
  stat: fileStat,
  /** 读取目录 */
  readDir: fileReadDir,
  /** 创建目录 */
  makeDir: fileMakeDir,
  /** 删除目录 */
  removeDir: fileRemoveDir,
  /** 重命名文件/目录 */
  rename: fileRename,
  /** 确保目录存在 */
  ensureDir: fileEnsureDir,
  /** 删除路径（文件或目录） */
  deletePath: fileDeletePath,
  /** 递归列出文件 */
  listRecursive: fileListRecursive,
  /** 列出文件夹内容 */
  listInFolder: fileListInFolder,
  /** 确保 .nomedia 标记存在 */
  ensureNoMedia: fileEnsureNoMedia,
  /** 检查文件是否存在 */
  exists: fileExists,
  /** 复制文件 */
  copy: fileCopy,
  /** 移动文件/目录 */
  move: fileMove,
}

// ============================================
// 导出功能命名空间 (Export Functions)
// ============================================

import {
  zipSessionToFile as exportToZip,
  getProjectThumbnail as exportGetThumbnail,
  getProjectBatchInfo as exportGetBatchInfo,
  getFirstPhotoUri as exportGetFirstPhotoUri,
} from '@/services/storage/pointCloud'

/**
 * 导出功能命名空间
 * @namespace
 */
export const exportData = {
  /** 将会话打包为 ZIP 文件 */
  toZip: exportToZip,
  /** 获取项目缩略图 */
  getThumbnail: exportGetThumbnail,
  /** 获取项目批次信息 */
  getBatchInfo: exportGetBatchInfo,
  /** 获取第一张照片的URI */
  getFirstPhotoUri: exportGetFirstPhotoUri,
}

// ============================================
// 路径工具命名空间 (Path Utilities)
// ============================================

import {
  isSessionId as pathIsSessionId,
  isProjectWithSessionFormat as pathIsProjectWithSessionFormat,
  isCustomFolder as pathIsCustomFolder,
  parseFolderName as pathParseFolderName,
  getDisplayName as pathGetDisplayName,
  sessionFolder as pathSessionFolder,
  batchFolder as pathBatchFolder,
  buildPointCloudDataFileName as pathBuildDataFileName,
  isTempSession as pathIsTempSession,
  getTempSessionName as pathGetTempSessionName,
  extractSessionIdFromTemp as pathExtractSessionIdFromTemp,
  parsePhotoFileName as pathParsePhotoFileName,
  normalizeBatchId as pathNormalizeBatchId,
  extractBatchNumber as pathExtractBatchNumber,
  getFileNameFromPath as pathGetFileNameFromPath,
  getDirectoryFromPath as pathGetDirectoryFromPath,
  getFileExtension as pathGetFileExtension,
  isImageFile as pathIsImageFile,
  isDataFile as pathIsDataFile,
  buildPath as pathBuild,
} from '@/utils/storage/path'

/**
 * 路径工具命名空间
 * @namespace
 */
export const path = {
  /** 判断是否为会话ID格式 */
  isSessionId: pathIsSessionId,
  /** 判断是否为项目-会话格式 */
  isProjectWithSessionFormat: pathIsProjectWithSessionFormat,
  /** 判断是否为自定义文件夹 */
  isCustomFolder: pathIsCustomFolder,
  /** 解析文件夹名称 */
  parseFolderName: pathParseFolderName,
  /** 获取显示名称 */
  getDisplayName: pathGetDisplayName,
  /** 构建会话文件夹路径 */
  sessionFolder: pathSessionFolder,
  /** 构建批次文件夹路径 */
  batchFolder: pathBatchFolder,
  /** 构建点云数据文件名 */
  buildDataFileName: pathBuildDataFileName,
  /** 判断是否为临时会话 */
  isTempSession: pathIsTempSession,
  /** 获取临时会话名称 */
  getTempSessionName: pathGetTempSessionName,
  /** 从临时会话名提取会话ID */
  extractSessionIdFromTemp: pathExtractSessionIdFromTemp,
  /** 解析照片文件名 */
  parsePhotoFileName: pathParsePhotoFileName,
  /** 规范化批次ID */
  normalizeBatchId: pathNormalizeBatchId,
  /** 提取批次编号 */
  extractBatchNumber: pathExtractBatchNumber,
  /** 从路径获取文件名 */
  getFileNameFromPath: pathGetFileNameFromPath,
  /** 从路径获取目录 */
  getDirectoryFromPath: pathGetDirectoryFromPath,
  /** 获取文件扩展名 */
  getFileExtension: pathGetFileExtension,
  /** 判断是否为图片文件 */
  isImageFile: pathIsImageFile,
  /** 判断是否为数据文件 */
  isDataFile: pathIsDataFile,
  /** 构建路径 */
  build: pathBuild,
}

// ============================================
// 验证工具命名空间 (Validation Utilities)
// ============================================

import {
  FilePathError as ValidateError,
  validateSessionId as validateSession,
  validateBatchId as validateBatch,
  sanitizePath as validateSanitizePath,
  validateFolderName as validateFolder,
  validatePhotosArray as validatePhotos,
  validateDataLines as validateData,
  validateParams as validateParameters,
} from '@/utils/storage/validate'

/**
 * 验证工具命名空间
 * @namespace
 */
export const validate = {
  /** 错误类 */
  Error: ValidateError,
  /** 验证会话ID */
  session: validateSession,
  /** 验证批次ID */
  batch: validateBatch,
  /** 清理路径 */
  sanitizePath: validateSanitizePath,
  /** 验证文件夹名称 */
  folder: validateFolder,
  /** 验证照片数组 */
  photos: validatePhotos,
  /** 验证数据行 */
  data: validateData,
  /** 验证多个参数 */
  parameters: validateParameters,
}

// ============================================
// 事件通知
// ============================================

export { dispatchFolderUpdate } from '@/services/storage/pointCloud'

// ============================================
// 常量导出
// ============================================

export {
  POINTCLOUD_ROOT,
  TEMP_PREFIX,
  BATCH_PREFIX,
  BATCH_NUMBER_LENGTH,
  SESSION_ID_PATTERN,
  SESSION_ID_MIN_LENGTH,
  SESSION_ID_MAX_LENGTH,
  IMAGE_EXTENSIONS,
  DATA_EXTENSIONS,
  POINTCLOUD_DATA_PREFIX,
  MAX_RECURSION_DEPTH,
  MAX_BATCH_SIZE,
  RETRY_CONFIG,
  ErrorCodes,
  FeatureFlags,
  MODULE_NAME,
} from '@/constants/storage'

// ============================================
// 向后兼容的包装函数
// ============================================

export {
  saveBleDataToFileWithSessionStructure,
  listBleDataFiles,
  readBleDataFile,
} from '@/services/storage/pointCloud'

// ============================================
// 版本信息
// ============================================

/**
 * API 版本号
 */
export const VERSION = '3.0.0'

/**
 * 构建日期
 */
export const BUILD_DATE = '2026-03-19'

/**
 * API 描述
 */
export const DESCRIPTION = 'PointCloudStorage API - 点云数据存储管理接口'

/**
 * 获取模块信息
 * @returns {Object} 模块信息对象
 */
export function getModuleInfo() {
  return {
    name: 'PointCloudStorage API',
    version: VERSION,
    buildDate: BUILD_DATE,
    description: DESCRIPTION,
    architecture: 'API/Service/Util 分层架构',
    namespaces: ['session', 'batch', 'file', 'exportData', 'path', 'validate'],
    layers: {
      api: ['@/api/pointCloudStorage'],
      services: ['@/services/storage/fileSystem', '@/services/storage/pointCloud'],
      utils: ['@/utils/storage/path', '@/utils/storage/validate'],
      constants: ['@/constants/storage']
    }
  }
}
