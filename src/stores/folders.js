// stores/folders.js
import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose, watch } from 'vue'
import * as storage from '@/api/pointCloudStorage'
import { Capacitor } from '@capacitor/core'
import noImg from '@/assets/img/noImg.png'

export const useFoldersStore = defineStore('folders', () => {
  // 状态
  const projectFolders = ref([])
  const loading = ref(false)
  const lastFetched = ref(null)
  const fetchPromise = ref(null)

  // 事件监听器引用
  let pointcloudUpdatedHandler = null

  // 初始化事件监听
  function initEventListeners() {
    if (typeof window === 'undefined') return

    if (pointcloudUpdatedHandler) {
      window.removeEventListener('pointcloud-updated', pointcloudUpdatedHandler)
    }

    pointcloudUpdatedHandler = (e) => {
      console.log('[FoldersStore] 收到 pointcloud-updated 事件', e?.detail)
      setTimeout(() => {
        refreshFolders()
      }, 0)
    }

    window.addEventListener('pointcloud-updated', pointcloudUpdatedHandler)
    console.log('[FoldersStore] 事件监听器已初始化')
  }

  // 清理事件监听
  function cleanupEventListeners() {
    if (typeof window === 'undefined' || !pointcloudUpdatedHandler) return

    window.removeEventListener('pointcloud-updated', pointcloudUpdatedHandler)
    pointcloudUpdatedHandler = null
    console.log('[FoldersStore] 事件监听器已清理')
  }

  // 计算属性
  const foldersCount = computed(() => projectFolders.value.length)

  const fileListItems = computed(() => {
    return projectFolders.value
      .map((folder) => {
        const title =
          folder.projectName && folder.projectName !== folder.sessionId
            ? folder.projectName
            : folder.sessionId || folder.name
        const displayDate = folder.hasFiles ? folder.displayDate : '空'

        return {
          folderName: folder.name,
          projectName: folder.projectName || folder.name,
          sessionId: folder.sessionId || folder.name,
          displayName: title,
          timeStr: displayDate,
          firstFile: folder.firstFile || null,
          hasFiles: folder.hasFiles,
          sortTime: folder.lastModified || 0,
        }
      })
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
  })

  // 计算属性：用于 ProjectList 组件的数据格式
  const projectListItems = computed(() => {
    return projectFolders.value
      .map((folder) => ({
        id: folder.name,
        name: folder.projectName || folder.name,
        thumbnail: folder.thumbnail || noImg,
        date: folder.displayName || folder.sessionId || '',
        source: '云台',
        original: folder,
        sortTime: folder.lastModified || 0,
        hasPhoto: folder.hasPhoto || false,
        batchInfo: folder.batchInfo || '',
        batchStats: folder.batchStats || [], // 批次统计信息，默认空数组
        totalPhotoCount: folder.totalPhotoCount || 0, // 照片总数
      }))
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
  })

  // 方法：加载项目文件夹
  async function loadProjectFolders(forceRefresh = false) {
    if (fetchPromise.value && !forceRefresh) {
      // console.log('fetchPromise不为空')
      return fetchPromise.value
    }

    if (!forceRefresh && projectFolders.value.length > 0 && lastFetched.value) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000 // 计算5分钟前的时间戳
      if (lastFetched.value > fiveMinutesAgo) {// 如果上次获取时间 > 5分钟前
        // console.log('[FoldersStore] 使用缓存的数据')
        return projectFolders.value
      }
    }

    loading.value = true

    fetchPromise.value = (async () => {
      try {
        console.log('[FoldersStore] 开始加载项目文件夹')
        const folders = await storage.session.listFolders()

        const withDetails = await Promise.all(
          folders.map(async (folder) => {
            const folderInfo = folder.info

            // 获取项目缩略图（使用新的动态选择策略）
            let thumbnail = null
            let hasPhoto = false
            let batchInfo = ''
            let batchStats = []
            let totalPhotoCount = 0

            try {
              // 使用新的缩略图选择函数
              const thumbResult = await storage.exportData.getThumbnail(folder.name)
              hasPhoto = thumbResult.hasPhoto
              batchInfo = thumbResult.batchInfo

              if (hasPhoto && thumbResult.uri) {
                thumbnail = Capacitor.convertFileSrc(thumbResult.uri)
                // console.log(`[FoldersStore] 为项目 ${folder.name} 选择缩略图: ${thumbResult.batchInfo}`)
              }

              // 获取批次统计信息
              batchStats = await storage.exportData.getBatchInfo(folder.name)
              totalPhotoCount = batchStats.reduce((sum, batch) => sum + batch.photoCount, 0)
            } catch (e) {
              console.warn(`[FoldersStore] 获取文件夹 ${folder.name} 缩略图失败:`, e)
            }

            // 解析项目名与 sessionId
            let projectName = folderInfo.projectName || folderInfo.displayName
            let sessionId = folderInfo.sessionId
            let displayName = folderInfo.displayName
            let displayDate = folderInfo.displayDate

            // 获取文件夹内文件信息（用于排序）
            let lastModified = 0
            let hasFiles = false
            let fileCount = 0

            try {
              const allPaths = await storage.file.listRecursive(`pointcloud/${folder.name}`)
              hasFiles = allPaths && allPaths.length > 0
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
                }
              }
            } catch (e) {
              // 忽略错误
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
          }),
        )

        // 按最后修改时间倒序排列
        withDetails.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
        projectFolders.value = withDetails
        lastFetched.value = Date.now()

        console.log(`[FoldersStore] 加载完成，共 ${withDetails.length} 个项目`)
        return withDetails
      } catch (e) {
        console.error('[FoldersStore] 加载失败', e)
        throw e
      } finally {
        loading.value = false
        fetchPromise.value = null
      }
    })()

    return fetchPromise.value
  }

  // 刷新数据
  async function refreshFolders() {
    console.log('[FoldersStore] 刷新项目列表')
    return loadProjectFolders(true)
  }

  function updateFolder(folderName, updates) {
    const index = projectFolders.value.findIndex((f) => f.name === folderName)
    if (index !== -1) {
      projectFolders.value[index] = {
        ...projectFolders.value[index],
        ...updates,
      }
    }
  }

  function removeFolder(folderName) {
    projectFolders.value = projectFolders.value.filter((f) => f.name !== folderName)
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

  function addFolder(folderData) {
    projectFolders.value.unshift(folderData)
  }

  function clearFolders() {
    projectFolders.value = []
    lastFetched.value = null
    fetchPromise.value = null
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
