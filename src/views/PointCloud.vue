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

        <!-- <button @click="openSaveDialog" class="save-btn" :disabled="saving "> -->

        <button @click="handleOverivew" class="preview-btn" :disabled="saving || !enableSave">
          预览
        </button>
        <button @click="openSaveDialog" class="save-btn" :disabled="saving || !enableSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>

        <div class="right-button-group">
          <!-- <van-button
            class="circle-btn edit-btn"
            type="primary"
            @click="handleEdit"
          >
        </van-button> -->

          <img src="@/assets/img/edit.png" class="editIcon" @click="handleEditClick" alt="编辑" />
          <button class="capture-btn" @click="startDataStream"></button>
          <img
            src="@/assets/img/setting.png"
            class="setIcon"
            @click="handleSettingClick"
            alt="设置"
          />
        </div>
        <!-- <van-button icon="edit" type="primary" />
        <button class="capture-btn" @click="startDataStream"></button>
        <van-button icon="setting" type="primary" /> -->
        <!-- <div class="data-stats top-center-stat">
          <div class="stat-item">
            <span>点云数量</span>
            <span id="point-count">{{ pointCount }}</span>
          </div>
          <div class="stat-item">
            <span>帧率</span>
            <span id="storage-status">{{ frameRate }}</span>
          </div>
        </div> -->

        <!-- 注释点位，下周的进度搞这个 -->
        <div class="batch-buttons-row">
          <button
            v-for="(b, idx) in batchButtons"
            :key="idx"
            class="batch-btn"
            @click="goToBatch(idx)"
          >
            点位{{ idx + 1 }}
          </button>
        </div>
        <div class="bottom-left-stat">
          <span>采集点位数：{{ dataBatchCounter }} / 50</span>
        </div>
        <!-- 内存调试按钮（仅开发环境显示） -->
        <button v-if="isDev" class="debug-memory-btn" @click="showMemoryStats">内存</button>
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
import { useFoldersStore } from '@/stores/folders'
import { usePointCloudRenderer } from '@/composables/usePointCloudRenderer/index.js'
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
import * as storage from '@/api/pointCloudStorage'
import { showLoadingToast, closeToast, showToast } from 'vant'

const bluetoothStore = useBluetoothStore()
const folderStore = useFoldersStore()
const router = useRouter()

const container = ref(null)
let renderer = null
let isRendererReady = ref(false)
let pointCount = ref(0)
let frameRate = ref(0)
const isCollecting = ref(false)
const saving = ref(false)
let enableSave = ref(false)
const showSaveDialog = ref(false)
const projectName = ref('')
const saveInput = ref(null)
const lastSavedFolder = ref(null)
const savedDuringDialog = ref(false)

// 会话相关数据
let currentSessionId = null // 整个项目的会话ID
let currentBatchData = {
  // 当前点位的数据
  rawLines: [],
  photos: [],
  pointCount: 0, // 当前点位点云计数
}
let dataBatchCounter = ref(0) // 当前点位编号

let parser = null
const accumulationBuffer = []
const MAX_BUFFER_SIZE = 10000 // 缓冲区上限   超过就丢弃
const MAX_POINTS_PER_BATCH = 500000 // 单个点位最大点云数
let accumulationTimer = null
const ACCUMULATION_INTERVAL = 33
const MIN_BATCH_SIZE = 3  //  进行渲染一次最少需要点数
let pauseListener = null
let resumeListener = null
let hasStarted = false

// 设备断开相关状态
const deviceDisconnected = ref(false)
let disconnectUnregister = null

// 记录进入后台前的采集状态
let wasCollectingBeforePause = false
const isNavigating = ref(false)
// 批次按钮状态
const batchButtons = ref([]) // 存储已经生成的点位序号

// 删除事件监听器
let batchDeletedListener = null
let _hasCleaned = false

// 开发环境标志
// const isDev = ref(import.meta.env.DEV)
const isDev = true

/**
 * 显示内存统计信息
 */
const showMemoryStats = () => {
  if (!renderer) {
    showToast({ message: '渲染器未初始化', position: 'bottom' })
    return
  }

  const stats = renderer.getMemoryStats()
  const totalMB = (stats.totalActualSize / 1024 / 1024).toFixed(2)

  console.log('[PointCloud Memory Stats]', JSON.stringify(stats))

  showToast({
    message: `点数: ${stats.currentPointCount}\n内存: ${totalMB}MB\n使用率: ${stats.utilizationRate}%`,
    position: 'bottom',
    duration: 3000,
  })
}
const goBack = async () => {
  if (isNavigating.value) return
  isNavigating.value = true

  console.log('[Pointcloud] 用户点击返回，开始执行清理...')

  // 立即开始路由返回，不等待清理完成
  const navigationPromise = router.back()

  // 将清理操作延迟到下一个事件循环，避免阻塞路由返回
  setTimeout(() => {
    cleanupResourcesForExit().catch((err) => {
      console.error('[Pointcloud] 清理时发生错误', err)
    })
  }, 50)

  // 先判断是否需要删除
  if (!savedDuringDialog.value && currentSessionId && hasStarted) {
    // await delSessionDir()  // 没保存，先暂时不删除 3/19
    // setTimeout(async () => {
    // }, 200)
  }

  return navigationPromise
}

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

  // 监听统一的 pointcloud-updated 事件以响应批次变化
  batchDeletedListener = async (e) => {
    const { type } = e.detail || {}
    if (type === 'batch-deleted' || type === 'batches-reindexed') {
      await loadBatchButtons()
    }
  }
  window.addEventListener('pointcloud-updated', batchDeletedListener)
})

onUnmounted(async () => {
  if (pauseListener) {
    pauseListener.remove()
    pauseListener = null
  }
  if (resumeListener) {
    resumeListener.remove()
    resumeListener = null
  }
  if (batchDeletedListener) {
    window.removeEventListener('pointcloud-updated', batchDeletedListener)
    batchDeletedListener = null
  }
  // 组件卸载时也执行彻底清理
  await cleanupResourcesForExit()
})

onBeforeRouteLeave(async (to, from, next) => {
  if (isLeavingSession(to) && hasStarted) {
    // 如果是返回主页并且开始过采集，则删除多余文件夹
    // await delSessionDir() // 没保存，暂时先不删除 3/19
  }
  await cleanupResourcesForExit()
  next()
})

const handleEditClick = () => {
  console.log('handleEditClick')
}

const handleSettingClick = () => {
  console.log('handleSettingClick')
}

async function init() {
  // 每次初始化重置清理标志
  _hasCleaned = false
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
    // setTimeout(() => setImmersive(true), 120)
    // setTimeout(async () => {
    //   await setImmersive(true)
    //   try {
    //     await StatusBar.setBackgroundColor({ color: '#0e1420' })
    //   } catch (e) {
    //     console.log('沉浸式err: ', e)
    //   }
    // }, 900)
  } catch (err) {
    console.warn('setImmersive initial calls failed', err)
  }

  setTimeout(() => {
    if (container.value) {
      // 可以传入自定义配置覆盖默认值，不传则使用默认配置
      const customConfig = {
        // maxPoints: 300000,        // 降低点云上限
        // initialCapacity: 30000,   // 降低初始容量
        // targetFps: 60,            // 提高帧率
        // pointSize: 0.5,           // 增大点的大小
      }
      renderer = usePointCloudRenderer(container.value, customConfig)

      renderer.init()
      frameRate.value = 30
      isRendererReady.value = true
      window.addEventListener('resize', renderer.onResize)

      if (!currentSessionId) {
        currentSessionId = generateOptimizedSessionId()
        resetForNewProject()
      } else {
        // 若已有会话ID则加载已存在批次，用于返回时恢复
        loadBatchButtons()
      }
    }
  }, 100)
}
function goToBatch(idx) {
  if (!currentSessionId) return
  const bid = idx + 1
  router.push({ name: 'BatchDetail', params: { session: currentSessionId, bid } })
}
// ================开始： 编辑批次数据相关=======================

// 加载现有批次按钮（如果存在）
async function loadBatchButtons() {
  if (!currentSessionId) return
  // 如果未保存，尝试从临时文件夹加载
  let folderToLoad = currentSessionId
  if (!savedDuringDialog.value) {
    folderToLoad = storage.path.getTempSessionName(currentSessionId)
  } else {
    // 已保存的会话，直接使用 currentSessionId
    folderToLoad = currentSessionId
  }
  try {
    const list = await storage.batch.list(folderToLoad)
    batchButtons.value = list.map((_, idx) => idx + 1)
    dataBatchCounter.value = batchButtons.value.length
  } catch (e) {
    console.warn('[PointCloud] loadBatchButtons 失败', e)
    batchButtons.value = []
  }
}

// 重置为新项目
function resetForNewProject() {
  dataBatchCounter.value = 0
  batchButtons.value = []
  currentBatchData = { rawLines: [], photos: [], pointCount: 0 }
  enableSave.value = false
  if (renderer && typeof renderer.resetPointCloud === 'function') {
    renderer.resetPointCloud()
    pointCount.value = 0
  }
}

// 重置为新点位
function resetForNewBatch() {
  currentBatchData = { rawLines: [], photos: [], pointCount: 0 }
  accumulationBuffer.length = 0
  if (renderer && typeof renderer.resetPointCloud === 'function') {
    renderer.resetPointCloud()
    pointCount.value = 0
  }
}

// 保存当前点位数据
async function saveCurrentBatch() {
  if (!currentSessionId) return

  const bid = dataBatchCounter.value
  if (currentBatchData.rawLines.length === 0 && currentBatchData.photos.length === 0) {
    return
  }

  try {
    // 使用临时文件夹名保存
    const tempFolderName = storage.path.getTempSessionName(currentSessionId)
    // 保存当前点位的数据到批次文件夹
    await storage.batch.save(
      tempFolderName,
      bid,
      currentBatchData.rawLines,
      currentBatchData.photos,
    )
    console.log(
      '[PointCloud] 点位保存成功到临时文件夹',
      bid,
      '点云行数:',
      currentBatchData.rawLines.length,
      '照片数:',
      currentBatchData.photos.length,
    )

    // 清空当前点位数据（为下一个点位做准备）
    currentBatchData = { rawLines: [], photos: [], pointCount: 0 }
  } catch (e) {
    console.error('[PointCloud] saveCurrentBatch error', e)
    throw e
  }
}
// ================结束： 编辑批次数据相关=======================

function registerDisconnectListener() {
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }

  disconnectUnregister = bluetoothService.onDeviceDisconnected(
    async (deviceId, isManualDisconnect) => {
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

      // 停止订阅和清空累加器
      try {
        bluetoothStore.setCleanupStatus(true) // 清理中
        await stopSessionParser() // 这里会取消订阅
      } catch (e) {
        console.warn('[PointCloudPage] 清理会话失败', e)
      } finally {
        bluetoothStore.setCleanupStatus(false) // 清理结束
      }
      // 显示提示
      showToast({ message: '设备已断开连接', position: 'bottom' })
    },
  )
}

// --- 监听蓝牙Store的连接状态变化 ---
watch(
  () => bluetoothStore.connectingStatus,
  async (newStatus, oldStatus) => {
    if (oldStatus === 2 && newStatus !== 2) {
      // 连接从已连接变为非已连接状态
      if (!deviceDisconnected.value) {
        console.log('[PointCloudPage] 检测到全局连接状态变为未连接')
        deviceDisconnected.value = true
        isCollecting.value = false
        try {
          bluetoothStore.setCleanupStatus(true) // 清理中
          await stopSessionParser() // 这里会取消订阅
        } catch (e) {
          console.warn('[PointCloudPage] 清理会话失败', e)
        } finally {
          bluetoothStore.setCleanupStatus(false) // 清理结束
        }
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
    try {
      bluetoothStore.setCleanupStatus(true) // 清理中
      await stopSessionParser() // 这里会取消订阅
    } catch (e) {
      console.warn('[PointCloudPage] 清理会话失败', e)
    } finally {
      bluetoothStore.setCleanupStatus(false) // 清理结束
    }
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
  if (_hasCleaned) {
    console.log('[PointCloud] cleanupResourcesForExit 已执行过，忽略')
    return
  }
  _hasCleaned = true

  // 同步清理定时器，确保立即生效
  if (accumulationTimer) {
    clearInterval(accumulationTimer)
    accumulationTimer = null
  }

  try {
    // 延迟执行状态栏恢复，让页面先退出
    setTimeout(async () => {
      try {
        await StatusBar.setBackgroundColor({ color: '#0a0a1a' })
        await StatusBar.setStyle({ style: 'LIGHT' })
      } catch (err) {
        console.warn('StatusBar restore overlays failed', err)
      }
    }, 200)

    // 延迟执行沉浸模式关闭
    setTimeout(() => {
      setImmersive(false)
    }, 250)
  } catch (err) {
    console.warn('StatusBar restore overlays failed', err)
  }

  if (renderer?.onResize) {
    window.removeEventListener('resize', renderer.onResize)
  }
  // 延迟销毁渲染器
  setTimeout(() => {
    if (renderer?.dispose && typeof renderer.dispose === 'function') {
      renderer.dispose()
    }
    renderer = null
    isRendererReady.value = false
  }, 100)

  await disableScreenKeepAwake()
  try {
    bluetoothStore.setCleanupStatus(true) // 清理中
    await stopSessionParser() // 这里会取消订阅
  } catch (e) {
    console.warn('[PointCloudPage] 清理会话失败', e)
  } finally {
    bluetoothStore.setCleanupStatus(false) // 清理结束
  }

  // --- 移除断开监听 ---
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }
  // --- 结束：移除断开监听 ---

  bluetoothStore.handleSendEnd()
  isCollecting.value = false
  hasStarted = false
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
  // if (wasCollectingBeforePause) {
  //   // 确保渲染器和会话ID都存在
  //   if (isRendererReady.value && currentSessionId) {
  //     // 重新启动会话解析器（重新订阅、启动相机）
  //     startSessionParser()
  //   } else {
  //     console.warn('[App] 恢复失败：渲染器未就绪、会话ID未生成或未启动过采集')
  //   }
  // } else {
  //   console.log('[App] 上次未在采集状态，无需恢复')
  // }
}

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
    enableDebug: true,
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
        // 构建目标目录路径：pointcloud/a7f3c9d1-{sessionId}/Batch_XXX
        const tempFolderName = storage.path.getTempSessionName(currentSessionId)
        const bid = dataBatchCounter.value
        const targetDir = `pointcloud/${tempFolderName}/Batch_${String(bid).padStart(3, '0')}`

        // 拍照并在后台保存（不阻塞主线程）
        const photoData = await cameraHelper.captureAndSave(
          fileBaseName + '====' + ++reNameFlag,
          targetDir,
        )

        if (photoData && photoData.filePath && photoData.fileName) {
          // 只保存文件路径，不保存base64数据
          currentBatchData.photos.push({
            name: photoData.fileName,
            filePath: photoData.filePath,
          })
          console.log(
            '[PointCloud] 照片已添加到当前点位，当前照片数:',
            currentBatchData.photos.length,
          )
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
    onPhotoSessionEnded: async () => {
      // 当前点位拍照结束，保存点位数据
      await saveCurrentBatch()

      // 更新点位计数器
      dataBatchCounter.value++
      enableSave.value = true

      // 添加按钮表示新生成的点位
      batchButtons.value.push(dataBatchCounter.value)
      isCollecting.value = false
      console.log('[PointCloud] 点位保存完成，下一个点位编号:', dataBatchCounter.value)
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
        // 检查单个点位点云数量上限
        if (currentBatchData.pointCount >= MAX_POINTS_PER_BATCH) {
          return
        }

        const { points, errors } = parser.parse(uint8)
        if (errors && errors.length > 0) {
          console.warn('parse errors', errors)
        }
        if (points && points.length > 0) {
          // 检查缓冲区上限  超出上限时丢弃同等数量旧点位
          if (accumulationBuffer.length > MAX_BUFFER_SIZE) {
            const overflow = accumulationBuffer.length - MAX_BUFFER_SIZE + points.length
            accumulationBuffer.splice(0, overflow)
          }

          accumulationBuffer.push(...points)
          points.forEach((p) => {
            // 这里保存所有接收到的点云坐标信息 ---- 但是渲染时可能会丢弃部分超过缓冲区上限的数据
            currentBatchData.rawLines.push(`${p.x / 10} ${p.y / 10} ${p.z / 10}`)
          })
          currentBatchData.pointCount += points.length

          // 达到上限时停止采集并提示
          if (currentBatchData.pointCount >= MAX_POINTS_PER_BATCH) {
            console.warn(`点位点云数量已达到上限 ${MAX_POINTS_PER_BATCH}，停止接收`)
            showToast({ message: '当前点位点云数量已达上限', position: 'bottom' })
            stopSessionParser()
            isCollecting.value = false
            bluetoothStore.handleSendEnd()
          }
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

  hasStarted = true // 表示是否开始过采集，如果没有则不用删除文件夹
}

async function startDataStream() {
  if (isCollecting.value) {
    showToast({ message: '正在采集中...', position: 'bottom' })
    return
  }
  // 开始新点位采集前，清空渲染器中的点云
  if (renderer && typeof renderer.resetPointCloud === 'function') {
    renderer.resetPointCloud()
    pointCount.value = 0
  }

  if (deviceDisconnected.value) {
    showToast({ message: '设备已断开连接，请返回重连', position: 'bottom' })
    return
  }
  if (bluetoothStore.connectingStatus !== 2) {
    showToast({ message: '设备未连接', position: 'bottom' })
    return
  }
  if (!isRendererReady.value) {
    showToast({ message: '渲染器未准备好', position: 'bottom' })
    return
  }
  if (!currentSessionId) {
    showToast({ message: '会话ID未生成', position: 'bottom' })
    return
  }

  // 重置当前点位数据
  currentBatchData = { rawLines: [], photos: [], pointCount: 0 }
  accumulationBuffer.length = 0

  isCollecting.value = true
  bluetoothStore.handleSendStart()
  console.log('startDataStream click', '开始新点位采集，点位编号:', dataBatchCounter.value + 1)
  startSessionParser()
}

const openSaveDialog = async () => {
  if (!currentSessionId) {
    showToast({ message: '会话ID未生成，无法保存', position: 'bottom' })
    return
  }

  // 检查整个项目是否有数据（所有点位）
  if (dataBatchCounter.value === 0) {
    showToast({ message: '暂无数据可保存', position: 'bottom' })
    return
  }

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
  showSaveDialog.value = false
}

const confirmSave = async () => {
  const name = (projectName.value || '').trim()

  if (name && name.length > 10) {
    showToast({ message: '项目名称不能超过10个字符', position: 'bottom' })
    return
  }

  const validRe = /^[\u4e00-\u9fa5A-Za-z0-9 _-]*$/
  if (name && !validRe.test(name)) {
    showToast({
      message: '项目名称包含非法字符，仅允许中文、字母、数字、空格、下划线和短横线',
      position: 'bottom',
    })
    return
  }

  const folderName = name ? `${name}_${currentSessionId}` : currentSessionId
  lastSavedFolder.value = folderName
  savedDuringDialog.value = false

  // 先关闭保存对话框
  closeSaveDialog()

  try {
    // 显示加载中提示
    showLoadingToast({
      message: '保存中...',
      forbidClick: true,
    })
    // 执行保存操作
    await performSave(folderName)

    // 保存成功后关闭加载提示
    closeToast()
  } catch (error) {
    // 保存失败也关闭加载提示
    closeToast()
    showToast({
      message: '保存失败',
      position: 'bottom',
    })
  } finally {
    router.back()
  }
}

let isDeletingSession = false

const delSessionDir = async () => {
  // 防止重复执行
  if (isDeletingSession) return
  if (!savedDuringDialog.value && currentSessionId && currentSessionId !== lastSavedFolder.value) {
    isDeletingSession = true
    try {
      const folderToDelete = storage.path.getTempSessionName(currentSessionId)
      await storage.session.delete(folderToDelete)
      console.log('[Pointcloud] 未保存会话，已删除目录', folderToDelete)
    } catch (e) {
      console.warn('[Pointcloud] 删除未保存会话失败', e)
    } finally {
      isDeletingSession = false
    }
  }
}
// 保存整个项目（重命名会话文件夹）
async function performSave(folderName) {
  saving.value = true
  try {
    const tempName = storage.path.getTempSessionName(currentSessionId)
    // 确定目标文件夹名
    let targetName
    if (folderName && folderName !== currentSessionId) {
      targetName = folderName
    } else {
      // 用户没输入项目名，直接使用会话ID
      targetName = currentSessionId
    }

    // 检查临时文件夹是否存在，存在则重命名
    try {
      await storage.file.stat(`pointcloud/${tempName}`)

      if (tempName !== targetName) {
        await storage.session.rename(tempName, targetName)
        currentSessionId = targetName
        console.log('[PointCloud] 开始刷新项目列表...')
        await folderStore.refreshFolders()
        console.log('[PointCloud] 刷新完成')
      }
    } catch (e) {
      console.warn('[PointCloud] 临时文件夹不存在', tempName)
    }
    // // 重命名会话文件夹
    // if (currentSessionId && folderName && folderName !== currentSessionId) {
    //   await storage.session.rename(currentSessionId, folderName)
    //   currentSessionId = folderName
    // }

    showToast({
      message: '保存成功',
      position: 'bottom',
    })
    savedDuringDialog.value = true
    lastSavedFolder.value = targetName
  } catch (error) {
    console.error('保存失败:', error)
    showToast({
      message: `保存失败：${error.message || '未知错误'}`,
      position: 'bottom'
    })
    throw error // 重新抛出错误以便上层捕获
  } finally {
    saving.value = false
  }
}

async function stopSessionParser() {
  if (!parser) {
    return
  }
  console.log('[stopSessionParser] Stopping parser and subscription...')
  if (accumulationTimer) {
    clearInterval(accumulationTimer)
    accumulationTimer = null
  }
  accumulationBuffer.length = 0
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
  isCollecting.value = false
}
// 判断是否真的是离开会话页面（返回主页）
function isLeavingSession(to) {
  // 如果跳转到 BatchDetail，不是离开
  if (to.name === 'BatchDetail') return false

  // 如果跳转到主页，是离开
  if (to.name === 'MainContentTabs') return true

  // 如果路由深度变小（返回上一级），且上一级是主页，也是离开
  const currentDepth = router.currentRoute.value.matched.length
  const targetDepth = to.matched.length
  if (targetDepth < currentDepth && to.name === 'MainContentTabs') {
    return true
  }

  return false
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
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.three-container {
  flex: 1;
  width: 100%;
  position: relative;
  background: radial-gradient(#223344, #001122);
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

/* ========== 通用按钮样式 ========== */
.back-btn,
.preview-btn,
.save-btn,
.capture-btn,
.batch-btn,
.disconnect-back-btn,
.save-actions button {
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  transition: all 0.2s ease;
}

/* ========== 返回按钮 ========== */
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
  -webkit-user-drag: none;
  pointer-events: none;
}

/* ========== 保存按钮 ========== */
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
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  line-height: 1;
}

.save-btn:hover:not(:disabled) {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
  box-shadow: 0 6px 16px var(--brand-glow);
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.25);
}

.save-btn:active:not(:disabled) {
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

/* ========== 预览按钮 ========== */
.preview-btn {
  position: absolute;
  top: 16px;
  right: calc(44px + 16px + 32px); /* 保存按钮宽度 + 保存按钮右侧间距 + 16px间隔 */
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
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  line-height: 1;
}

.preview-btn:hover:not(:disabled) {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
  box-shadow: 0 6px 16px var(--brand-glow);
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.25);
}

.preview-btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 2px 8px var(--brand-glow);
}

.preview-btn:disabled {
  background: rgba(42, 122, 255, 0.5);
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
}

/* ========== 右侧圆形按钮组 ========== */
.right-button-group {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px; /* 按钮之间的间距 */
  pointer-events: none;
  z-index: 11;
}

.editIcon,
.setIcon {
  width: 24px;
  height: 24px;
  pointer-events: auto;
}

/* ========== 采集按钮 ========== */
.capture-btn {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.1), transparent 80%),
    var(--brand-gradient);
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 6px 16px var(--brand-glow);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

/* .capture-btn::after {
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
  pointer-events: none;
}

.capture-btn:hover:not(:disabled) {
  transform: translateY(-50%) scale(1.05);
  box-shadow: 0 10px 24px var(--brand-glow);
  border-color: rgba(255, 255, 255, 0.3);
}

.capture-btn:hover:not(:disabled)::after {
  background: white;
  transform: translate(-50%, -50%) scale(0.95);
}

.capture-btn:active:not(:disabled) {
  transform: translateY(-50%) scale(0.97);
  box-shadow: 0 4px 12px var(--brand-glow);
}

.capture-btn:active:not(:disabled)::after {
  transform: translate(-50%, -50%) scale(0.9);
} */

/* ========== 批次按钮行 ========== */
.batch-buttons-row {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  z-index: 11;
  pointer-events: auto;
}

.batch-btn {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: none;
  background: var(--brand-gradient);
  color: #fff;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px var(--brand-glow);
}

.batch-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px var(--brand-glow);
}

.batch-btn:active {
  transform: scale(0.97);
  box-shadow: 0 2px 8px var(--brand-glow);
}

/* ========== 统计数据 ========== */
.bottom-left-stat {
  position: absolute;
  left: 16px;
  bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
  z-index: 10;
  pointer-events: auto;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.bottom-left-stat span {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

/* ========== 内存调试按钮 ========== */
.debug-memory-btn {
  position: absolute;
  left: 16px;
  bottom: 48px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  pointer-events: auto;
  cursor: pointer;
  z-index: 10;
}

.debug-memory-btn:hover {
  background: var(--bg-surface-hover);
  border-color: var(--border-active);
}

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
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
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

/* ========== 设备断开提示 ========== */
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
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
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
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.disconnect-message span {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
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
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.disconnect-back-btn:hover {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
  transform: translateY(-1px);
}

.disconnect-back-btn:active {
  transform: translateY(1px);
}

/* ========== 保存对话框 ========== */
.save-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.save-dialog-content {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  background: transparent;
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
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  overflow: auto;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.save-dialog-card h3 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.save-dialog-card label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.save-dialog-content input {
  width: 100%;
  margin: 8px 0 16px 0;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 16px;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
  transition: all 0.2s ease;
  outline: none;
}

.save-dialog-content input:focus {
  border-color: var(--brand-primary);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(42, 122, 255, 0.2);
}

.save-dialog-content input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

/* 对话框按钮容器 */
.save-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.save-actions button {
  padding: 12px 24px;
  border-radius: 30px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  min-width: 100px;
  letter-spacing: 0.3px;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 完成按钮 */
.save-actions button:first-child {
  background: var(--brand-gradient);
  color: white;
  box-shadow: 0 4px 12px var(--brand-glow);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.save-actions button:first-child:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px var(--brand-glow);
  border-color: rgba(255, 255, 255, 0.3);
}

.save-actions button:first-child:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 2px 8px var(--brand-glow);
}

/* 取消按钮 */
.save-actions button:last-child {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.save-actions button:last-child:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.save-actions button:last-child:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(1px);
}

/* 禁用状态 */
.save-actions button:disabled,
.save-btn:disabled,
.preview-btn:disabled,
.disconnect-back-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none;
  border-color: rgba(255, 255, 255, 0.08);
}

/* ========== 移动端适配 ========== */
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

  .save-btn,
  .preview-btn {
    height: 26px;
    padding: 0 8px;
    min-width: 40px;
    font-size: 11px;
    top: 16px;
  }

  .save-btn {
    right: 16px;
  }

  .preview-btn {
    right: calc(40px + 16px + 16px); /* 保存按钮宽度(40px) + 保存按钮右侧间距 + 16px间隔 */
  }

  .capture-btn {
    width: 52px;
    height: 52px;
    right: 16px;
  }

  .top-center-stat {
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    min-width: 90px;
  }

  .bottom-left-stat {
    font-size: 12px;
    left: 12px;
    bottom: 12px;
  }

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

  .save-dialog-card {
    width: 85vw;
    padding: 20px;
  }

  .save-actions {
    gap: 10px;
    margin-top: 20px;
  }

  .save-actions button {
    padding: 10px 20px;
    min-width: 80px;
    font-size: 14px;
  }
}
</style>
