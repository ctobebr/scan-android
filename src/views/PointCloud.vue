<template>
  <div class="point-cloud-page">
    <div ref="container" class="three-container">
      <!-- 摄像头预览容器（供 CameraPreview.attach 使用） -->
      <div id="cameraPreview" class="camera-preview-overlay"></div>
      <!-- 将按钮和统计信息放在 three-container 内部 -->
      <div class="overlay-controls">
        <button class="back-btn" @click="goBack" aria-label="Back">
          <img src="@/assets/img/back.png" alt="返回" />
        </button>
        <button @click="openSaveDialog" class="save-btn" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
        <button class="capture-btn" @click="startDataStream"></button>
        <div class="data-stats top-center-stat">
          <!-- <div class="stat-item">
            <span>点云数量</span>
            <span id="point-count">{{ pointCount }}</span>
          </div> -->
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
        <div class="bottom-left-stat">
          <span>采集点位数：{{ dataBatchCounter }} / 50</span>
        </div>
        <!-- 设备断开提示层 -->
        <div v-if="deviceDisconnected" class="disconnect-overlay">
          <div class="disconnect-message">
            <span>设备已断开连接</span>
            <button class="disconnect-back-btn" @click="goBack">返回</button>
          </div>
        </div>
        <!-- 保存对话框 -->
        <div v-if="showSaveDialog" class="save-dialog-overlay">
          <div class="save-dialog-content">
            <div class="save-dialog-card">
              <h3>保存</h3>
              <label>项目名称</label>
              <input
                ref="saveInput"
                v-model="projectName"
                placeholder="输入项目名称"
                maxlength="10"
              />
              <div class="save-actions">
                <button @click="confirmSave" :disabled="saving">完成</button>
                <button @click="closeSaveDialog" :disabled="saving">取消</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useBluetoothStore } from '@/stores/bluetooth'
import { usePointCloudRenderer } from '@/composables/usePointCloudRenderer'
import { showToast } from '@/utils/toast'
import { StatusBar } from '@capacitor/status-bar'
import { setImmersive } from '@/utils/immersive'
import { bluetoothService } from '@/services/bluetoothService'
import cameraHelper from '@/utils/cameraHelper'
import { parseBleData } from '@/utils/parseBleData'
import { NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/protocolCommands'
import { App } from '@capacitor/app'
import {
  lockToLandscape,
  lockToPortrait,
  unlockOrientation,
  enableScreenKeepAwake,
  disableScreenKeepAwake,
} from '@/utils/screen'
import { generateOptimizedSessionId } from '@/utils/sessionIdUtils'
const bluetoothStore = useBluetoothStore()
const router = useRouter()
const goBack = () => {
  router.back()
}
const container = ref(null)
let renderer = null
let isRendererReady = ref(false)
let pointCount = ref(0)
// let lastReportPointCount = ref(0)
// let lastReportTime = ref(0)
// let pointsPerSecond = ref(0)
let frameRate = ref(0)
const isCollecting = ref(false) // true = 正在采集（向渲染器加点）
// const hasStarted = ref(false)
const saving = ref(false) // 保存中状态
let enableSave = false
const showSaveDialog = ref(false)
const projectName = ref('')
const saveInput = ref(null)
const lastSavedFolder = ref(null)
const savedDuringDialog = ref(false)

const openSaveDialog = async () => {
  // if (!currentSessionId) {
  //   showToast('会话ID未生成，无法保存')
  //   return
  // }
  // if (sessionData.rawLines.length === 0 && sessionData.photos.length === 0) {
  //   showToast('暂无数据可保存')
  //   return
  // }
  // if (!enableSave) {
  //   showToast('至少需要完成一个点位的数据采集')
  //   return
  // }
  // await unlockOrientation()
  showSaveDialog.value = true
  nextTick(() => {
    try {
      if (saveInput && saveInput.value && saveInput.value.focus) {
        saveInput.value.focus()
      }
    } catch (e) {
      console.warn('focus failed', e)
    }
  })
}
const closeSaveDialog = async () => {
  // await lockToLandscape()
  showSaveDialog.value = false
}

const confirmSave = async () => {
  const name = (projectName.value || '').trim()
  // 验证长度与字符（允许中文、字母、数字、空格、下划线、短横）
  if (name && name.length > 10) {
    showToast('项目名称不能超过10个字符')
    return
  }
  const validRe = /^[\u4e00-\u9fa5A-Za-z0-9 _-]*$/
  if (name && !validRe.test(name)) {
    showToast('项目名称包含非法字符，仅允许中文、字母、数字、空格、下划线和短横线')
    return
  }

  const folderName = name ? `${name}_${currentSessionId}` : currentSessionId
  lastSavedFolder.value = folderName
  savedDuringDialog.value = false
  await performSave(folderName)
}
// --- 设备断开相关状态 ---
const deviceDisconnected = ref(false)
let disconnectUnregister = null
// --- 结束：设备断开相关状态 ---

// --- 会话相关数据 ---
let currentSessionId = null // 当前会话的唯一ID
let sessionData = {
  rawLines: [], // 用于保存点云文件的原始行
  photos: [], // 存储拍照文件信息
}
let dataBatchCounter = ref(0) // 用于区分不同批次的数据

let parser = null
const accumulationBuffer = []
let accumulationTimer = null
const ACCUMULATION_INTERVAL = 33
const MIN_BATCH_SIZE = 3
let pauseListener = null
let resumeListener = null

// --- 记录进入后台前的采集状态 ---
let wasCollectingBeforePause = false
onMounted(async () => {
  await init()

  // --- 注册断开监听 ---
  registerDisconnectListener()

  // --- 页面加载时检查连接状态 ---
  if (bluetoothStore.connectingStatus !== 2) {
    console.log('[PointCloudPage] 页面加载时检测到设备未连接')
    deviceDisconnected.value = true
  } else {
    // 主动校验一次连接状态
    bluetoothService.checkConnectionStatus(bluetoothStore.connectingDeviceId).catch(() => {
      console.log('[PointCloudPage] 页面加载时检测到连接已断开')
      deviceDisconnected.value = true
    })
  }
  // --- 结束：页面加载时检查连接状态 ---

  pauseListener = await App.addListener('pause', () => {
    cleanupResourcesForPause() // 暂停清理函数
  })
  resumeListener = await App.addListener('resume', async () => {
    await handleAppResume() // 恢复函数
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

  // --- 移除断开监听 ---
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }
  // --- 结束：移除断开监听 ---

  // 组件卸载时也执行彻底清理
  cleanupResourcesForExit()
})

async function init() {
  if (isRendererReady.value) return
  await lockToLandscape()
  await enableScreenKeepAwake()
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setBackgroundColor({ color: '#0e1420' })
    await StatusBar.setStyle({ style: 'LIGHT' })
  } catch (err) {
    console.warn('StatusBar overlay set failed', err)
  }
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

  setTimeout(() => {
    if (container.value) {
      renderer = usePointCloudRenderer(container.value)
      renderer.init()
      frameRate.value = 30
      isRendererReady.value = true
      window.addEventListener('resize', renderer.onResize)

      if (!currentSessionId) {
        currentSessionId = generateOptimizedSessionId()
        // currentSessionId = dateToSessionId()
        // const res =  parseSessionIdToFormattedTime(currentSessionId)
        //  console.log('[PointCloudPage] Generated Session ID:', currentSessionId)
        //  console.log('[PointCloudPage] Generated parseSessionIdToFormattedTime:', res)
        sessionData = { rawLines: [], photos: [] }
        dataBatchCounter.value = 0
        enableSave = false
      }
    }
  }, 100)
}

// 生成优化后的会话ID 已从公共工具导出：`generateOptimizedSessionId`

// --- 注册设备断开监听 ---
function registerDisconnectListener() {
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }

  disconnectUnregister = bluetoothService.onDeviceDisconnected((deviceId, isManualDisconnect) => {
    // 只处理当前连接的设备
    if (deviceId !== bluetoothStore.connectingDeviceId) {
      return
    }

    console.log('[PointCloudPage] 设备断开连接，手动断开:', isManualDisconnect)

    // 如果是手动断开（主动调用handleDisconnect），直接返回上一页
    if (isManualDisconnect) {
      goBack()
      return
    }

    // 意外断开：显示UI提示，停止采集
    deviceDisconnected.value = true
    isCollecting.value = false
    // hasStarted.value = false

    // 停止订阅和定时器
    stopSessionParser()

    // 显示提示
    showToast('设备已断开连接', 3000)
  })
}
// --- 结束：注册设备断开监听 ---

// --- 监听蓝牙Store的连接状态变化 ---
watch(
  () => bluetoothStore.connectingStatus,
  (newStatus, oldStatus) => {
    if (oldStatus === 2 && newStatus !== 2) {
      // 连接从已连接变为非已连接状态
      if (!deviceDisconnected.value) {
        console.log('[PointCloudPage] 检测到全局连接状态变为未连接')
        deviceDisconnected.value = true
        isCollecting.value = false
        // hasStarted.value = false
        stopSessionParser()
      }
    }
  },
)
// --- 结束：监听蓝牙Store的连接状态变化 ---

// ---清理资源函数 (进入后台时调用) ---
async function cleanupResourcesForPause() {
  // 1. 记录当前采集状态，用于恢复
  wasCollectingBeforePause = isCollecting.value

  // 2. 如果正在采集，则停止会话解析器（取消订阅、停止相机、清除定时器）
  if (isCollecting.value) {
    await stopSessionParser()
  } else {
    console.log('[PointCloudPage] 未在采集状态，无需停止会话解析器')
  }

  // 3. 发送蓝牙结束指令（可根据业务逻辑调整）
  // bluetoothStore.handleSendEnd()

  // 4. 停止屏幕常亮
  await disableScreenKeepAwake()
}

// 路由切换时彻底清理资源
async function cleanupResourcesForExit() {
  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setBackgroundColor({ color: '#0a0a1a' })
    await StatusBar.setStyle({ style: 'DARK' })
  } catch (err) {
    console.warn('StatusBar restore overlays failed', err)
  }
  setImmersive(false)

  if (renderer?.onResize) {
    window.removeEventListener('resize', renderer.onResize)
  }
  if (renderer?.dispose && typeof renderer.dispose === 'function') {
    renderer.dispose()
  }
  renderer = null
  isRendererReady.value = false

  await disableScreenKeepAwake()
  await cameraHelper.stopPreview()
  try {
    await stopSessionParser() // 这里会取消订阅
  } catch (e) {
    console.warn('[PointCloudPage] 清理会话失败', e)
  }

  // --- 移除断开监听 ---
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }
  // --- 结束：移除断开监听 ---

  bluetoothStore.handleSendEnd()
  isCollecting.value = false
  // hasStarted.value = false
  pointCount.value = 0
  dataBatchCounter.value = 0
  deviceDisconnected.value = false
  await lockToPortrait()
}

// --- 回到前台时调用 ---
async function handleAppResume() {
  // 1. 重新启用屏幕常亮
  await enableScreenKeepAwake()

  // --- 恢复前检查设备是否仍然连接 ---
  if (deviceDisconnected.value) {
    console.log('[PointCloudPage] 设备已断开，不恢复采集')
    return
  }

  if (bluetoothStore.connectingStatus !== 2) {
    console.log('[PointCloudPage] 设备未连接，不恢复采集')
    deviceDisconnected.value = true
    return
  }
  // --- 结束：恢复前检查设备是否仍然连接 ---

  // 2. 如果之前正在采集，则尝试恢复订阅
  if (wasCollectingBeforePause) {
    // 确保渲染器和会话ID都存在
    if (isRendererReady.value && currentSessionId) {
      // 重新启动会话解析器（重新订阅、启动相机）
      startSessionParser()
    } else {
      console.warn('[App] 恢复失败：渲染器未就绪、会话ID未生成或未启动过采集')
    }
  } else {
    console.log('[App] 上次未在采集状态，无需恢复')
  }
}

onBeforeRouteLeave((to, from, next) => {
  cleanupResourcesForExit()
  next()
})

// 启动解析器并订阅蓝牙通知
function startSessionParser() {
  let reNameFlag = 0
  // --- 检查设备是否已断开 ---
  if (deviceDisconnected.value) {
    console.warn('[startSessionParser] 设备已断开，无法订阅')
    return
  }
  // --- 结束：检查设备是否已断开 ---

  if (parser) return
  console.log('[startSessionParser] Starting parser and subscription...')
  parser = new parseBleData({
    getDataBatchCounter: () => `dataBatch_${dataBatchCounter.value.toString().padStart(3, '0')}`,
    onStartPreview: async () => {
      // 拍照前再次检查连接状态
      if (deviceDisconnected.value) {
        console.warn(
          '[startSessionParser] Device disconnected before starting camera preview. Aborting.',
        )
        throw new Error('Device disconnected before starting camera preview.')
      }
      return cameraHelper.startPreview('cameraPreview')
    },
    onTakePhoto: async ({ fileBaseName, meta }) => {
      if (deviceDisconnected.value) {
        console.warn(
          '[startSessionParser] Device disconnected before taking photo. Aborting photo capture.',
        )
        throw new Error('Device disconnected before taking photo.')
      }
      try {
        // const photoData = await cameraHelper.captureAndSave(fileBaseName)
        const photoData = await cameraHelper.captureAndSave(fileBaseName + '====' + reNameFlag++)
        console.log('renameflag', reNameFlag)
        if (photoData && photoData.base64Data && photoData.fileName) {
          sessionData.photos.push({
            name: photoData.fileName,
            base64: photoData.base64Data,
          })
        }
        return photoData
      } catch (e) {
        console.error('拍照获取失败', e)
        throw e
      }
    },
    onEndPreview: async () => {
      return cameraHelper.stopPreview()
    },
    onPhotoSessionEnded: () => {
      dataBatchCounter.value++
      enableSave = true
    },
  })

  const deviceId = bluetoothStore.connectingDeviceId
  if (!deviceId) {
    console.warn('未连接设备，无法订阅通知')
    return
  }

  bluetoothService
    .subscribeToNotifications(deviceId, NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID, (uint8) => {
      try {
        const { points, errors } = parser.parse(uint8)
        if (errors && errors.length > 0) {
          console.warn('parse errors', errors)
        }
        if (points && points.length > 0) {
          accumulationBuffer.push(...points)
          points.forEach((p) => {
            sessionData.rawLines.push(`${p.x / 10} ${p.y / 10} ${p.z / 10}`)
          })
        }
      } catch (e) {
        console.error('notification handler error', e)
      }
    })
    .catch((e) => console.warn('subscribeToNotifications failed', e))

  accumulationTimer = setInterval(() => {
    if (!isRendererReady.value || !isCollecting.value) return
    if (accumulationBuffer.length >= MIN_BATCH_SIZE) {
      const toRender = accumulationBuffer.splice(0, Math.min(accumulationBuffer.length, 1000))
      if (toRender.length > 0) {
        renderer.addPoints(toRender)
        pointCount.value += toRender.length
      }
    }
  }, ACCUMULATION_INTERVAL)
}

// 开始数据流
async function startDataStream() {
  // --- 检查设备是否已断开 ---
  if (deviceDisconnected.value) {
    showToast('设备已断开连接，请返回重连')
    return
  }
  if (bluetoothStore.connectingStatus !== 2) {
    showToast('设备未连接')
    return
  }
  // --- 结束：检查设备是否已断开 ---

  if (!isRendererReady.value) {
    showToast('渲染器未准备好')
    return
  }
  if (!currentSessionId) {
    showToast('会话ID未生成')
    return
  }
  isCollecting.value = true
  // hasStarted.value = true
  bluetoothStore.handleSendStart()
  console.log('startDataStream click', '发送了开始指令，现在开始采集')
  startSessionParser()
}

// --- 打开保存对话或直接保存（保留兼容旧调用） ---
// const saveMessages = async () => {
//   openSaveDialog()
// }

// 执行保存逻辑，folderName 为 'projectName_sessionId' 或仅 sessionId
async function performSave(folderName) {
  saving.value = true
  try {
    const result = await bluetoothService.saveBleDataToFileWithSessionStructure(
      sessionData.rawLines,
      folderName,
      sessionData.photos,
    )
    console.log('保存成功:', JSON.stringify(result))
    showToast(
      // `会话 ${folderName} 已保存\n点云: ${result.lineCount} 行\n照片: ${result.photoPaths.length} 张`,
      '保存成功'
    )
    // 标记为已保存，记录已保存的文件夹
    savedDuringDialog.value = true
    lastSavedFolder.value = folderName
    closeSaveDialog()
    // 通知外部刷新（主页面会监听此事件并调用 loadProjectFolders）
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(
          new CustomEvent('pointcloud-updated', { detail: { folder: folderName } }),
        )
      }
    } catch (e) {
      console.warn('dispatch pointcloud-updated failed', e)
    }
    // 完成后返回主页面
    router.back()
  } catch (error) {
    console.error('保存失败:', error)
    showToast('保存失败：' + (error.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// 停止订阅，停止相机预览，清理累积定时器
async function stopSessionParser() {
  console.log('[stopSessionParser] Stopping parser and subscription...')
  if (accumulationTimer) {
    clearInterval(accumulationTimer)
    accumulationTimer = null
  }
  try {
    const deviceId = bluetoothStore.connectingDeviceId
    if (deviceId) {
      await bluetoothService.unsubscribeFromNotifications(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_NOTIFY_CHAR_UUID,
      )
    }
  } catch (e) {
    console.warn('unsubscribe failed', e)
  }
  await cameraHelper.stopPreview().catch(() => {})
  parser = null
}
</script>

<style scoped>
.point-cloud-page {
  --bg-deep: #0a0d12;
  --bg-surface: rgba(16, 22, 32, 0.75);
  --bg-surface-hover: rgba(24, 32, 44, 0.85);
  --brand-primary: #2a7aff;
  --brand-secondary: #4d9eff;
  --brand-gradient: linear-gradient(145deg, #2a7aff, #4d9eff);
  --brand-glow: rgba(42, 122, 255, 0.25);
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-active: rgba(255, 255, 255, 0.12);
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.65);
  --text-tertiary: rgba(255, 255, 255, 0.45);

  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  margin: 0;
  background: var(--bg-deep);
  color: var(--text-primary);
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.three-container {
  flex: 1;
  width: 100%;
  position: relative;
  background: transparent;
  overflow: hidden;
}

.camera-preview-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: transparent;
}

.overlay-controls {
  position: absolute;
  inset: 0;
  pointer-events: none;
  padding: 16px;
  box-sizing: border-box;
  z-index: 10;
}

.back-btn {
  position: absolute;
  left: 16px;
  top: 16px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--border-subtle);
  pointer-events: auto;
  z-index: 12;
  transition: all 0.2s ease;
  cursor: pointer;
  padding: 0;
}

.back-btn:hover {
  background: var(--bg-surface-hover);
  border-color: var(--border-active);
}

.back-btn:active {
  transform: scale(0.97);
  opacity: 0.9;
}

.back-btn img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
  filter: brightness(0.95);
  opacity: 0.9;
}

.save-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 0 10px;
  height: 28px;
  min-width: 44px;
  width: auto;
  background: var(--brand-gradient);
  border: none;
  border-radius: 999px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px var(--brand-glow);
  pointer-events: auto;
  z-index: 11;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}

/* 保存对话框覆盖层需要接收事件 */

/* 整合后的保存对话框样式：全屏覆盖模态 */
.save-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6);
}

.save-dialog-content {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  background: transparent; /* 内容内使用半透明卡片样式 */
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.save-dialog-card {
  width: 60vw;
  max-width: 700px;
  max-height: 90vh;
  background: rgba(15, 23, 36, 0.98);
  color: #fff;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  overflow: auto;
}

.save-dialog-content input {
  width: 100%;
  margin: 8px 0 12px 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.save-btn:hover {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
  box-shadow: 0 6px 16px var(--brand-glow);
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.25);
}

.save-btn:active {
  transform: translateY(1px);
  box-shadow: 0 2px 8px var(--brand-glow);
}

.save-btn:disabled {
  background: rgba(42, 122, 255, 0.5);
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
}

.capture-btn {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.1), transparent 80%),
    var(--brand-gradient);
  pointer-events: auto;
  z-index: 11;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 16px var(--brand-glow);
  border: 1px solid rgba(255, 255, 255, 0.2);
  -webkit-tap-highlight-color: transparent;
}

.capture-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.capture-btn:hover {
  transform: translateY(-50%) scale(1.05);
  box-shadow: 0 10px 24px var(--brand-glow);
  border-color: rgba(255, 255, 255, 0.3);
}

.capture-btn:hover::after {
  background: white;
  transform: translate(-50%, -50%) scale(0.95);
}

.capture-btn:active {
  transform: translateY(-50%) scale(0.97);
  box-shadow: 0 4px 12px var(--brand-glow);
}

.capture-btn:active::after {
  transform: translate(-50%, -50%) scale(0.9);
}

/* ========== 顶部中央统计数据样式 ========== */
.top-center-stat {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px;
  padding: 10px 18px;
  border: 1px solid var(--border-subtle);
  pointer-events: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  min-width: 100px;
  display: flex;
  justify-content: center;
  z-index: 10;
  flex-direction: column;
  gap: 4px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  font-weight: 400;
}

.stat-value {
  font-size: 20px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: 0.5px;
}

/* ========== 左下角统计数据样式 ========== */
.bottom-left-stat {
  position: absolute;
  left: 16px;
  bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
  z-index: 10;
  pointer-events: auto; /* 确保文字本身不阻挡交互 */
}

/* ========== 设备断开提示样式 ========== */
.disconnect-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(10, 13, 18, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  pointer-events: auto;
}

.disconnect-message {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.disconnect-message span {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
}

.disconnect-back-btn {
  padding: 10px 24px;
  background: var(--brand-gradient);
  border: none;
  border-radius: 999px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.disconnect-back-btn:hover {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
  transform: translateY(-1px);
}

.disconnect-back-btn:active {
  transform: translateY(1px);
}

.save-dialog-content h3 {
  margin: 0 0 8px 0;
}
.save-dialog-content input {
  width: 100%;
  padding: 8px 10px;
  margin: 8px 0 12px 0;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #fff;
}
.save-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.save-actions button {
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}

@media (max-width: 768px) {
  .overlay-controls {
    padding: 16px;
  }

  .back-btn {
    width: 34px;
    height: 34px;
    left: 16px;
    top: 16px;
  }

  .save-btn {
    height: 26px;
    padding: 0 8px;
    min-width: 40px;
    font-size: 11px;
    top: 16px;
    right: 16px;
  }

  .capture-btn {
    width: 52px;
    height: 52px;
    right: 16px;
  }

  /* 适配小屏幕上的顶部中央统计 */
  .top-center-stat {
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    min-width: 90px;
  }

  /* 适配小屏幕上的左下角统计 */
  .bottom-left-stat {
    font-size: 12px;
    left: 12px;
    bottom: 12px;
  }

  /* 适配小屏幕上的断开提示 */
  .disconnect-message {
    padding: 20px 24px;
  }

  .disconnect-message span {
    font-size: 16px;
  }

  .disconnect-back-btn {
    padding: 8px 20px;
    font-size: 13px;
  }
}
</style>
