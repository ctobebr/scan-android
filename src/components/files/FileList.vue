<template>
  <div class="favorites-list">
    <main class="list-container">
      <div v-if="loadingFiles" class="loading-state">
        <p>加载中...</p>
      </div>

      <div v-else-if="sessions.length === 0" class="empty-state">
        <p>暂无历史数据文件</p>
      </div>

      <div v-else class="list">
        <div v-for="session in sessions" :key="session.folderName" class="list-item">
          <div class="info">
            <div class="title">{{ session.displayName }}</div>
            <div class="date">
              <span>{{ session.firstFile ? formatDate(session.firstFile.mtime) : '空' }}</span>
            </div>
            <div class="date">
              <span>{{
                session.firstFile ? formatFileSize(session.firstFile.size || 0) : '空'
              }}</span>
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { bluetoothService } from '@/services/bluetoothService'
import { showToast } from '@/utils/toast'
import { parseSessionIdToFormattedTime } from '@/utils/sessionIdUtils'
import { Share } from '@capacitor/share'
import { AppLauncher, LaunchWebUrlResult } from '@capacitor/app-launcher'
const loadingFiles = ref(false)
const sessions = ref([])

const loadFileList = async () => {
  loadingFiles.value = true
  try {
    const folders = await bluetoothService.listPointCloudFolders()
    console.log('folders:', JSON.stringify(folders))
    const items = []
    for (const f of folders) {
      const filesInFolder = await bluetoothService.listFilesInFolder(`pointcloud/${f.name}`)
      // 选择最新的文件作为 firstFile（按 mtime 倒序）
      const sortedFiles = (filesInFolder || [])
        .slice()
        .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
      const firstFile = sortedFiles.length > 0 ? sortedFiles[0] : null
      // 尝试从文件夹名解析项目名与 sessionId
      let projectName = f.name
      let sessionId = f.name
      // 如果命名为 project_sessionId，则拆分
      const idx = f.name.lastIndexOf('_')
      if (idx > 0) {
        projectName = f.name.slice(0, idx)
        sessionId = f.name.slice(idx + 1)
      }
      const timeStr = parseSessionIdToFormattedTime(sessionId) || sessionId
      // 标题显示优先级：项目名称 > 会话ID
      const title = projectName && projectName !== sessionId ? projectName : sessionId
      items.push({
        folderName: f.name,
        projectName,
        sessionId,
        displayName: title,
        timeStr,
        firstFile,
      })
    }
    // 按时间倒序：有 firstFile 的按 firstFile.mtime 排序，否则放到末尾
    items.sort((a, b) => (b.firstFile?.mtime || 0) - (a.firstFile?.mtime || 0))
    sessions.value = items
  } catch (error) {
    console.error('加载会话列表失败:', error)
    showToast('加载会话列表失败: ' + (error.message || error))
    sessions.value = []
  } finally {
    loadingFiles.value = false
  }
}
const onShareClick = async (folderName, projectName, sessionId) => {
  try {
    // 检查会话文件夹是否为空
    const filesInFolder = await bluetoothService.listFilesInFolder(`pointcloud/${folderName}`)
    if (!filesInFolder || filesInFolder.length === 0) {
      if (confirm('当前会话文件夹为空，是否删除该会话？')) {
        await bluetoothService.deleteFolder(folderName)
        await loadFileList()
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
      // 分享后尝试在文件管理器中打开目标文件夹，便于手动复制到 U 盘
      // try {
      //   const rel = folderName
      //   console.warn('调用 FileManagerOpener.openFolder 中3...')
      //   if (Plugins && Plugins.FileManagerOpener && Plugins.FileManagerOpener.openFolder) {
      //     await Plugins.FileManagerOpener.openFolder({ path: rel })
      //     console.warn('调用 FileManagerOpener.openFolder 中2...')
      //   } else if ((window ).Capacitor && (window).Capacitor.Plugins?.FileManagerOpener) {
      //     console.warn('调用 FileManagerOpener.openFolder 中1...')
      //     await (window).Capacitor.Plugins.FileManagerOpener.openFolder({ path: rel })
      //   }
      //   console.warn('调用 FileManagerOpener.openFolder 中...')
      // } catch (e) {
      //   console.warn('调用 FileManagerOpener.openFolder 失败', e)
      // }
      // showToast('压缩包已生成：' + String(res.path) + '，可使用文件管理器复制到 U 盘')
    } else {
      showToast('打包失败，未生成可分享文件')
    }
  } catch (error) {
    console.error('分享会话失败:', error)
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
// const onShareClick = async (folderName, projectName, sessionId) => {
//   try {
//     // 检查会话文件夹是否为空
//     const filesInFolder = await bluetoothService.listFilesInFolder(`pointcloud/${folderName}`)
//     if (!filesInFolder || filesInFolder.length === 0) {
//       if (confirm('当前会话文件夹为空，是否删除该会话？')) {
//         await bluetoothService.deleteFolder(folderName)
//         await loadFileList()
//       }
//       return
//     }

//     const timeStr = parseSessionIdToFormattedTime(sessionId) || sessionId
//     const zipBaseName = `${timeStr}_${projectName || sessionId}`
//     console.log(
//       '[FileList] 请求打包分享 folder=' +
//         String(folderName) +
//         ' zipBaseName=' +
//         String(zipBaseName),
//     )
//     const res = await bluetoothService.zipSessionToFile(folderName, zipBaseName)
//     if (res) {
//       // 准备分享数据
//       let fileUri = null;
//       // 尝试获取文件 URI
//       if (res.uri) {
//         fileUri = res.uri;
//       } else if (res.path) {
//         // 如果插件返回了绝对路径，尝试通过 getURL 获取 URI
//         try {
//           fileUri = await bluetoothService.getURL(res.path);
//         } catch (e) {
//           console.warn('通过 res.path 获取 URI 失败:', e);
//         }
//       } else if (res.relativePath) {
//          // 如果插件返回了相对路径，也尝试通过 getURL 获取 URI
//         try {
//           fileUri = await bluetoothService.getURL(res.relativePath);
//         } catch (e) {
//           console.warn('通过 res.relativePath 获取 URI 失败:', e);
//         }
//       }

//       if (fileUri) {
//         await Share.share({
//           title: `分享数据文件: ${zipBaseName}.zip`,
//           url: fileUri,
//           dialogTitle: '选择应用分享文件',
//         })
//       } else {
//         // 如果无法获取 URI，则回退到原来的逻辑，打开文件管理器
//         console.warn('无法获取文件URI，回退到打开文件管理器');
//         let targetDir = folderName
//         if (res.relativePath && typeof res.relativePath === 'string') {
//           const rp = res.relativePath.replace(/\\/g, '/')
//           const parts = rp.split('/')
//           if (parts.length > 1) parts.pop()
//           targetDir = parts.join('/') || folderName
//         }
//         const plugin = Capacitor.Plugins && Capacitor.Plugins.FileManagerOpener
//         if (plugin && plugin.openFolder) {
//           await plugin.openFolder({ path: targetDir })
//           showToast('已打开文件管理器，定位到：' + targetDir)
//         } else if (window?.Capacitor?.Plugins?.FileManagerOpener) {
//           await window.Capacitor.Plugins.FileManagerOpener.openFolder({ path: targetDir })
//           showToast('已打开文件管理器，定位到：' + targetDir)
//         } else {
//           showToast(
//             '未找到原生插件，压缩包已生成：' + String(res.path || res.relativePath || res.uri),
//           )
//         }
//       }
//     } else {
//       showToast('打包失败，未生成文件')
//     }
//   } catch (error) {
//     console.error('分享会话失败:', error)
//     // 使用与模板相同的错误处理
//     showToast(`分享文件 "${zipBaseName || sessionId}" 失败 (可能因文件过大): ${error.message}`)

//     const msg = (error && error.message) || String(error)
//     if (/cancel|canceled|用户取消|Share canceled/i.test(msg)) {
//       showToast('分享已取消')
//     } else if (/FILE_NOTCREATED/i.test(msg)) {
//       showToast('打包失败：未创建文件')
//     } else {
//       showToast('分享失败: ' + msg)
//     }
//   }
// }

/**
 * 处理 Delete 按钮点击
 * @param {string} fileName - 被点击项的文件名
 */
const onDeleteClick = (fileNameOrFolder) => {
  console.log(`删除按钮被点击，目标:  ${fileNameOrFolder}`)
  showMoreOptions(fileNameOrFolder) // Reuse the existing confirmation logic
}

const showMoreOptions = (filename) => {
  const rel = (filename || '').replace('pointcloud/', '')
  if (confirm(`确定要删除会话 "${rel}" 吗？此操作不可撤销。`)) {
    deleteFile(filename)
  }
}

const deleteFile = async (filename) => {
  // 支持删除单文件或整个文件夹（若传入为文件夹名）
  try {
    // 如果是文件夹（pointcloud/<folder>），使用统一接口删除整个文件夹
    if (filename && filename.includes('pointcloud/')) {
      const rel = filename.replace('pointcloud/', '')
      console.log('[FileList] 请求删除文件夹: ' + rel)
      await bluetoothService.deleteFolder(rel)
    } else {
      // 删除单个文件位于 Documents 根
      console.log('[FileList] 请求删除单文件: ' + filename)
      await bluetoothService.deleteBleDataFile(filename)
    }
    showToast('删除完成')
  } catch (e) {
    console.error('删除失败', e)
    showToast('删除失败: ' + (e.message || e))
  } finally {
    await loadFileList()
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
  loadFileList()
  try {
    window.addEventListener('pointcloud-updated', loadFileList)
  } catch (e) {
    console.warn('addEventListener pointcloud-updated failed', e)
  }
})

onBeforeUnmount(() => {
  try {
    window.removeEventListener('pointcloud-updated', loadFileList)
  } catch (e) {
    console.warn('removeEventListener failed', e)
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
