<template>
  <div class="project-list-container">
    <!-- 项目列表内容区域 (可滚动) -->
    <div class="content-area">
      <div v-if="projectListItems.length === 0 && !folderStore.loading" class="empty-state">
        <p>暂无项目</p>
      </div>

      <div v-for="(item, index) in projectListItems" :key="item.id || index" class="list-item">
        <div class="thumbnail">
          <img
            :src="item.thumbnail || noImg"
            :alt="`Project  ${index + 1} Thumbnail`"
          />
        </div>
        <div class="info">
          <!-- <div class="status-bar">
            <span class="status-label">{{ item.status }}</span>
            <span class="action-link" @click="toggleStatus(index)">
              {{ item.status === '未活跃' ? '设为活跃' : '设为未活跃' }} >
            </span>
          </div> -->
          <div class="title">{{ item.name }}</div>
          <div class="date">{{ item.date }} | {{ item.source }}</div>
        </div>
        <!-- <div class="actions">
          <i class="icon-share" title="分享"></i>
          <i class="icon-more" title="更多"></i>
        </div> -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated } from 'vue'
import { useFoldersStore } from '@/stores/folders'
import noImg from '@/assets/img/noImg.png'

const folderStore = useFoldersStore()
// 直接从 store 获取项目列表数据
const projectListItems = computed(() => {
  if (folderStore.loading) {
    return [
      {
        name: '加载中...',
        thumbnail: noImg,
        date: '项目1',
        source: '云台',
      },
      {
        name: '加载中...',
        thumbnail: noImg,
        date: '项目2',
        source: '云台',
      },
      {
        name: '加载中...',
        thumbnail: noImg,
        date: '项目3',
        source: '云台',
      },
    ]
  }
  return folderStore.projectListItems.map((item) => ({ ...item, isSkeleton: false }))
})

// 初始化时，onMounted和onActivated都会执行
onMounted(() => {
  // 组件挂载时，如果 store 还没有数据，则加载
  if (folderStore.projectFolders.length === 0) {
    //  folderStore.loadProjectFolders()   //maincontenttabs中在挂载时会加载文件夹，而projectlist作为maincontenttabs的默认动态组件，此处应该可以暂时不再去重新加载文件夹
  }
})
onActivated(() => {
  // folderStore.loadProjectFolders()
})
// 响应 props.projects 的变化
// watch(
//   () => props.projects,
//   (newVal) => {
//     const arr = Array.isArray(newVal) ? newVal : (newVal && newVal.value) || []
//     if (arr && Array.isArray(arr)) {
//       const mapped = arr.map((p, idx) => ({
//         id: idx + 1,
//         name: p.projectName || p.name || p.folderName || `项目 ${idx + 1}`,
//         thumbnail: p.thumbUri || p.thumbnail || noImg,
//         status: '已保存',
//         date: p.displayName || p.sessionId || '',
//         source: p.projectName || '手机',
//       }))

//       // 按照 date 字段进行排序，最新的在前
//       const sortedMapped = mapped.sort((a, b) => {
//         // 尝试将 a.date 和 b.date 转换为 Date 对象进行比较
//         // 如果转换失败 (isNaN)，则将其视为最早的时间 (负无穷)
//         const dateA = new Date(a.date)
//         const dateB = new Date(b.date)

//         // 如果 a 的日期更晚（更大），则返回负数，a 排在 b 前面
//         if (dateA > dateB) return -1
//         // 如果 a 的日期更早（更小），则返回正数，b 排在 a 前面
//         if (dateA < dateB) return 1
//         // 如果相等，则保持原有顺序
//         return 0
//       })

//       projectListItems.value = sortedMapped
//     }
//     // 调试：输出接收到的项目数组，便于诊断缩略图路径问题
//   },
//   { immediate: true },
// )

// 切换项目状态
// const toggleStatus = (index) => {
//   const item = projectListItems.value[index]
//   item.status = item.status === '未活跃' ? '活跃' : '未活跃'
// }
</script>

<!-- 注意：这里使用了 scoped 样式，它只会影响当前组件 -->
<style scoped>
/* 项目列表容器 */
.project-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

/* 内容区域 - 可滚动 */
.content-area {
  flex: 1;
  overflow-y: auto;
  /* 添加透明背景 */
  background: transparent;
  /* 确保内容区域占满 */
  height: 100%;
  /* 隐藏滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.content-area::-webkit-scrollbar {
  display: none;
}
.loading-state {
  text-align: center;
  padding: 40px 0;
  color: #999;
  background: transparent;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 空状态 - 同样透明 */
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

/* 列表项保持白色卡片效果 */
.list-item {
  background: white;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 12px;
}

.thumbnail {
  width: 100%;
  height: 180px;
  overflow: hidden;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info {
  padding: 16px;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.status-label {
  font-size: 14px;
  color: #f56a00;
  background-color: rgba(245, 106, 0, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.action-link {
  font-size: 14px;
  color: #1890ff;
  text-decoration: none;
  cursor: pointer;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 4px;
}

.date {
  font-size: 12px;
  color: #999;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 16px;
  /* border-top: 1px solid #eee; */
}

.icon-share,
.icon-more {
  font-size: 18px;
  color: #666;
  cursor: pointer;
}
</style>
