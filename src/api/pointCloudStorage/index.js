/**
 * @fileoverview PointCloudStorage API - 点云数据存储管理接口（优化版）
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
 * │   └── index.js             # 统一导出入口（已优化，仅导出实际使用的函数）
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
 * import * as storage from '@/api/pointCloudStorage'
 *
 * // 会话管理
 * const folders = await storage.session.listFolders()
 * await storage.session.rename('oldName', 'newName')
 * await storage.session.deleteFolder('folderName')
 *
 * // 批次管理
 * await storage.batch.save(sessionId, batchId, dataLines, photos)
 * const batches = await storage.batch.list(sessionId)
 *
 * // 文件操作
 * const exists = await storage.file.exists('path/to/file')
 * const files = await storage.file.listRecursive('path/to/dir')
 *
 * // 导出功能
 * const zipResult = await storage.exportData.toZip(sessionName)
 * ```
 *
 * @module @/api/pointCloudStorage
 * @version 3.1.0
 * @since 2026-03-26
 */

// ============================================
// 会话管理命名空间 (Session Management)
// ============================================

import {
  listPointCloudFolders as sessionListFolders,
  renameSession as sessionRename,
  deleteSession as sessionDelete,
  deletePointCloudFolder as sessionDeleteFolder,
} from '@/services/storage/pointCloud'

/**
 * 会话管理命名空间
 * @namespace
 */
export const session = {
  /** 列出点云文件夹（带解析信息） */
  listFolders: sessionListFolders,
  /** 重命名会话 */
  rename: sessionRename,
  /** 删除会话 */
  delete: sessionDelete,
  /** 删除点云文件夹 */
  deleteFolder: sessionDeleteFolder,
}

// ============================================
// 批次管理命名空间 (Batch Management)
// ============================================

import {
  saveBatch as batchSave,
  listBatches as batchList,
  readBatch as batchRead,
  deleteBatch as batchDelete,
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
}

// ============================================
// 文件操作命名空间 (File Operations)
// ============================================

import {
  stat as fileStat,
  readdir as fileReadDir,
  ensureDir as fileEnsureDir,
  deleteDirectory as fileDeleteDirectory,
  listFilesRecursive as fileListRecursive,
  ensureNoMedia as fileEnsureNoMedia,
  exists as fileExists,
} from '@/services/storage/fileSystem'

/**
 * 文件操作命名空间
 * @namespace
 */
export const file = {
  /** 获取文件状态 */
  stat: fileStat,
  /** 读取目录 */
  readDir: fileReadDir,
  /** 确保目录存在 */
  ensureDir: fileEnsureDir,
  /** 删除目录（支持选项参数） */
  deleteDirectory: fileDeleteDirectory,
  /** 递归列出文件 */
  listRecursive: fileListRecursive,
  /** 确保 .nomedia 标记存在 */
  ensureNoMedia: fileEnsureNoMedia,
  /** 检查文件是否存在 */
  exists: fileExists,
}

// ============================================
// 导出功能命名空间 (Export Functions)
// ============================================

import {
  zipSessionToFile as exportToZip,
  getProjectThumbnail as exportGetThumbnail,
  getProjectBatchInfo as exportGetBatchInfo,
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
}

// ============================================
// 路径工具命名空间 (Path Utilities)
// ============================================

import {
  parseFolderName as pathParseFolderName,
  getTempSessionName as pathGetTempSessionName,
} from '@/utils/storage/path'

/**
 * 路径工具命名空间
 * @namespace
 */
export const path = {
  /** 解析文件夹名称 */
  parseFolderName: pathParseFolderName,
  /** 获取临时会话名称 */
  getTempSessionName: pathGetTempSessionName,
}

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
// 版本信息
// ============================================

/**
 * API 版本号
 */
export const VERSION = '3.2.0'

/**
 * 构建日期
 */
export const BUILD_DATE = '2026-03-26'

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
    architecture: 'API/Service/Util 分层架构（已优化）',
    namespaces: ['session', 'batch', 'file', 'exportData', 'path'],
    layers: {
      api: ['@/api/pointCloudStorage'],
      services: ['@/services/storage/fileSystem', '@/services/storage/pointCloud'],
      utils: ['@/utils/storage/path', '@/utils/storage/validate'],
      constants: ['@/constants/storage']
    },
    optimization: '已移除未使用的函数导出，减少包体积'
  }
}
