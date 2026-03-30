<template>
  <div class="batch-detail-page">
    <div ref="rendererContainer" class="three-container"></div>
    <div class="sidebar">
      <h3>点位 {{ batchNum }}</h3>
      <button @click="reload" class="action-btn">查看点云</button>
      <button @click="removeBatch" class="action-btn delete">删除点位</button>
    </div>
  </div>
</template>

<script setup>
defineOptions({
  name: 'BatchDetailView'
})

import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePointCloudRenderer } from '@/composables/usePointCloudRenderer/index.js'
import * as storage from '@/api/pointCloudStorage'
import { showLoadingToast, closeToast, showToast, showConfirmDialog } from 'vant'

const router = useRouter()
const route = useRoute()

const sessionId = route.params.session
const batchNum = route.params.bid

const rendererContainer = ref(null)
let renderer = null
let isRendererReady = ref(false)

async function loadBatch() {
  if (!sessionId || !batchNum) return
  const data = await storage.batch.read(sessionId, batchNum)
  if (data && data.lines) {
    if (!renderer) return
    renderer.setData({ points: data.lines })
  }
}

function reload() {
  loadBatch()
}

async function removeBatch() {
  try {
    await storage.batch.delete(sessionId, batchNum)
    showToast({ message: '点位已删除', position: 'bottom' })
    router.back()
  } catch (e) {
    showToast({ message: '删除失败', position: 'bottom' })
  }
}

onMounted(async () => {
  if (rendererContainer.value) {
    renderer = usePointCloudRenderer(rendererContainer.value)
    isRendererReady.value = true
    await loadBatch()
  }
})

onUnmounted(() => {
  if (renderer && renderer.dispose) {
    renderer.dispose()
  }
})
</script>

<style scoped>
.batch-detail-page {
  display: flex;
  height: 100vh;
  background: #0a0a1a;
}
.three-container {
  flex: 1;
  position: relative;
}
.sidebar {
  width: 200px;
  padding: 16px;
  background: #131722;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.action-btn {
  padding: 8px 12px;
  background: var(--brand-gradient);
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
}
.action-btn.delete {
  background: #e25454;
}
</style>
