<template>
  <div class="favorites-list">
    <main class="list-container">
      <div v-if="loadingFiles" class="loading-state">
        <p>加载中...</p>
      </div>

      <div v-else-if="files.length === 0" class="empty-state">
        <p>暂无历史数据文件</p>
      </div>

      <div v-else class="list">
        <div
          v-for="file in files"
          :key="file.name"
          class="list-item"
        >
          <div class="info">
            <div class="title">{{ file.name }}</div>
            <div class="date">
              <span>{{ formatDate(file.mtime) }}</span>
            </div>
            <div class="date">
              <span>{{ formatFileSize(file.size) }}</span>
            </div>
          </div>

          <!-- 操作图标容器 -->
          <div class="action-icons">
            <!-- <img
              src="@/assets/img/review.png"
              @click.stop="onReviewClick(file.name)"
              class="icon-review"
              alt="Review"
            /> -->
            <img
              src="@/assets/img/share.png"
              @click.stop="onShareClick(file.name)"
              class="icon-share"
              alt="Share"
            />
            <img
              src="@/assets/img/delete.png"
              @click.stop="onDeleteClick(file.name)"
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
import { ref, onMounted } from 'vue'
import { bluetoothService } from '@/services/bluetoothService'
import { showToast } from '@/utils/toast'
import { Share } from '@capacitor/share'

const loadingFiles = ref(false)
const files = ref([])

const loadFileList = async () => {
  loadingFiles.value = true
  try {
    files.value = await bluetoothService.listBleDataFiles()
  } catch (error) {
    console.error('加载文件列表失败:', error)
    showToast('加载文件列表失败: ' + error.message)
    files.value = []
  } finally {
    loadingFiles.value = false
  }
}

const onShareClick = async (filename) => {
  try {
    const fileUri = await bluetoothService.getURL(filename)
    await Share.share({
      title: `打开数据文件:  ${filename}`,
      url: fileUri,
      dialogTitle: '选择应用打开文件',
    })
  } catch (error) {
    console.error(`分享文件 " ${filename}" 失败:`, error)
    showToast(`分享文件 " ${filename}" 失败 (可能因文件过大):  ${error.message}`)
    // 也可以考虑跳转到详情页作为备选
    // router.push({...});
  }
}

/**
 * 处理 Delete 按钮点击
 * @param {string} fileName - 被点击项的文件名
 */
const onDeleteClick = (fileName) => {
  console.log(`删除按钮被点击，文件名:  ${fileName}`)
  showMoreOptions(fileName) // Reuse the existing confirmation logic
}

const showMoreOptions = (filename) => {
  if (confirm(`确定要删除文件 " ${filename}" 吗？此操作不可撤销。`)) {
    deleteFile(filename)
  }
}

const deleteFile = async (filename) => {
  let originalFiles = [...files.value]; // 缓存删除前的文件列表，用于恢复

  try {
    // 1. 立即乐观更新 UI：从本地列表中移除该项，给用户即时反馈
    files.value = files.value.filter(f => f.name !== filename);

    // 2. 发起实际删除请求
    // 注意：你需要确保 bluetoothService 中实现了 deleteBleDataFile 方法
    await bluetoothService.deleteBleDataFile(filename);

    // 3. 成功后显示提示
    showToast(`文件 " ${filename}" 已成功删除`);

  } catch (error) {
    console.error(`删除文件 " ${filename}" 失败:`, error);

    // 4. 删除失败时，回滚 UI 到删除前的状态
    files.value = originalFiles;

    // 5. 显示错误提示
    showToast(`删除文件 " ${filename}" 失败:  ${error.message}`);
  } finally {
    // 加载最新的文件列表，以确保 UI 与服务器状态同步
    // 如果删除失败，这次加载会再次获取到刚才删除失败的文件
    // 如果删除成功，这次加载会获取到最新的列表
    await loadFileList();
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
