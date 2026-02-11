<template>
  <div class="point-cloud-page">
    <div class="fullscreen-bg" aria-hidden="true"></div>
    <div ref="container" class="three-container">
      <!-- 摄像头预览容器（供 CameraPreview.attach 使用） -->
      <div id="cameraPreview" class="camera-preview-overlay"></div>
      <!-- 将按钮和统计信息放在 three-container 内部 -->
      <div class="overlay-controls">
        <button class="back-btn" @click="goBack" aria-label="Back">
          <img src="@/assets/img/back.png" alt="返回" />
        </button>
        <!-- <div class="point-cloud-controls"> -->
        <!-- <button class="control-btn" @click="startDataStream">开始采集</button> -->
        <!-- 暂停采集按钮已注释掉 -->
        <!-- <button class="control-btn" @click="stopDataStream">暂停采集</button> -->
        <!-- <button class="control-btn" @click="clearPointCloudData">清空点云</button> -->
        <!-- </div> -->
        <!-- 右侧大圆形捕获按钮（与示例视觉位置一致） -->
        <button
          @click="saveMessages"
          class="save-btn"
          :disabled="displayedMessages.length === 0 || saving"
        >
          {{ saving ? '保存中...' : '保存' }}
        </button>
        <button class="capture-btn" @click="startDataStream" aria-label="Capture"></button>
        <div class="data-stats">
          <div class="stat-item">
            <span>点云数量</span>
            <span id="point-count">{{ pointCount }}</span>
          </div>
          <!-- <div class="stat-item">
            <span>点云速率</span>
            <span id="data-rate">
              {{ !hasStarted ? '0 点/秒' : isCollecting ? ` ${pointsPerSecond} 点/秒` : '已暂停' }}
            </span>
          </div> -->
          <!-- <div class="stat-item">
            <span>帧率</span>
            <span id="storage-status">{{ frameRate }}</span>
          </div> -->
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watchEffect, onBeforeMount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useBluetoothStore } from '@/stores/bluetooth'
import { usePointCloudRenderer } from '@/composables/usePointCloudRenderer'
import { showToast } from '@/utils/toast'
import { StatusBar } from '@capacitor/status-bar'
import { setImmersive } from '@/utils/immersive'
import { storeToRefs } from 'pinia'
import { bluetoothService } from '@/services/bluetoothService'
import cameraHelper from '@/utils/cameraHelper'
import { App } from '@capacitor/app'
import { lockToLandscape, lockToPortrait } from '@/utils/screen'
const bluetoothStore = useBluetoothStore()
const router = useRouter()
const goBack = () => {
  router.back()
}
const { displayedMessages } = storeToRefs(bluetoothStore)
const container = ref(null)
let renderer = null
let isRendererReady = ref(false)
let lastReportPointCount = ref(0)
let lastReportTime = ref(0)
let pointCount = ref(0)
let pointsPerSecond = ref(0)
let frameRate = ref(0)
const isCollecting = ref(false) // true = 正在采集（向渲染器加点）
const hasStarted = ref(false)
const saving = ref(false) // 保存中状态
const fullMessages = bluetoothStore.getRawMessages()
let pauseListener = null
let resumeListener = null
async function init() {
  if (isRendererReady.value) return
  await lockToLandscape()
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setBackgroundColor({ color: '#0e1420' })
    await StatusBar.setStyle({ style: 'LIGHT' })
  } catch (err) {
    console.warn('StatusBar overlay set failed', err)
  }

  // 进入时开启沉浸式（隐藏状态栏/导航栏图标），并多次重试以覆盖 OEM 的恢复逻辑
  try {
    setImmersive(true)
    setTimeout(() => setImmersive(true), 120)
    setTimeout(async () => {
      await setImmersive(true)
      try {
        await StatusBar.setBackgroundColor({ color: '#0e1420' })
      } catch (e) {
        console.log('沉浸式err: ', e)
      }
    }, 900)
  } catch (err) {
    console.warn('setImmersive initial calls failed', err)
  }
  // 使 WebView 覆盖状态栏并设置统一的背景色与亮色图标，增加沉浸式的重试以提高兼容性
  // 延迟初始化，确保容器高度已计算
  setTimeout(() => {
    if (container.value) {
      renderer = usePointCloudRenderer(container.value)
      renderer.init()
      // 初始帧率设为 30（与 renderer 默认一致）
      frameRate.value = 30
      isRendererReady.value = true
      // 监听窗口 resize
      window.addEventListener('resize', renderer.onResize)
    }
  }, 100)
}

// 清理资源
async function cleanupResources() {
  console.log('[PointCloudPage] 正在清理资源...')
  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setBackgroundColor({ color: '#0a0a1a' })
    await StatusBar.setStyle({ style: 'DARK' })
  } catch (err) {
    console.warn('StatusBar restore overlays failed', err)
  }
  setImmersive(false)

  // 1. 停止数据采集
  isCollecting.value = false

  // 2. 移除 resize 监听器
  if (renderer?.onResize) {
    window.removeEventListener('resize', renderer.onResize)
  }

  // 3. 调用渲染器的 dispose 方法
  if (renderer?.dispose && typeof renderer.dispose === 'function') {
    renderer.dispose()
  }

  // 4. 显式置空引用，帮助 GC
  renderer = null
  isRendererReady.value = false
  // 5.

  // 6. 停止相机预览（幂等，多次调用安全）
  await cameraHelper.stopPreview()

  // 7. 清理 parser 中的拍照会话标志，防止残留导致后续忽略点云或尝试拍照失败
  try {
    if (bluetoothStore && bluetoothStore.parser && bluetoothStore.parser.protocolState) {
      bluetoothStore.parser.protocolState.photoSession.active = false
      bluetoothStore.parser.protocolState.photoSession.previewStarted = false
      bluetoothStore.parser.cameraReadyPromise = null
    }
  } catch (e) {
    console.warn('[PointCloudPage] 清理 parser.photoSession 失败', e)
  }

  // 7. 发送蓝牙结束指令
  bluetoothStore.handleSendEnd()

  // 8. 强制锁定为竖屏，确保返回主页面后保持竖屏状态
  try {
    await lockToPortrait()
  } catch (e) {
    console.warn('[PointCloudPage] lockToPortrait failed', e)
  }
}
// 路由切换时清理资源
onBeforeRouteLeave((to, from, next) => {
  cleanupResources()
  next() // 允许跳转
})
// 初始化渲染器
onMounted(async () => {
  await init()
  // 监听进入后台
  pauseListener = await App.addListener('pause', () => {
    cleanupResources()
  })
  // 监听从后台回到前台
  resumeListener = await App.addListener('resume', async () => {
    console.log('[App] 从后台恢复到前台')
    await init()
    // 在这里执行你需要的操作，例如：
    // - 重新启动相机预览
    // - 恢复数据采集
    // - 刷新状态等
    // handleAppResume()
  })
})
onUnmounted(() => {
  if (pauseListener) {
    pauseListener.remove()
    pauseListener = null
  }
  if (resumeListener) {
    resumeListener.remove()
    resumeListener = null
  }
})
// onUnmounted(async () => {
//   // 退出时恢复 StatusBar 覆盖策略并关闭沉浸式，恢复图标样式为 DARK

// })
// 开始数据流
function startDataStream() {
  isCollecting.value = true
  hasStarted.value = true
  bluetoothStore.handleSendStart()
  console.log('startDataStream click', '发送了开始指令，现在开始采集')
  // 切换帧率可以提高采集和渲染流畅度
  // if (renderer?.setTargetFps) {
  //   renderer.setTargetFps(30)
  //   frameRate.value = 30
  // }
}
// 停止数据流
// function stopDataStream() {
//   isCollecting.value = false
// }

// function clearPointCloudData() {
//   if (renderer?.resetPointCloud) {
//     renderer.resetPointCloud()//  只重置点云
//   }
//   isCollecting.value = false
//   // 重置 UI 计数
//   pointCount.value = 0
//   pointsPerSecond.value = 0
//   lastReportTime.value = 0
//   lastReportPointCount.value = 0
//   hasStarted.value =false
// }
const saveMessages = async () => {
  if (fullMessages.length === 0) return

  saving.value = true
  try {
    //  只传原始数组
    const result = await bluetoothService.saveBleDataToFile(fullMessages)
    // alert(JSON.stringify(result))
    showToast(`已保存 ${result.lineCount} 行数据`)
    // bluetoothStore.clearRawMessagesForSave()
  } catch (error) {
    console.error('保存失败:', error)
    showToast('保存失败：' + (error.message || '未知错误'))
  } finally {
    // bluetoothStore.clearMessages()
    saving.value = false
  }
}

// 监听 store 中的 connectedPoints 变化
watchEffect(() => {
  // Vue 会自动追踪这个函数中访问的所有响应式数据
  // 包括：ref、reactive、computed 等
  if (!isRendererReady.value || !isCollecting.value) return
  // 显式声明依赖：读取connectedPoints 是否变化，建立依赖
  bluetoothStore.connectedPoints // 建立依赖
  // const currentPoints = bluetoothStore.connectedPoints
  try {
    // watchEffect自动监听内部的响应式数据，即connectedPoints，每次新增点时触发回调将connectedPoints赋值给 points（新增加的点），并且清空connectedPoints（不会再次触发当前正在执行的watcheffect,vue自动避免了这种情况）（vue2中这样做会死循环）
    //  获取新点并立即清空 store
    const newPoints = bluetoothStore.consumeConnectedPoints()

    if (newPoints.length === 0) return

    renderer.addPoints(newPoints)
    pointCount.value += newPoints.length

    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`[PointCloud] Rendered ${newPoints.length} points, total: ${pointCount.value}`)
    // }

    // ===== 计算 PPS（每秒点数）=====
    const now = performance.now()

    // 首次初始化
    if (lastReportTime.value === 0) {
      lastReportTime.value = now
      lastReportPointCount.value = pointCount.value
      return
    }

    const timeDiff = now - lastReportTime.value // 毫秒
    if (timeDiff >= 1000) {
      // 满 1 秒
      const pointDiff = pointCount.value - lastReportPointCount.value
      const pps = Math.round(pointDiff / (timeDiff / 1000)) // 点/秒

      pointsPerSecond.value = pps

      // 更新"上次"状态
      lastReportTime.value = now
      lastReportPointCount.value = pointCount.value

      // if (process.env.NODE_ENV === 'development') {
      //   console.log(`[PointCloud] PPS: ${pps}, Total points: ${pointCount.value}`)
      // }
    }
  } catch (err) {
    console.error('[PointCloud] watchEffect failed:', err)
    isCollecting.value = false
    showToast('点云渲染异常，已自动停止采集')
  }
})
</script>

<style scoped>
.point-cloud-page {
  --bg-very-dark: #0e1420; /* 主背景（略亮于之前） */
  --panel-bg: rgba(255, 255, 255, 0.03);
  --accent: #1890ff;
  --accent-2: #40a9ff;
  --muted: rgba(255, 255, 255, 0.45);

  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  width: 100vw;
  height: 100vh;
  margin: 0;
  background: var(--bg-very-dark); /* 更统一的深色，略亮 */
  color: #e6eef7;
}
.overlay-controls {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Allow clicks to pass through initially */
  display: flex;
  flex-direction: column;
  justify-content: space-between; /* Push controls to top and stats to bottom */
  /* 包含安全区内边距，避免刘海/凹槽遮挡（支持 iOS/部分 Android） */
  padding: calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px))
    calc(16px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px));
  box-sizing: border-box;
  z-index: 10; /* Ensure controls are above the canvas */
}
.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.three-container {
  flex: 1;
  width: 100%;
  background: transparent;
  /* border-radius: 8px; */
  overflow: hidden;
  position: relative;
}

.camera-preview-overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 5; /* 低于 overlay-controls (10) 以显示控制按钮在上层 */
  pointer-events: none; /* 预览不捕获鼠标/触摸，除非需要 */
  background: transparent;
}

.point-cloud-controls {
  display: flex;
  gap: 12px;
  flex-wrap: nowrap;
  align-self: flex-start; /* Align buttons to the top */
  pointer-events: auto; /* Enable clicks for buttons */
  margin-top: 24px; /* Add top margin for spacing */
  margin-left: 32px; /* Move start button slightly inward */
}

/* 返回按钮（左上角） */
.back-btn {
  position: absolute;
  left: calc(12px + env(safe-area-inset-left, 0px));
  top: calc(12px + env(safe-area-inset-top, 0px));
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.04);
  box-shadow: 0 8px 20px rgba(2, 6, 23, 0.6);
  pointer-events: auto;
  z-index: 12;
}
.back-btn img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
}
.back-btn:active {
  transform: translateY(1px);
  opacity: 0.95;
}

.control-btn {
  padding: 14px 28px;
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
  color: white;
  border-radius: 14px;
  box-shadow: 0 6px 18px rgba(24, 144, 255, 0.18);
  font-size: 18px;
  font-weight: 600;
}

.control-btn:active {
  transform: translateY(1px);
}

/** 捕获按钮（右侧大圆） **/
.capture-btn {
  position: absolute;
  right: calc(36px + env(safe-area-inset-right, 0px));
  top: 50%;
  transform: translateY(-50%);
  width: 72px;
  height: 72px;
  border-radius: 50%;
  /* 移除边框 */
  border: none;
  /* 添加蓝色背景 */
  background-color: #1890ff; /* 使用与原边框颜色相同的蓝色调 */
  /* 保留原始的其他样式属性 */
  pointer-events: auto;
  z-index: 11; /* 高于 overlay-controls */
  transition:
    transform 120ms ease,
    box-shadow 160ms ease;
}
/* .capture-btn:active {
  transform: translateY(-50%) scale(0.98);
  box-shadow: 0 8px 20px rgba(24, 144, 255, 0.12);
}
.capture-btn::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 35% 30%,
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.02)
  );
}

.capture-btn.pulse {
  animation: pulse 2.2s infinite;
}
@keyframes pulse {
  0% {
    box-shadow: 0 12px 30px rgba(24, 144, 255, 0.14);
  }
  50% {
    box-shadow: 0 18px 40px rgba(24, 144, 255, 0.18);
  }
  100% {
    box-shadow: 0 12px 30px rgba(24, 144, 255, 0.14);
  }
} */

.control-btn {
  flex: 1;
  min-width: 120px;
  background: var(--primary);
  border: none;
  color: white;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.control-btn:hover {
  background: #40a9ff;
}

.data-stats {
  position: absolute; /* 固定在右下角，避免遮挡网格 */
  right: calc(20px + env(safe-area-inset-right, 0px));
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.03); /* 轻微磨砂玻璃效果 */
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 12px;
  padding: 12px 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
  pointer-events: auto; /* Enable clicks for stats if needed */
  width: 140px; /* 适配更小的宽度 */
  height: 92px; /* 稍高以适应两行文本 */
  box-shadow: 0 8px 24px rgba(2, 6, 23, 0.6);
}

.stat-item {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  flex: 1;
  padding: 0 16px;
  text-align: center;
  min-height: 46px;
}

.stat-item span:first-child {
  font-size: 10px;
  color: var(--muted);
}

.stat-item span:last-child {
  color: var(--text);
  font-size: 14px;
  font-weight: 400;
}

.stat-item:not(:first-child) {
  border-left: 1px solid #404040;
}
.save-btn {
  position: absolute;
  right: 6%;
  top: 20%;
  background-color: #1890ff;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  font-size: 8px;
  border: none;
  z-index: 11;
  pointer-events: auto;
}
.save-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
