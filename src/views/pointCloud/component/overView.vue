<template>
  <div class="panorama-page">
    <!-- 顶部导航栏 -->
    <div class="nav-bar">
      <button class="back-btn" @click="goBack">
        <img src="@/assets/img/back.png" alt="返回" />
      </button>
      <span class="page-title">全景预览</span>
      <div class="placeholder"></div>
    </div>

    <!-- 全景渲染容器 -->
    <div ref="container" class="panorama-container">
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

    <!-- 底部照片选择器 -->
    <div class="photo-selector">
      <div class="photo-list">
        <div
          v-for="(photo, index) in photoList"
          :key="index"
          :class="['photo-item', { active: currentIndex === index }]"
          @click="switchPhoto(index)"
        >
          <img :src="photo.thumbnail" :alt="photo.name" />
          <span class="photo-name">{{ photo.name }}</span>
        </div>
      </div>
    </div>

    <!-- 锚点信息提示 -->
    <div v-if="selectedHotspot" class="hotspot-tooltip">
      <div class="tooltip-content">
        <span class="tooltip-label">{{ selectedHotspot.label }}</span>
        <button class="tooltip-close" @click="selectedHotspot = null">×</button>
      </div>
    </div>

    <!-- 操作提示 -->
    <!-- <div v-if="showGestureHint" class="gesture-hint" @click="showGestureHint = false">
      <div class="hint-content">
        <div class="hint-item">
          <span class="hint-icon">👆</span>
          <span class="hint-text">拖动旋转视角</span>
        </div>
        <div class="hint-item">
          <span class="hint-icon">🤏</span>
          <span class="hint-text">捏合缩放</span>
        </div>
        <div class="hint-item">
          <span class="hint-icon">👆</span>
          <span class="hint-text">点击锚点切换视角</span>
        </div>
      </div>
    </div> -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { usePanoramaViewer } from '@/composables/usePanoramaViewer.js'
import { StatusBar } from '@capacitor/status-bar'

// 导入全景图片
import img1 from '@/assets/overViewTest/342cb14e88ccd258660d621bb53825f6.png'
import img2 from '@/assets/overViewTest/5e6cbabc9e9d877cee83752266662081.jpg'
import img3 from '@/assets/overViewTest/a0afff337aa4f593409b0a60b97ca98c.jpg'
import img4 from '@/assets/overViewTest/b6ebccaf1737f0242aad39ac7ca9f8ec.jpg'
import img5 from '@/assets/overViewTest/f6052a720b26973a774a57d522cf80e4.jpg'
import img6 from '@/assets/overViewTest/f6e9b61c1202dbe1df854c0fb9148617.png'

// 图片列表配置
// 目前锚点硬编码，锚点（单位角度，HOOKS函数内部写的角度转弧度的转换方法）由后端提供
// 后续点击锚点切换视角时，有两种切换锚点视角的方案，目前代码是方案①，
//  ①切换到一张全景照片内的不同视角 ，只改变相机的朝向，画面内容不变（因为球体内侧贴图的固定的）
//  ②切换到另一张全景照片的视角，有一种到达下一个观测点的感觉，实现思路是直接将球体内侧贴图替换为另一张全景照片。（整体效果像贝壳租房客厅进入卧室感觉）
const photoList = [
  {
    name: '全景1',
    src: img1,
    thumbnail: img1,
    hotspots: [
      { id: '1', position: { theta: 0, phi: 90 }, label: '入口', color: 0xff4444 },
      { id: '2', position: { theta: 90, phi: 90 }, label: '左侧', color: 0x44ff44 },
      { id: '3', position: { theta: 180, phi: 90 }, label: '后方', color: 0x4444ff },
    ],
  },
  {
    name: '全景2',
    src: img2,
    thumbnail: img2,
    hotspots: [
      { id: '1', position: { theta: 45, phi: 90 }, label: '视角A', color: 0xffaa00 },
      { id: '2', position: { theta: 225, phi: 90 }, label: '视角B', color: 0x00aaff },
    ],
  },
  {
    name: '全景3',
    src: img3,
    thumbnail: img3,
    hotspots: [
      { id: '1', position: { theta: 0, phi: 60 }, label: '高处', color: 0xff00ff },
      { id: '2', position: { theta: 120, phi: 120 }, label: '低处', color: 0x00ffaa },
    ],
  },
  {
    name: '全景4',
    src: img4,
    thumbnail: img4,
    hotspots: [
      { id: '1', position: { theta: 30, phi: 90 }, label: '东', color: 0xff6600 },
      { id: '2', position: { theta: 150, phi: 90 }, label: '西', color: 0x6600ff },
      { id: '3', position: { theta: 270, phi: 90 }, label: '北', color: 0x00ff66 },
    ],
  },
  {
    name: '全景5',
    src: img5,
    thumbnail: img5,
    hotspots: [
      { id: '1', position: { theta: 0, phi: 90 }, label: '中心', color: 0xffff00 },
    ],
  },
  {
    name: '全景6',
    src: img6,
    thumbnail: img6,
    hotspots: [
      { id: '1', position: { theta: 60, phi: 80 }, label: '点1', color: 0xff3366 },
      { id: '2', position: { theta: 180, phi: 100 }, label: '点2', color: 0x33ff66 },
      { id: '3', position: { theta: 300, phi: 90 }, label: '点3', color: 0x3366ff },
    ],
  },
]

const router = useRouter()
const container = ref(null)
const loading = ref(false)
const webglError = ref(false)
const currentIndex = ref(0)
const selectedHotspot = ref(null)
const showGestureHint = ref(true)

let viewer = null

// 检查 WebGL 支持
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

// 初始化全景查看器
async function initViewer() {
  if (!checkWebGLSupport()) {
    webglError.value = true
    return
  }

  if (!container.value) return

  // 创建查看器实例
  viewer = usePanoramaViewer(container.value, {
    rotateSpeed: 0.3,
    zoomSpeed: 0.8,
  })

  // 初始化
  viewer.init()

  // 设置锚点点击回调
  viewer.onHotspotClick((hotspot) => {
    selectedHotspot.value = hotspot // 这行设置选中的锚点，触发锚点上面 div标签显示
    // 切换到锚点对应的视角
    const targetTheta = (hotspot.position?.theta || 0) + 180
    const targetPhi = 90
    viewer.switchView(
      { theta: targetTheta, phi: targetPhi },
      800
    )
  })

  // 加载第一张图片
  await loadPhoto(0)

  // 3秒后隐藏手势提示
  setTimeout(() => {
    showGestureHint.value = false
  }, 3000)
}

// 加载指定照片
async function loadPhoto(index) {
  if (!viewer || index < 0 || index >= photoList.length) return

  loading.value = true
  currentIndex.value = index
  const photo = photoList[index]

  console.log('[Panorama] 开始加载图片:', photo.src)

  try {
    // 清除旧锚点
    viewer.clearHotspots()

    // 加载全景图片
    await viewer.loadPanorama(photo.src)
    console.log('[Panorama] 图片加载成功')

    // 添加锚点
    if (photo.hotspots && photo.hotspots.length > 0) {
      photo.hotspots.forEach((hotspot) => {
        viewer.addHotspot(hotspot)
      })
    }

    // 重置视角
    viewer.resetView()
  } catch (error) {
    console.error('[Panorama] 加载全景图片失败:', error)
  } finally {
    loading.value = false
  }
}

// 切换照片
function switchPhoto(index) {
  if (index === currentIndex.value) return
  loadPhoto(index)
}

// 返回上一页
function goBack() {
  router.back()
}

// 页面可见性变化处理
function handleVisibilityChange() {
  if (document.hidden) {
    // 页面隐藏时暂停渲染
  } else {
    // 页面显示时恢复渲染
  }
}

onMounted(async () => {
  // 设置状态栏
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setBackgroundColor({ color: '#0a0d12' })
    await StatusBar.setStyle({ style: 'LIGHT' })
  } catch (err) {
    console.warn('StatusBar 设置失败:', err)
  }

  // 延迟初始化，确保容器已渲染
  setTimeout(() => {
    initViewer()
  }, 100)

  // 监听页面可见性
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(async () => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  // 释放查看器资源
  if (viewer) {
    viewer.dispose()
    viewer = null
  }

  // 恢复状态栏
  try {
    await StatusBar.setBackgroundColor({ color: '#0a0a1a' })
    await StatusBar.setStyle({ style: 'LIGHT' })
  } catch (err) {
    console.warn('StatusBar 恢复失败:', err)
  }
})

onUnmounted(() => {
  // 确保资源已释放
  if (viewer) {
    viewer.dispose()
    viewer = null
  }
})
</script>

<style scoped>
.panorama-page {
  --bg-deep: #0a0d12;
  --bg-surface: rgba(16, 22, 32, 0.9);
  --brand-primary: #2a7aff;
  --brand-gradient: linear-gradient(145deg, #2a7aff, #4d9eff);
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.65);
  --border-subtle: rgba(255, 255, 255, 0.06);

  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: var(--bg-deep);
  color: var(--text-primary);
  position: relative;
  overflow: hidden;
}

/* 顶部导航栏 */
.nav-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  z-index: 100;
  pointer-events: none;
}

.back-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--border-subtle);
  pointer-events: auto;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(24, 32, 44, 0.95);
}

.back-btn:active {
  transform: scale(0.95);
}

.back-btn img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: brightness(0.95);
}

.page-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.placeholder {
  width: 40px;
}

/* 全景容器 */
.panorama-container {
  flex: 1;
  width: 100%;
  position: relative;
  background: radial-gradient(#1a1f2a, #0a0d12);
  overflow: hidden;
}

/* 加载遮罩 */
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

/* 错误遮罩 */
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

/* 底部照片选择器 */
.photo-selector {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  z-index: 100;
}

.photo-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 8px 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.photo-list::-webkit-scrollbar {
  display: none;
}

.photo-item {
  flex-shrink: 0;
  width: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0.7;
}

.photo-item:hover {
  opacity: 0.9;
}

.photo-item.active {
  opacity: 1;
}

.photo-item img {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.photo-item.active img {
  border-color: var(--brand-primary);
  box-shadow: 0 0 12px rgba(42, 122, 255, 0.4);
}

.photo-name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.photo-item.active .photo-name {
  color: var(--brand-primary);
}

/* 锚点提示 */
.hotspot-tooltip {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.tooltip-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.tooltip-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.tooltip-close {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tooltip-close:hover {
  background: rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
}

/* 手势提示 */
.gesture-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 200;
  cursor: pointer;
}

.hint-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 32px;
  background: var(--bg-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.hint-icon {
  font-size: 28px;
  width: 40px;
  text-align: center;
}

.hint-text {
  font-size: 16px;
  color: var(--text-primary);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .nav-bar {
    height: 48px;
    padding: 0 12px;
  }

  .back-btn {
    width: 36px;
    height: 36px;
  }

  .back-btn img {
    width: 18px;
    height: 18px;
  }

  .page-title {
    font-size: 16px;
  }

  .photo-selector {
    padding: 12px;
  }

  .photo-item {
    width: 70px;
  }

  .photo-item img {
    width: 56px;
    height: 56px;
  }

  .photo-name {
    font-size: 11px;
    max-width: 70px;
  }

  .hint-content {
    padding: 24px;
    margin: 0 20px;
  }

  .hint-icon {
    font-size: 24px;
  }

  .hint-text {
    font-size: 14px;
  }
}

/* 横屏优化 */
@media (orientation: landscape) and (max-height: 500px) {
  .photo-selector {
    padding: 8px 16px;
  }

  .photo-item {
    width: 60px;
  }

  .photo-item img {
    width: 48px;
    height: 48px;
  }

  .photo-name {
    font-size: 10px;
  }
}
</style>
