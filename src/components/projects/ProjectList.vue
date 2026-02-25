<template>
  <div class="project-list-container">
    <!-- 项目列表内容区域 (可滚动) -->
    <div class="content-area">
      <div v-for="(item, index) in projectListItems" :key="index" class="list-item">
        <div class="thumbnail">
          <img
            :src="item.thumbnail"
            :alt="`Project  ${index + 1} Thumbnail`"
            @error="
              (e) => {
                console.warn('[ProjectList] thumbnail load error', item, e)
                e.target.src = noImg
              }
            "
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
import { ref, watch } from 'vue'

import noImg from '@/assets/img/noImg.png'

const props = defineProps({
  projects: { type: Array, default: () => null },
})
const projectListItems = ref([])

// 响应 props.projects 的变化
watch(
  () => props.projects,
  (newVal) => {
    const arr = Array.isArray(newVal) ? newVal : (newVal && newVal.value) || []
    if (arr && Array.isArray(arr)) {
      const mapped = arr.map((p, idx) => ({
        id: idx + 1,
        name: p.projectName || p.name || p.folderName || `项目 ${idx + 1}`,
        thumbnail: p.thumbUri || p.thumbnail || noImg,
        status: '已保存',
        date: p.displayName || p.sessionId || '',
        source: p.projectName || '手机',
      }))

      // 按照 date 字段进行排序，最新的在前
      const sortedMapped = mapped.sort((a, b) => {
        // 尝试将 a.date 和 b.date 转换为 Date 对象进行比较
        // 如果转换失败 (isNaN)，则将其视为最早的时间 (负无穷)
        const dateA = new Date(a.date)
        const dateB = new Date(b.date)

        // 如果 a 的日期更晚（更大），则返回负数，a 排在 b 前面
        if (dateA > dateB) return -1
        // 如果 a 的日期更早（更小），则返回正数，b 排在 a 前面
        if (dateA < dateB) return 1
        // 如果相等，则保持原有顺序
        return 0
      })

      projectListItems.value = sortedMapped
    }
    // 调试：输出接收到的项目数组，便于诊断缩略图路径问题
    console.log('[ProjectList] props.projects changed:', JSON.stringify(arr))
  },
  { immediate: true },
)

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
  height: 100%; /* 占满父容器 */
  display: flex;
  flex-direction: column;
}

/* 内容区域 - 可滚动 */
.content-area {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 关键：当内容超出时允许垂直滚动 */
  /* 隐藏滚动条 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.content-area::-webkit-scrollbar {
  display: none; /* Chrome, Safari */
}

/* 为了演示，保持与原来一致的样式 */
.list-item {
  background: white;
  border-radius: 12px;
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
  font-weight: 500;
  margin-bottom: 4px;
  color: #333;
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
