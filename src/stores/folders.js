// stores/folders.js
import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import { bluetoothService } from '@/services/bluetoothService'
import { Capacitor } from '@capacitor/core'
import { parseSessionIdToFormattedTime } from '@/utils/sessionIdUtils'

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

      //  直接使用 folder.hasFiles
      const displayDate = folder.hasFiles ? folder.displayName || folder.sessionId || '' : '空'

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

  // ✅ 修改：用于 ProjectList 的数据格式
  const projectListItems = computed(() => {
    return projectFolders.value
      .map((folder) => ({
        id: folder.name,
        name: folder.projectName || folder.name,
        thumbnail: folder.thumbUri || null, // 如果没有照片则为 null，组件会显示 noImg
        date: folder.displayName || folder.sessionId || '',
        source: folder.projectName || '手机',
        original: folder,
        sortTime: folder.lastModified || 0,
      }))
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0)) // 按时间倒序排列
  })

  // 方法：加载项目文件夹
  async function loadProjectFolders(forceRefresh = false) {
    if (fetchPromise.value && !forceRefresh) {
      return fetchPromise.value
    }

    if (!forceRefresh && projectFolders.value.length > 0 && lastFetched.value) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      if (lastFetched.value > fiveMinutesAgo) {
        console.log('[FoldersStore] 使用缓存的数据')
        return projectFolders.value
      }
    }

    loading.value = true

    fetchPromise.value = (async () => {
      try {
        console.log('[FoldersStore] 开始加载项目文件夹')
        const folders = await bluetoothService.listPointCloudFolders()

        const withDetails = await Promise.all(
          folders.map(async (f) => {
            // 获取缩略图
            const rawThumbUri = await bluetoothService.getFirstPhotoUri(f.name).catch(() => null)
            let thumb = null
            if (rawThumbUri) {
              try {
                thumb = Capacitor.convertFileSrc(rawThumbUri)
              } catch (e) {
                console.warn('[FoldersStore] convertFileSrc failed', e)
              }
            }

            // 解析项目名与 sessionId
            let projectName = f.name
            let sessionId = f.name
            const idx = f.name.lastIndexOf('_')
            if (idx > 0) {
              projectName = f.name.slice(0, idx)
              sessionId = f.name.slice(idx + 1)
            }

            const displayName = parseSessionIdToFormattedTime(sessionId) || sessionId

            // 获取文件夹内文件信息
            let lastModified = 0
            let firstFile = null
            let hasFiles = false
            try {
              const files = await bluetoothService.listFilesInFolder(`pointcloud/${f.name}`)
              hasFiles = files && files.length > 0

              const sortedFiles = (files || [])
                .slice()
                .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
              firstFile = sortedFiles.length > 0 ? sortedFiles[0] : null

              for (const ff of files || []) {
                if (ff?.mtime && ff.mtime > lastModified) lastModified = ff.mtime
              }
            } catch (e) {
              // ignore
            }

            return {
              name: f.name,
              thumbUri: thumb,
              projectName,
              sessionId,
              displayName,
              lastModified,
              firstFile,
              hasFiles,
            }
          }),
        )

        // 按最后修改时间倒序排列，最新的在前
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
    addFolder,
    clearFolders,
    cleanupEventListeners,
  }
})
