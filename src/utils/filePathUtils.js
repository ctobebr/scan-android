// src/utils/filePathUtils.js
import { Filesystem, Directory } from '@capacitor/filesystem'
import { parseSessionIdToFormattedTime } from './sessionIdUtils'
import { Share } from '@capacitor/share'
import { TEMP_PREFIX } from '@/constants/protocolCommands'

// 所有文件操作都相对于 Directory.Documents 目录
// 我们集中管理 pointcloud/session/batch 结构的路径构建

/**
 * 顶层点云数据目录的路径
 */
export const POINTCLOUD_ROOT = 'pointcloud'
// ========== ：文件夹分类相关函数 ==========

/**
 * 会话ID的正则模式：纯小写字母数字，8-12位
 * 由 dateToSessionId 生成的字符串符合此规则
 */
const SESSION_ID_PATTERN = /^[0-9a-z]{8,12}$/

/**
 * 判断字符串是否是系统生成的会话ID
 * @param {string} str - 要判断的字符串
 * @returns {boolean} 是否是会话ID
 */
export function isSessionId(str) {
  if (!str || typeof str !== 'string') return false
  return SESSION_ID_PATTERN.test(str)
}

/**
 * 判断是否是"项目名_会话ID"格式
 * @param {string} folderName - 文件夹名
 * @returns {boolean} 是否是项目名_会话ID格式
 */
export function isProjectWithSessionFormat(folderName) {
  if (!folderName || typeof folderName !== 'string') return false

  const parts = folderName.split('_')
  return parts.length === 2 && isSessionId(parts[1])
}

/**
 * 判断是否是纯用户自定义文件夹
 * @param {string} folderName - 文件夹名
 * @returns {boolean} 是否是自定义文件夹
 */
export function isCustomFolder(folderName) {
  if (!folderName || typeof folderName !== 'string') return false

  // 如果不是会话ID格式，也不是"项目_会话ID"格式，就是自定义文件夹
  return !isSessionId(folderName) && !isProjectWithSessionFormat(folderName)
}

/**
 * 解析文件夹名，获取详细信息
 * @param {string} folderName - 原始文件夹名
 * @returns {Object} 文件夹信息对象
 */
export function parseFolderName(folderName) {
  const result = {
    original: folderName,
    type: 'unknown',
    projectName: null,
    sessionId: null,
    displayName: folderName,
    shouldShow: true, // 默认显示
    isTemp: false,
  }

  if (!folderName || typeof folderName !== 'string') {
    result.shouldShow = false
    return result
  }
  // 情况0：临时文件夹（a7f3c9d1-开头）
  if (isTempSession(folderName)) {
    result.type = 'temp_session'
    result.sessionId = extractSessionIdFromTemp(folderName)
    result.displayName = '未保存项目'
    result.isTemp = true
    result.shouldShow = false
    return result
  }

  // 情况1：纯会话ID
  if (isSessionId(folderName)) {
    result.type = 'session_only'
    result.sessionId = folderName
    // result.displayName = folderName
    result.displayName = '未命名项目'
    // 纯会话ID视为保存
    result.isTemp = false
    return result
  }

  // 情况2：项目名_会话ID
  if (isProjectWithSessionFormat(folderName)) {
    const [project, sessionId] = folderName.split('_')
    result.type = 'project_with_session'
    result.projectName = project
    result.sessionId = sessionId
    result.displayName = project
    result.isTemp = false
    return result
  }

  // 情况3：纯用户自定义（不显示）
  result.type = 'custom'
  result.displayName = folderName
  result.shouldShow = false
  result.isTemp = false

  return result
}

/**
 * 获取适合显示的文件夹名
 * @param {string} folderName - 原始文件夹名
 * @returns {string} 显示用的文件夹名
 */
export function getDisplayName(folderName) {
  const info = parseFolderName(folderName)
  return info.displayName
}

/**
 * 过滤掉不应显示的文件夹
 * @param {Array<{name: string}>} folders - 原始文件夹列表
 * @returns {Array<{name: string, info: Object}>} 过滤后的文件夹列表（附带解析信息）
 */
export function filterDisplayableFolders(folders) {
  if (!Array.isArray(folders)) return []
  return folders
    .map((folder) => {
      const info = parseFolderName(folder.name)
      const formattedTime = info.sessionId && parseSessionIdToFormattedTime(info.sessionId)
      info.displayDate = formattedTime
      return {
        ...folder,
        info,
        shouldShow: info.shouldShow,
      }
    })
    .filter((item) => item.shouldShow)
}
// ========== 结束：文件夹分类相关函数 ==========
/**
 * 根据会话ID构建会话文件夹路径（不包含根目录前缀）
 * @param {string} sessionId - 会话ID
 * @returns {string} 会话文件夹的完整路径
 */
export function sessionFolder(sessionId) {
  if (!sessionId) throw new Error('会话ID不能为空')
  return `${POINTCLOUD_ROOT}/${sessionId}`
}

/**
 * 在会话文件夹下构建批次文件夹路径
 * @param {string} sessionId - 会话ID
 * @param {number|string} batchId - 批次ID（数字或字符串）
 * @returns {string} 批次文件夹的完整路径
 */
export function batchFolder(sessionId, batchId) {
  if (!sessionId) throw new Error('会话ID不能为空')
  if (batchId === undefined || batchId === null) throw new Error('批次ID不能为空')
  const num = String(batchId).padStart(3, '0')
  return `${sessionFolder(sessionId)}/Batch_${num}`
}

/**
 * 确保目录存在，如果不存在则递归创建
 * @param {string} path - 相对于 Documents 的路径
 * @returns {Promise<string>} 确保存在的目录路径
 */
export async function ensureDir(path) {
  try {
    await Filesystem.readdir({ path, directory: Directory.Documents })
  } catch (e) {
    if (e.message && e.message.includes('Directory does not exist')) {
      await Filesystem.mkdir({ path, directory: Directory.Documents, recursive: true })
    } else {
      throw e
    }
  }
  return path
}

/**
 * 确保会话目录存在
 * @param {string} sessionId - 会话ID
 * @returns {Promise<string>} 会话目录路径
 */
export async function ensureSessionDir(sessionId) {
  const path = sessionFolder(sessionId)
  const res = await ensureDir(path)
  // 在会话目录下放置 .nomedia
  await ensureNoMedia(path)
  return res
}

/**
 * 确保批次目录存在
 * @param {string} sessionId - 会话ID
 * @param {string|number} batchId - 批次ID
 * @returns {Promise<string>} 批次目录路径
 */
export async function ensureBatchDir(sessionId, batchId) {
  await ensureSessionDir(sessionId)
  const path = batchFolder(sessionId, batchId)
  const res = await ensureDir(path)
  await ensureNoMedia(path)
  return res
}

/**
 * 列出 pointcloud 根目录下的所有文件夹（即所有会话）
 * @returns {Promise<string[]>} 会话名称数组
 */
export async function listSessions() {
  try {
    const res = await Filesystem.readdir({ path: POINTCLOUD_ROOT, directory: Directory.Documents })
    return (res.files || []).filter((f) => f.type === 'directory').map((f) => f.name)
  } catch (e) {
    // 如果根目录不存在，返回空数组
    if (e.message && e.message.includes('Directory does not exist')) return []
    throw e
  }
}

/**
 * 递归删除文件或文件夹
 * @param {string} path - 要删除的路径
 * @returns {Promise<void>}
 */
export async function deletePath(path) {
  try {
    // 尝试使用 rmdir（如果可用）
    if (Filesystem.rmdir) {
      await Filesystem.rmdir({ path, directory: Directory.Documents, recursive: true })
      return
    }
    // 降级方案：尝试使用 deleteFile，可能只能删除空文件夹
    await Filesystem.deleteFile({ path, directory: Directory.Documents })
    return
  } catch (e) {
    // 如果文件不存在则忽略错误
    if (e.message && e.message.includes('does not exist')) return
    console.warn('[filePathUtils] deletePath initial attempt failed, will try manual recursion', e)
    try {
      // 尝试删除内容然后移除目录
      const items = await listFilesRecursive(path)
      for (const p of items) {
        try {
          await Filesystem.deleteFile({ path: p, directory: Directory.Documents })
        } catch (err) {
          console.warn('[filePathUtils] failed to delete child file', p, err)
        }
      }
      // 删除子项后，再次尝试 rmdir
      if (Filesystem.rmdir) {
        await Filesystem.rmdir({ path, directory: Directory.Documents, recursive: true })
      } else {
        await Filesystem.deleteFile({ path, directory: Directory.Documents })
      }
      return
    } catch (e2) {
      console.error('[filePathUtils] manual deletePath fallback also failed', e2)
      if (e2.message && e2.message.includes('does not exist')) return
      throw e2
    }
  }
}

/**
 * 递归列出指定路径下的所有文件
 * @param {string} path - 要列出的路径
 * @returns {Promise<string[]>} 文件路径数组
          return
 */
export async function listFilesRecursive(path) {
  const results = []
  async function walk(p) {
    try {
      const res = await Filesystem.readdir({ path: p, directory: Directory.Documents })
      for (const f of res.files || []) {
        const full = `${p}/${f.name}`
        if (f.type === 'directory') {
          await walk(full)
        } else {
          results.push(full)
        }
      }
    } catch (e) {
      console.warn('递归列出文件时读取错误', p, e)
    }
  }
  await walk(path)
  return results
}

// ------------------------
// 文件系统辅助包装函数
// 这些包装函数始终相对于 Directory.Documents 进行操作
// 将所有文件系统 I/O 集中在此处便于更改底层行为（平台特性、权限、错误处理等）
// ------------------------

/**
 * 读取文件内容
 * @param {string} path - 文件路径
 * @param {object} opts - 可选参数，如 { encoding }
 * @returns {Promise<Object>} Capacitor 读取结果
 */
export async function readFile(path, opts = {}) {
  return Filesystem.readFile({ path, directory: Directory.Documents, encoding: opts.encoding })
}

/**
 * 写入文件
 * @param {string} path - 文件路径
 * @param {string} data - 文件数据（根据编码可能是 base64 或 utf8 字符串）
 * @param {object} opts - 可选参数，如 { encoding }
 * @returns {Promise<void>}
 */
export async function writeFile(path, data, opts = {}) {
  return Filesystem.writeFile({
    path,
    data,
    directory: Directory.Documents,
    encoding: opts.encoding,
  })
}

/**
 * 获取文件的 URI
 * @param {string} path - 文件路径
 * @returns {Promise<{uri: string}>} 包含文件 URI 的对象
 */
export async function getUri(path) {
  return Filesystem.getUri({ path, directory: Directory.Documents })
}

/**
 * 读取目录内容
 * @param {string} path - 目录路径
 * @returns {Promise<{files: Array}>} 目录中的文件列表
 */
export async function readdir(path) {
  return Filesystem.readdir({ path, directory: Directory.Documents })
}

/**
 * 创建目录
 * @param {string} path - 目录路径
 * @param {object} opts - 可选参数，如 { recursive }
 * @returns {Promise<void>}
 */
export async function mkdir(path, opts = {}) {
  return Filesystem.mkdir({ path, directory: Directory.Documents, recursive: !!opts.recursive })
}

/**
 * 删除文件
 * @param {string} path - 文件路径
 * @returns {Promise<void>}
 */
export async function deleteFile(path) {
  return Filesystem.deleteFile({ path, directory: Directory.Documents })
}

/**
 * 获取文件/目录的状态信息
 * @param {string} path - 文件/目录路径
 * @returns {Promise<Object>} 包含大小、修改时间等状态信息
 */
export async function stat(path) {
  return Filesystem.stat({ path, directory: Directory.Documents })
}

/**
 * 删除目录
 * @param {string} path - 目录路径
 * @param {object} opts - 可选参数，如 { recursive }
 * @returns {Promise<void>}
 */
export async function rmdir(path, opts = {}) {
  if (Filesystem.rmdir) {
    return Filesystem.rmdir({ path, directory: Directory.Documents, recursive: !!opts.recursive })
  }
  // 降级方案：尝试使用 deleteFile，某些平台上可能只能删除空文件夹
  return Filesystem.deleteFile({ path, directory: Directory.Documents })
}

/**
 * 重命名文件或文件夹
 * 优先使用原生 rename 方法，如果不支持则使用复制+删除的方式降级
 * @param {string} oldPath - 原路径
 * @param {string} newPath - 新路径
 * @returns {Promise<void>}
 */
export async function rename(oldPath, newPath) {
  if (!oldPath?.trim() || !newPath?.trim()) {
    throw new Error('原路径和新路径都不能为空')
  }

  //  直接使用原生 rename，不要自己搞复杂逻辑
  if (Filesystem.rename) {
    // 某些 Capacitor 版本/平台要求使用 `from` 而非 `path`，并且需要同时
    // 提供 `from` 和 `to` 字段。为了兼容所有情况，我们同时传入二者。
    const params = {
      directory: Directory.Documents,
      to: newPath,
      from: oldPath, // 主要字段
      path: oldPath, // 兼容旧版本或文档描述
    }
    console.log('[filePathUtils] Filesystem.rename params', params)
    await Filesystem.rename(params)
    return
  }

  // 如果不支持 rename，才用降级方案
  throw new Error('当前平台不支持重命名操作')
}

/**
 * 列出文件夹下的直接文件（非递归）
 * @param {string} path - 文件夹路径
 * @returns {Promise<Array>} Capacitor readdir 返回的 files 数组
 */
export async function listFilesInFolder(path) {
  try {
    const res = await readdir(path)
    return res.files || []
  } catch (e) {
    return []
  }
}

// ========== 文件状态信息相关函数（从 bluetoothService 迁移） ==========

/**
 * 触发文件夹更新自定义事件
 * 用于通知应用的其他部分 pointcloud 文件夹内容已更新
 * @param {string} type - 事件类型（如 'new_batch', 'rename', 'delete' 等）
 * @param {object} data - 事件附带的数据
 */
export function dispatchFolderUpdate(type, data) {
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
      console.log(`[filePathUtils] 已触发 pointcloud-updated 事件: ${type}`, data)
    }
  } catch (e) {
    console.warn('[filePathUtils] 触发 pointcloud-updated 事件失败', e)
  }
}

/**
 * 保存单批次的数据行和照片到会话/批次文件夹中
 * 这是新的 API，替代旧的 saveBleDataToFileWithSessionStructure
 * @param {string} sessionID - 会话ID
 * @param {number|string} batchId - 批次计数器（如 1,2,3... 或补零后的字符串）
 * @param {string[]} dataLines - 要保存的数据行数组
 * @param {Array<{path?:string,base64?:string,name:string}>} photos - 照片信息数组
 * @returns {Promise<{folder:string,batchFolder:string,filePath:string,photoPaths:string[],lineCount:number}>} 保存结果
 */
export async function saveBatch(sessionID, batchId, dataLines, photos = []) {
  console.log('--- [saveBatch] ---', sessionID, batchId, dataLines.length, photos.length)
  if (!sessionID || typeof sessionID !== 'string') {
    throw new Error('无效的会话ID')
  }
  if (!Array.isArray(dataLines)) {
    throw new Error('dataLines 必须是数组')
  }
  if (!Array.isArray(photos)) {
    throw new Error('photos 必须是数组')
  }

  // 将数字类型的批次ID规范化为补零的字符串
  let bid = batchId
  if (typeof bid === 'number') {
    bid = String(bid).padStart(3, '0')
  }
  const batchFolderName = `Batch_${bid}`

  // 确保目录存在
  const sessionPath = await ensureSessionDir(sessionID)
  const fullBatchPath = await ensureBatchDir(sessionID, bid)

  // 写入数据行到文本文件
  const content = dataLines.join('\n')
  const timestamp = new Date(Date.now() + 28800000) // UTC+8 时区
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
  const txtFilename = `pointCloud_data_${timestamp}.txt`
  const txtFilePath = `${sessionPath}/${batchFolderName}/${txtFilename}`

  await writeFile(txtFilePath, content, { encoding: 'utf8' })
  const fullTxtUri = await getUri(txtFilePath)

  // 保存照片
  const savedPhotoUris = []
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    if (photo && typeof photo === 'object' && !Array.isArray(photo)) {
      if (photo.base64 && typeof photo.base64 === 'string') {
        const target = photo.name || `photo_${i}.jpg`
        const photoPath = `${sessionPath}/${batchFolderName}/${target}`
        try {
          await writeFile(photoPath, photo.base64)
          const uri = await getUri(photoPath)
          savedPhotoUris.push(uri.uri)
        } catch (e) {
          console.warn('保存照片失败', e)
        }
      }
    }
  }

  console.log('[filePathUtils] saveBatch 保存成功', txtFilePath, savedPhotoUris.length)

  dispatchFolderUpdate('new_batch', { session: sessionID, batch: bid })

  return {
    folder: sessionPath,
    batchFolder: `${sessionPath}/${batchFolderName}`,
    filePath: txtFilePath,
    fullUri: fullTxtUri.uri,
    photoPaths: savedPhotoUris,
    lineCount: dataLines.length,
    sessionId: sessionID,
    batchId: bid,
  }
}

// ========== 批次与项目辅助操作 ==========

/**
 * 列出指定会话下所有批次文件夹名称（排序后）
 * @param {string} sessionId
 * @returns {Promise<string[]>} 批次名称数组，例如 ["Batch_001","Batch_002"]
 */
export async function listBatches(sessionId) {
  if (!sessionId) throw new Error('需要会话ID')
  const path = sessionFolder(sessionId)
  try {
    const res = await readdir(path)
    const dirs = (res.files || [])
      .filter((f) => f.type === 'directory' && /^Batch_\d{3}$/.test(f.name))
      .map((f) => f.name)
      .sort()
    return dirs
  } catch (e) {
    // 目录不存在或空
    if (e.message && e.message.includes('Directory does not exist')) return []
    throw e
  }
}

/**
 * 读取单个批次的点云数据和照片路径
 * @param {string} sessionId
 * @param {number|string} batchId
 * @returns {Promise<{lines:string[], photos:string[]}>}
 */
export async function readBatch(sessionId, batchId) {
  const folderName = batchFolder(sessionId, batchId)
  const fullFolder = `${POINTCLOUD_ROOT}/${folderName}`
  const result = { lines: [], photos: [] }
  try {
    const allFiles = await listFilesRecursive(folderName)
    for (const p of allFiles) {
      if (p.endsWith('.txt')) {
        const read = await readFile(p, { encoding: 'utf8' })
        if (read && read.data) {
          result.lines = read.data.split('\n').filter((l) => l)
        }
      } else if (/\.(jpe?g|png|webp|heic|heif)$/i.test(p)) {
        try {
          const uri = await getUri(p)
          result.photos.push(uri.uri)
        } catch (e) {
          // fallback to base64 data
          const read = await readFile(p)
          if (read && read.data) {
            const lower = p.toLowerCase()
            const mime = lower.endsWith('.png')
              ? 'image/png'
              : lower.endsWith('.webp')
                ? 'image/webp'
                : 'image/jpeg'
            result.photos.push(`data:${mime};base64,${read.data}`)
          }
        }
      }
    }
  } catch (e) {
    console.warn('[filePathUtils] readBatch failed', e)
  }
  return result
}

/**
 * 删除指定批次并自动重排其它批次索引
 * @param {string} sessionId
 * @param {number|string} batchId
 */
export async function deleteBatch(sessionId, batchId) {
  const folder = batchFolder(sessionId, batchId)
  await deletePath(folder)
  dispatchFolderUpdate('batch-deleted', { session: sessionId, batch: batchId })
  // 重索引其余批次
  await reindexBatches(sessionId)
}

/**
 * 按顺序重命名指定会话下的批次，以保持连续编号
 * @param {string} sessionId
 */
export async function reindexBatches(sessionId) {
  const batches = await listBatches(sessionId)
  for (let i = 0; i < batches.length; i++) {
    const desired = `Batch_${String(i + 1).padStart(3, '0')}`
    if (batches[i] !== desired) {
      const oldPath = `${POINTCLOUD_ROOT}/${batches[i]}`
      const newPath = `${POINTCLOUD_ROOT}/${desired}`
      try {
        await rename(oldPath, newPath)
      } catch (e) {
        console.warn('[filePathUtils] reindex rename failed', oldPath, newPath, e)
      }
    }
  }
  dispatchFolderUpdate('batches-reindexed', { session: sessionId })
}

/**
 * 确保 no-media 标记存在，防止系统媒体扫描
 * @param {string} basePath 相对于 Documents 的目录
 */
export async function ensureNoMedia(basePath) {
  try {
    const marker = `${basePath}/.nomedia`
    await writeFile(marker, '', { encoding: 'utf8' })
  } catch (e) {
    // ignore
  }
}

/**
 * 重命名会话文件夹（当用户确认项目名称时使用）
 * @param {string} oldName - 原文件夹名称
 * @param {string} newName - 新文件夹名称
 * @returns {Promise<boolean>} 重命名是否成功
 */
export async function renameSession(oldName, newName) {
  if (!oldName?.trim() || !newName?.trim()) {
    throw new Error('需要提供原名称和新名称')
  }

  oldName = oldName.trim()
  newName = newName.trim()

  if (oldName === newName) {
    return true
  }

  const oldPath = `pointcloud/${oldName}`
  const newPath = `pointcloud/${newName}`

  console.log(`[renameSession] 重命名: ${oldPath} -> ${newPath}`)

  try {
    // 直接调用 rename，让原生 API 处理所有检查
    await rename(oldPath, newPath)
    // dispatchFolderUpdate('rename', { oldName, newName })   // 在pointcloud页面重命名之后强制刷新，不再在此处去派发文件夹更新事件
    console.log('[renameSession] 重命名成功')
    return true
  } catch (e) {
    console.error('[renameSession] 失败:', e.message, 'oldPath=', oldPath, 'newPath=', newPath)
    throw new Error(`重命名失败: ${e.message}`)
  }
}

/**
 * 删除整个会话文件夹
 * @param {string} sessionId - 要删除的会话ID
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionId) {
  await deletePath(`${POINTCLOUD_ROOT}/${sessionId}`)
  dispatchFolderUpdate('delete_session', { session: sessionId })
}

/**
 * 将 BLE 数据保存到具有会话结构的文件中（saveBatch 的包装函数，批次索引为1）
 * @param {string[]} dataLines - 数据行数组
 * @param {string} sessionID - 会话ID
 * @param {Array<{path?: string, base64?: string, name: string}>} photos - 照片数组
 * @returns {Promise<{path: string, filePath: string, photoPaths: string[], lineCount: number}>} 保存结果
 */
export async function saveBleDataToFileWithSessionStructure(dataLines, sessionID, photos = []) {
  return saveBatch(sessionID, 1, dataLines, photos)
}

/**
 * 列出 Documents 目录下的蓝牙数据文件
 * @param {string} [pattern='pointCloud_data_'] - 文件名匹配模式，默认查找以 'pointCloud_data_' 开头的文件
 * @returns {Promise<{name: string, size: number, ctime: number, mtime: number}[]>} 文件信息列表
 */
export async function listBleDataFiles(pattern = 'pointCloud_data_') {
  try {
    const result = await readdir('')

    // 过滤出符合条件的 .txt 文件
    const filteredFiles = result.files
      .filter((file) => {
        return file.name.startsWith(pattern) && file.name.endsWith('.txt')
      })
      .map((file) => ({
        name: file.name,
        size: file.size,
        ctime: file.mtime,
        mtime: file.mtime,
      }))

    // 按修改时间倒序排列，最新的在前
    filteredFiles.sort((a, b) => b.mtime - a.mtime)

    return filteredFiles
  } catch (error) {
    console.error('读取文件列表失败:', error)
    throw new Error('读取文件列表失败: ' + error.message)
  }
}

/**
 * 读取指定的蓝牙数据文件内容
 * @param {string} filename - 文件名
 * @returns {Promise<string>} 文件内容
 */
export async function readBleDataFile(filename) {
  try {
    const result = await readFile(filename, { encoding: 'utf8' })
    return result.data
  } catch (error) {
    console.log('读取失败')
    console.log(`读取文件 "${filename}" 失败:`, error)
    throw new Error(`读取文件失败: ${error.message}`)
  }
}
/**
 * 删除 pointcloud 下的指定会话文件夹及其内容
 * @param {string} folderOrRel - 可以是 'pointcloud/<folder>' 或 '<folder>' 或仅文件夹名
 * @returns {Promise<boolean>} 删除是否成功
 */
export async function deletePointCloudFolder(folderOrRel) {
  if (!folderOrRel) throw new Error('需要提供文件夹名称或相对路径')

  // 解析文件夹名，记录操作日志
  let rel = folderOrRel
  if (rel.startsWith(`${POINTCLOUD_ROOT}/`)) {
    rel = rel.replace(`${POINTCLOUD_ROOT}/`, '')
  }

  const folderInfo = parseFolderName(rel)
  console.log(`[filePathUtils] 删除文件夹: ${rel}, 类型: ${folderInfo.type}`)

  const folderPath = `${POINTCLOUD_ROOT}/${rel}`
  try {
    await deletePath(folderPath)
    dispatchFolderUpdate('delete', { folder: rel, type: folderInfo.type })
    console.log(`[filePathUtils] deletePointCloudFolder 已递归删除 ${folderPath}`)
    return true
  } catch (e) {
    console.error('[filePathUtils] deletePointCloudFolder 失败:', e)
    throw new Error('删除文件夹失败: ' + (e.message || e))
  }
}

/**
 * 列出 Documents 目录下的 pointcloud 文件夹下的所有文件夹
 * 注意：此函数已被修改为返回过滤后的结果，只返回应显示的文件夹
 * @param {boolean} includeAll - 是否包含所有文件夹（包括自定义文件夹），默认为 false
 * @returns {Promise<Array<{name: string, info: Object, shouldShow: boolean}>>} 文件夹信息数组
 */
export async function listPointCloudFolders(includeAll = false) {
  const folderPath = POINTCLOUD_ROOT
  try {
    const result = await readdir(folderPath)

    const folders = result.files
      .filter((item) => item.type === 'directory')
      .map((folder) => ({
        name: folder.name,
      }))

    if (includeAll) {
      return folders.map((folder) => {
        const info = parseFolderName(folder.name)
        // 在这里解析时间并添加到 info 中
        const formattedTime = info.sessionId ? parseSessionIdToFormattedTime(info.sessionId) : null
        return {
          ...folder,
          info: {
            ...info,
            formattedTime, // 添加格式化后的时间
            displayDate: info.sessionId ? formattedTime : null,
          },
          shouldShow: info.shouldShow,
        }
      })
    } else {
      return filterDisplayableFolders(folders)
    }
  } catch (error) {
    console.error('读取文件夹列表失败:', error)
    if (error.message.includes('ENOENT')) {
      console.warn(`文件夹 Documents/${folderPath} 不存在或路径错误。`)
      return []
    }
    throw new Error('读取文件夹列表失败: ' + error.message)
  }
}

/**
 * 获取会话文件夹下的第一张图片的 URI
 * @param {string} sessionId - 会话ID
 * @returns {Promise<string|null>} 返回可用的 URI 或 null
 */
// export async function getFirstPhotoUri(sessionId) {
//   if (!sessionId) return null

//   // 先解析文件夹名，检查是否应该处理
//   const folderInfo = parseFolderName(sessionId)
//   if (!folderInfo.shouldShow) {
//     console.log(`[filePathUtils] getFirstPhotoUri: 跳过自定义文件夹 "${sessionId}"`)
//     return null
//   }

//   const folderPath = `${POINTCLOUD_ROOT}/${sessionId}`
//   try {
//     const allPaths = await listFilesRecursive(folderPath)
//     if (!allPaths || allPaths.length === 0) return null
//     const imageRe = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i
//     const imgPath = allPaths.find((p) => imageRe.test(p))
//     if (!imgPath) {
//       console.log('[filePathUtils] getFirstPhotoUri: 在', folderPath, '中未找到图片文件')
//       return null
//     }
//     try {
//       const uriResult = await getUri(imgPath)
//       return uriResult?.uri || null
//     } catch (e) {
//       console.warn('[filePathUtils] getFirstPhotoUri getUri 失败，尝试读取 base64 降级:', e)
//       try {
//         const read = await readFile(imgPath)
//         if (read && read.data) {
//           const lower = imgPath.toLowerCase()
//           const mime = lower.endsWith('.png')
//             ? 'image/png'
//             : lower.endsWith('.webp')
//               ? 'image/webp'
//               : 'image/jpeg'
//           return `data:${mime};base64,${read.data}`
//         }
//       } catch (e2) {
//         console.warn('[filePathUtils] getFirstPhotoUri 读取文件降级也失败:', e2)
//       }
//       return null
//     }
//   } catch (e) {
//     console.warn('获取第一张照片失败:', e)
//     return null
//   }
// }
/**
 * 解析照片文件名，提取批次和角度信息
 * @param {string} fileName - 文件名（如 "Batch_001_45.23_89.56====1.jpg"）
 * @returns {Object|null} 解析结果
 */
export function parsePhotoFileName(fileName) {
  // 暂时没有使用到
  if (!fileName) return null

  // 匹配格式：Batch_XXX_角度_角度[====X].jpg 或 .jpeg 或 .png
  const pattern = /^Batch_(\d+)_([0-9.]+)_([0-9.]+)(?:====\d+)?\.(jpe?g|png|webp)$/i
  const match = fileName.match(pattern)

  if (match) {
    return {
      batch: match[1], // 批次号字符串（如 "001"）
      batchNum: parseInt(match[1], 10), // 数字形式的批次号
      pitch: parseFloat(match[2]), // 俯仰角
      yaw: parseFloat(match[3]), // 偏航角
      format: match[4], // 图片格式
      hasDuplicate: fileName.includes('===='), // 是否有重名标记
    }
  }

  return null
}
/**
 * 获取项目中最适合作为缩略图的照片（考虑用户删除的点位）
 * 选择策略：
 * 1. 获取所有存在的批次文件夹
 * 2. 按批次号升序排序，找到第一个存在的批次
 * 3. 在该批次中选择最新的照片作为缩略图
 * 4. 如果没有任何批次存在照片，选择所有照片中最新的一张
 * 5. 如果没有照片，返回 null
 *
 * @param {string} sessionId - 会话ID
 * @returns {Promise<{uri: string|null, path: string|null, hasPhoto: boolean, batchInfo: string}>}
 */
export async function getProjectThumbnail(sessionId) {
  if (!sessionId) return { uri: null, path: null, hasPhoto: false, batchInfo: '' }

  // 添加文件夹类型检查
  const folderInfo = parseFolderName(sessionId)
  if (!folderInfo.shouldShow) {
    console.log(`[filePathUtils] getProjectThumbnail: 跳过自定义文件夹 "${sessionId}"`)
    return { uri: null, path: null, hasPhoto: false, batchInfo: '' }
  }

  const folderPath = `${POINTCLOUD_ROOT}/${sessionId}`

  try {
    // 1. 获取所有批次文件夹
    const items = await readdir(folderPath)
    const batchFolders = items.files
      .filter((f) => f.type === 'directory' && f.name.startsWith('Batch_'))
      .map((f) => {
        // 提取批次号
        const match = f.name.match(/^Batch_(\d+)$/)
        return {
          name: f.name,
          batchNum: match ? parseInt(match[1], 10) : 999,
        }
      })
      .sort((a, b) => a.batchNum - b.batchNum) // 按批次号升序排序

    if (batchFolders.length === 0) {
      return { uri: null, path: null, hasPhoto: false, batchInfo: '' }
    }

    // 2. 遍历每个批次文件夹（按批次号顺序），查找第一个有照片的批次
    for (const batch of batchFolders) {
      const batchPath = `${folderPath}/${batch.name}`

      try {
        const batchItems = await readdir(batchPath)

        // 筛选出该批次下的所有照片
        const imageRe = /\.(jpe?g|png|webp)$/i
        const photoFiles = batchItems.files
          .filter((f) => f.type === 'file' && imageRe.test(f.name))
          .map((f) => ({
            path: `${batchPath}/${f.name}`,
            name: f.name,
          }))

        if (photoFiles.length > 0) {
          // 找到第一个有照片的批次，选择该批次中最新的一张
          const photosWithStats = await Promise.all(
            photoFiles.map(async (photo) => {
              try {
                const stat = await stat(photo.path)
                return {
                  ...photo,
                  mtime: stat.mtime || 0,
                }
              } catch (e) {
                return {
                  ...photo,
                  mtime: 0,
                }
              }
            }),
          )

          // 按修改时间排序，取最新的
          photosWithStats.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
          const selectedPhoto = photosWithStats[0]

          const uriResult = await getUri(selectedPhoto.path)
          // console.log(`[缩略图选择] 使用批次 ${batch.name} 的最新照片: ${selectedPhoto.name}`)

          return {
            uri: uriResult?.uri || null,
            path: selectedPhoto.path,
            hasPhoto: true,
            batchInfo: batch.name,
          }
        }
      } catch (e) {
        console.warn(`[filePathUtils] 读取批次文件夹 ${batch.name} 失败:`, e)
        continue // 继续检查下一个批次
      }
    }

    // 3. 如果没有找到任何批次有照片，尝试在所有文件中查找（降级方案）
    // console.log('[缩略图选择] 所有批次文件夹均无照片，尝试查找所有文件')
    const allPaths = await listFilesRecursive(folderPath)
    const imageRe = /\.(jpe?g|png|webp)$/i
    const photoPaths = allPaths.filter((p) => imageRe.test(p))

    if (photoPaths.length > 0) {
      // 获取所有照片的修改时间
      const photosWithStats = await Promise.all(
        photoPaths.map(async (path) => {
          try {
            const stat = await stat(path)
            return {
              path,
              mtime: stat.mtime || 0,
            }
          } catch (e) {
            return {
              path,
              mtime: 0,
            }
          }
        }),
      )

      // 按修改时间排序，取最新的
      photosWithStats.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
      const latestPhoto = photosWithStats[0]

      const uriResult = await getUri(latestPhoto.path)
      // console.log(`[缩略图选择] 使用最新照片: ${latestPhoto.path.split('/').pop()}`)

      return {
        uri: uriResult?.uri || null,
        path: latestPhoto.path,
        hasPhoto: true,
        batchInfo: 'latest',
      }
    }

    return { uri: null, path: null, hasPhoto: false, batchInfo: '' }
  } catch (e) {
    console.warn('[filePathUtils] 获取项目缩略图失败:', e)
    return { uri: null, path: null, hasPhoto: false, batchInfo: '' }
  }
}
/**
 * 获取项目所有批次的信息（用于调试或显示）
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Array<{batchNum: number, batchName: string, photoCount: number, exists: boolean}>>}
 */
export async function getProjectBatchInfo(sessionId) {
  if (!sessionId) return []

  const folderPath = `${POINTCLOUD_ROOT}/${sessionId}`
  const result = []

  try {
    // 获取所有批次文件夹
    const items = await readdir(folderPath)
    const batchFolders = items.files
      .filter((f) => f.type === 'directory' && f.name.startsWith('Batch_'))
      .map((f) => {
        const match = f.name.match(/^Batch_(\d+)$/)
        return {
          name: f.name,
          batchNum: match ? parseInt(match[1], 10) : 999,
        }
      })
      .sort((a, b) => a.batchNum - b.batchNum)

    for (const batch of batchFolders) {
      const batchPath = `${folderPath}/${batch.name}`
      let photoCount = 0

      try {
        const batchItems = await readdir(batchPath)
        const imageRe = /\.(jpe?g|png|webp)$/i
        photoCount = batchItems.files.filter(
          (f) => f.type === 'file' && imageRe.test(f.name),
        ).length
      } catch (e) {
        console.warn(`[filePathUtils] 读取批次 ${batch.name} 失败:`, e)
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
    console.warn('[filePathUtils] 获取项目批次信息失败:', e)
    return []
  }
}

/**
 * 保持向后兼容的旧函数
 * @param {string} sessionId
 * @returns {Promise<string|null>}
 */
export async function getFirstPhotoUri(sessionId) {
  const thumbnail = await getProjectThumbnail(sessionId)
  return thumbnail.hasPhoto ? thumbnail.uri : null
}
/**
 * 将会话文件夹内的文件打包为 zip 文件
 * @param {string} sessionFolderName - pointcloud 下的文件夹名
 * @param {string} zipFileName - 输出 zip 文件名（不含扩展名）
 * @param {string[]} existingFiles - 可选的已有文件列表，避免重复递归
 * @returns {Promise<{uri:string, path:string, relativePath:string}>}
 */
export async function zipSessionToFile(sessionFolderName, zipFileName, existingFiles = null) {
  if (!sessionFolderName) throw new Error('需要提供会话文件夹名称')
  const folderPath = `${POINTCLOUD_ROOT}/${sessionFolderName}`

  // 尝试确保 JSZip 可用
  let JSZipLib = null
  if (typeof window !== 'undefined' && window.JSZip) {
    JSZipLib = window.JSZip
  } else {
    try {
      const mod = await import('jszip')
      JSZipLib = mod.default || mod
    } catch (impErr) {
      if (typeof window !== 'undefined') {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.0/dist/jszip.min.js'
            script.onload = resolve
            script.onerror = reject
            document.head.appendChild(script)
          })
          JSZipLib = window.JSZip
        } catch (cdnErr) {
          console.warn('加载 JSZip 失败', impErr, cdnErr)
        }
      }
    }
  }

  if (!JSZipLib) {
    throw new Error('无法加载压缩库 JSZip')
  }

  // 过滤文件名中的非法字符
  const sanitize = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
  const safeBase = sanitize(zipFileName || sessionFolderName)
  const zipName = `${safeBase}.zip`
  const targetDir = `${POINTCLOUD_ROOT}/${sessionFolderName}`
  const zipPath = `${targetDir}/${zipName}`

  console.log('[filePathUtils] zipSessionToFile 检查 zip 是否已存在 -> path=' + zipPath)

  // 如果 zip 已存在则直接返回，避免重复生成
  try {
    const statResult = await stat(zipPath)
    if (statResult) {
      const existingUri = (await getUri(zipPath)).uri
      console.log('[filePathUtils] zip 已存在，返回已有文件 -> ' + String(existingUri))
      return { uri: existingUri, path: zipPath, relativePath: zipPath }
    }
  } catch (eStat) {
    console.log('[filePathUtils] zip 不存在或 stat 不可用，准备生成: ' + String(eStat))
  }

  const zip = new JSZipLib()

  try {
    const allFiles = existingFiles || await listFilesRecursive(folderPath)
    if (!allFiles || allFiles.length === 0) throw new Error('项目文件夹下无文件')

    for (const p of allFiles) {
      const relative = p.replace(`${folderPath}/`, '')
      try {
        const read = await readFile(p)
        zip.file(relative, read.data, { base64: true })
      } catch (e) {
        console.warn('读取文件失败，尝试通过 URI 获取:', p, e)
        try {
          const uriRes = await getUri(p)
          const resp = await fetch(uriRes.uri)
          const blob = await resp.blob()
          const arrayBuffer = await blob.arrayBuffer()
          zip.file(relative, arrayBuffer)
        } catch (e2) {
          console.warn('添加到 zip 时失败:', p, e2)
        }
      }
    }
    const content = await zip.generateAsync({ type: 'base64' })

    console.log(
      '[filePathUtils] zipSessionToFile 生成 zip -> path=' +
        zipPath +
        ' base64 大小=' +
        String(content.length),
    )

    // 压缩进去之前需要确保目录存在
    try {
      await mkdir(targetDir, { recursive: true })
      console.log('[filePathUtils] 创建目录成功或目录已存在: ' + targetDir)
    } catch (mkErr) {
      console.warn('[filePathUtils] 创建目录可能失败或目录已存在: ' + String(mkErr))
    }

    await writeFile(zipPath, content)
    const uriRes = await getUri(zipPath)
    console.log('[filePathUtils] zipSessionToFile 写入完成 uri -> ' + String(uriRes && uriRes.uri))
    // dispatchFolderUpdate('zip_created', { folder: sessionFolderName, zipName: zipFileName })  // 与展示无关不再派发更新文件夹事件
    return { uri: uriRes.uri, path: zipPath, relativePath: zipPath }
  } catch (error) {
    console.error('打包项目失败', error)
    throw error
  }
}

// ========== 结束：文件状态信息相关 ==========

// ========== 开始：临时会话相关函数 ==========
/**
 * 判断是否是临时会话（未保存）
 * @param {string} folderName
 * @returns {boolean}
 */
export function isTempSession(folderName) {
  return folderName.startsWith(TEMP_PREFIX)
}

/**
 * 生成临时会话文件夹名
 * @param {string} sessionId
 * @returns {string}
 */
export function getTempSessionName(sessionId) {
  return `${TEMP_PREFIX}${sessionId}`
}

/**
 * 从临时会话名中提取会话ID
 * @param {string} tempName
 * @returns {string}
 */
export function extractSessionIdFromTemp(tempName) {
  return tempName.replace(TEMP_PREFIX, '')
}
