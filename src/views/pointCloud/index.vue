<template>
  <div class="point-cloud-page">
    <div ref="container" class="three-container">
      <!-- 摄像头预览容器（供 CameraPreview.attach 使用） -->
      <div id="cameraPreview" class="camera-preview-overlay"></div>

      <!-- 采集进度卡片 -->
      <div v-if="collectionProgress.isCollecting" class="collection-progress-card">
        <div class="progress-icon">
          <svg
            class="radar-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="3" fill="#2a7aff" />
            <circle cx="12" cy="12" r="6" stroke="#2a7aff" stroke-width="1.5" opacity="0.6" />
            <circle cx="12" cy="12" r="9" stroke="#2a7aff" stroke-width="1" opacity="0.3" />
            <path d="M12 3L12 6" stroke="#2a7aff" stroke-width="2" stroke-linecap="round" />
            <path d="M12 18L12 21" stroke="#2a7aff" stroke-width="2" stroke-linecap="round" />
            <path d="M3 12L6 12" stroke="#2a7aff" stroke-width="2" stroke-linecap="round" />
            <path d="M18 12L21 12" stroke="#2a7aff" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
        <div class="progress-title">采集中...</div>
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
          </div>
          <div class="progress-percentage">{{ Math.round(progressPercentage) }}%</div>
        </div>
        <div class="progress-stats">
          <div class="stat-row">
            <span class="stat-label">已采集:</span>
            <span class="stat-value"
              >{{ collectionProgress.currentPoints.toLocaleString() }} 点</span
            >
          </div>
          <div class="stat-row">
            <span class="stat-label">速率:</span>
            <span class="stat-value">{{ pointsPerSecond.toLocaleString() }} 点/秒</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">剩余:</span>
            <span class="stat-value">{{ collectionProgress.remainingTime }} 秒</span>
          </div>
        </div>
      </div>

      <!-- 将按钮和统计信息放在 three-container 内部 -->
      <div class="overlay-controls">
        <button class="back-btn" @click="goBack" aria-label="Back">
          <img src="@/assets/img/back.png" alt="返回" />
        </button>

        <!-- <button @click="openSaveDialog" class="save-btn" :disabled="saving "> -->

        <!-- <button @click="handleOverivew" class="preview-btn" > -->
        <button @click="handleOverivew" class="preview-btn" :disabled="saving || !enableSave">
          预览
        </button>
        <button class="stitch-btn" :disabled="saving || !enableSave || isStitching">
          {{ isStitching ? stitchProgressText || '拼接中...' : '拼接' }}
        </button>
        <button @click="openSaveDialog" class="save-btn" :disabled="saving || !enableSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>

        <div class="right-button-group">
          <img src="@/assets/img/edit.png" class="editIcon" @click="handleEditClick" alt="编辑" />
          <button
            class="capture-btn"
            :disabled="bluetoothStore.connectionStatus !== 2 || isCollecting.value"
            @click="startDataStream"
          ></button>
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
        <!-- <button v-if="isDev" class="debug-memory-btn" @click="showMemoryStats">内存</button> -->

        <!-- 保存对话框 -->
        <div v-if="showSaveDialog" class="save-dialog-overlay">
          <div class="save-dialog-content">
            <div class="save-dialog-card">
              <h3>完成</h3>
              <label>项目名称</label>
              <input
                ref="saveInput"
                v-model="projectName"
                placeholder="输入项目名称"
                maxlength="10"
              />
              <div class="save-actions">
                <button @click="confirmSave" :disabled="saving">保存</button>
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
defineOptions({
  name: 'PointCloudView',
})

import {
  ref,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  watch,
  nextTick,
  onActivated,
  onDeactivated,
  computed,
} from 'vue'
import { useRouter, onBeforeRouteLeave, useRoute } from 'vue-router'
import { useBluetoothStore } from '@/stores/bluetooth'
import { useFoldersStore } from '@/stores/folders'
import { useKeepAliveStore } from '@/stores/keepAlive'
import { usePointCloudRenderer } from '@/composables/usePointCloudRenderer/index.js'
import { StatusBar } from '@capacitor/status-bar'
import { setImmersive } from '@/utils/device/immersive'
import { bluetoothService } from '@/services/bluetooth'
import cameraHelper from '@/utils/device/camera'
import { parseBleData } from '@/utils/format/bleProtocol'
import { NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/bluetooth'
import { App } from '@capacitor/app'
// 导入全局日志工具
import { createLogger } from '@/utils/logger'
// 导入多站点支持
import * as THREE from 'three'
import { stations } from '@/config/pointCloudStations.js'
import { loadAllStations, loadStation } from '@/utils/pointCloudLoader.js'

// 创建点云页面专用日志记录器
const logger = createLogger('PointCloudView')
import {
  lockToLandscape,
  lockToPortrait,
  unlockOrientation,
  enableScreenKeepAwake,
  disableScreenKeepAwake,
} from '@/utils/device/screen'

import * as storage from '@/api/pointCloudStorage'
import PtcrPlugin from '@/plugins/ptcr'
import HLMRFPlugin from '@/plugins/hlmrf'
import { HLMRF_OUTPUT, HLMRF_STITCH } from '@/config/hlmrf'
import { setPanoramaCache } from '@/utils/panoramaCache'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { generateOptimizedSessionId } from '@/utils/format/sessionId'
import { Filesystem, Directory, FilesystemEncoding } from '@capacitor/filesystem'

// ==============================================
// 路由和状态管理
// ==============================================
const router = useRouter()
const route = useRoute()
const bluetoothStore = useBluetoothStore()
const folderStore = useFoldersStore()
const keepAliveStore = useKeepAliveStore()

// ==============================================
// 响应式状态
// ==============================================
const container = ref(null)
const pointCount = ref(0)
const frameRate = ref(0)
const showSaveDialog = ref(false)
const projectName = ref('')
const saving = ref(false)
const enableSave = ref(false)
const isCollecting = ref(false)
const isRendererReady = ref(false)
const saveInput = ref(null)
const dataBatchCounter = ref(0)
const lastSavedFolder = ref('')
const savedDuringDialog = ref(false)

const isStitching = ref(false)
const stitchProgressText = ref('')

// 当前批次数据
let currentBatchData = { rawLines: [], photos: [], pointCount: 0 }

// 当前会话ID
let currentSessionId = null

// 当前项目实际文件夹名（磁盘上的文件夹名，如 MyProject_abc123）
let currentFolderName = null

// 渲染器实例
let renderer = null

// 蓝牙数据解析器
let parser = null

// 点云数据缓冲区
const accumulationBuffer = []
const MAX_BUFFER_SIZE = 10000 // 缓冲区上限   超过就丢弃
const MAX_POINTS_PER_BATCH = 100000 // 单个点位最大点云数

// 延迟渲染相关状态
const deferredRenderBuffer = [] // 延迟渲染缓冲区（采集期间暂存所有点数据）
let backgroundRenderTask = null // 后台渲染任务标识（rAF ID 或 setTimeout ID）
let isBackgroundRendering = false // 后台渲染是否正在运行
const BACKGROUND_RENDER_CHUNK = 2000 // 每帧渲染点数
/**
 * setInterval定时器，每33检查一次缓冲区====缓冲区最多10000个点，超出这个上限时，丢弃缓冲区中旧的点数据
 * 如果正在采集 && 缓冲区至少有3个点
 * 则批量取出数据（最多1000个）
 * 一次性渲染到threejs
 */
// 积累定时器
let accumulationTimer = null
const ACCUMULATION_INTERVAL = 33
const MIN_BATCH_SIZE = 3 //  进行渲染一次最少需要点数
let pauseListener = null
let resumeListener = null
let hasStarted = false

let disconnectUnregister = null

// 记录进入后台前的采集状态
const isNavigating = ref(false)
// 批次按钮状态
const batchButtons = ref([]) // 存储已经生成的点位序号

// 批次变化注销函数
let unsubscribeBatchChange = null
let _hasCleaned = false

// init() 中 setTimeout 的定时器 ID，用于取消未执行的初始化
let initTimeoutId = null
// 组件是否已卸载的标志，防止异步初始化在卸载后执行
let isUnmounted = false

// 开发环境标志
// const isDev = ref(import.meta.env.DEV)
const isDev = true

// ==============================================
// 多站点显示相关状态
// ==============================================
let anchorSprites = [] // 锚点精灵数组
const raycaster = new THREE.Raycaster() // 射线检测器
const mouse = new THREE.Vector2() // 鼠标位置
let _hlmrfClickRegistered = false // 是否已注册HLMRF锚点点击事件

// ==============================================
// 采集进度相关状态
// ==============================================
const collectionProgress = ref({
  isCollecting: false,
  currentPoints: 0,
  scanTimeSeconds: 30, // 从设备读取的扫描时间，默认30秒
  elapsedTime: 0, // 已采集时间（秒）
  remainingTime: 0, // 剩余时间（秒）
})

// 倒计时定时器
let countdownTimer = null

// 是否已获取扫描时间
const hasScanTime = ref(false)

// ==============================================
// 辅助函数
// ==============================================

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

  logger.debug('Memory Stats', stats)

  showToast({
    message: `点数: ${stats.currentPointCount}\n内存: ${totalMB}MB\n使用率: ${stats.utilizationRate}%`,
    position: 'bottom',
    duration: 3000,
  })
}

/**
 * 判断是否真的是离开会话页面（返回主页）
 */
function isLeavingSession(to) {
  // 如果跳转到 BatchDetail，不是离开
  if (to.name === 'BatchDetail') return false

  // 如果跳转到主页，是离开
  if (to.name === 'MainView') return true

  // 如果路由深度变小（返回上一级），且上一级是主页，也是离开
  const currentDepth = router.currentRoute.value.matched.length
  const targetDepth = to.matched.length
  if (targetDepth < currentDepth && to.name === 'MainView') {
    return true
  }

  return false
}

// ==============================================
// 导航相关函数
// ==============================================

/**
 * 处理返回操作
 * 触发路由返回并确保导航状态正确管理
 */
const goBack = async () => {
  // 防止重复触发
  if (isNavigating.value) {
    return
  }

  try {
    // 设置导航状态
    isNavigating.value = true

    // 立即开始路由返回
    await router.back()
  } catch (error) {
    showToast({ message: '返回失败', position: 'bottom' })
  } finally {
    // 重置导航状态
    setTimeout(() => {
      isNavigating.value = false
    }, 100)
  }
}

/**
 * 跳转到预览页面
 */
const handleOverivew = () => {
  let testID = 1
  router.push({ name: 'BatchDetail', params: { currentSessionId: currentSessionId, bid: testID } })
}

/**
 * 跳转到点位详情页面
 * @param {number} idx - 点位索引
 */
function goToBatch(idx) {
  // 检查是否正在采集中
  if (isCollecting.value) {
    showToast({ message: '正在采集中...', position: 'bottom' })
    return
  }

  if (!currentSessionId) return
  const bid = idx + 1
  router.push({ name: 'BatchDetail', params: { currentSessionId: currentSessionId, bid } })
}

/**
 * 打开保存对话框
 */
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
      if (saveInput.value && typeof saveInput.value.focus === 'function') {
        saveInput.value.focus()
      }
    } catch (e) {
      logger.warn('focus failed', e)
    }
  })
}

/**
 * 关闭保存对话框
 */
const closeSaveDialog = async () => {
  showSaveDialog.value = false
}

/**
 * 确认保存操作
 */
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
    showLoadingToast({
      message: '保存中...',
      forbidClick: true,
    })
    // 执行保存操作（非阻塞）
    performSave(folderName).finally(() => {
      // 保存完成后关闭加载提示
      // 立即执行返回操作
      closeToast()
      router.back()
    })

    // Todo  后续完成之后上传云端，不允许再次继续采集站位数据，只能查看
  } catch (error) {
    closeToast()
    showToast({
      message: '保存失败',
      position: 'bottom',
    })
    router.back()
  }
}

// ==============================================
// 数据管理函数
// ==============================================

/**
 * 加载现有批次按钮（如果存在）
 */
async function loadBatchButtons() {
  if (!currentSessionId) return
  let folderToLoad
  if (currentFolderName) {
    folderToLoad = currentFolderName
  } else if (savedDuringDialog.value) {
    folderToLoad = currentSessionId
  } else {
    folderToLoad = storage.path.getTempSessionName(currentSessionId)
  }
  try {
    const list = await storage.batch.list(folderToLoad)
    batchButtons.value = list.map((_, idx) => idx + 1)
    dataBatchCounter.value = batchButtons.value.length
  } catch (e) {
    logger.warn('[PointCloud] loadBatchButtons 失败', e)
    batchButtons.value = []
  }
}

/**
 * 重置为新项目
 */
function resetForNewProject() {
  dataBatchCounter.value = 0
  batchButtons.value = []
  currentBatchData = { rawLines: [], photos: [], pointCount: 0 }
  currentFolderName = null
  enableSave.value = false
  cleanupMultiStationResources()
  if (renderer && typeof renderer.resetPointCloud === 'function') {
    renderer.resetPointCloud()
    pointCount.value = 0
  }
}

/**
 * 重置为新点位
 */
function resetForNewBatch() {
  currentBatchData = { rawLines: [], photos: [], pointCount: 0 }
  clearAccumulationBuffer()
  deferredRenderBuffer.length = 0
  if (renderer && typeof renderer.resetPointCloud === 'function') {
    renderer.resetPointCloud()
    pointCount.value = 0
  }
}

/**
 * 保存当前点位数据
 *
 * 根据采集过程中实际接收到的数据格式自动选择文件头：
 * - 仅XYZ:    x(m) y(m) z(m)
 * - 含极坐标: x(m) y(m) z(m) pitchDeg(Deg) yawDeg(Deg) distance(m)
 */
async function saveCurrentBatch() {
  if (!currentSessionId) return

  const bid = dataBatchCounter.value
  if (currentBatchData.rawLines.length === 0 && currentBatchData.photos.length === 0) {
    return
  }

  try {
    const saveFolderName = currentFolderName || storage.path.getTempSessionName(currentSessionId)

    // 根据实际数据格式动态选择文件头（而非写死6列）
    const header = currentBatchData.hasPolarData
      ? 'x(m) y(m) z(m) pitchDeg(Deg) yawDeg(Deg) distance(m)'
      : 'x(m) y(m) z(m)'
    const linesWithHeader = [header, ...currentBatchData.rawLines]

    await storage.batch.save(saveFolderName, bid, linesWithHeader, currentBatchData.photos)
    logger.debug(
      '[PointCloud] 点位保存成功',
      bid,
      '点云行数:',
      linesWithHeader.length - 1,
      '照片数:',
      currentBatchData.photos.length,
      '格式:',
      currentBatchData.hasPolarData ? 'XYZ+极坐标(6列)' : 'XYZ(3列)',
    )

    currentBatchData = { rawLines: [], photos: [], pointCount: 0, hasPolarData: false }
  } catch (e) {
    logger.error('[PointCloud] saveCurrentBatch error', e)
    throw e
  }
}

/**
 * 保存整个项目（重命名会话文件夹）
 * @param {string} folderName - 目标文件夹名    `${name}_${currentSessionId}` 或者 currentSessionId
 * @returns {Promise} - 保存操作的 Promise
 */
function performSave(folderName) {
  logger.debug('====folderName', folderName)
  return new Promise(async (resolve, reject) => {
    saving.value = true
    try {
      // 如果是从已有项目进入（currentFolderName 已存在且非临时文件夹），跳过重命名
      if (currentFolderName && !storage.path.isTempSession(currentFolderName)) {
        let targetName
        if (folderName && folderName !== currentSessionId) {
          targetName = folderName
          if (currentFolderName !== targetName) {
            await storage.session.rename(currentFolderName, targetName)
            currentFolderName = targetName
          }
        } else {
          targetName = currentFolderName
        }
        showToast({ message: '保存成功', position: 'bottom' })
        savedDuringDialog.value = true
        lastSavedFolder.value = targetName
        resolve()
        return
      }

      const tempName = storage.path.getTempSessionName(currentSessionId)
      // 确定目标文件夹名
      let targetName
      if (folderName && folderName !== currentSessionId) {
        // 用户有自定义项目名称
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
          // 事件已在 renameSession 内部派发，无需外部处理
          logger.debug('[PointCloud] 项目重命名完成')
        }
      } catch (e) {
        logger.warn('[PointCloud] 临时文件夹不存在', tempName)
      }
      currentFolderName = targetName
      showToast({
        message: '保存成功',
        position: 'bottom',
      })
      savedDuringDialog.value = true
      lastSavedFolder.value = targetName
      resolve()
    } catch (error) {
      logger.error('保存失败:', error)
      showToast({
        message: `保存失败：${error.message || '未知错误'}`,
        position: 'bottom',
      })
      reject(error)
    } finally {
      saving.value = false
    }
  })
}

/**
 * 删除临时会话目录
 */
const delSessionDir = async () => {
  // 防止重复执行
  if (isDeletingSession) return
  if (!savedDuringDialog.value && currentSessionId && currentSessionId !== lastSavedFolder.value) {
    isDeletingSession = true
    try {
      const folderToDelete = storage.path.getTempSessionName(currentSessionId)
      await storage.session.delete(folderToDelete)
      logger.debug('[Pointcloud] 未保存会话，已删除目录', folderToDelete)
    } catch (e) {
      logger.warn('[Pointcloud] 删除未保存会话失败', e)
    } finally {
      isDeletingSession = false
    }
  }
}

let isDeletingSession = false

async function getDataDir() {
  if (currentFolderName) {
    return currentFolderName
  }
  if (savedDuringDialog.value && lastSavedFolder.value) {
    return lastSavedFolder.value
  }
  return storage.path.getTempSessionName(currentSessionId)
}

function getCurrentBatchNo() {
  const idx = dataBatchCounter.value - 1
  return String(Math.max(0, idx)).padStart(3, '0')
}

async function parseAndRenderTxt(txtRelPath) {
  const readResult = await Filesystem.readFile({
    path: txtRelPath,
    directory: Directory.External,
    encoding: FilesystemEncoding.UTF8,
  })
  if (!readResult || !readResult.data) {
    throw new Error('文件读取返回空数据')
  }
  const rawText = readResult.data
  const lines = rawText.trim().split('\n')
  const firstLineMatch = lines[0].match(/[a-zA-Z]/)
  const points = []
  const startLine = firstLineMatch ? 1 : 0
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length >= 3) {
      points.push({
        x: parseFloat(parts[0]),
        y: parseFloat(parts[1]),
        z: parseFloat(parts[2]),
      })
    }
  }
  if (points.length > 0 && renderer) {
    renderer.resetPointCloud()
    renderer.addPoints(points)
    pointCount.value = points.length
  }
}

async function findFirstBatchTxt(folderName) {
  const batchDir = `${storage.path.sessionFolder(folderName)}/Batch_000`
  try {
    const { files } = await Filesystem.readdir({
      path: batchDir,
      directory: Directory.External,
    })
    const txtFile = files.find(
      (f) => f.type === 'file' && f.name.startsWith('pointCloud_data_') && f.name.endsWith('.txt'),
    )
    if (txtFile) {
      return `${batchDir}/${txtFile.name}`
    }
  } catch (_) {}
  return null
}

async function loadAndRenderProjectData(folderName) {
  showLoadingToast({ message: '加载点云中...', forbidClick: false })

  try {
    const alignedPath = await storage.stitch.findLatestAlignedBlock(folderName)
    if (alignedPath) {
      logger.info(`[PointCloud] 查看模式 - 加载拼接结果文件: ${alignedPath}`)
      await parseAndRenderTxt(alignedPath)
      logger.info(`[PointCloud] 查看模式 - 渲染点云数量: ${pointCount.value}`)
      closeToast()
      return
    }

    const firstBatchPath = await findFirstBatchTxt(folderName)
    if (firstBatchPath) {
      logger.info(`[PointCloud] 查看模式 - 无拼接结果，降级加载原始点云文件: ${firstBatchPath}`)
      await parseAndRenderTxt(firstBatchPath)
      logger.info(`[PointCloud] 查看模式 - 渲染点云数量: ${pointCount.value}`)
      closeToast()
      return
    }

    closeToast()
    logger.info('[PointCloud] 查看模式 - 该项目暂无点云数据')
    showToast({ message: '该项目暂无点云数据，可开始采集', position: 'bottom', duration: 3000 })
  } catch (e) {
    closeToast()
    logger.error('[PointCloud] 加载项目数据失败', e)
    showToast({ message: '加载点云数据失败', position: 'bottom' })
  }
}

// ==============================================
// 自动拼接算法相关函数
// ==============================================

/**
 * 触发自动拼接（拍照完成后调用）
 */
async function triggerAutoStitch() {
  setTimeout(async () => {
    try {
      console.log('\n')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[AutoStitch] 🚀 开始自动拼接算法')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[AutoStitch] ⏰ 时间:', new Date().toLocaleString('zh-CN'))
      console.log('[AutoStitch] 📍 当前点位:', dataBatchCounter.value)
      console.log('═══════════════════════════════════════════════════════\n')

      // 1. 获取数据目录
      const dataDir = await getDataDir()
      const batchNo = getCurrentBatchNo()

      console.log('[AutoStitch] 📂 拼接参数:')
      console.log('   ├─ dataDir:', dataDir)
      console.log('   └─ batchNo:', batchNo)

      const batchFolder = storage.path.batchFolder(dataDir, parseInt(batchNo))
      const photoDir = `${batchFolder}/allPicture`

      console.log('\n[AutoStitch] 📁 完整路径:')
      console.log('   ├─ 批次目录:', batchFolder)
      console.log('   └─ 照片目录:', photoDir)

      // 2. 检查输入文件
      console.log('\n[AutoStitch] 🔍 开始检查输入文件...')
      await checkInputFiles(dataDir, batchNo)

      // 3. 诊断插件健康状况
      console.log('\n[AutoStitch] 🔬 诊断 PtcrPlugin...')
      const diagResult = await debugCheckPlugin()
      if (!diagResult.ok) {
        console.error('[AutoStitch] ❌ 插件不可用，跳过拼接')
        isStitching.value = false
        showToast({
          message: `PtcrPlugin 不可用: ${diagResult.error}`,
          position: 'bottom',
          duration: 5000,
        })
        return
      }
      console.log('[AutoStitch] ✅ PtcrPlugin 已就绪\n')
      console.log('   ├─ Python:', diagResult.detail.python)
      console.log('   ├─ 脚本目录:', diagResult.detail.scripts)
      console.log('   └─ ONNX模型:', diagResult.detail.onnx)
      console.log('')

      // 4. 显示 UI 进度提示
      isStitching.value = true
      stitchProgressText.value = '准备中...'

      // 5. 设置进度监听器
      let progressHandle = null
      const progressHandler = (event) => {
        console.log('───────────────────────────────────────────────────')
        console.log(`[AutoStitch] 📊 进度更新: ${event.stage}`)
        console.log(`   ├─ 任务: ${event.task}`)
        console.log(`   └─ 消息: ${event.message}`)
        console.log('───────────────────────────────────────────────────')

        stitchProgressText.value = `${event.stage}: ${event.message}`

        if (event.stage === 'finish') {
          console.log('[AutoStitch] ✅ 拼接任务完成')
        } else if (event.stage === 'error') {
          console.error(`[AutoStitch] ❌ 拼接任务失败: ${event.message}`)
        }
      }

      try {
        progressHandle = await PtcrPlugin.addListener('ptcrProgress', progressHandler)
      } catch (e) {
        console.warn('[AutoStitch] ⚠️ 无法注册进度监听器:', e.message)
      }

      // 6. 选择生成算法
      //    修改下面 method 变量即可切换: 'cloud0' | 'raw' | 'standard'
      //    cloud0:    无 ONNX 深度估计，稀疏彩色点云（最快 ~30s），输出 ply_raw.ply
      //    raw:       ONNX 深度估计(raw)，密集彩色点云（~70s），输出 fused_raw.ply
      //    standard:  ONNX 深度估计(standard)+垂直矫正，高质量密集彩色点云（~151s），输出 fused_standard.ply
      const method = 'cloud0'

      let result
      let startTime

      if (method === 'cloud0') {
        console.log('\n[AutoStitch] 🚀 调用 generateCloud0()...')
        console.log('[AutoStitch] 配置参数:', { dataDir, batchNo })
        startTime = Date.now()
        result = await PtcrPlugin.generateCloud0({ dataDir, batchNo })
      } else if (method === 'raw') {
        console.log('\n[AutoStitch] 🚀 调用 generateCloudByRaw()...')
        console.log('[AutoStitch] 配置参数:', { dataDir, batchNo })
        startTime = Date.now()
        result = await PtcrPlugin.generateCloudByRaw({ dataDir, batchNo })
      } else if (method === 'standard') {
        console.log('\n[AutoStitch] 🚀 调用 generateCloudByStandard()...')
        console.log('[AutoStitch] 配置参数:', { dataDir, batchNo })
        startTime = Date.now()
        result = await PtcrPlugin.generateCloudByStandard({ dataDir, batchNo })
      }

      const elapsed = Date.now() - startTime

      // 7. 处理结果
      console.log('\n')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[AutoStitch] 📦 算法返回结果')
      console.log('═══════════════════════════════════════════════════════')
      console.log('   ├─ ok:', result.ok ? '✅ 成功' : '❌ 失败')
      console.log('   ├─ task:', result.task)
      console.log(
        '   ├─ 算法耗时:',
        result.elapsedMs,
        'ms',
        `(${(result.elapsedMs / 1000).toFixed(1)}s)`,
      )
      console.log('   ├─ JS 调用耗时:', elapsed, 'ms', `(${(elapsed / 1000).toFixed(1)}s)`)
      console.log('   ├─ outputFile:', result.outputFile || '(无)')
      console.log('   ├─ error:', result.error || '(无)')
      console.log('   └─ log 长度:', result.log?.length || 0, '字符')
      console.log('═══════════════════════════════════════════════════════\n')

      if (result.ok) {
        console.log('[AutoStitch] 🎉 拼接成功！')

        if (result.outputFile) {
          await checkOutputFiles(result.outputFile, dataDir, batchNo, method)
        }

        if (result.log) {
          console.log('\n[AutoStitch] 📜 完整日志内容:')
          console.log('───────────────────────────────────────────────────')
          console.log(result.log)
          console.log('───────────────────────────────────────────────────\n')
        }

        isStitching.value = false
        stitchProgressText.value = '拼接完成'

        preCachePanorama(dataDir, batchNo, method)

        showToast({
          message: '全景图生成成功',
          position: 'bottom',
          duration: 2000,
        })
      } else {
        console.error('[AutoStitch] ❌ 拼接失败')
        console.error('   ├─ 错误:', result.error)
        console.error('   └─ 日志:', result.log)

        isStitching.value = false
        stitchProgressText.value = '拼接失败'

        showToast({
          message: `拼接失败: ${result.error || '未知错误'}`,
          position: 'bottom',
          duration: 3000,
        })
      }
    } catch (error) {
      console.error('\n')
      console.error('═══════════════════════════════════════════════════════')
      console.error('[AutoStitch] ❌ 异常')
      console.error('═══════════════════════════════════════════════════════')
      console.error('   ├─ 错误:', error.message)
      console.error('   └─ 堆栈:', error.stack)

      if (error.message && error.message.includes('not implemented on android')) {
        console.error('')
        console.error('🔧 解决方案: 需要重新构建 APK 并安装到手机')
        console.error('   cd e:\\scanAndroid\\scan\\android')
        console.error('   rd /s /q app\\build')
        console.error('   .\\gradlew.bat assembleDebug --no-daemon')
        console.error('   adb install -r app\\build\\outputs\\apk\\debug\\app-debug.apk')
      }

      console.error('═══════════════════════════════════════════════════════\n')

      isStitching.value = false
      stitchProgressText.value = '拼接异常'

      showToast({
        message: 'PtcrPlugin 未安装到手机，请重新构建 APK',
        position: 'bottom',
        duration: 5000,
      })
    }
  }, 2000)
}

async function triggerHLMRFRegistration() {
  setTimeout(async () => {
    try {
      const dataDir = await getDataDir()
      const currentIdx = parseInt(getCurrentBatchNo())

      if (currentIdx < 1) {
        logger.info('[HLMRF] 首个站位，无需拼接，在原点创建锚点')

        updateHLMRFAnchors([{ batchNo: 1, x: 0, y: 0, z: 0 }])
        return
      }

      const previousIdx = currentIdx - 1
      const prevNo = String(previousIdx).padStart(3, '0')
      const currNo = String(currentIdx).padStart(3, '0')

      const currentBatchFolder = storage.path.batchFolder(dataDir, currentIdx)
      const previousBatchFolder = storage.path.batchFolder(dataDir, previousIdx)

      console.log('\n')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[HLMRF] ===== 开始 HLMRF 多站点拼接 =====')
      console.log('═══════════════════════════════════════════════════════')
      console.log(`[HLMRF]   当前批次: Batch_${currNo}`)
      console.log(`[HLMRF]   上一批次: Batch_${prevNo}`)
      console.log(`[HLMRF]   当前批次目录: ${currentBatchFolder}`)
      console.log(`[HLMRF]   上一批次目录: ${previousBatchFolder}`)

      const { files: currentFiles } = await storage.file.readDir(currentBatchFolder)
      const currentPointCloudFile = currentFiles.find(
        (f) =>
          f.type === 'file' &&
          f.name.startsWith('pointCloud_data_') &&
          f.name.endsWith('.txt'),
      )
      if (!currentPointCloudFile) {
        logger.warn('[HLMRF] 当前批次无点云文件，跳过拼接')
        return
      }
      console.log(`[HLMRF]   当前批次点云文件: ${currentPointCloudFile.name}`)

      const stitchDir = `${currentBatchFolder}/${HLMRF_STITCH.STITCH_DIR}`
      const stitchInputDir = `${stitchDir}/${HLMRF_STITCH.INPUT_DIR}`
      const stitchOutputDir = `${stitchDir}/${HLMRF_STITCH.OUTPUT_DIR}`

      await storage.file.ensureDir(stitchInputDir)
      await storage.file.ensureDir(stitchOutputDir)

      console.log(`[HLMRF]   stitch_input: ${stitchInputDir}`)
      console.log(`[HLMRF]   stitch_output: ${stitchOutputDir}`)

      const { copyFile } = await import('@/services/storage/fileSystem')

      const currentSource = `${currentBatchFolder}/${currentPointCloudFile.name}`
      const currentDest = `${stitchInputDir}/${currentPointCloudFile.name}`
      await copyFile(currentSource, currentDest)
      console.log(`[HLMRF]   已复制当前批次点云: ${currentPointCloudFile.name}`)

      const previousStitchOutput =
        `${previousBatchFolder}/${HLMRF_STITCH.STITCH_DIR}/${HLMRF_STITCH.OUTPUT_DIR}`
      const previousDenseCloudPath =
        `${previousStitchOutput}/${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`

      let previousDenseCloudExists = false
      try {
        await storage.file.stat(previousDenseCloudPath)
        previousDenseCloudExists = true
      } catch (_) {}

      if (previousDenseCloudExists) {
        const prevDest = `${stitchInputDir}/${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`
        await copyFile(previousDenseCloudPath, prevDest)
        console.log(`[HLMRF]   已复制上一批次拼接结果: ${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`)
      } else {
        const { files: prevFiles } = await storage.file.readDir(previousBatchFolder)
        const prevPointCloudFile = prevFiles.find(
          (f) =>
            f.type === 'file' &&
            f.name.startsWith('pointCloud_data_') &&
            f.name.endsWith('.txt'),
        )
        if (!prevPointCloudFile) {
          logger.warn('[HLMRF] 上一批次无点云文件，跳过拼接')
          return
        }
        const prevSource = `${previousBatchFolder}/${prevPointCloudFile.name}`
        const prevDest = `${stitchInputDir}/${prevPointCloudFile.name}`
        await copyFile(prevSource, prevDest)
        console.log(`[HLMRF]   已复制上一批次原始点云: ${prevPointCloudFile.name}`)
      }

      console.log('[HLMRF]   调用 HLMRFPlugin.runRegistration...')

      const result = await HLMRFPlugin.runRegistration({
        inputDir: stitchInputDir,
        outputDir: stitchOutputDir,
      })

      console.log('\n')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[HLMRF] ===== 拼接结果 =====')
      console.log('═══════════════════════════════════════════════════════')
      console.log('    ok:', result.ok)
      console.log('    outputDir:', result.outputDir)
      console.log('    alignedPointCloudPath:', result.alignedPointCloudPath || '(无)')
      console.log('    alignedBlockPath:', result.alignedBlockPath || '(无)')
      console.log('═══════════════════════════════════════════════════════\n')

      if (result.ok) {
        const denseCloudPath = `${stitchOutputDir}/${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`
        try {
          await parseAndRenderTxt(denseCloudPath)
          const renderedCount = pointCount.value
          logger.info(`[HLMRF] 渲染完成: ${renderedCount} 个点`)
          showToast({
            message: `多站点拼接完成 (Batch_${currNo}), ${renderedCount.toLocaleString()} 点`,
            position: 'bottom',
            duration: 3000,
          })
        } catch (renderError) {
          logger.error('[HLMRF] 渲染拼接结果失败:', renderError.message)
          showToast({
            message: `拼接完成但渲染失败: ${renderError.message}`,
            position: 'bottom',
            duration: 5000,
          })
        }

        const positions = await readGlobalPosesFromStitch(stitchOutputDir)
        if (positions.length > 0) {
          updateHLMRFAnchors(positions)
        }
      } else {
        showToast({
          message: '多站点拼接失败',
          position: 'bottom',
          duration: 3000,
        })
      }
    } catch (error) {
      logger.error('[HLMRF] 拼接异常:', error.message)
      console.error('[HLMRF] 堆栈:', error.stack)
      showToast({
        message: `HLMRF 拼接异常: ${error.message || '未知错误'}`,
        position: 'bottom',
        duration: 5000,
      })
    }
  }, 2000)
}

/**
 * 检查输入文件是否存在
 */
async function checkInputFiles(dataDir, batchNo) {
  const batchFolder = storage.path.batchFolder(dataDir, parseInt(batchNo))
  const photoDir = `${batchFolder}/allPicture`

  console.log('[AutoStitch] 📂 检查输入文件...')
  console.log('   ├─ 批次目录:', batchFolder)
  console.log('   └─ 照片目录:', photoDir)

  try {
    const batchDirExists = await storage.file.exists(batchFolder)
    console.log(
      `[AutoStitch] ${batchDirExists ? '✅' : '❌'} 批次目录: ${batchDirExists ? '存在' : '不存在'}`,
    )

    if (batchDirExists) {
      const { files: entries } = await storage.file.readDir(batchFolder)
      console.log('[AutoStitch] 📋 批次目录文件列表:')
      entries.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.type === 'directory' ? '📁' : '📄'} ${f.name}`)
      })

      const pointCloudFiles = entries.filter(
        (f) =>
          f.type === 'file' && f.name.startsWith('pointCloud_data_') && f.name.endsWith('.txt'),
      )

      if (pointCloudFiles.length > 0) {
        console.log(`[AutoStitch] ✅ 找到 ${pointCloudFiles.length} 个点云文件:`)
        pointCloudFiles.forEach((f, i) => {
          const sizeKb = (f.size / 1024).toFixed(1)
          const isEmpty = f.size < 200
          const flag = isEmpty ? '⚠️ 数据为空' : '✅'
          console.log(`   ${i + 1}. ${f.name} (${sizeKb} KB) ${flag}`)
          if (isEmpty && i === 0) {
            console.log(`[AutoStitch] ⚠️ 激光点云数据为空！仅含表头，蓝牙可能未传数据`)
            console.log(`[AutoStitch]    算法仍会继续，但将生成空点云（无有效深度点）`)
          }
        })
      } else {
        console.log('[AutoStitch] ❌ 未找到点云文件 (pointCloud_data_*.txt)')
      }
    } else {
      console.log('[AutoStitch] ❌ 批次目录不存在')
    }

    console.log('')
    const photoDirExists = await storage.file.exists(photoDir)
    console.log(
      `[AutoStitch] ${photoDirExists ? '✅' : '❌'} 照片目录: ${photoDirExists ? '存在' : '不存在'}`,
    )

    if (photoDirExists) {
      const { files: entries } = await storage.file.readDir(photoDir)
      const photoFiles = entries.filter(
        (f) =>
          f.type === 'file' &&
          (f.name.endsWith('.jpg') || f.name.endsWith('.png') || f.name.endsWith('.jpeg')),
      )

      console.log(`[AutoStitch] 📷 照片文件: ${photoFiles.length} 张`)

      if (photoFiles.length > 0) {
        console.log('   前 5 张:')
        photoFiles.slice(0, 5).forEach((f, i) => {
          console.log(`   ${i + 1}. ${f.name} (${(f.size / 1024).toFixed(1)} KB)`)
        })
        if (photoFiles.length > 5) {
          console.log(`   ... 还有 ${photoFiles.length - 5} 张`)
        }
      } else {
        console.log('[AutoStitch] ⚠️ 照片目录为空')
      }
    } else {
      console.log('[AutoStitch] ❌ 照片目录不存在')
    }

    console.log('')
  } catch (error) {
    console.error('[AutoStitch] ❌ 检查文件失败:', error.message)
    console.error('   堆栈:', error.stack)
  }
}

/**
 * 检查输出文件
 */
async function preCachePanorama(dataDir, batchNo, method) {
  const batchFolder = storage.path.batchFolder(dataDir, parseInt(batchNo))
  const panoNames =
    method === 'standard'
      ? ['pano_standard.png', 'pano_raw.png']
      : ['pano_raw.png', 'pano_standard.png']

  for (const panoName of panoNames) {
    try {
      const panoPath = `${batchFolder}/ptcr_output/${panoName}`
      const readResult = await Filesystem.readFile({
        path: panoPath,
        directory: Directory.External,
      })
      if (readResult?.data) {
        const dataUri = `data:image/png;base64,${readResult.data}`
        setPanoramaCache(panoPath, dataUri)
        console.log(
          `[AutoStitch] 🚀 已预缓存全景图 (${(readResult.data.length / 1024).toFixed(0)} KB base64)`,
        )
        return
      }
    } catch (e) {}
  }
  console.warn('[AutoStitch] 预缓存全景图失败（不影响功能）')
}

async function checkOutputFiles(outputFile, dataDir, batchNo, method) {
  console.log('[AutoStitch] 📦 检查输出文件...')

  const batchFolder = storage.path.batchFolder(dataDir, parseInt(batchNo))
  const outputDir = `${batchFolder}/ptcr_output`

  const plyFileName =
    method === 'raw'
      ? 'fused_raw.ply'
      : method === 'standard'
        ? 'fused_standard.ply'
        : 'ply_raw.ply'
  const panoFileName = method === 'standard' ? 'pano_standard.png' : 'pano_raw.png'

  const outputPath = `${outputDir}/${plyFileName}`

  console.log(`   ├─ 算法报告路径: ${outputFile}`)
  console.log(`   └─ 实际检查路径: ${outputPath}`)

  try {
    const exists = await storage.file.exists(outputPath)
    console.log(`[AutoStitch] ${exists ? '✅' : '❌'} 主输出文件: ${exists ? '存在' : '不存在'}`)

    if (exists) {
      const stat = await storage.file.stat(outputPath)
      const fileSize = stat.size ? `${(stat.size / 1024 / 1024).toFixed(2)} MB` : '未知'
      console.log(`   └─ 文件大小: ${fileSize}`)
    } else {
      console.log(`   ⚠️ 文件可能尚未刷新到磁盘，或算法报告路径有误`)
    }

    // 2. 检查工作目录
    const workDir = outputDir

    console.log('')
    const workDirExists = await storage.file.exists(workDir)
    console.log(
      `[AutoStitch] ${workDirExists ? '✅' : '❌'} 工作目录: ${workDirExists ? '存在' : '不存在'}`,
    )
    console.log('   └─ 路径:', workDir)

    if (workDirExists) {
      const { files: entries } = await storage.file.readDir(workDir)
      console.log('[AutoStitch] 📋 工作目录文件列表:')
      entries.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.type === 'directory' ? '📁' : '📄'} ${f.name}`)
      })

      console.log('')
      const keyFiles = [
        { name: panoFileName, desc: '全景图' },
        { name: 'depth_sparse_ref.png', desc: '稀疏深度图' },
        { name: plyFileName, desc: '点云文件' },
        { name: 'imgs/params.txt', desc: '相机参数' },
      ]

      console.log('[AutoStitch] 🔑 关键输出文件:')
      for (const file of keyFiles) {
        const filePath = `${workDir}/${file.name}`
        const fileExists = await storage.file.exists(filePath)

        if (fileExists) {
          const stat = await storage.file.stat(filePath)
          const fileSize = stat.size ? `${(stat.size / 1024).toFixed(1)} KB` : '未知'
          console.log(`   ✅ ${file.name} (${file.desc}): ${fileSize}`)

          if (file.name === 'params.txt') {
            try {
              const statResult = await storage.file.stat(filePath)
              console.log(`      └─ 文件大小: ${(statResult.size / 1024).toFixed(1)} KB`)
            } catch (e) {
              console.log(`      └─ 无法读取状态: ${e.message}`)
            }
          }
        } else {
          console.log(`   ❌ ${file.name} (${file.desc}): 不存在`)
        }
      }

      console.log('')
    } else {
      console.log('[AutoStitch] ⚠️ 工作目录不存在')
    }
  } catch (error) {
    console.error('[AutoStitch] ❌ 检查输出文件失败:', error.message)
  }
}

// ==============================================
// HLMRF 位姿解析与锚点渲染
// ==============================================

/**
 * 解析 global_poses.txt 内容，提取所有站位的设备采集坐标
 *
 * global_poses.txt 格式示例:
 *   1:
 *    1  0  0  0
 *    0  1  0  0
 *    0  0  1  0
 *    0  0  0  1
 *   2:
 *     0.918865  0.0448933   0.392009   -2.20237
 *    -0.0518019   0.998632 0.00705846  0.0179284
 *     -0.391156 -0.0267926   0.919934  -0.561387
 *             0          0          0          1
 *
 * 每个站位对应一个 4x4 变换矩阵，平移分量（设备坐标）在最后一列的前三行
 *
 * @param {string} content - global_poses.txt 文件内容
 * @returns {Array<{batchNo: number, x: number, y: number, z: number}>}
 */
function parseGlobalPosesContent(content) {
  const lines = content.trim().split('\n')
  const positions = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    const match = line.match(/^(\d+):$/)
    if (match) {
      const batchNo = parseInt(match[1])
      if (i + 4 <= lines.length) {
        const row1 = lines[i + 1].trim().split(/\s+/)
        const row2 = lines[i + 2].trim().split(/\s+/)
        const row3 = lines[i + 3].trim().split(/\s+/)

        if (row1.length >= 4 && row2.length >= 4 && row3.length >= 4) {
          positions.push({
            batchNo,
            x: parseFloat(row1[3]),
            y: parseFloat(row2[3]),
            z: parseFloat(row3[3]),
          })
        }
        i += 4
      }
    }
    i++
  }

  return positions
}

/**
 * 根据解析出的站位坐标更新 3D 场景中的锚点精灵
 * 首个站位在原点，后续站位根据位姿矩阵的平移分量定位
 *
 * @param {Array<{batchNo: number, x: number, y: number, z: number}>} positions
 */
function updateHLMRFAnchors(positions) {
  if (!renderer || !isRendererReady.value) return

  const scene = renderer.getScene()
  if (!scene) return

  anchorSprites.forEach((sprite) => {
    scene.remove(sprite)
    if (sprite.material && sprite.material.map) sprite.material.map.dispose()
    if (sprite.material) sprite.material.dispose()
  })
  anchorSprites = []

  if (container.value && !_hlmrfClickRegistered) {
    container.value.addEventListener('click', onContainerClick)
    _hlmrfClickRegistered = true
  }

  for (const pos of positions) {
    const sprite = createHLMRFAnchorSprite(pos.batchNo)
    sprite.position.set(pos.x, pos.y + 0.5, pos.z)
    sprite.scale.set(1.5, 1.5, 1)
    sprite.userData = { stationId: pos.batchNo - 1, isAnchor: true, isHLMRFAnchor: true }
    scene.add(sprite)
    anchorSprites.push(sprite)
  }

  console.log(
    `[HLMRF] 锚点更新完成: ${positions.length} 个站位`,
    positions.map((p) => `站${p.batchNo}(${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)})`),
  )
}

/**
 * 创建 HLMRF 站位锚点精灵
 * @param {number} batchNo - 站位编号（从1开始）
 * @returns {THREE.Sprite}
 */
function createHLMRFAnchorSprite(batchNo) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  ctx.beginPath()
  ctx.arc(32, 32, 28, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#2a7aff'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = '#000000'
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(batchNo), 32, 32)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
  })
  return new THREE.Sprite(material)
}

/**
 * 读取 stitch_output 目录下的 global_poses.txt 并解析为站位坐标
 * @param {string} stitchOutputDir - stitch_output 目录路径
 * @returns {Promise<Array<{batchNo: number, x: number, y: number, z: number}>>}
 */
async function readGlobalPosesFromStitch(stitchOutputDir) {
  const posesPath = `${stitchOutputDir}/${HLMRF_OUTPUT.GLOBAL_POSES_FILE}`

  try {
    await storage.file.stat(posesPath)
  } catch (_) {
    console.warn('[HLMRF] global_poses.txt 不存在:', posesPath)
    return []
  }

  const readResult = await Filesystem.readFile({
    path: posesPath,
    directory: Directory.External,
    encoding: FilesystemEncoding.UTF8,
  })

  if (!readResult || !readResult.data) {
    console.warn('[HLMRF] global_poses.txt 内容为空')
    return []
  }

  const positions = parseGlobalPosesContent(readResult.data)
  console.log(
    '[HLMRF] global_poses.txt 解析结果:',
    JSON.stringify(positions),
  )

  return positions
}

// ==============================================
// PtcrPlugin 诊断函数
// ==============================================

/**
 * 诊断 PtcrPlugin 是否完整可用
 * 可在控制台直接调用: debugCheckPlugin()
 */
async function debugCheckPlugin() {
  console.log('[PtcrDiag] 🔬 开始诊断 PtcrPlugin...')

  const result = {
    ok: false,
    error: null,
    detail: { python: '', scripts: '', onnx: '' },
  }

  try {
    if (!PtcrPlugin) {
      result.error = 'PtcrPlugin 未导入'
      console.error('[PtcrDiag] ❌', result.error)
      return result
    }

    console.log('[PtcrDiag] 📡 PtcrPlugin 对象:', Object.keys(PtcrPlugin).join(', '))

    const methods = [
      'healthCheck',
      'generateCloud0',
      'generateCloudByRaw',
      'generateCloudByStandard',
    ]
    for (const m of methods) {
      console.log(`[PtcrDiag]    ├─ ${m}:`, typeof PtcrPlugin[m])
    }

    try {
      const hc = await PtcrPlugin.healthCheck()
      console.log('[PtcrDiag] 🏥 healthCheck 返回:', JSON.stringify(hc))

      result.ok = hc.ok === true
      result.detail.python = hc.ok
        ? `Python OK (task: ${hc.task})`
        : `Python 失败: ${hc.error || '未知'}`
      result.detail.scripts = hc.log || ''

      if (!result.ok) {
        result.error = hc.error || 'healthCheck 返回失败'
      }
    } catch (hcError) {
      result.error = hcError.message || String(hcError)
      result.detail.python = `healthCheck 调用失败: ${result.error}`

      if (result.error.includes('not implemented on android')) {
        result.detail.python = '❌ PtcrPlugin 未安装到 APK（not implemented on android）'
        result.detail.scripts = '需要在 build.gradle 中包含 PtcrPlugin 并重新构建'
        result.detail.onnx = 'APK 重建后自动部署'
        console.error('[PtcrDiag] ❌ 插件未实现（APK 不含原生代码）')
        console.error('[PtcrDiag] 🔧 解决: 重新构建 APK 并安装')
        return result
      }
    }

    console.log('[PtcrDiag] ✅ 诊断完成:', result.ok ? '插件可用' : `不可用: ${result.error}`)
  } catch (e) {
    result.error = e.message || String(e)
    console.error('[PtcrDiag] ❌ 诊断异常:', result.error)
  }

  return result
}

// ==============================================
// 资源清理函数
// ==============================================

/**
 * 清理定时器和事件监听器
 */
function cleanupTimersAndListeners() {
  // 清理点云渲染定时器
  cleanupAccumulationTimer()

  // 停止后台渲染任务
  stopBackgroundRender()

  // 移除 resize 事件监听器
  if (renderer?.onResize) {
    window.removeEventListener('resize', renderer.onResize)
  }

  // 移除蓝牙断开监听
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }
}

/**
 * 清理渲染器资源
 * @returns {Promise} - 清理操作的 Promise
 */
function cleanupRenderer() {
  return new Promise((resolve) => {
    // 立即执行清理，不再使用 setTimeout 延迟
    // 原因：setTimeout 会导致竞态条件，如果用户在延迟期间重新进入页面，
    // 可能会出现 renderer 被 dispose 但动画循环仍在运行的情况
    if (renderer?.dispose && typeof renderer.dispose === 'function') {
      renderer.dispose()
    }
    renderer = null
    isRendererReady.value = false
    resolve()
  })
}

/**
 * 清理蓝牙会话
 */
async function cleanupBluetoothSession() {
  try {
    bluetoothStore.setCleanupStatus(true) // 清理中
    await stopSessionParser() // 取消订阅

    bluetoothStore.handleSendEnd() // 发送结束指令-----取消订阅是取消接收下位机消息，上位机依旧可以给下位机发送消息
  } catch (e) {
    logger.warn('[PointCloudPage] 清理会话失败', e)
  } finally {
    bluetoothStore.setCleanupStatus(false) // 清理结束
  }
}

/**
 * 重置状态变量
 * @param {boolean} resetState - 是否重置所有状态
 */
function resetStateVariables(resetState) {
  isCollecting.value = false
  pointCount.value = 0

  if (resetState) {
    hasStarted = false
    dataBatchCounter.value = 0
  }
}

/**
 * 恢复系统设置
 * @param {Object} options - 恢复选项
 */
async function restoreSystemSettings(options) {
  const { restoreStatusBar, disableImmersive, disableKeepAwake, restorePortrait } = options

  // 恢复状态栏设置
  if (restoreStatusBar) {
    try {
      await StatusBar.setBackgroundColor({ color: '#0a0a1a' })
      await StatusBar.setStyle({ style: 'LIGHT' })
    } catch (err) {
      logger.warn('StatusBar restore overlays failed', err)
    }
  }

  // 禁用沉浸模式
  if (disableImmersive) {
    setImmersive(false)
  }

  // 停止屏幕常亮
  if (disableKeepAwake) {
    await disableScreenKeepAwake()
  }

  // 恢复竖屏
  if (restorePortrait) {
    await lockToPortrait()
  }
}

/**
 * 应用进入后台时的清理函数
 * 记录采集状态并停止必要的资源
 */
async function cleanupResourcesForPause() {
  try {
    // 2. 检查是否处于拍照会话中
    const isInPhotoSession = parser?.protocolState?.photoSession?.active === true

    // 3. 如果正在采集但处于拍照会话中，不清理蓝牙会话（拍照流程需要蓝牙连接）
    if (isCollecting.value) {
      if (isInPhotoSession) {
        logger.debug('[PointCloud] 正在拍照会话中，跳过蓝牙会话清理')
      } else {
        // 方案C：暂停解析器但不取消订阅，保持蓝牙通知通道
        logger.debug('[PointCloud] 正在采集（非拍照会话），暂停解析器')
        if (parser) {
          parser.pause()
        }
        cleanupAccumulationTimer()
        stopBackgroundRender()
        clearAccumulationBuffer()
        resetSessionParserState()
      }
    }

    // 4. 停止屏幕常亮
    // logger.debug('[PointCloud] 停止屏幕常亮')
    await disableScreenKeepAwake()
  } catch (error) {
    logger.error('[PointCloud] 清理暂停资源时发生错误', error)
  }
}

/**
 * cleanupResourcesForExit 全局超时时间（毫秒）
 * 防止任何异步清理操作阻塞路由切换过久
 */
const EXIT_CLEANUP_TIMEOUT_MS = 5000

/**
 * 路由切换时彻底清理资源
 *
 * 清理顺序：定时器/监听器 → 多站点资源 → 渲染器 → 蓝牙会话 → 状态变量 → 系统设置
 * 所有步骤均有独立的错误捕获，单步失败不影响后续步骤
 *
 * @param {Object} options - 清理选项
 * @param {boolean} [options.restorePortrait=true] - 是否恢复竖屏
 * @param {boolean} [options.disableKeepAwake=true] - 是否禁用屏幕常亮
 * @param {boolean} [options.disableImmersive=true] - 是否禁用沉浸模式
 * @param {boolean} [options.restoreStatusBar=true] - 是否恢复状态栏设置
 * @param {boolean} [options.resetState=true] - 是否重置状态变量
 * @param {boolean} [options.cleanupRenderer=true] - 是否清理渲染器资源
 * @param {boolean} [options.nonBlockingBleCleanup=false] - BLE清理是否fire-and-forget（路由退出场景推荐使用，不阻塞跳转）
 */
async function cleanupResourcesForExit(options = {}) {
  const {
    restorePortrait = true,
    disableKeepAwake = true,
    disableImmersive = true,
    restoreStatusBar = true,
    resetState = true,
    cleanupRenderer: shouldCleanupRenderer = true,
    nonBlockingBleCleanup = false,
  } = options

  if (_hasCleaned) {
    logger.debug('[PointCloud] cleanupResourcesForExit 已执行过，忽略')
    return
  }

  _hasCleaned = true

  let timeoutId = null

  try {
    // 整体清理用全局超时包裹，到期后直接 resolve，不阻塞调用方
    await Promise.race([
      (async () => {
        // 1. 清理定时器和事件监听器
        cleanupTimersAndListeners()

        // 2. 清理多站点相关资源
        cleanupMultiStationResources()

        // 3. 根据选项决定是否清理渲染器资源
        if (shouldCleanupRenderer) {
          await cleanupRenderer()
        } else {
          logger.debug('[PointCloud] 跳过渲染器清理，保持点云数据')
        }

        // 4. 清理蓝牙会话
        if (nonBlockingBleCleanup) {
          // 路由退出场景：fire-and-forget，不阻塞跳转
          // 注意：BLE清理失败时仅记录日志，不影响页面退出
          cleanupBluetoothSession().catch((e) =>
            logger.warn('[PointCloud] 后台BLE清理失败（非阻塞模式）', e),
          )
        } else {
          await cleanupBluetoothSession()
        }

        // 5. 重置状态变量
        resetStateVariables(resetState)

        // 6. 恢复系统设置
        await restoreSystemSettings({
          restoreStatusBar,
          disableImmersive,
          disableKeepAwake,
          restorePortrait,
        })
      })(),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          logger.warn(
            `[PointCloud] cleanupResourcesForExit 超时（${EXIT_CLEANUP_TIMEOUT_MS}ms），强制退出`,
          )
          resolve()
        }, EXIT_CLEANUP_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    logger.error('[PointCloud] 清理资源时发生错误', error)
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    logger.debug('[PointCloud] cleanupResourcesForExit 执行结束')
  }
}

/**
 * 清理多站点相关资源
 */
function cleanupMultiStationResources() {
  if (container.value) {
    container.value.removeEventListener('click', onContainerClick)
  }

  if (renderer) {
    const scene = renderer.getScene()
    if (scene) {
      anchorSprites.forEach((sprite) => {
        scene.remove(sprite)
        if (sprite.material.map) sprite.material.map.dispose()
        sprite.material.dispose()
      })
    }
  }
  anchorSprites = []
  _hlmrfClickRegistered = false
}

/**
 * 清理积累定时器
 * 点云渲染定时器（渲染相关的缓冲区函数）
 */
function cleanupAccumulationTimer() {
  if (accumulationTimer) {
    clearInterval(accumulationTimer)
    accumulationTimer = null
  }
}

/**
 * 清空积累缓冲区
 */
function clearAccumulationBuffer() {
  accumulationBuffer.length = 0
  deferredRenderBuffer.length = 0
}

function startBackgroundPointCloudRender() {
  if (isBackgroundRendering) {
    logger.debug('[BackgroundRender] 后台渲染任务已在运行')
    return
  }

  isBackgroundRendering = true
  const initialBufferSize = deferredRenderBuffer.length
  console.log('[BackgroundRender] ===== 开始后台渲染 =====')
  console.log(`[BackgroundRender] 初始缓冲区点数: ${initialBufferSize.toLocaleString()}`)
  console.log(`[BackgroundRender] 每帧渲染点数: ${BACKGROUND_RENDER_CHUNK}`)
  logger.debug('[BackgroundRender] 启动后台渲染，缓冲区点数:', initialBufferSize)

  let totalRenderedInSession = 0
  let frameCount = 0

  function renderChunk() {
    if (!isBackgroundRendering || !isRendererReady.value || !renderer) {
      backgroundRenderTask = null
      isBackgroundRendering = false
      console.log('[BackgroundRender] ===== 后台渲染终止 =====')
      console.log(
        `[BackgroundRender] 本次会话渲染总数: ${totalRenderedInSession.toLocaleString()} 点`,
      )
      console.log(`[BackgroundRender] 渲染帧数: ${frameCount}`)
      return
    }

    const chunk = deferredRenderBuffer.splice(0, BACKGROUND_RENDER_CHUNK)
    const chunkSize = chunk.length
    if (chunkSize > 0) {
      renderer.addPoints(chunk)
      pointCount.value += chunkSize
      totalRenderedInSession += chunkSize
      frameCount++

      if (frameCount % 10 === 0 || chunkSize < BACKGROUND_RENDER_CHUNK) {
        console.log(
          `[BackgroundRender] 帧 ${frameCount}: 渲染 ${chunkSize} 点, 累计 ${totalRenderedInSession.toLocaleString()} 点, 缓冲区剩余 ${deferredRenderBuffer.length.toLocaleString()} 点`,
        )
      }
    }

    if (deferredRenderBuffer.length > 0) {
      backgroundRenderTask = requestAnimationFrame(renderChunk)
    } else if (isCollecting.value) {
      backgroundRenderTask = setTimeout(() => {
        if (deferredRenderBuffer.length > 0) {
          backgroundRenderTask = requestAnimationFrame(renderChunk)
        } else {
          isBackgroundRendering = false
          backgroundRenderTask = null
          console.log('[BackgroundRender] ===== 后台渲染暂停（等待新数据）=====')
          console.log(
            `[BackgroundRender] 暂停前渲染总数: ${totalRenderedInSession.toLocaleString()} 点`,
          )
        }
      }, 200)
    } else {
      isBackgroundRendering = false
      backgroundRenderTask = null
      console.log('[BackgroundRender] ===== 后台渲染结束 =====')
      console.log(
        `[BackgroundRender] 本次会话渲染总数: ${totalRenderedInSession.toLocaleString()} 点`,
      )
      console.log(`[BackgroundRender] 渲染帧数: ${frameCount}`)
      console.log(`[BackgroundRender] 初始缓冲区: ${initialBufferSize.toLocaleString()} 点`)
      logger.debug('[BackgroundRender] 后台渲染任务完成')
    }
  }

  backgroundRenderTask = requestAnimationFrame(renderChunk)
}

function stopBackgroundRender() {
  const wasRendering = isBackgroundRendering
  const bufferRemaining = deferredRenderBuffer.length
  isBackgroundRendering = false
  if (backgroundRenderTask !== null) {
    if (typeof backgroundRenderTask === 'number') {
      cancelAnimationFrame(backgroundRenderTask)
    } else {
      clearTimeout(backgroundRenderTask)
    }
    backgroundRenderTask = null
  }
  if (wasRendering) {
    console.log('[BackgroundRender] ===== 强制停止后台渲染 =====')
    console.log(`[BackgroundRender] 停止时缓冲区剩余点数: ${bufferRemaining.toLocaleString()} 点`)
    logger.debug('[BackgroundRender] 后台渲染已强制停止')
  }
}

async function flushDeferredRender() {
  stopBackgroundRender()

  const initialBufferSize = deferredRenderBuffer.length
  let totalFlushed = 0
  let flushIterations = 0

  console.log('[BackgroundRender] ===== 开始刷新延迟渲染缓冲区 =====')
  console.log(`[BackgroundRender] 刷新前缓冲区点数: ${initialBufferSize.toLocaleString()} 点`)
  console.log(`[BackgroundRender] 刷新每批处理点数: ${BACKGROUND_RENDER_CHUNK * 2}`)

  while (deferredRenderBuffer.length > 0) {
    const chunk = deferredRenderBuffer.splice(0, BACKGROUND_RENDER_CHUNK * 2)
    const chunkSize = chunk.length
    if (chunkSize > 0 && renderer && isRendererReady.value) {
      renderer.addPoints(chunk)
      pointCount.value += chunkSize
      totalFlushed += chunkSize
      flushIterations++

      if (flushIterations % 5 === 0 || chunkSize < BACKGROUND_RENDER_CHUNK * 2) {
        console.log(
          `[BackgroundRender] 刷新进度: 已处理 ${totalFlushed.toLocaleString()} 点, 剩余 ${deferredRenderBuffer.length.toLocaleString()} 点`,
        )
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 16))
  }

  console.log('[BackgroundRender] ===== 延迟渲染缓冲区刷新完成 =====')
  console.log(`[BackgroundRender] 刷新总点数: ${totalFlushed.toLocaleString()} 点`)
  console.log(`[BackgroundRender] 刷新迭代次数: ${flushIterations}`)
}

/**
 * BLE取消订阅操作超时时间（毫秒）
 * 防止底层BLE descriptor写入阻塞过久导致路由切换卡死
 */
const BLE_UNSUBSCRIBE_TIMEOUT_MS = 3000

/**
 * 取消蓝牙订阅
 * 带超时保护，超时后自动放弃等待，不阻塞主流程
 * @returns {Promise<void>}
 */
async function unsubscribeFromBluetooth() {
  try {
    const deviceId = bluetoothStore.connectedDeviceId
    if (!deviceId) return

    await Promise.race([
      bluetoothService.unsubscribeFromNotifications(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_NOTIFY_CHAR_UUID,
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`BLE取消订阅超时（${BLE_UNSUBSCRIBE_TIMEOUT_MS}ms）`)),
          BLE_UNSUBSCRIBE_TIMEOUT_MS,
        ),
      ),
    ])
    logger.debug('[unsubscribeFromBluetooth] 蓝牙订阅已取消')
  } catch (e) {
    logger.warn('[unsubscribeFromBluetooth] 取消订阅失败', e)
  }
}

/**
 * 停止相机预览
 * @returns {Promise<void>}
 */
async function stopCameraPreview() {
  try {
    await cameraHelper.stopPreview()
    logger.debug('[stopCameraPreview] 相机预览已停止')
  } catch (e) {
    logger.warn('[stopCameraPreview] 停止相机预览失败', e)
  }
}

/**
 * 重置会话解析器状态
 */
function resetSessionParserState() {
  // 不再设置 parser = null，保持实例以便复用
  // parser = null
  isCollecting.value = false
  logger.debug('[resetSessionParserState] 解析器状态已重置，实例已保留')
}

/**
 * 停止会话解析器
 * 取消蓝牙订阅、停止相机预览、清理相关资源
 * @returns {Promise<void>}
 */
async function stopSessionParser() {
  if (!parser) {
    logger.debug('[stopSessionParser] 解析器不存在，无需停止')
    return
  }

  logger.debug('[stopSessionParser] 开始停止解析器和订阅...')

  try {
    // 清理定时器
    cleanupAccumulationTimer()

    // 停止后台渲染
    stopBackgroundRender()

    // 清空缓冲区
    clearAccumulationBuffer()

    // 取消蓝牙订阅
    await unsubscribeFromBluetooth()

    // 停止相机预览
    await stopCameraPreview()

    // 重置采集状态为未采集
    resetSessionParserState()
  } catch (error) {
    logger.error('[stopSessionParser] 停止解析器时发生错误', error)
  }
}

/**
 * 检查设备连接状态
 * @returns {boolean} - 设备是否已连接
 */
function checkDeviceConnection() {
  if (bluetoothStore.connectionStatus !== 2) {
    logger.warn('[checkDeviceConnection] 设备未连接，无法订阅')
    return false
  }
  return true
}

/**
 * 创建会话解析器实例
 * @returns {Object} - 会话解析器实例
 */
function createSessionParser() {
  const parser = new parseBleData({
    enableDebug: true,
    getDataBatchCounter: () => `dataBatch_${dataBatchCounter.value.toString().padStart(3, '0')}`,
    onStartPreview: async () => {
      startBackgroundPointCloudRender()
      return cameraHelper.startPreview('cameraPreview')
    },
    onSendCameraReady: async () => {
      return bluetoothStore.handleSendCameraNextPhoto()
    },
    onTakePhoto: async ({ fileBaseName, meta }) => {
      try {
        const saveFolderName = currentFolderName || storage.path.getTempSessionName(currentSessionId)
        const bid = dataBatchCounter.value
        const targetDir = `pointcloud/${saveFolderName}/Batch_${String(bid).padStart(3, '0')}/allPicture`
        // 拍照并在后台保存（不阻塞主线程）
        const photoData = await cameraHelper.captureAndSave(
          fileBaseName + '====' + ++parser.reNameFlag,
          targetDir,
        )

        if (photoData && photoData.filePath && photoData.fileName) {
          // 只保存文件路径，不保存base64数据
          currentBatchData.photos.push({
            name: photoData.fileName,
            filePath: photoData.filePath,
          })
        }
        return photoData
      } catch (e) {
        logger.error('拍照获取失败', e)
        throw e
      }
    },
    onEndPreview: async () => {
      return cameraHelper.stopPreview()
    },
    onScanTimeResponse: (data) => {
      handleScanTimeResponse(data)
    },
    onPhotoSessionEnded: async () => {
      console.log('\n')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[PhotoSession] 📸 拍照会话结束')
      console.log('═══════════════════════════════════════════════════════')
      console.log('[PhotoSession] 📍 当前点位:', dataBatchCounter.value)
      console.log('[PhotoSession] 📊 点云数量:', currentBatchData.pointCount)
      console.log('[PhotoSession] 📷 照片数量:', currentBatchData.photos.length)
      console.log('[PhotoSession] 📝 数据行数:', currentBatchData.rawLines.length)
      console.log('═══════════════════════════════════════════════════════\n')

      // 1. 刷新延迟渲染
      console.log('[PhotoSession] 🎨 刷新延迟渲染...')
      await flushDeferredRender()
      stopBackgroundRender()

      // 2. 保存当前点位数据
      console.log('[PhotoSession] 💾 保存当前点位数据...')
      await saveCurrentBatch()
      console.log('[PhotoSession] ✅ 点位数据保存完成')

      // 3. 更新点位计数器
      dataBatchCounter.value++
      enableSave.value = true

      // 4. 添加按钮
      batchButtons.value.push(dataBatchCounter.value)

      // 停止采集进度显示
      stopCollectionProgress()

      console.log('[PhotoSession] 📍 更新点位计数器:', dataBatchCounter.value)

      // 5. 方案C：暂停解析器（不取消订阅），保持蓝牙通知通道
      console.log('[PhotoSession] ⏸️ 暂停解析器（保持蓝牙订阅）...')
      if (parser) {
        parser.pause()
      }
      clearAccumulationBuffer()
      resetSessionParserState()
      console.log('[PhotoSession] ✅ 解析器已暂停')

      // 6. 触发 HLMRF 多站点拼接（拍照完成后自动运行）
      console.log('[PhotoSession] 🚀 即将触发 HLMRF 多站点拼接...')
      console.log('═══════════════════════════════════════════════════════\n')
      triggerHLMRFRegistration()
    },
  })

  return parser
}

/**
 * 订阅蓝牙通知
 * @param {string} deviceId - 设备ID
 * @returns {Promise<void>}
 */
async function subscribeToBluetoothNotifications(deviceId) {
  try {
    await bluetoothService.subscribeToNotifications(
      deviceId,
      NUS_SERVICE_UUID,
      NUS_NOTIFY_CHAR_UUID,
      (uint8) => {
        try {
          // 快速路径：非采集状态或 parser 暂停时直接跳过
          if (!isCollecting.value || !parser || parser.isPaused()) {
            return
          }

          // 始终解析蓝牙数据，确保拍照指令（0x81/0x82/0x83）能正常处理
          // 单帧单包时，解析得到points长度是1，单帧多包时，解析得到points长度是3
          const { points, errors } = parser.parse(uint8)
          if (errors && errors.length > 0) {
            logger.warn('parse errors', errors)
          }
          if (points && points.length > 0) {
            // 检查单个站位点云数量上限，达到上限后不保存新点但继续解析指令
            if (currentBatchData.pointCount >= MAX_POINTS_PER_BATCH) {
              return
            }
            // 检查缓冲区上限  超出上限时丢弃同等数量旧点位
            if (accumulationBuffer.length > MAX_BUFFER_SIZE) {
              const overflow = accumulationBuffer.length - MAX_BUFFER_SIZE + points.length
              accumulationBuffer.splice(0, overflow)
            }

            accumulationBuffer.push(...points)
            points.forEach((p) => {
              // 根据数据类型决定保存格式
              if (p.pitch !== undefined && p.yaw !== undefined && p.distanceM !== undefined) {
                // 极坐标数据：标记为含极坐标格式，保存6列
                currentBatchData.hasPolarData = true
                currentBatchData.rawLines.push(
                  `${p.x / 10} ${p.y / 10} ${p.z / 10} ${p.pitchDeg} ${p.yawDeg} ${p.distanceM / 10}`,
                )
              } else {
                // 仅XYZ数据（单格式模式）：3列
                currentBatchData.rawLines.push(`${p.x / 10} ${p.y / 10} ${p.z / 10}`)
              }
            })
            currentBatchData.pointCount += points.length

            // 更新采集进度中的点云计数
            collectionProgress.value.currentPoints = currentBatchData.pointCount

            // 达到上限时只提示，不停止订阅和采集
            if (currentBatchData.pointCount >= MAX_POINTS_PER_BATCH) {
              logger.warn(`点位点云数量已达到上限 ${MAX_POINTS_PER_BATCH}，停止接收`)
              showToast({ message: '当前点位点云数量已达上限', position: 'bottom' })
            }
          }
        } catch (e) {
          logger.error('notification handler error', e)
        }
      },
    )
  } catch (e) {
    logger.warn('subscribeToNotifications failed', e)
  }
}

/**
 * - 条件检查（渲染器状态和采集状态）
- 点云数据的批量处理
- 点云渲染操作
- 点计数更新
 */
function initAndStartRenderingTimer() {
  accumulationTimer = setInterval(() => {
    if (!isRendererReady.value || !isCollecting.value) return
    if (accumulationBuffer.length >= MIN_BATCH_SIZE) {
      const toDefer = accumulationBuffer.splice(0, Math.min(accumulationBuffer.length, 1000))
      deferredRenderBuffer.push(...toDefer)
    }
  }, ACCUMULATION_INTERVAL)
}

/**
 * 开始数据采集
 */
async function startDataStream() {
  console.log('点击startDataStream')
  if (isCollecting.value) {
    showToast({ message: '正在采集中...', position: 'bottom' })
    return
  }
  if (isStitching.value) {
    showToast({ message: '算法拼接中，请等待完成后重试', position: 'bottom' })
    return
  }
  if (dataBatchCounter.value >= 50) {
    // if (dataBatchCounter.value >= 5) {
    showToast({ message: '采集点位已达上限', position: 'bottom' })
    return
  }
  // 开始新点位采集前，清空渲染器中的点云
  if (renderer && typeof renderer.resetPointCloud === 'function') {
    renderer.resetPointCloud()
    pointCount.value = 0
  }

  if (bluetoothStore.connectionStatus !== 2) {
    showToast({ message: '设备未连接，无法开始采集', position: 'bottom' })
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

  // 首次点击开始采集时，创建会话根目录
  if (!hasStarted) {
    try {
      const sessionDirName = currentFolderName || storage.path.getTempSessionName(currentSessionId)
      const rootDir = `pointcloud/${sessionDirName}`
      await storage.file.ensureDir(rootDir)
      logger.debug('[PointCloud] 会话根目录已创建:', rootDir)
      //优化： 通知其他页面新增了文件夹（局部更新）
      //存在问题： 当处于拍照阶段未结束时，滑动屏幕返回（无法监听这个事件）导致数据列表项展示有问题，无法识别保存的照片等效果（暂时不用解决）
      storage.session.dispatchFolderUpdate('partial_update', {
        action: 'folder_added',
        folders: [sessionDirName],
      })
    } catch (e) {
      logger.warn('[PointCloud] 创建会话根目录失败:', e)
      showToast({ message: '创建存储目录失败', position: 'bottom' })
      return
    }
  }

  // 重置当前点位数据
  currentBatchData = { rawLines: [], photos: [], pointCount: 0, hasPolarData: false }
  clearAccumulationBuffer()

  isCollecting.value = true

  // 方案C：使用 parser.resume() 恢复解析器（订阅已在页面进入时建立）
  // resume() 内部执行与 reset() 等价的状态重置，包括 reNameFlag / photoSession / outputMode 等
  if (!parser) {
    parser = createSessionParser()
  }
  parser.resume()

  if (!accumulationTimer) {
    initAndStartRenderingTimer()
  }

  hasStarted = true

  // 发送读取扫描时间指令（复用已有订阅通道）
  await readScanTimeFromDevice()

  // 等待扫描时间读取完成后再启动进度显示
  // 给设备响应时间，最多等待2秒
  let waitCount = 0
  while (!hasScanTime.value && waitCount < 20) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    waitCount++
  }

  // 启动采集进度显示
  startCollectionProgress()

  bluetoothStore.handleSendStart()
  logger.debug('startDataStream click', '开始新点位采集，点位编号:', dataBatchCounter.value + 1)
}

// ==============================================
// 扫描时间相关函数
// ==============================================

/**
 * 从设备读取扫描时间
 */
async function readScanTimeFromDevice() {
  try {
    if (bluetoothStore.connectionStatus !== 2) {
      logger.debug('设备未连接，使用默认扫描时间 30 秒')
      collectionProgress.value.scanTimeSeconds = 30
      hasScanTime.value = true
      return
    }

    logger.debug('发送读取扫描时间指令')
    await bluetoothStore.handleReadScanTime()
    // 响应通过蓝牙数据回调处理
  } catch (error) {
    logger.error('读取扫描时间失败', error)
    // 使用默认扫描时间 30 秒
    collectionProgress.value.scanTimeSeconds = 30
    hasScanTime.value = true
  }
}

/**
 * 处理扫描时间响应
 * @param {Object|number} data - 扫描时间数据
 */
function handleScanTimeResponse(data) {
  if (data && typeof data === 'object' && data.seconds !== undefined) {
    collectionProgress.value.scanTimeSeconds = parseInt(data.seconds)
  } else if (typeof data === 'number') {
    collectionProgress.value.scanTimeSeconds = parseInt(data)
  } else {
    collectionProgress.value.scanTimeSeconds = 30
  }
  hasScanTime.value = true
  logger.debug('[PointCloud] 扫描时间设置:', collectionProgress.value.scanTimeSeconds)
}

// ==============================================
// 采集进度相关函数
// ==============================================

/**
 * 启动采集进度倒计时
 */
function startCollectionProgress() {
  // 初始化进度状态
  collectionProgress.value.isCollecting = true
  collectionProgress.value.currentPoints = 0
  collectionProgress.value.elapsedTime = 0
  collectionProgress.value.remainingTime = collectionProgress.value.scanTimeSeconds

  // 启动倒计时定时器，每秒更新一次
  countdownTimer = setInterval(() => {
    collectionProgress.value.elapsedTime++
    collectionProgress.value.remainingTime = Math.max(
      0,
      collectionProgress.value.scanTimeSeconds - collectionProgress.value.elapsedTime,
    )

    // 倒计时结束，清理定时器
    if (collectionProgress.value.remainingTime <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

/**
 * 停止采集进度倒计时
 */
function stopCollectionProgress() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  collectionProgress.value.isCollecting = false
  collectionProgress.value.elapsedTime = 0
  collectionProgress.value.remainingTime = 0
}

/**
 * 计算进度百分比
 */
const progressPercentage = computed(() => {
  if (collectionProgress.value.scanTimeSeconds === 0) return 0
  const percentage =
    (collectionProgress.value.elapsedTime / collectionProgress.value.scanTimeSeconds) * 100
  return Math.min(percentage, 100)
})

const pointsPerSecond = computed(() => {
  if (!collectionProgress.value.isCollecting || collectionProgress.value.elapsedTime <= 0) return 0
  return Math.round(collectionProgress.value.currentPoints / collectionProgress.value.elapsedTime)
})

// ==============================================
// 初始化和设置函数
// ==============================================

/**
 * 初始化页面和渲染器
 */
async function init() {
  // 获取页面模式
  const mode = route.query.mode || 'collect'
  console.log(`[PointCloud] 进入模式: ${mode === 'collect' ? '采集模式' : '查看模式'}`)
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
    logger.warn('StatusBar overlay set failed', err)
  }

  try {
    setImmersive(true)
  } catch (err) {
    logger.warn('setImmersive initial calls failed', err)
  }

  // 使用变量保存定时器 ID，以便在组件卸载时取消
  initTimeoutId = setTimeout(async () => {
    // 如果组件已卸载，跳过初始化
    if (isUnmounted) {
      logger.debug('[PointCloud] 组件已卸载，跳过渲染器初始化')
      return
    }

    if (container.value) {
      // 检测是否为移动设备
      const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)

      const baseConfig = {
        maxPoints: 5000000,
        initialCapacity: 100000,
        pixelRatioMax: isMobile ? 1 : 2,
        targetFps: 30,
        pointSize: isMobile ? 0.4 : 0.5,
        cameraFov: 60,
        cameraNear: 0.1,
        cameraFar: 200,
      }

      renderer = usePointCloudRenderer(container.value, baseConfig)

      // ========== 配置相机和缩放限制 ==========
      // 初始相机高度10米，缩放范围控制为初始的两倍：5米-20米
      const initialCameraHeight = 10
      const cameraConfig = {
        position: { x: 0, y: initialCameraHeight, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        controls: {
          minDistance: initialCameraHeight / 2, // 5米（初始的1/2）
          maxDistance: initialCameraHeight * 2, // 20米（初始的2倍）
          maxPolarAngle: Math.PI / 2,
          // minDistance: initialCameraHeight / 10,
          // maxDistance: initialCameraHeight * 10,
        },
      }

      // 初始化并传入相机配置
      renderer.init(cameraConfig)

      frameRate.value = 30
      isRendererReady.value = true
      window.addEventListener('resize', renderer.onResize)

      if (mode === 'view') {
        const querySessionId = route.query.currentSessionId
        const queryFolderName = route.query.folderName
        if (querySessionId && typeof querySessionId === 'string') {
          currentSessionId = querySessionId
          currentFolderName = queryFolderName || querySessionId
          savedDuringDialog.value = true
          lastSavedFolder.value = currentFolderName
          enableSave.value = true
          await loadBatchButtons()
          await loadAndRenderProjectData(currentFolderName)
        }
      } else {
        // ========= 采集模式：加载坐标系和网格 ==========
        if (!currentSessionId) {
          console.log('!currentSessionId')
          currentSessionId = generateOptimizedSessionId()
        } else {
          loadBatchButtons()
        }
      }
    }

    // 初始化完成后清空定时器 ID
    initTimeoutId = null
  }, 100)
}
/**
 * 加载点云数据和创建锚点
 * @param {Object} renderer - 渲染器实例
 * @param {HTMLElement} container - 容器元素
 * @returns {Promise<void>}
 */
async function loadPointCloudAndAnchors(renderer, container) {
  // 获取场景
  const scene = renderer.getScene()

  // ========== 渐进式加载 ==========
  console.log('[PointCloud] 开始加载点云数据...')

  // 显示加载提示
  showLoadingToast({
    message: '加载点云中...',
    forbidClick: false,
  })

  // 先加载中心站点（站点0）
  const centerStation = stations[0]
  const centerPoints = loadStation(centerStation)
  renderer.addPoints(centerPoints)
  pointCount.value = centerPoints.length
  console.log(`[PointCloud] 中心站点加载完成: ${centerPoints.length} 个点`)

  // 创建锚点
  createAnchorSprites(scene)
  // 添加点击事件监听
  container.addEventListener('click', onContainerClick)

  // 渐进式加载周围站点
  const surroundingStations = stations.slice(1)
  await loadStationsByPriority(
    surroundingStations,
    renderer,
    (loadedCount, totalPoints, currentStationId, currentStationName) => {
      pointCount.value = totalPoints

      // 打印具体站点信息
      if (currentStationId !== undefined) {
        console.log(
          `[PointCloud] 🚀 正在渲染: 站点${currentStationId} (${currentStationName}) | 累计点数: ${totalPoints.toLocaleString()}`,
        )
      } else {
        console.log(
          `[PointCloud] 📊 批量更新: ${loadedCount}/${surroundingStations.length} 站点 | 总点数: ${totalPoints.toLocaleString()}`,
        )
      }
    },
  )

  // 关闭加载提示
  closeToast()
}
/**
 * 渐进式加载站点点云
 * @param {Array} stations - 站点配置数组
 * @param {Object} renderer - 渲染器实例
 * @param {Function} onProgress - 进度回调
 */
async function loadStationsProgressive(stations, renderer, onProgress) {
  let totalPoints = pointCount.value
  // 每批次加载2个站点，避免一次性压力过大
  const batchSize = 2
  let index = 0

  return new Promise((resolve) => {
    function loadBatch() {
      const end = Math.min(index + batchSize, stations.length)
      const batch = stations.slice(index, end)

      for (const station of batch) {
        const points = loadStation(station)
        if (points.length > 0) {
          renderer.addPoints(points)
          totalPoints += points.length
        }
      }

      index = end

      if (onProgress) {
        onProgress(index, totalPoints)
      }

      if (index < stations.length) {
        // 使用 requestIdleCallback 或 setTimeout 让出主线程
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => loadBatch(), { timeout: 100 })
        } else {
          setTimeout(loadBatch, 50)
        }
      } else {
        console.log(`[PointCloud] 所有站点加载完成，总点数: ${totalPoints.toLocaleString()}`)
        resolve()
      }
    }

    loadBatch()
  })
}
/**
 * 根据视锥优先级渐进式加载站点点云
 * @param {Array} stationList - 站点配置数组
 * @param {Object} renderer - 渲染器实例
 * @param {Function} onProgress - 进度回调
 */
async function loadStationsByPriority(stationList, renderer, onProgress) {
  let totalPoints = pointCount.value
  const camera = renderer.getCamera()

  if (!camera) {
    console.log('[PointCloud] ⚠️ 未获取到相机，降级为普通渐进式加载')
    return loadStationsProgressive(stationList, renderer, onProgress)
  }

  const cameraPos = camera.position
  const fovRadius = Math.abs(cameraPos.y) * Math.tan((30 * Math.PI) / 180)

  // ========== 1. 动态计算所有站点的距离分布 ==========
  const stationsWithDistance = []
  let maxDistance = 0
  let minDistance = Infinity

  for (const station of stationList) {
    const dx = station.offset.x - cameraPos.x
    const dz = station.offset.z - cameraPos.z
    const distance = Math.sqrt(dx * dx + dz * dz)

    stationsWithDistance.push({
      ...station,
      distance,
    })

    if (distance > maxDistance) maxDistance = distance
    if (distance < minDistance) minDistance = distance
  }

  console.log('\n' + '='.repeat(60))
  console.log('[PointCloud] 🎯 视锥剔除渐进式加载开始')
  console.log('='.repeat(60))
  console.log(`[PointCloud] 📷 相机位置: (${cameraPos.x}, ${cameraPos.y}, ${cameraPos.z})`)
  console.log(`[PointCloud] 🔍 视野半径: ${fovRadius.toFixed(2)}米`)
  console.log(
    `[PointCloud] 📊 站点距离范围: ${minDistance.toFixed(2)}米 ~ ${maxDistance.toFixed(2)}米`,
  )

  // ========== 2. 根据实际数据分布动态计算优先级阈值 ==========
  // 方法：将距离范围分成4个区间
  // 视锥内（距离 < fovRadius）的站点优先级0

  // 获取所有视锥外站点的距离
  const outsideDistances = stationsWithDistance
    .filter((s) => s.distance >= fovRadius)
    .map((s) => s.distance)

  let radius2, radius3

  if (outsideDistances.length > 0) {
    // 对视锥外的距离进行排序
    outsideDistances.sort((a, b) => a - b)

    // 动态分位数：将视锥外的站点按距离分成3个等级
    const q1Index = Math.floor(outsideDistances.length * 0.33) // 前33%为高优先级
    const q2Index = Math.floor(outsideDistances.length * 0.66) // 前66%为中优先级

    radius2 = outsideDistances[q1Index] || fovRadius * 1.5
    radius3 = outsideDistances[q2Index] || fovRadius * 2.5
  } else {
    // 没有视锥外站点时的默认值
    radius2 = fovRadius * 1.5
    radius3 = fovRadius * 2.5
  }

  console.log(
    `[PointCloud] 🎚️ 动态优先级阈值: 立即加载<${fovRadius.toFixed(2)}米 | 高优先级<${radius2.toFixed(2)}米 | 中优先级<${radius3.toFixed(2)}米`,
  )

  // ========== 3. 计算每个站点的优先级 ==========
  const stationsWithPriority = stationsWithDistance.map((station) => {
    let priority
    let priorityName
    let priorityIcon

    if (station.distance < fovRadius) {
      priority = 0
      priorityName = '立即加载'
      priorityIcon = '🚀'
    } else if (station.distance < radius2) {
      priority = 1
      priorityName = '高优先级'
      priorityIcon = '⚡'
    } else if (station.distance < radius3) {
      priority = 2
      priorityName = '中优先级'
      priorityIcon = '📌'
    } else {
      priority = 3
      priorityName = '低优先级'
      priorityIcon = '💤'
    }

    return {
      ...station,
      priority,
      priorityName,
      priorityIcon,
      distance: station.distance,
    }
  })

  // 按优先级排序
  stationsWithPriority.sort((a, b) => a.priority - b.priority)

  // 打印优先级统计
  const priorityStats = {
    0: stationsWithPriority.filter((s) => s.priority === 0).length,
    1: stationsWithPriority.filter((s) => s.priority === 1).length,
    2: stationsWithPriority.filter((s) => s.priority === 2).length,
    3: stationsWithPriority.filter((s) => s.priority === 3).length,
  }

  console.log('\n' + '-'.repeat(40))
  console.log('[PointCloud] 📈 动态优先级统计:')
  console.log(`   🚀 立即加载(优先级0): ${priorityStats[0]} 个站点`)
  console.log(`   ⚡ 高优先级(优先级1): ${priorityStats[1]} 个站点`)
  console.log(`   📌 中优先级(优先级2): ${priorityStats[2]} 个站点`)
  console.log(`   💤 低优先级(优先级3): ${priorityStats[3]} 个站点`)
  console.log('-'.repeat(40))

  // 打印所有站点的优先级详情
  console.log('\n[PointCloud] 📋 所有站点优先级详情:')
  for (const s of stationsWithPriority) {
    console.log(
      `   ${s.priorityIcon} ${s.folder} (${s.name}) | 距离相机:${s.distance.toFixed(2)}米 | ${s.priorityName}`,
    )
  }

  // ========== 4. 按优先级分批加载 ==========

  // 优先级0：立即加载
  const immediateStations = stationsWithPriority.filter((s) => s.priority === 0)
  if (immediateStations.length > 0) {
    console.log('\n' + '='.repeat(40))
    console.log(`[PointCloud] 🚀 阶段1: 立即加载 (${immediateStations.length} 个站点)`)
    console.log('='.repeat(40))

    for (const station of immediateStations) {
      console.log(
        `   🔄 正在加载: ${station.folder} (${station.name}) | 距离相机:${station.distance.toFixed(2)}米`,
      )
      const points = loadStation(station)
      if (points.length > 0) {
        renderer.addPoints(points)
        pointCount.value += points.length
        console.log(
          `      ✅ 完成! 点数: ${points.length.toLocaleString()} | 累计总点数: ${pointCount.value.toLocaleString()}`,
        )
        if (onProgress) {
          onProgress(1, pointCount.value, station.id, station.name)
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  }

  // 优先级1：高优先级
  const highPriorityStations = stationsWithPriority.filter((s) => s.priority === 1)
  if (highPriorityStations.length > 0) {
    console.log('\n' + '='.repeat(40))
    console.log(`[PointCloud] ⚡ 阶段2: 高优先级加载 (${highPriorityStations.length} 个站点)`)
    console.log('='.repeat(40))

    for (const s of highPriorityStations) {
      console.log(`   📍 待加载: ${s.folder} (${s.name}) | 距离相机:${s.distance.toFixed(2)}米`)
    }

    const newTotal = await loadStationBatch(
      highPriorityStations,
      renderer,
      (loadedCount, total, stationId, stationName) => {
        if (onProgress) {
          onProgress(immediateStations.length + loadedCount, total, stationId, stationName)
        }
      },
    )
    totalPoints = newTotal
  }

  // 优先级2：中优先级
  const midPriorityStations = stationsWithPriority.filter((s) => s.priority === 2)
  if (midPriorityStations.length > 0) {
    console.log('\n' + '='.repeat(40))
    console.log(`[PointCloud] 📌 阶段3: 中优先级加载 (${midPriorityStations.length} 个站点)`)
    console.log('='.repeat(40))

    const showCount = Math.min(5, midPriorityStations.length)
    for (let i = 0; i < showCount; i++) {
      const s = midPriorityStations[i]
      console.log(`   📍 待加载: ${s.folder} (${s.name}) | 距离相机:${s.distance.toFixed(2)}米`)
    }
    if (midPriorityStations.length > showCount) {
      console.log(`   ... 还有 ${midPriorityStations.length - showCount} 个站点`)
    }

    const newTotal = await loadStationBatch(
      midPriorityStations,
      renderer,
      (loadedCount, total, stationId, stationName) => {
        if (onProgress) {
          onProgress(
            immediateStations.length + highPriorityStations.length + loadedCount,
            total,
            stationId,
            stationName,
          )
        }
      },
    )
    totalPoints = newTotal
  }

  // 优先级3：低优先级
  const lowPriorityStations = stationsWithPriority.filter((s) => s.priority === 3)
  if (lowPriorityStations.length > 0) {
    console.log('\n' + '='.repeat(40))
    console.log(
      `[PointCloud] 💤 阶段4: 低优先级加载 (${lowPriorityStations.length} 个站点) - 使用空闲时间`,
    )
    console.log('='.repeat(40))

    const showCount = Math.min(3, lowPriorityStations.length)
    for (let i = 0; i < showCount; i++) {
      const s = lowPriorityStations[i]
      console.log(`   📍 待加载: ${s.folder} (${s.name}) | 距离相机:${s.distance.toFixed(2)}米`)
    }
    if (lowPriorityStations.length > showCount) {
      console.log(`   ... 还有 ${lowPriorityStations.length - showCount} 个站点`)
    }

    if (typeof requestIdleCallback !== 'undefined') {
      console.log(`   ⏰ 使用 requestIdleCallback 在浏览器空闲时加载`)
      await new Promise((resolve) => {
        requestIdleCallback(
          async () => {
            const newTotal = await loadStationBatch(
              lowPriorityStations,
              renderer,
              (loadedCount, total, stationId, stationName) => {
                if (onProgress) {
                  onProgress(
                    immediateStations.length +
                      highPriorityStations.length +
                      midPriorityStations.length +
                      loadedCount,
                    total,
                    stationId,
                    stationName,
                  )
                }
              },
            )
            totalPoints = newTotal
            resolve()
          },
          { timeout: 3000 },
        )
      })
    } else {
      console.log(`   ⏰ 使用 setTimeout 延迟加载`)
      const newTotal = await loadStationBatch(
        lowPriorityStations,
        renderer,
        (loadedCount, total, stationId, stationName) => {
          if (onProgress) {
            onProgress(
              immediateStations.length +
                highPriorityStations.length +
                midPriorityStations.length +
                loadedCount,
              total,
              stationId,
              stationName,
            )
          }
        },
      )
      totalPoints = newTotal
    }
  }

  pointCount.value = totalPoints

  console.log('\n' + '='.repeat(60))
  console.log(`[PointCloud] 🎉 所有站点加载完成！总点数: ${totalPoints.toLocaleString()}`)
  console.log('='.repeat(60) + '\n')
}

/**
 * 批量加载站点（通用函数）
 * @param {Array} stations - 站点配置数组
 * @param {Object} renderer - 渲染器实例
 * @param {Function} onProgress - 进度回调
 */
async function loadStationBatch(stations, renderer, onProgress) {
  if (!stations || stations.length === 0) return

  // 使用局部变量累加
  let accumulatedPoints = pointCount.value
  const batchSize = 2

  for (let i = 0; i < stations.length; i += batchSize) {
    const batch = stations.slice(i, i + batchSize)
    for (const station of batch) {
      const points = loadStation(station)
      if (points.length > 0) {
        renderer.addPoints(points)
        accumulatedPoints += points.length

        // 实时显示正在加载的站点
        console.log(
          `   🔄 正在加载: ${station.folder} (${station.name}) | 点数: ${points.length.toLocaleString()} | 累计: ${accumulatedPoints.toLocaleString()}`,
        )

        // 传递当前站点信息给回调
        if (onProgress) {
          onProgress(
            Math.min(i + batchSize, stations.length),
            accumulatedPoints,
            station.id,
            station.name,
          )
        }
      }
    }
    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 16))
  }

  // 返回累加后的总点数
  return accumulatedPoints
}
/**
 * 注册蓝牙断开监听器
 */
function registerDisconnectListener() {
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }

  disconnectUnregister = bluetoothService.onDeviceDisconnected(
    async (deviceId, isManualDisconnect) => {
      // 只处理当前连接的设备
      if (deviceId !== bluetoothStore.connectedDeviceId) {
        return
      }

      logger.debug('[PointCloudPage] 设备断开连接，手动断开:', isManualDisconnect)

      // 如果正在采集，停止采集并清理会话
      if (isCollecting.value) {
        isCollecting.value = false
        try {
          bluetoothStore.setCleanupStatus(true) // 清理中
          await stopSessionParser() // 这里会取消订阅
        } catch (e) {
          logger.warn('[PointCloudPage] 清理会话失败', e)
        } finally {
          bluetoothStore.setCleanupStatus(false) // 清理结束
        }
        showToast({ message: '设备已断开连接，采集已停止', position: 'bottom' })
      }
    },
  )
}

// ==============================================
// 监听器和生命周期钩子
// ==============================================

// --- 监听蓝牙Store的连接状态变化 ---
watch(
  () => bluetoothStore.connectionStatus,
  async (newStatus, oldStatus) => {
    if (oldStatus === 2 && newStatus !== 2 && isCollecting.value) {
      // 采集过程中连接变为未连接，自动停止采集并清理
      logger.debug('[PointCloudPage] 采集过程中检测到全局连接状态变为未连接')
      isCollecting.value = false
      try {
        bluetoothStore.setCleanupStatus(true) // 清理中
        await stopSessionParser() // 这里会取消订阅
      } catch (e) {
        logger.warn('[PointCloudPage] 清理会话失败', e)
      } finally {
        bluetoothStore.setCleanupStatus(false) // 清理结束
      }
      showToast({ message: '设备已断开连接，采集已停止', position: 'bottom' })
    }
  },
)
// --- 结束：监听蓝牙Store的连接状态变化 ---

/**
 * 组件挂载时的初始化
 */
onMounted(async () => {
  await init()

  // --- 注册断开监听 ---
  registerDisconnectListener()

  // --- 页面加载时检查连接状态 ---
  if (bluetoothStore.connectionStatus !== 2) {
    logger.debug('[PointCloudPage] 页面加载时检测到设备未连接，采集功能已禁用')
  } else {
    // 主动校验一次连接状态
    bluetoothService.checkConnectionStatus(bluetoothStore.connectedDeviceId).catch(() => {
      logger.debug('[PointCloudPage] 页面加载时检测到连接已断开')
    })
  }
  // --- 结束：页面加载时检查连接状态 ---

  // --- 方案C：页面进入时建立蓝牙订阅（仅一次）---
  if (bluetoothStore.connectionStatus === 2) {
    if (!parser) {
      parser = createSessionParser()
    }
    parser.pause()

    const deviceId = bluetoothStore.connectedDeviceId
    if (deviceId) {
      await subscribeToBluetoothNotifications(deviceId)
      initAndStartRenderingTimer()
    }
  }
  // --- 结束：页面进入时建立蓝牙订阅 ---

  pauseListener = await App.addListener('pause', () => {
    cleanupResourcesForPause() // 暂停清理函数
  })
  resumeListener = await App.addListener('resume', async () => {
    await handleAppResume() // 恢复函数
  })

  // 注册批次变化回调，由 Pinia store 统一管理
  unsubscribeBatchChange = folderStore.onBatchChange(async (folders, action) => {
    const matchFolder = currentFolderName || storage.path.getTempSessionName(currentSessionId)
    if (folders.includes(matchFolder)) {
      await loadBatchButtons()
    }
  })
})

/**
 * 组件卸载时的清理
 */
onUnmounted(async () => {
  // 标记组件已卸载，防止异步初始化继续执行
  isUnmounted = true

  // 取消未执行的初始化定时器
  if (initTimeoutId) {
    clearTimeout(initTimeoutId)
    initTimeoutId = null
  }

  if (pauseListener) {
    pauseListener.remove()
    pauseListener = null
  }
  if (resumeListener) {
    resumeListener.remove()
    resumeListener = null
  }
  if (unsubscribeBatchChange) {
    unsubscribeBatchChange()
    unsubscribeBatchChange = null
  }
  // 组件卸载时也执行彻底清理（如果 beforeRouteLeave 中未执行过）
  if (!_hasCleaned) {
    await cleanupResourcesForExit()
  } else {
    logger.debug(
      '[PointCloud] onUnmounted: cleanupResourcesForExit 已在 beforeRouteLeave 中执行，跳过',
    )
  }
})

/**
 * 组件被 keep-alive 缓存时调用
 * 完全保持状态，只暂停后台渲染定时器
 */
onDeactivated(() => {
  logger.debug('[PointCloud] onDeactivated - 组件被缓存，完全保持状态')

  // 所有状态完全保持
})

/**
 * 组件从 keep-alive 缓存中激活时调用
 * 从 BatchDetail 返回时，状态完全保持，无需恢复
 *
 * 注意：由于 goToBatch 阻止了采集状态下的跳转
 * 从 BatchDetail 返回时一定不在采集状态，无需恢复采集定时器
 */
onActivated(async () => {
  logger.debug('[PointCloud] onActivated - 组件被激活，状态完全保持')

  // 所有状态完全保持，无需任何恢复操作
  // - 所有数据状态保持
})

/**
 * 路由离开守卫
 * 根据目标路由执行不同的清理策略
 * 调用router.back()时，会先等待 onBeforeRouteLeave执行完毕，这里将部分场景下蓝牙取消订阅修改为非阻塞的，避免影响路由跳转
 */
onBeforeRouteLeave(async (to, from, next) => {
  logger.debug('[PointCloud] 执行 beforeRouteLeave 守卫')

  try {
    // 检查是否离开会话页面
    // if (isLeavingSession(to) && hasStarted) {
    // logger.debug('[PointCloud] 离开会话页面，检查是否需要删除临时文件夹')
    // await delSessionDir() // 没保存，暂时先不删除 3/19
    // }

    // 根据目标路由执行不同的清理策略
    if (to.name === 'BatchDetail') {
      logger.debug('[PointCloud] 导航到 BatchDetail 页面，完全保持状态')
      // 添加 PointCloudView 到 keep-alive 缓存
      keepAliveStore.addCache('PointCloudView')
    } else {
      logger.debug('[PointCloud] 导航到其他页面，移除 keep-alive 缓存并执行完整清理')
      // 从 keep-alive 缓存中移除
      keepAliveStore.removeCache('PointCloudView')

      // 取消未执行的初始化定时器，防止清理后渲染器又被创建
      if (initTimeoutId) {
        clearTimeout(initTimeoutId)
        initTimeoutId = null
      }

      // 标记组件已卸载，防止 onUnmounted 中重复清理
      isUnmounted = true

      // nonBlockingBleCleanup: true → BLE取消订阅作为fire-and-forget后台执行
      // 不阻塞路由跳转，避免BLE底层descriptor写入延迟导致UI卡死
      await cleanupResourcesForExit({ nonBlockingBleCleanup: true })
    }

    next()
  } catch (error) {
    logger.error('[PointCloud] 路由离开守卫执行错误', error)
    next()
  }
})

/**
 * 应用恢复时的处理
 */
async function handleAppResume() {
  // 1. 重新启用屏幕常亮
  await enableScreenKeepAwake()

  // --- 恢复前检查设备是否仍然连接 ---
  if (bluetoothStore.connectionStatus !== 2) {
    logger.debug('[PointCloudPage] 设备未连接，不恢复采集')
    return
  }
  // --- 结束：恢复前检查设备是否仍然连接 ---
}

/**
 * 处理编辑点击
 */
const handleEditClick = () => {}

/**
 * 处理设置点击
 */
const handleSettingClick = () => {}

// ==============================================
// 多站点显示相关函数
// ==============================================

/**
 * 创建锚点精灵
 * @param {THREE.Scene} scene - Three.js 场景
 */
function createAnchorSprites(scene) {
  // 清理现有锚点
  anchorSprites.forEach((sprite) => {
    scene.remove(sprite)
    sprite.material.map.dispose()
    sprite.material.dispose()
  })
  anchorSprites = []

  for (const station of stations) {
    const sprite = createAnchorSprite(station)
    // 点云数据的原始Y坐标范围约-4到-1，中心约在-2.5
    // 锚点放在点云数据中心上方一点，方便用户点击
    const anchorY = station.offset.y - 2 // 点云中心位置
    const anchorZ = station.offset.z + 1 // 稍微高出点云
    sprite.position.set(station.offset.x, anchorY, anchorZ)
    sprite.scale.set(1.5, 1.5, 1)
    sprite.userData = { stationId: station.id, isAnchor: true }

    scene.add(sprite)
    anchorSprites.push(sprite)
  }
}

/**
 * 创建单个锚点精灵
 * @param {Object} station - 站点配置
 * @returns {THREE.Sprite} 锚点精灵
 */
function createAnchorSprite(station) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  // 绘制圆形背景
  ctx.beginPath()
  ctx.arc(32, 32, 28, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = station.hexColor || '#000000'
  ctx.lineWidth = 3
  ctx.stroke()

  // 绘制文字
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(station.id + 1), 32, 32)

  const texture = new THREE.CanvasTexture(canvas)
  // 设置 depthTest: false 使锚点不会被其他对象遮挡
  // 设置 depthWrite: false 避免影响其他对象的深度测试
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)

  return sprite
}

/**
 * 容器点击事件处理
 * @param {MouseEvent} event - 鼠标事件
 */
function onContainerClick(event) {
  if (!renderer || !container.value || !isRendererReady.value) return

  const rect = container.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  const camera = renderer.getCamera()
  raycaster.setFromCamera(mouse, camera)

  const intersects = raycaster.intersectObjects(anchorSprites)
  if (intersects.length > 0) {
    const stationId = intersects[0].object.userData.stationId
    jumpToBatchDetail(stationId)
  }
}

/**
 * 跳转到 BatchDetail 页面
 * @param {number} stationId - 站点ID
 */
function jumpToBatchDetail(stationId) {
  if (!currentSessionId) return
  logger.debug('[PointCloud] 跳转到 BatchDetail', { stationId, currentSessionId })
  router.push({
    name: 'BatchDetail',
    params: {
      currentSessionId,
      bid: stationId + 1,
    },
  })
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
/**
幕布画板背景色
*/
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

.stitch-btn {
  position: absolute;
  top: 16px;
  right: calc(44px + 16px + 32px + 44px + 16px);
  padding: 0 10px;
  height: 28px;
  min-width: 44px;
  width: auto;
  background: linear-gradient(145deg, #00c853, #00e676);
  border: none;
  border-radius: 999px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(0, 200, 83, 0.25);
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stitch-btn:hover:not(:disabled) {
  background: linear-gradient(145deg, #00e676, #00c853);
  box-shadow: 0 6px 16px rgba(0, 200, 83, 0.35);
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.25);
}

.stitch-btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 2px 8px rgba(0, 200, 83, 0.2);
}

.stitch-btn:disabled {
  background: rgba(0, 200, 83, 0.5);
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
}
 */

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
.stitch-btn:disabled,
.disconnect-back-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none;
  border-color: rgba(255, 255, 255, 0.08);
}

/* ========== 采集进度卡片 ========== */
.collection-progress-card {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 280px;
  background: rgba(16, 22, 32, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translate(-50%, -40%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

.progress-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radar-icon {
  width: 100%;
  height: 100%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}

.progress-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.progress-bar-container {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2a7aff, #4d9eff);
  border-radius: 4px;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(42, 122, 255, 0.5);
  animation: shimmer 2s linear infinite;
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.progress-percentage {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 40px;
  text-align: right;
}

.progress-stats {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
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
    right: calc(40px + 16px + 16px);
  }

  .stitch-btn {
    right: calc(40px + 16px + 16px + 40px + 16px);
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

  /* 移动端采集进度卡片适配 */
  .collection-progress-card {
    width: 240px;
    padding: 20px;
  }

  .progress-icon {
    width: 40px;
    height: 40px;
  }

  .progress-title {
    font-size: 16px;
  }

  .progress-bar {
    height: 6px;
  }

  .progress-percentage {
    font-size: 12px;
    min-width: 36px;
  }

  .stat-label,
  .stat-value {
    font-size: 12px;
  }
}
</style>
