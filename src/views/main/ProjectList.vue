<template>
  <div class="project-list-container">
    <div
      class="content-area"
      ref="contentAreaRef"
    >
      <div v-if="showEmptyState" class="empty-state">
        <p>暂无项目</p>
      </div>

      <div
        v-else
        class="virtual-container"
        :style="{ height: effectiveTotalHeight + 'px', position: 'relative' }"
      >
        <div
          class="virtual-list"
          :style="{ transform: `translateY(${effectiveOffsetY}px)` }"
        >
          <div
            v-for="(item, index) in visibleProjectItems"
            :key="item._virtualIndex"
            class="list-item"
            :class="{ 'is-skeleton': item.isSkeleton }"
            @click="handleItemClick(item)"
          >
            <div class="thumbnail">
              <img
                :data-src="item.thumbnail || noImg"
                :src="isVirtualMode ? undefined : (item.thumbnail || noImg)"
                :alt="`Project ${item._virtualIndex + 1} Thumbnail`"
                @error="handleImageError($event, item, item._virtualIndex)"
              />
            </div>
            <div class="info">
              <div class="title">{{ item.name }}</div>
              <div class="date">{{ formatDate(item.sortTime) }} | {{ item.source }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useFoldersStore } from '@/stores/folders'
import { useVirtualList } from '@/composables/useVirtualList'
import noImg from '@/assets/img/noImg.png'

const folderStore = useFoldersStore()
const router = useRouter()

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const contentAreaRef = ref(null)
let observer = null
let attachedCount = 0

const resolveUrl = (url) => {
  try {
    return new URL(url, window.location.origin).href
  } catch {
    return url
  }
}

const normalizeSrc = (src) => {
  if (!src) return src
  try {
    return new URL(src, window.location.origin).href
  } catch {
    return src
  }
}

const handleImageError = (event, item, index) => {
  console.error(`图片加载失败 [${index}]:`, item.name, item.thumbnail)
  event.target.dataset.src = noImg
  event.target.src = noImg
}

const observeListItems = () => {
  nextTick(() => {
    if (!contentAreaRef.value) return
    if (observer) observer.disconnect()

    attachedCount = 0

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const img = entry.target.querySelector('img')
          if (!img) return

          if (entry.isIntersecting) {
            const dataSrc = img.getAttribute('data-src')
            if (dataSrc) {
              const expectedSrc = resolveUrl(dataSrc)
              const currentSrc = normalizeSrc(img.src)
              if (currentSrc !== expectedSrc) {
                img.src = dataSrc
                attachedCount++
              }
            }
          }
        })
      },
      {
        root: contentAreaRef.value,
        rootMargin: '300px 0px',
        threshold: 0.01,
      },
    )

    const items = contentAreaRef.value.querySelectorAll('.list-item')
    items.forEach((el) => observer.observe(el))
  })
}

const handleItemClick = (item) => {
  if (!item.sessionId) {
    console.warn('项目缺少 sessionId，无法跳转:', item)
    return
  }
  router.push({
    name: 'PointCloud',
    query: {
      mode: 'view',
      currentSessionId: item.sessionId,
    },
  })
}

const folderDataItems = computed(() => folderStore.folderItems)

const skeletonItems = [
  { name: '加载中...', thumbnail: noImg, sortTime: Date.now(), source: '云台', isSkeleton: true },
  { name: '加载中...', thumbnail: noImg, sortTime: Date.now(), source: '云台', isSkeleton: true },
  { name: '加载中...', thumbnail: noImg, sortTime: Date.now(), source: '云台', isSkeleton: true },
]

const showEmptyState = computed(
  () => folderDataItems.value.length === 0 && !folderStore.loading,
)

const isVirtualMode = computed(
  () => !folderStore.loading && folderDataItems.value.length > 0,
)

const {
  visibleItems: virtualItems,
  totalHeight,
  offsetY,
} = useVirtualList(folderDataItems, contentAreaRef)

const visibleProjectItems = computed(() => {
  if (!isVirtualMode.value) {
    return skeletonItems.map((item, i) => ({ ...item, _virtualIndex: i }))
  }
  return virtualItems.value
})

// 骨架屏模式下覆盖 totalHeight，确保容器有足够高度展示占位项
// 使用固定 ITEM_HEIGHT = 192（与 useVirtualList 中保持一致）
const SKELETON_ITEM_HEIGHT = 192

const effectiveTotalHeight = computed(() => {
  if (!isVirtualMode.value) {
    return skeletonItems.length * SKELETON_ITEM_HEIGHT
  }
  return totalHeight.value
})

const effectiveOffsetY = computed(() => {
  if (!isVirtualMode.value) return 0
  return offsetY.value
})

onMounted(() => {
  observeListItems()
})

onActivated(() => {
  observeListItems()
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

let lastRenderStart = -1
let lastRenderEnd = -1

watch(visibleProjectItems, (items) => {
  if (items.length === 0) return
  const s = items[0]._virtualIndex
  const e = items[items.length - 1]._virtualIndex + 1
  if (s !== lastRenderStart || e !== lastRenderEnd) {
    lastRenderStart = s
    lastRenderEnd = e
    observeListItems()
  }
})

watch(
  () => folderStore.loading,
  (newVal, oldVal) => {
    if (oldVal && !newVal) {
      lastRenderStart = -1
      lastRenderEnd = -1
      observeListItems()
    }
  },
)</script>

<!-- 注意：这里使用了 scoped 样式，它只会影响当前组件 -->
<style scoped>
/* 项目列表容器 */
.project-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
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
  position: relative;
  min-height: 180px;
}

.thumbnail {
  width: 100%;
  height: 180px;
  overflow: hidden;
  position: absolute;
  top: 0;
  left: 0;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info {
  padding: 16px;
  border-radius: 20px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
  position: relative;
  z-index: 1;
  min-height: 180px;
}

.info .title {
  color: white;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
}

.info .date {
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* 骨架屏加载动画 */
.list-item.is-skeleton .thumbnail img {
  opacity: 0.6;
}

.list-item.is-skeleton {
  animation: skeletonPulse 1.5s ease-in-out infinite;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* 加载中的文字样式 */
.list-item.is-skeleton .info .title {
  font-size: 16px;
  font-weight: 400;
  opacity: 0.8;
  letter-spacing: 2px;
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
