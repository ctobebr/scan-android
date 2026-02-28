<template>
  <div class="favorites-list">
    <main class="list-container">
      <div v-if="folderStore.loading" class="loading-state">
        <p>加载中...</p>
      </div>

      <div v-else-if="sessions.length === 0" class="empty-state">
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { bluetoothService } from '@/services/bluetoothService'
import { showToast } from '@/utils/toast'
import { parseSessionIdToFormattedTime } from '@/utils/sessionIdUtils'
import { Share } from '@capacitor/share'
import { useFoldersStore } from '@/stores/folders'

const folderStore = useFoldersStore()
// 直接从 store 的计算属性获取会话列表
const sessions = computed(() => {
  return folderStore.fileListItems
})

const onShareClick = async (folderName, projectName, sessionId) => {
  try {
    // 检查项目文件夹是否为空
    const filesInFolder = await bluetoothService.listFilesInFolder(`pointcloud/${folderName}`)
    if (!filesInFolder || filesInFolder.length === 0) {
      if (confirm('当前项目文件夹为空，是否删除该项目？')) {
        await bluetoothService.deleteFolder(folderName)
        // 删除后刷新 store（事件会触发，但这里可以立即刷新）
        await folderStore.refreshFolders()
      }
      return
    }

    const timeStr = parseSessionIdToFormattedTime(sessionId) || sessionId
    const zipBaseName = `${timeStr}_${projectName || sessionId}`
    console.log(
      '[FileList] 请求打包分享 folder=' +
        String(folderName) +
        ' zipBaseName=' +
        String(zipBaseName),
    )
    const res = await bluetoothService.zipSessionToFile(folderName, zipBaseName)
    if (res && res.uri) {
      await Share.share({
        title: `${zipBaseName}.zip`,
        url: res.uri,
        dialogTitle: '选择应用分享压缩包',
      })
      showToast('压缩包已生成：' + String(res.path) + '，可使用文件管理器复制到 U 盘')
    } else {
      showToast('打包失败，未生成可分享文件')
    }
  } catch (error) {
    console.error('分享项目失败:', error)
    const msg = (error && error.message) || String(error)
    if (/cancel|canceled|用户取消|Share canceled/i.test(msg)) {
      showToast('分享已取消')
    } else if (/FILE_NOTCREATED/i.test(msg)) {
      showToast('打包失败：未创建文件')
    } else {
      showToast('分享失败: ' + msg)
    }
  }
}


/**
 * 处理 Delete 按钮点击
 * @param {string} fileNameOrFolder - 被点击项的文件
 */
const onDeleteClick = (fileNameOrFolder) => {
  console.log(`删除按钮被点击，目标:  ${fileNameOrFolder}`)
  showMoreOptions(fileNameOrFolder)
}

const showMoreOptions = (filename) => {
  const rel = (filename || '').replace('pointcloud/', '')
  const res = rel.split('_')[0]
  if (confirm(`确定要删除 "${res}" 项目吗？此操作不可撤销。`)) {
    deleteFile(filename)
  }
}

const deleteFile = async (filename) => {
  try {
    if (filename && filename.includes('pointcloud/')) {
      const rel = filename.replace('pointcloud/', '')
      console.log('[FileList] 请求删除文件夹: ' + rel)
      await bluetoothService.deleteFolder(rel)
      // 删除后从 store 中移除（事件也会触发，但这里可以立即更新）
      folderStore.removeFolder(rel)
    } else {
      console.log('[FileList] 请求删除单文件: ' + filename)
      await bluetoothService.deleteBleDataFile(filename)
      // 单文件删除后刷新整个列表（事件也会触发，但这里可以立即更新）
      await folderStore.refreshFolders()
    }
    showToast('删除完成')
  } catch (e) {
    console.error('删除失败', e)
    showToast('删除失败: ' + (e.message || e))
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

onMounted(() => {
  // 组件挂载时，如果 store 还没有数据，则加载
  if (folderStore.projectFolders.length === 0) {
    folderStore.loadProjectFolders()
  }
})
</script>

<style scoped>
.favorites-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
}

.list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #999;
}

.list {
  width: 100%;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 20px;
  margin: 0px 0px 10px 0px;
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  /* 移除 cursor: pointer; 防止鼠标悬停时显示手型光标 */
  transition: all 0.18s ease;
  position: relative;
  width: 100%;
  min-height: 92px;
  overflow: hidden;
}

/* 禁用 hover 效果 */
.list-item:hover {
  background-color: #fff; /* 保持背景色不变 */
  transform: none; /* 禁用位移效果 */
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06); /* 禁用阴影变化 */
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
  font-size: 15px;
  font-weight: 600;
  color: #111827;
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

/* .icon-review:hover,
.icon-share:hover,
.icon-delete:hover {
  opacity: 1;
  transform: translateY(-2px) scale(1.06);
} */

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
