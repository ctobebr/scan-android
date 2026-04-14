<template>
  <div class="batch-detail-page">
    <div ref="panoramaContainer" class="image-container">
      <!-- 加载提示 -->
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <span class="loading-text">加载中...</span>
      </div>

      <!-- WebGL 不支持提示 -->
      <div v-if="webglError" class="error-overlay">
        <span class="error-text">您的设备不支持 WebGL</span>
      </div>
    </div>
    <div class="sidebar">
      <div class="sidebar-header">
        <h3 class="title" v-if="!isDeleteConfirm">点位 {{ batchNum }}</h3>
        <h3 class="title" v-else>删除 点位{{ batchNum }}</h3>
        <button class="close-btn" @click="goBack">
          <Icon name="cross" />
        </button>
      </div>

      <!-- 正常菜单 -->
      <div class="menu-list" v-if="!isDeleteConfirm">
        <div class="menu-item" @click="handleManualSplice">
          <div class="menu-icon">
            <Icon name="edit" />
          </div>
          <span class="menu-text">手动拼接</span>
          <Icon name="arrow" class="menu-arrow" />
        </div>
        <div class="menu-item" @click="handleMosaic">
          <div class="menu-icon">
            <Icon name="apps-o" />
          </div>
          <span class="menu-text">马赛克</span>
          <Icon name="arrow" class="menu-arrow" />
        </div>
        <div class="menu-item" @click="handleTag">
          <div class="menu-icon">
            <Icon name="bookmark-o" />
          </div>
          <span class="menu-text">标记标签</span>
          <Icon name="arrow" class="menu-arrow" />
        </div>
        <div class="menu-item delete" @click="showDeleteConfirm">
          <div class="menu-icon">
            <Icon name="delete-o" />
          </div>
          <span class="menu-text">删除</span>
          <Icon name="arrow" class="menu-arrow" />
        </div>
      </div>

      <!-- 删除确认界面 -->
      <div class="delete-confirm" v-else>
        <div class="confirm-buttons">
          <button class="cancel-btn" @click="cancelDelete">取消</button>
          <button class="confirm-btn" @click="confirmDelete">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({
  name: 'BatchDetailView'
})

import { ref, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast, Icon } from 'vant'
import * as storage from '@/api/pointCloudStorage'
import { usePanoramaViewer } from '@/composables/usePanoramaViewer.js'
import panoramaImage from '@/assets/overViewTest/342cb14e88ccd258660d621bb53825f6.png'
import { StatusBar } from '@capacitor/status-bar'
import { setImmersive } from '@/utils/device/immersive'
import {
  lockToLandscape,
  lockToPortrait,
  enableScreenKeepAwake,
  disableScreenKeepAwake,
} from '@/utils/device/screen'
import { createLogger } from '@/utils/logger'

const router = useRouter()
const route = useRoute()

const currentSessionId = route.params.currentSessionId
const batchNum = route.params.bid
const isDeleteConfirm = ref(false)
const logger = createLogger('BatchDetailView')

const panoramaContainer = ref(null)
const loading = ref(false)
const webglError = ref(false)
let viewer = null

onMounted(async () => {
  await init()
  setTimeout(() => {
    initViewer()
  }, 100)
})

onUnmounted(async () => {
  if (viewer) {
    viewer.dispose()
    viewer = null
  }
  await cleanupResourcesForExit()
})

async function init() {
  //   try {
  //   await StatusBar.setOverlaysWebView({ overlay: true })
  //   await StatusBar.setBackgroundColor({ color: '#0e1420' })
  //   await StatusBar.setStyle({ style: 'LIGHT' })
  //   logger.debug('成功设置')
  // } catch (err) {
  //   logger.warn('StatusBar overlay set failed', err)
  // }
  // try {
  //   await setImmersive(true)
  //   logger.debug('成功设置')

  // } catch (err) {
  //   logger.warn('setImmersive initial calls failed', err)
  // }
}

async function cleanupResourcesForExit(params) {
  try {
    // 延迟执行状态栏恢复，让页面先退出

    // 延迟执行沉浸模式关闭
    // setTimeout(() => {
    //   setImmersive(false)
    // }, 250)
  } catch (err) {
    logger.warn('StatusBar restore overlays failed', err)
  }
}

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

async function initViewer() {
  if (!checkWebGLSupport()) {
    webglError.value = true
    return
  }

  if (!panoramaContainer.value) return

  viewer = usePanoramaViewer(panoramaContainer.value, {
    rotateSpeed: 0.3,
    zoomSpeed: 0.8,
  })

  viewer.init()

  loading.value = true
  try {
    await viewer.loadPanorama(panoramaImage)
  } catch (error) {
    console.error('[BatchDetail] 全景图片加载失败:', error)
  } finally {
    loading.value = false
  }
}
function goBack() {
  router.back()
}

function handleManualSplice() {
  showToast({ message: '手动拼接功能开发中', position: 'bottom' })
}

function handleMosaic() {
  showToast({ message: '马赛克功能开发中', position: 'bottom' })
}

function handleTag() {
  showToast({ message: '标记标签功能开发中', position: 'bottom' })
}

function showDeleteConfirm() {
  isDeleteConfirm.value = true
}

function cancelDelete() {
  isDeleteConfirm.value = false
}

async function confirmDelete() {
  try {
    // 使用临时文件夹名删除批次
    // batchNum 是显示的点位编号（1,2,3...），需要转换为 batchId（0,1,2...）
    const tempFolderName = storage.path.getTempSessionName(currentSessionId)
    const batchId = batchNum - 1
    await storage.batch.delete(tempFolderName, batchId)
    showToast({ message: '删除成功', position: 'bottom' })
    router.back()
  } catch (e) {
    showToast({ message: '删除失败', position: 'bottom' })
  }
}
</script>

<style scoped>
.batch-detail-page {
  --bg-deep: #0a0d12;
  --bg-surface: rgba(16, 22, 32, 0.75);
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.65);
  --border-subtle: rgba(255, 255, 255, 0.06);

  display: flex;
  height: 100vh;
  background: var(--bg-deep);
  margin: 0;
  color: var(--text-primary);
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.image-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  background: radial-gradient(#223344, #001122);
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.preview-image {
  display: none;
}

.image-hint {
  display: none;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 50;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  margin-top: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  z-index: 50;
}

.error-text {
  font-size: 16px;
  color: #ff6666;
}

.sidebar {
  width: 280px;
  background: radial-gradient(#223344, #001122);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  /* border-bottom: 1px solid var(--border-subtle); */
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #fff;
  font-size: 20px;
}

.close-btn:hover {
  color: #ccc;
}

.menu-list {
  padding: 8px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;
}

.menu-item:hover {
  background-color: rgba(24, 32, 44, 0.85);
}

.menu-item:not(:last-child)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20px;
  right: 20px;
  height: 1px;
  background-color: rgba(255, 255, 255, 0.06);
}

.menu-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: #ccc;
  font-size: 20px;
}

.menu-text {
  flex: 1;
  font-size: 15px;
  color: #fff;
}

.menu-arrow {
  color: #666;
  font-size: 16px;
}

.menu-item.delete .menu-icon {
  color: #ff4d4f;
}

.menu-item.delete .menu-text {
  color: #ff4d4f;
}

/* 删除确认界面样式 */
.delete-confirm {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 20px;
}

.confirm-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cancel-btn,
.confirm-btn {
  padding: 14px 0;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: #333;
  color: #fff;
}

.cancel-btn:hover {
  background: #444;
}

.confirm-btn {
  background: #ff4d4f;
  color: white;
}

.confirm-btn:hover {
  background: #ff7875;
}
</style>
