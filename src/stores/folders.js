// stores/folders.js
import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose, watch } from 'vue'
import * as storage from '@/api/pointCloudStorage'
import { Capacitor } from '@capacitor/core'
import noImg from '@/assets/img/noImg.png'
import { createLogger } from '@/utils/logger' // 使用全局统一的日志工具
import { parseSessionIdToDate } from '@/utils/format/sessionId' // 导入会话ID解析函数
import { parseFolderName } from '@/utils/storage/path' // 导入路径解析函数

// 创建模块级日志记录器
const logger = createLogger('FoldersStore')

export const useFoldersStore = defineStore('folders', () => {
  // 状态
  const projectFolders = ref([])
  const loading = ref(false)
  const loadingDetails = ref(true)
  const lastFetched = ref(null)
  const fetchPromise = ref(null)
  /** 增量加载详情的任务Promise，用于去重 */
  let detailsLoadPromise = null
  /** 增量加载的取消令牌（自增计数器），防止旧批次覆盖新数据 */
  let detailsLoadToken = 0

  // 批次变化回调函数（由 pointCloud/index.vue 注册）
  const batchChangeCallbacks = ref(new Set())

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

    pointcloudUpdatedHandler = async (e) => {
      const detail = e?.detail || {}
      logger.debug('收到 pointcloud-updated 事件', detail)

      if (detail.type === 'partial_update') {
        const { folders, action } = detail
        if (folders && folders.length > 0) {
          logger.info('执行局部更新', { action, count: folders.length })

          // 统一处理所有 action 类型
          switch (action) {
            case 'folder_added': {
              // 异步获取新文件夹的完整详情
              const newFoldersDetails = await Promise.all(
                folders.map(async (name) => {
                  const info = parseFolderName(name)
                  // 创建临时文件夹对象，用于获取详情
                  const tempFolder = {
                    name,
                    info: {
                      projectName: info.projectName || info.displayName,
                      sessionId: info.sessionId || name,
                      displayName: info.displayName,
                      displayDate: '',
                      type: info.type,
                    },
                  }
                  // 获取完整详情（包括缩略图、文件状态等）
                  return await getFolderDetails(tempFolder)
                })
              )
              projectFolders.value = [...newFoldersDetails, ...projectFolders.value]
              break
            }

            case 'folder_deleted': {
              projectFolders.value = projectFolders.value.filter(
                (f) => !folders.includes(f.name),
              )
              break
            }

            case 'folder_renamed': {
              const { oldName, newName } = detail
              const targetName = oldName || folders[0]
              const index = projectFolders.value.findIndex((f) => f.name === targetName)
              if (index !== -1 && newName) {
                const folderInfo = parseFolderName(newName)
                const oldFolder = projectFolders.value[index]
                projectFolders.value[index] = {
                  ...oldFolder,
                  name: newName,
                  projectName: folderInfo.projectName || folderInfo.displayName,
                  sessionId: folderInfo.sessionId || newName,
                  displayName: folderInfo.displayName,
                  // 保留原来的 displayDate（如果有文件则保留时间，否则保留空）
                  displayDate: oldFolder.hasFiles ? oldFolder.displayDate : '',
                  type: folderInfo.type,
                  isTemp: folderInfo.isTemp,
                }
              }
              break
            }

            case 'folder_refreshed': {
              // 刷新指定文件夹的详情（如照片保存后更新缩略图）
              for (const folderName of folders) {
                const index = projectFolders.value.findIndex((f) => f.name === folderName)
                if (index !== -1) {
                  const folder = projectFolders.value[index]
                  const updatedDetails = await getFolderDetails({
                    name: folder.name,
                    info: {
                      projectName: folder.projectName,
                      sessionId: folder.sessionId || folder.name,
                      displayName: folder.displayName,
                      displayDate: folder.displayDate,
                      type: folder.type,
                    },
                  })
                  projectFolders.value[index] = updatedDetails
                  logger.debug('文件夹详情已刷新', { folderName })
                }
              }
              break
            }

            case 'batch_added':
            case 'batch_deleted':
            case 'batch_reindexed':
            case 'batch_rebuilt': {
              // 批次操作后刷新文件夹详情（缩略图、文件状态等可能变化）
              for (const folderName of folders) {
                const index = projectFolders.value.findIndex((f) => f.name === folderName)
                if (index !== -1) {
                  const folder = projectFolders.value[index]
                  const updatedDetails = await getFolderDetails({
                    name: folder.name,
                    info: {
                      projectName: folder.projectName,
                      sessionId: folder.sessionId || folder.name,
                      displayName: folder.displayName,
                      displayDate: folder.displayDate,
                      type: folder.type,
                    },
                  })
                  projectFolders.value[index] = updatedDetails
                  logger.debug('批次操作后文件夹详情已刷新', { folderName, action })
                }
              }
              // 通知注册的回调函数（如 pointCloud/index.vue 的 loadBatchButtons）
              batchChangeCallbacks.value.forEach((callback) => {
                try {
                  callback(folders, action)
                } catch (e) {
                  logger.warn('批次变化回调执行失败', { error: e.message })
                }
              })
              break
            }

            default:
              logger.warn('未知的 action 类型，执行完整刷新', { action })
              refreshFolders()
          }
        }
        return
      }

      // 非 partial_update 类型事件的 fallback 处理
      logger.warn('收到非 partial_update 类型事件，执行完整刷新', { type: detail.type })
      refreshFolders()
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

  /**
   * 注册批次变化回调函数
   * 用于 pointCloud/index.vue 监听批次变化并刷新批次按钮
   * @param {Function} callback - 回调函数，接收 (folders, action) 参数
   * @returns {Function} 注销回调的函数
   */
  function onBatchChange(callback) {
    if (typeof callback !== 'function') {
      logger.warn('onBatchChange: callback 必须是函数')
      return () => {}
    }
    batchChangeCallbacks.value.add(callback)
    logger.debug('批次变化回调已注册')

    // 返回注销函数
    return () => {
      batchChangeCallbacks.value.delete(callback)
      logger.debug('批次变化回调已注销')
    }
  }

  /**
   * 清除所有批次变化回调
   */
  function clearBatchChangeCallbacks() {
    batchChangeCallbacks.value.clear()
    logger.info('所有批次变化回调已清除')
  }

  // 计算属性
  /**
   * 文件夹数量
   * @returns {number} 文件夹数量
   */
  const foldersCount = computed(() => projectFolders.value.length)

  /**
   * 统一的文件夹列表项
   * 包含 FileList 和 ProjectList 组件所需的字段
   * @returns {Array} 文件夹列表项数组
   */
  const folderItems = computed(() => {
    return projectFolders.value
      .map((folder) => {
        const sessionDate = parseSessionIdToDate(folder.sessionId)
        const sortTime = sessionDate?.getTime() || 0

        return {
          // FileList 组件字段
          folderName: folder.name,
          displayName: folder.displayName,
          timeStr: folder.hasFiles ? folder.displayDate : '空',
          projectName: folder.projectName || folder.name,
          sessionId: folder.sessionId || folder.name,
          sortTime,

          // ProjectList 组件字段
          id: folder.name,
          name: folder.projectName || folder.name,
          thumbnail: folder.thumbnail || noImg,
          source: '云台',
        }
      })
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
  })

  // 直接调用 API 获取缩略图（API层已包含重试逻辑）
  /**
   * 获取文件夹缩略图
   * @param {string} folderName - 文件夹名称
   * @returns {Promise<Object>} 包含缩略图信息的对象
   */
  async function getFolderThumbnail(folderName) {
    const thumbResult = await storage.exportData.getThumbnail(folderName)

    return {
      thumbnail: thumbResult.hasPhoto ? Capacitor.convertFileSrc(thumbResult.uri) : null,
    }
  }

  // 直接调用 API（API层已有重试逻辑）
  /**
   * 检查文件夹是否包含文件
   * 通过递归扫描获取文件夹的文件状态信息，用于判断项目是否为空
   * @param {string} folderName - 文件夹名称
   * @returns {Promise<Object>} 包含文件状态信息的对象
   */
  async function checkFolderFileStatus(folderName) {
    const folderPath = `pointcloud/${folderName}`
    const directoryContent = await storage.file.readDir(folderPath)
    const directoryHasItems = directoryContent.files && directoryContent.files.length > 0
    if (directoryHasItems) {
      return { hasFiles: true }
    }
    const allFilePaths = await storage.file.listRecursive(folderPath)
    return { hasFiles: allFilePaths && allFilePaths.length > 0 }
  }

  // 提取文件夹详情获取逻辑为单独函数
  /**
   * 获取文件夹详细信息
   * @param {Object} folder - 文件夹对象
   * @returns {Promise<Object>} 包含详细信息的文件夹对象
   */
  async function getFolderDetails(folder) {
    try {
      const folderInfo = folder.info
      // 获取项目缩略图
      const { thumbnail } = await getFolderThumbnail(folder.name)

      // 解析项目名与 sessionId
      let projectName = folderInfo.projectName || folderInfo.displayName
      let sessionId = folderInfo.sessionId
      let displayName = folderInfo.displayName
      let displayDate = folderInfo.displayDate

      // 使用 sessionId 解析获取时间作为 lastModified
      const sessionDate = parseSessionIdToDate(sessionId)
      const lastModified = sessionDate?.getTime() || 0

      // 检查文件夹是否包含文件
      const { hasFiles } = await checkFolderFileStatus(folder.name)

      // 确保显示日期：有文件时显示实际时间，无文件时显示空
      if (hasFiles && lastModified) {
        displayDate = new Date(lastModified).toLocaleString()
      } else {
        displayDate = ''
      }

      return {
        name: folder.name,
        thumbnail,
        projectName,
        sessionId,
        displayName,
        lastModified,
        displayDate,
        hasFiles,
        type: folderInfo.type,
      }
    } catch (e) {
      logger.error(`获取文件夹 ${folder.name} 详情失败:`, e)
      const sessionDate = parseSessionIdToDate(folder.info?.sessionId || folder.name)
      const lastModified = sessionDate?.getTime() || 0
      return {
        name: folder.name,
        thumbnail: null,
        projectName: folder.info?.projectName || folder.info?.displayName || folder.name,
        sessionId: folder.info?.sessionId || folder.name,
        displayName: folder.info?.displayName || folder.name,
        lastModified,
        displayDate: '',
        hasFiles: false,
        type: folder.info?.type || 'unknown',
      }
    }
  }

  /**
   * 加载项目文件夹
   *
   * 分两步执行：
   * 1. 快速获取文件夹名列表，立即渲染UI（loading=false）
   * 2. 后台分批增量加载缩略图和文件状态等详情，逐批更新列表
   *
   * 这种增量模式避免了41个文件夹同时执行getThumbnail+checkFolderFileStatus
   * 造成的82次文件I/O并行阻塞，与ProjectList的虚拟滚动懒加载模式保持一致
   *
   * @param {boolean} [forceRefresh=false] - 是否强制刷新
   * @returns {Promise<Array>} 项目文件夹数组
   */
  async function loadProjectFolders(forceRefresh = false) {
    if (fetchPromise.value && !forceRefresh) {
      logger.debug('使用缓存的fetchPromise')
      return fetchPromise.value
    }

    if (!forceRefresh && projectFolders.value.length > 0 && lastFetched.value) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      if (lastFetched.value > fiveMinutesAgo) {
        logger.debug('使用缓存的数据')
        return projectFolders.value
      }
    }

    loading.value = true
    loadingDetails.value = true

    fetchPromise.value = (async () => {
      try {
        logger.info('开始加载项目文件夹')

        // 第一步：只列目录名，快速构建基础列表
        const folders = await storage.session.listFolders()
        const basicFolders = buildBasicFolderList(folders)
        projectFolders.value = basicFolders
        lastFetched.value = Date.now()

        logger.info(`基础列表加载完成，共 ${basicFolders.length} 个项目`)

        // 第二步：后台增量加载详情（缩略图、文件状态等）
        loadFolderDetailsIncremental(basicFolders)

        return basicFolders
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
   * 根据文件夹名列表构建基础项目对象
   * 仅根据文件夹名解析基本信息，不执行任何文件I/O操作
   *
   * @param {Array} folders - storage.session.listFolders() 的返回结果
   * @returns {Array} 基础文件夹对象数组
   */
  function buildBasicFolderList(folders) {
    const basicFolders = folders.map((folder) => {
      const info = folder.info || {}
      const sessionDate = parseSessionIdToDate(info.sessionId || folder.name)
      return {
        name: folder.name,
        thumbnail: null,
        projectName: info.projectName || info.displayName,
        sessionId: info.sessionId,
        displayName: info.displayName,
        lastModified: sessionDate?.getTime() || 0,
        displayDate: '',
        hasFiles: false,
        type: info.type,
        _detailsLoaded: false,
      }
    })

    basicFolders.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
    return basicFolders
  }

  /**
   * 后台增量加载文件夹详情
   *
   * 分批执行getFolderDetails（缩略图 + 文件状态检查），
   * 每批5个文件夹，逐批完成后就地更新projectFolders响应式列表。
   * 与ProjectList的虚拟滚动模式统一：UI立即可用，详情渐次到位。
   *
   * @param {Array} basicFolders - buildBasicFolderList返回的基础列表
   */
  async function loadFolderDetailsIncremental(basicFolders) {
    // 使用自增令牌取消之前的增量加载任务
    const token = ++detailsLoadToken

    const BATCH_SIZE = 5
    const DELAY_BETWEEN_BATCHES_MS = 50

    detailsLoadPromise = (async () => {
      try {
        for (let i = 0; i < basicFolders.length; i += BATCH_SIZE) {
          // 令牌不匹配说明已有新的fullRefresh，立即终止
          if (token !== detailsLoadToken) return

          const batch = basicFolders.slice(i, i + BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map((folder) =>
              getFolderDetails({
                name: folder.name,
                info: {
                  projectName: folder.projectName,
                  sessionId: folder.sessionId,
                  displayName: folder.displayName,
                  displayDate: folder.displayDate,
                  type: folder.type,
                },
              }),
            ),
          )

          // 逐项就地更新到响应式列表
          results.forEach((result, j) => {
            const folderName = batch[j].name
            const index = projectFolders.value.findIndex((f) => f.name === folderName)
            if (index === -1) return

            if (result.status === 'fulfilled') {
              projectFolders.value[index] = { ...result.value, _detailsLoaded: true }
            } else {
              // 加载失败时保留基本信息，标记已尝试加载
              projectFolders.value[index] = {
                ...projectFolders.value[index],
                _detailsLoaded: true,
              }
              logger.warn(`加载文件夹 ${folderName} 详情失败`, result.reason)
            }
          })

          // 批次间短延迟，避免持续占满I/O
          if (i + BATCH_SIZE < basicFolders.length) {
            await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
          }
        }

        logger.info('所有文件夹详情加载完成')
      } catch (e) {
        logger.error('增量加载详情异常', e)
      } finally {
        loadingDetails.value = false
        detailsLoadPromise = null
      }
    })()
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
    // 添加参数验证
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
    // 添加参数验证
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
    // 添加参数验证
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
    loadingDetails,
    lastFetched,
    foldersCount,
    folderItems,
    loadProjectFolders,
    refreshFolders,
    updateFolder,
    removeFolder,
    clearFolders,
    cleanupEventListeners,
    onBatchChange,
    clearBatchChangeCallbacks,
  }
})
