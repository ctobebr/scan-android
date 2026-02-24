<template>
  <div class="project-list-container">
    <!-- 项目列表内容区域 (可滚动) -->
    <div class="content-area">
      <div v-for="(item, index) in projectListItems" :key="index" class="list-item">
        <div class="thumbnail">
          <img :src="item.thumbnail" :alt="`Project  ${index + 1} Thumbnail`" />
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
import { ref } from 'vue'

// 模拟项目列表数据
const projectListItems = ref([
  {
    id: 1,
    name: '项目1',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+1',
    status: '未活跃',
    date: '2026-01-30',
    source: '云台'
  },
  {
    id: 2,
    name: '项目2',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+2',
    status: '活跃',
    date: '2026-01-29',
    source: '手机拍'
  },
  {
    id: 3,
    name: '项目3',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+3',
    status: '未活跃',
    date: '2026-01-28',
    source: '云台'
  },
  {
    id: 4,
    name: '项目4',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+4',
    status: '活跃',
    date: '2026-01-27',
    source: '云台'
  },
  {
    id: 5,
    name: '项目5',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+5',
    status: '未活跃',
    date: '2026-01-26',
    source: '手机拍'
  },
  {
    id: 6,
    name: '项目6',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+6',
    status: '活跃',
    date: '2026-01-25',
    source: '云台'
  },
  {
    id: 7,
    name: '项目7',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+7',
    status: '未活跃',
    date: '2026-01-24',
    source: '手机拍'
  },
  {
    id: 8,
    name: '项目8',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+8',
    status: '活跃',
    date: '2026-01-23',
    source: '云台'
  },
  {
    id: 9,
    name: '项目9',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+9',
    status: '未活跃',
    date: '2026-01-22',
    source: '手机拍'
  },
  {
    id: 10,
    name: '项目10',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+10',
    status: '活跃',
    date: '2026-01-21',
    source: '云台'
  },
  {
    id: 11,
    name: '项目11',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+11',
    status: '未活跃',
    date: '2026-01-20',
    source: '手机拍'
  },
  {
    id: 12,
    name: '项目12',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+12',
    status: '活跃',
    date: '2026-01-19',
    source: '云台'
  },
  {
    id: 13,
    name: '项目13',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+13',
    status: '未活跃',
    date: '2026-01-18',
    source: '手机拍'
  },
  {
    id: 14,
    name: '项目14',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+14',
    status: '活跃',
    date: '2026-01-17',
    source: '云台'
  },
  {
    id: 15,
    name: '项目15',
    thumbnail: 'https://via.placeholder.com/300x200?text=Project+15',
    status: '未活跃',
    date: '2026-01-16',
    source: '手机拍'
  },
])

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
  -ms-overflow-style: none;  /* IE and Edge */
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
