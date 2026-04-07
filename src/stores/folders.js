// stores/folders.js
import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose, watch } from 'vue'
import * as storage from '@/api/pointCloudStorage'
import { Capacitor } from '@capacitor/core'
import noImg from '@/assets/img/noImg.png'
import { createLogger } from '@/utils/logger' // MODIFIED: 使用全局统一的日志工具
import { parseSessionIdToDate } from '@/utils/format/sessionId' // MODIFIED: 导入会话ID解析函数

// MODIFIED: 创建模块级日志记录器
const logger = createLogger('FoldersStore')

export const useFoldersStore = defineStore('folders', () => {
  // 状态
  const projectFolders = ref([])
  const loading = ref(false)
  const lastFetched = ref(null)
  const fetchPromise = ref(null)

  // 事件监听器引用
  let pointcloudUpdatedHandler = null

  /**
   * 初始化事件监听器
   * 监听 pointcloud-updated 事件，当点云数据更新时刷新文件夹列表
   */
  function initEventListeners() {
    if (typeof window === 'undefined') return

    if (pointcloudUpdatedHandler) {
      window.removeEventListener('pointcloud-updated', pointcloudUpdatedHandler)
    }

    pointcloudUpdatedHandler = (e) => {
      const detail = e?.detail || {}
      logger.debug('收到 pointcloud-updated 事件', detail)

      if (detail.type === 'partial_update') {
        const { folders, action } = detail
        if (folders && folders.length > 0) {
          logger.info('执行局部更新', { action, count: folders.length })
          projectFolders.value = projectFolders.value.filter(
            (f) => !folders.includes(f.name),
          )
        }
        return
      }

      setTimeout(() => {
        refreshFolders()
      }, 0)
    }

    window.addEventListener('pointcloud-updated', pointcloudUpdatedHandler)
    logger.info('事件监听器已初始化')
  }

  /**
   * 清理事件监听器
   * 移除 pointcloud-updated 事件的监听
   */
  function cleanupEventListeners() {
    if (typeof window === 'undefined' || !pointcloudUpdatedHandler) return

    window.removeEventListener('pointcloud-updated', pointcloudUpdatedHandler)
    pointcloudUpdatedHandler = null
    logger.info('事件监听器已清理')
  }

  // 计算属性
  /**
   * 文件夹数量
   * @returns {number} 文件夹数量
   */
  const foldersCount = computed(() => projectFolders.value.length)

  /**
   * 文件列表项
   * 用于文件列表组件的数据格式
   * @returns {Array} 文件列表项数组
   */
  const fileListItems = computed(() => {
    return projectFolders.value
      .map((folder) => {
        const title =
          folder.projectName && folder.projectName !== folder.sessionId
            ? folder.projectName
            : folder.sessionId || folder.name
        const displayDate = folder.hasFiles ? folder.displayDate : '空'

        // MODIFIED: 使用会话ID解析的时间进行排序
        let sortTime = folder.lastModified || 0
        if (folder.sessionId) {
          const sessionDate = parseSessionIdToDate(folder.sessionId)
          if (sessionDate) {
            sortTime = sessionDate.getTime()
          }
        }

        return {
          folderName: folder.name,
          projectName: folder.projectName || folder.name,
          sessionId: folder.sessionId || folder.name,
          displayName: title,
          timeStr: displayDate,
          hasFiles: folder.hasFiles,
          sortTime: sortTime,
        }
      })
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
  })

  /**
   * 项目列表项
   * 用于 ProjectList 组件的数据格式
   * @returns {Array} 项目列表项数组
   */
  const projectListItems = computed(() => {
    return projectFolders.value
      .map((folder) => {
        // 使用会话ID解析的时间进行排序（与fileListItems保持一致）
        let sortTime = folder.lastModified || 0
        if (folder.sessionId) {
          const sessionDate = parseSessionIdToDate(folder.sessionId)
          if (sessionDate) {
            sortTime = sessionDate.getTime()
          }
        }

        return {
          id: folder.name,
          name: folder.projectName || folder.name,
          thumbnail: folder.thumbnail || noImg,
          date: folder.displayName || folder.sessionId || '',
          source: '云台',
          original: folder,
          sortTime: sortTime,
          hasPhoto: folder.hasPhoto || false,
          batchInfo: folder.batchInfo || '',
          batchStats: folder.batchStats || [], // 批次统计信息，默认空数组
          totalPhotoCount: folder.totalPhotoCount || 0, // 照片总数
        }
      })
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
  })

  // MODIFIED: 提取获取缩略图逻辑为单独函数
  /**
   * 获取文件夹缩略图和批次信息
   * @param {string} folderName - 文件夹名称
   * @param {number} [retries=2] - 重试次数
   * @returns {Promise<Object>} 包含缩略图和批次信息的对象
   */
  async function getFolderThumbnail(folderName, retries = 2) {
    let thumbnail = null
    let hasPhoto = false
    let batchInfo = ''
    let batchStats = []
    let totalPhotoCount = 0

    for (let i = 0; i <= retries; i++) {
      try {
        // 使用新的缩略图选择函数
        const thumbResult = await storage.exportData.getThumbnail(folderName)
        hasPhoto = thumbResult.hasPhoto
        batchInfo = thumbResult.batchInfo

        if (hasPhoto && thumbResult.uri) {
          thumbnail = Capacitor.convertFileSrc(thumbResult.uri)
          logger.debug(`为项目 ${folderName} 选择缩略图: ${thumbResult.batchInfo}`)
        }

        // 获取批次统计信息
        batchStats = await storage.exportData.getBatchInfo(folderName)
        totalPhotoCount = batchStats.reduce((sum, batch) => sum + batch.photoCount, 0)

        // 成功获取，跳出循环
        break
      } catch (e) {
        if (i < retries) {
          logger.warn(`获取文件夹 ${folderName} 缩略图失败，${retries - i} 次重试机会:`, e)
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)))
        } else {
          logger.warn(`获取文件夹 ${folderName} 缩略图最终失败:`, e)
        }
      }
    }

    return { thumbnail, hasPhoto, batchInfo, batchStats, totalPhotoCount }
  }

  // MODIFIED: 提取获取文件信息逻辑为单独函数
  /**
   * 获取文件夹内文件信息
   * @param {string} folderName - 文件夹名称
   * @param {number} [retries=2] - 重试次数
   * @returns {Promise<Object>} 包含文件信息的对象
   */
  async function getFolderFileInfo(folderName, retries = 2) {
    let lastModified = 0
    let hasFiles = false
    let fileCount = 0

    for (let i = 0; i <= retries; i++) {
      try {
        const folderPath = `pointcloud/${folderName}`

        // 先检查目录是否有内容（包括子目录和文件）
        const directoryContent = await storage.file.readDir(folderPath)
        const hasContent = directoryContent.files && directoryContent.files.length > 0

        // 然后检查是否有文件
        const allPaths = await storage.file.listRecursive(folderPath)
        hasFiles = hasContent || (allPaths && allPaths.length > 0)
        fileCount = allPaths.length

        if (hasFiles) {
          const stats = []
          for (const p of allPaths) {
            try {
              const st = await storage.file.stat(p)
              stats.push({ path: p, mtime: st.mtime || 0 })
            } catch (e) {
              // 忽略单个文件的失败
            }
          }
          if (stats.length > 0) {
            stats.sort((a, b) => b.mtime - a.mtime)
            lastModified = stats[0].mtime
          } else if (hasContent) {
            // 如果有子目录但没有文件，使用当前时间
            lastModified = Date.now()
          }
        }

        // 成功获取，跳出循环
        break
      } catch (e) {
        if (i < retries) {
          logger.warn(`获取文件夹 ${folderName} 文件信息失败，${retries - i} 次重试机会:`, e)
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)))
        } else {
          logger.warn(`获取文件夹 ${folderName} 文件信息最终失败:`, e)
        }
      }
    }

    return { lastModified, hasFiles, fileCount }
  }

  // MODIFIED: 提取文件夹详情获取逻辑为单独函数
  /**
   * 获取文件夹详细信息
   * @param {Object} folder - 文件夹对象
   * @param {number} [retries=2] - 重试次数
   * @returns {Promise<Object>} 包含详细信息的文件夹对象
   */
  async function getFolderDetails(folder, retries = 2) {
    try {
      const folderInfo = folder.info

      // 获取项目缩略图和批次信息
      const { thumbnail, hasPhoto, batchInfo, batchStats, totalPhotoCount } = await getFolderThumbnail(folder.name, retries)

      // 解析项目名与 sessionId
      let projectName = folderInfo.projectName || folderInfo.displayName
      let sessionId = folderInfo.sessionId
      let displayName = folderInfo.displayName
      let displayDate = folderInfo.displayDate

      // 获取文件夹内文件信息（用于排序）
      const { lastModified, hasFiles, fileCount } = await getFolderFileInfo(folder.name, retries)

      // MODIFIED: 确保即使没有会话ID也能显示日期
      if (!displayDate && hasFiles && lastModified) {
        displayDate = new Date(lastModified).toLocaleString()
      }

      return {
        name: folder.name,
        thumbnail,
        hasPhoto,
        totalPhotoCount,
        batchInfo,
        batchStats,
        projectName,
        sessionId,
        displayName,
        lastModified,
        displayDate,
        hasFiles,
        fileCount,
        type: folderInfo.type,
      }
    } catch (e) {
      logger.error(`获取文件夹 ${folder.name} 详情失败:`, e)
      // 返回基础信息，确保即使出错也能返回数据
      return {
        name: folder.name,
        thumbnail: null,
        hasPhoto: false,
        totalPhotoCount: 0,
        batchInfo: '',
        batchStats: [],
        projectName: folder.info?.projectName || folder.info?.displayName || folder.name,
        sessionId: folder.info?.sessionId || folder.name,
        displayName: folder.info?.displayName || folder.name,
        lastModified: 0,
        displayDate: folder.info?.displayDate || '未知',
        hasFiles: false,
        fileCount: 0,
        type: folder.info?.type || 'unknown',
      }
    }
  }

  /**
   * 加载项目文件夹
   * @param {boolean} [forceRefresh=false] - 是否强制刷新
   * @returns {Promise<Array>} 项目文件夹数组
   */
  async function loadProjectFolders(forceRefresh = false) {
    if (fetchPromise.value && !forceRefresh) {
      logger.debug('使用缓存的fetchPromise')
      return fetchPromise.value
    }

    if (!forceRefresh && projectFolders.value.length > 0 && lastFetched.value) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000 // 计算5分钟前的时间戳
      if (lastFetched.value > fiveMinutesAgo) {// 如果上次获取时间 > 5分钟前
        logger.debug('使用缓存的数据')
        return projectFolders.value
      }
    }

    loading.value = true

    fetchPromise.value = (async () => {
      try {
        logger.info('开始加载项目文件夹')
        const folders = await storage.session.listFolders()

        const withDetails = await Promise.all(
          folders.map(async (folder) => {
            return getFolderDetails(folder)
          }),
        )

        // 按最后修改时间倒序排列
        withDetails.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
        projectFolders.value = withDetails
        lastFetched.value = Date.now()

        logger.info(`加载完成，共 ${withDetails.length} 个项目`)
        return withDetails
      } catch (e) {
        logger.error('加载失败', e)
        throw e
      } finally {
        loading.value = false
        fetchPromise.value = null
      }
    })()

    return fetchPromise.value
  }

  /**
   * 刷新项目列表
   * 强制重新加载项目文件夹
   * @returns {Promise<Array>} 项目文件夹数组
   */
  async function refreshFolders() {
    logger.info('刷新项目列表')
    return loadProjectFolders(true)
  }

  /**
   * 更新文件夹信息
   * @param {string} folderName - 文件夹名称
   * @param {Object} updates - 要更新的信息
   */
  function updateFolder(folderName, updates) {
    // MODIFIED: 添加参数验证
    if (!folderName || typeof folderName !== 'string') {
      logger.warn('updateFolder: folderName 必须是字符串')
      return
    }
    if (!updates || typeof updates !== 'object') {
      logger.warn('updateFolder: updates 必须是对象')
      return
    }

    const index = projectFolders.value.findIndex((f) => f.name === folderName)
    if (index !== -1) {
      projectFolders.value[index] = {
        ...projectFolders.value[index],
        ...updates,
      }
      logger.debug(`更新文件夹 ${folderName} 信息`)
    } else {
      logger.warn(`未找到文件夹 ${folderName}`)
    }
  }

  /**
   * 移除文件夹
   * @param {string} folderName - 文件夹名称
   */
  function removeFolder(folderName) {
    // MODIFIED: 添加参数验证
    if (!folderName || typeof folderName !== 'string') {
      logger.warn('removeFolder: folderName 必须是字符串')
      return
    }

    const initialLength = projectFolders.value.length
    projectFolders.value = projectFolders.value.filter((f) => f.name !== folderName)
    if (projectFolders.value.length < initialLength) {
      logger.info(`移除文件夹 ${folderName}`)
    } else {
      logger.warn(`未找到文件夹 ${folderName}`)
    }
  }

  // 抛出给业务去判断当前刷新是否完毕
  // function waitForRefresh(timeout = 10000) {
  //   return new Promise((resolve, reject) => {
  //     let stopWatch
  //     let timer

  //     const cleanup = () => {
  //       if (timer) clearTimeout(timer)
  //       if (stopWatch) stopWatch()
  //     }

  //     timer = setTimeout(() => {
  //       cleanup()
  //       reject(new Error('等待刷新超时'))
  //     }, timeout)

  //     // 监听 loading 变化
  //     stopWatch = watch(loading, (newVal) => {
  //       if (!newVal) {
  //         // loading 结束
  //         cleanup()
  //         resolve()
  //       }
  //     })

  //     // 如果已经不在 loading，立即 resolve
  //     if (!loading.value) {
  //       cleanup()
  //       resolve()
  //     }
  //   })
  // }

  /**
   * 添加文件夹
   * @param {Object} folderData - 文件夹数据
   */
  function addFolder(folderData) {
    // MODIFIED: 添加参数验证
    if (!folderData || typeof folderData !== 'object') {
      logger.warn('addFolder: folderData 必须是对象')
      return
    }
    if (!folderData.name) {
      logger.warn('addFolder: folderData 必须包含 name 属性')
      return
    }

    projectFolders.value.unshift(folderData)
    logger.info(`添加文件夹 ${folderData.name}`)
  }

  /**
   * 清空文件夹列表
   */
  function clearFolders() {
    projectFolders.value = []
    lastFetched.value = null
    fetchPromise.value = null
    logger.info('清空文件夹列表')
  }

  // 自动初始化监听器
  initEventListeners()

  onScopeDispose(() => {
    cleanupEventListeners()
  })

  return {
    projectFolders,
    loading,
    lastFetched,
    foldersCount,
    fileListItems,
    projectListItems,
    loadProjectFolders,
    refreshFolders,
    updateFolder,
    removeFolder,
    // waitForRefresh,
    addFolder,
    clearFolders,
    cleanupEventListeners,
  }
})
