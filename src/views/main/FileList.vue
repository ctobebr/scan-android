<template>
  <div class="favorites-list">
    <main class="list-container">
      <div v-if="sessions.length === 0 && !folderStore.loading" class="empty-state">
        <p>暂无历史数据文件</p>
      </div>
      <div v-else class="list">
        <div v-for="session in sessions" :key="session.folderName" class="list-item">
          <div class="info">
            <!-- title 显示 projectName 或 sessionId -->
            <div class="title">{{ session.displayName }}</div>
            <!-- date 显示：如果有文件则显示时间，否则显示"空" -->
            <div class="date">
              <span>{{ session.timeStr }}</span>
            </div>
          </div>

          <!-- 操作图标容器 -->
          <div class="action-icons">
            <img
              src="@/assets/img/share.png"
              @click.stop="onShareClick(session.folderName, session.projectName, session.sessionId)"
              class="icon-share"
              alt="Share"
            />
            <img
              src="@/assets/img/delete.png"
              @click.stop="onDeleteClick('pointcloud/' + session.folderName)"
              class="icon-delete"
              alt="Delete"
            />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onUnmounted, watch } from 'vue'
import { showLoadingToast, closeToast, showToast, showConfirmDialog  } from 'vant'
import { parseSessionIdToFormattedTime } from '@/utils/format/sessionId'
import { Share } from '@capacitor/share'
import { useFoldersStore } from '@/stores/folders'
import * as storage from '@/api/pointCloudStorage'

const folderStore = useFoldersStore()

// --- 新增：组件卸载时强制关闭 Toast ---
// 防止页面跳转了 Toast 还在转
onUnmounted(() => {
  closeToast()
})

onMounted(() => {
  if (folderStore.projectFolders.length === 0) {
    folderStore.loadProjectFolders()
  }
})
onActivated(() => {
  console.log('激活filelist')
  // folderStore.loadProjectFolders()
})
// 直接从 store 的计算属性获取会话列表
const sessions = computed(() => {
  return folderStore.fileListItems
})

// ========== 新增：统一的等待刷新函数 ==========
/**
 * 等待文件夹Store刷新完成
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<void>}
 */
const waitForRefresh = (timeout = 10000) => {
  return new Promise((resolve, reject) => {
    let unwatchCleanup = null
    let timeoutId = null
    let resolved = false

    const cleanup = () => {
      if (unwatchCleanup) {
        unwatchCleanup()
        unwatchCleanup = null
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup()
        reject(new Error('等待刷新超时'))
      }
    }, timeout)

    const unwatch = watch(
      () => folderStore.loading,
      (newVal) => {
        if (newVal === false && !resolved) {
          resolved = true
          cleanup()
          resolve()
        }
      },
      { immediate: true }
    )

    unwatchCleanup = unwatch
  })
}

const onShareClick = async (folderName, projectName, sessionId) => {
  let unwatchCleanup = null
  let unwatch2Cleanup = null
  let timeoutId = null

  // 定义清理函数
  const cleanup = () => {
    if (unwatch2Cleanup) {
      unwatch2Cleanup()
      unwatch2Cleanup = null
    }
    if (unwatchCleanup) {
      unwatchCleanup()
      unwatchCleanup = null
    }
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  try {
    // 检查项目文件夹是否为空（包括子文件夹和文件）
    const folderPath = `pointcloud/${folderName}`
    const directoryContent = await storage.file.readDir(folderPath)

    // 检查是否有任何内容（文件或子目录）
    const hasContent = directoryContent.files && directoryContent.files.length > 0

    // 空文件夹处理：询问是否删除
    if (!hasContent) {
      // 获取正确的显示名称用于确认对话框
      const folderInfo = storage.path.parseFolderName(folderName)
      const displayName = folderInfo.displayName || folderName

      const confirmed = await showConfirmDialog({
        title: '提示',
        message: `项目 "${displayName}" 为空，是否删除该项目？`,
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      }).catch(() => false)

      if (confirmed) {
        try {
          showLoadingToast({
            message: '加载中...',
            forbidClick: true,
          })

          await storage.session.deleteFolder(folderName)

          // 手动刷新文件夹列表
          await folderStore.refreshFolders()

          // 使用统一的等待刷新函数
          await waitForRefresh(15000)

          closeToast()
          showToast({ message: '删除成功', position: 'bottom' })
        } catch (e) {
          closeToast()
          showToast({
            message: `删除失败: ${e.message || '未知错误'}`,
            position: 'bottom',
          })
        } finally {
          cleanup()
        }
      }
      return
    }

    // 递归检查项目文件夹是否有文件（用于打包分享）
    const allFiles = await storage.file.listRecursive(folderPath)

    // 如果只有子目录但没有文件，提示用户是否删除
    if (!allFiles || allFiles.length === 0) {

      // 获取正确的显示名称用于确认对话框
      const folderInfo = storage.path.parseFolderName(folderName)
      const displayName = folderInfo.displayName || folderName

      const confirmed = await showConfirmDialog({
        title: '提示',
        message: `项目 "${displayName}" 为空（只有空文件夹），是否删除该项目？`,
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      }).catch(() => false)

      if (confirmed) {
        try {
          showLoadingToast({
            message: '加载中...',
            forbidClick: true,
          })

          await storage.session.deleteFolder(folderName)

          // 手动刷新文件夹列表
          await folderStore.refreshFolders()

          // 使用统一的等待刷新函数
          await waitForRefresh(15000)

          closeToast()
          showToast({ message: '删除成功', position: 'bottom' })
        } catch (e) {
          closeToast()
          showToast({
            message: `删除失败: ${e.message || '未知错误'}`,
            position: 'bottom',
          })
        } finally {
          cleanup()
        }
      }
      return
    }

    // 正常分享流程
    showLoadingToast({
      message: '加载中...',
      forbidClick: true,
    })

    const timeStr = parseSessionIdToFormattedTime(sessionId) || sessionId
    const zipBaseName = `${timeStr}_${projectName || sessionId}`

    console.log(
      '[FileList] 请求打包分享 folder=' +
        String(folderName) +
        ' zipBaseName=' +
        String(zipBaseName) +
        ' 文件数=' +
        allFiles.length,
    )

    const res = await storage.exportData.toZip(
      folderName,
      zipBaseName
    )

    console.log('[FileList] zipSessionToFile result', res)
    closeToast()

    if (res && res.uri) {
      await Share.share({
        title: `${zipBaseName}.zip`,
        url: res.uri,
        dialogTitle: '选择应用分享压缩包',
      })
      // 添加分享成功提示
      showToast({
        message: '分享成功',
        position: 'bottom',
      })
    } else {
      showToast({
        message: '打包失败，未生成可分享文件',
        position: 'bottom',
      })
    }
  } catch (error) {
    console.error('分享项目失败:', error)
    closeToast()

    const msg = (error && error.message) || String(error)
    if (/cancel|canceled|用户取消|Share canceled/i.test(msg)) {
      showToast({
        message: '分享已取消',
        position: 'bottom',
      })
    } else if (/FILE_NOTCREATED/i.test(msg)) {
      showToast({
        message: '打包失败：未创建文件',
        position: 'bottom',
      })
    } else {
      showToast({
        message: '分享失败',
        position: 'bottom',
      })
    }
  } finally {
    // 只在有需要时清理，避免重复清理
    if (unwatchCleanup || unwatch2Cleanup || timeoutId) {
      cleanup()
    }
  }
}

/**
 * 处理 Delete 按钮点击
 * @param {string} fileNameOrFolder - 被点击项的文件
 */
const onDeleteClick = (fileNameOrFolder) => {
  showMoreOptions(fileNameOrFolder)
}

const showMoreOptions = async (filename) => {
  const rel = (filename || '').replace('pointcloud/', '')
  const folderInfo = storage.path.parseFolderName(rel)
  const displayName = folderInfo.displayName || rel

  const confirmed = await showConfirmDialog({
    title: '提示',
    message: `确定要删除 "${displayName}" 项目吗？此操作不可撤销。`,
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  }).catch(() => false)

  if (confirmed) {
    deleteFile(filename)
  }
}

// --- 核心修改：确保 Loading 覆盖整个异步流程 ---
const deleteFile = async (folderPath) => {
  let unwatchCleanup = null  // 用于清理 watch
  let unwatch2Cleanup = null // 用于清理内层 watch
  let timeoutId = null       // 用于清理定时器

  // 定义清理函数
  const cleanup = () => {
    if (unwatch2Cleanup) {
      unwatch2Cleanup()
      unwatch2Cleanup = null
    }
    if (unwatchCleanup) {
      unwatchCleanup()
      unwatchCleanup = null
    }
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  try {
    if (!folderPath?.includes('pointcloud/')) {
      throw new Error('无效的项目文件夹路径')
    }

    const relativePath = folderPath.replace('pointcloud/', '')

    // 检查文件夹是否存在
    const folderExists = await storage.file.exists(folderPath)
    if (!folderExists) {
      throw new Error('文件夹不存在')
    }

    showLoadingToast({
      message: '加载中...',
      forbidClick: true,
    })

    // 1. 执行删除
    await storage.session.deleteFolder(relativePath)

    // 2. 手动刷新文件夹列表
    await folderStore.refreshFolders()

    // 3. 等待刷新完成
    await waitForRefresh(15000)

    closeToast()
    showToast({ message: '删除成功', position: 'bottom' })

  } catch (e) {
    closeToast()
    showToast({
      message: `删除失败: ${e.message || '未知错误'}`,
      position: 'bottom',
    })
  } finally {
    // 确保所有监听器和定时器都被清理
    cleanup()
  }
}

const formatDate = (timestamp) => {
  if (!timestamp) return '未知'
  return new Date(timestamp).toLocaleString()
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<!-- style部分保持不变，未做任何修改 -->
<style scoped>
.favorites-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  background: transparent;
  height: 100%;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #999;
  background: transparent;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.list {
  width: 100%;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 20px;
  margin: 0px 0px 10px 0px;
  background-color: white;
  border-radius: 20px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  transition: all 0.18s ease;
  position: relative;
  width: 100%;
  min-height: 92px;
  overflow: hidden;
}

.list-item:hover {
  background-color: #fff;
  transform: none;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}

.info {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
  padding-right: 130px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.2;
  margin: 0 0 6px 0;
  display: block;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.date {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.2;
}

.action-icons {
  display: flex;
  gap: 12px;
  position: absolute;
  right: 20px;
  top: 8px;
  z-index: 2;
  align-items: flex-end;
}

.icon-review,
.icon-share,
.icon-delete {
  width: 28px;
  height: 28px;
  opacity: 0.95;
  transition:
    opacity 0.15s ease,
    transform 0.12s ease;
  cursor: pointer;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.08));
  -webkit-tap-highlight-color: transparent;
}

.icon-review {
  filter: hue-rotate(190deg) saturate(0.9);
}
.icon-share {
  filter: hue-rotate(100deg) saturate(1.1);
}
.icon-delete {
  filter: hue-rotate(-10deg) saturate(1.1);
}
</style>
