<template>
  <div class="splice-page">
    <!-- 三号容器 -->
    <div ref="threeContainer" class="three-container"></div>

    <!-- 加载遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <span class="loading-text">{{ loadingText }}</span>
        <div v-if="loadingProgress > 0" class="loading-bar-container">
          <div class="loading-bar">
            <div class="loading-bar-fill" :style="{ width: loadingProgress + '%' }"></div>
          </div>
          <span class="loading-bar-text">{{ loadingProgress }}%</span>
        </div>
      </div>
    </div>

    <!-- Header -->
    <div class="splice-header">
      <button class="header-btn cancel-btn" @click="handleCancel">取消</button>
      <span class="header-title">手动拼接</span>
      <button class="header-btn save-btn" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </div>

    <!-- 模式切换 -->
    <div class="mode-panel">
      <button
        :class="['mode-btn', { active: currentMode === 'horizontal' }]"
        @click="switchMode('horizontal')"
      >
        水平调整
      </button>
      <button
        :class="['mode-btn', { active: currentMode === 'height' }]"
        @click="switchMode('height')"
      >
        高度调整
      </button>
    </div>

    <!-- 取消确认弹窗 -->
    <div v-if="showCancelDialog" class="dialog-overlay" @click.self="showCancelDialog = false">
      <div class="dialog-card">
        <h3>确认退出</h3>
        <p>确定要退出手动拼接吗？未保存的修改将丢失。</p>
        <div class="dialog-actions">
          <button class="dialog-btn dialog-cancel" @click="showCancelDialog = false">取消</button>
          <button class="dialog-btn dialog-confirm" @click="confirmCancel">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { useSpliceRenderer } from '@/composables/useSpliceRenderer.js'
import {
  readGlobalPosesAll,
  appendPoseToGlobalPosesAll,
  rebuildDenseCloud,
} from '@/utils/pointCloud/reconstruction'
import { sessionFolder } from '@/utils/storage/path'
import { readFile, readdir } from '@/services/storage/fileSystem'
import { StatusBar } from '@capacitor/status-bar'
import { createLogger } from '@/utils/logger'

defineOptions({
  name: 'SpliceView',
})

const props = defineProps({
  currentSessionId: { type: String, required: true },
  bid: { type: String, required: true },
})

const logger = createLogger('SpliceView')
const router = useRouter()
const route = useRoute()

const threeContainer = ref(null)
const loading = ref(true)
const loadingText = ref('加载点云数据...')
const loadingProgress = ref(0)
const saving = ref(false)
const currentMode = ref('horizontal')
const showCancelDialog = ref(false)

let renderer = null

console.log('[SpliceView] ====== 页面初始化 ======')
console.log('[SpliceView] props:', {
  currentSessionId: props.currentSessionId,
  bid: props.bid,
  folderName: route.query.folderName,
})

// ==================== 点云加载 ====================

/**
 * 解析点云文本内容为点数组
 */
function parsePointCloudText(content) {
  const lines = content.trim().split('\n')
  const points = []
  const firstLineMatch = lines[0] && lines[0].match(/[a-zA-Z]/)
  const startLine = firstLineMatch ? 1 : 0

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length >= 3) {
      const x = parseFloat(parts[0])
      const y = parseFloat(parts[1])
      const z = parseFloat(parts[2])
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        points.push({ x, y, z })
      }
    }
  }
  return points
}

/**
 * 应用4x4位姿矩阵变换单个点
 */
function applyPoseTransform(matrix, x, y, z) {
  return {
    x: matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
    y: matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
    z: matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
  }
}

/**
 * 读取某站位的原始点云文件
 */
async function loadStationRawPoints(folderName, batchIdx) {
  const batchDir = `${sessionFolder(folderName)}/Batch_${String(batchIdx).padStart(3, '0')}`

  try {
    const { files } = await readdir(batchDir)
    const pcFile = files.find(
      (f) => f.type === 'file' && f.name.startsWith('pointCloud_data_') && f.name.endsWith('.txt'),
    )
    if (!pcFile) return []

    const filePath = `${batchDir}/${pcFile.name}`
    const result = await readFile(filePath, { encoding: 'utf8' })
    if (!result || !result.data) return []

    return parsePointCloudText(result.data)
  } catch (e) {
    logger.warn(`[SpliceView] 加载站位 ${batchIdx + 1} 点云失败:`, e.message)
    return []
  }
}

/**
 * 解析完整文件夹名
 * 处理 currentSessionId 可能是截断值（如 "5jhs8kfhgy6"）而非完整文件夹名（如 "a7f3c9d1-5jhs8kfhgy6"）的情况
 */
async function resolveFolderName() {
  const queryFolder = route.query.folderName
  const sessionId = props.currentSessionId

  // 如果有 query folderName 且它不是空的，直接使用
  if (queryFolder && queryFolder.length > 0) {
    console.log('[SpliceView] resolveFolderName: 使用 query.folderName:', queryFolder)
    return queryFolder
  }

  // 否则，在 pointcloud 目录中查找后缀匹配 sessionId 的文件夹
  console.log('[SpliceView] resolveFolderName: 在 pointcloud 目录中搜索 sessionId:', sessionId)
  try {
    const { files } = await readdir('pointcloud')
    for (const f of files || []) {
      if (f.type === 'directory' && f.name.endsWith(`-${sessionId}`)) {
        console.log('[SpliceView] resolveFolderName: 找到匹配文件夹:', f.name)
        return f.name
      }
    }
  } catch (e) {
    console.warn('[SpliceView] resolveFolderName: 读取 pointcloud 目录失败:', e.message)
  }

  // 最后兜底：使用 sessionId 本身
  console.warn('[SpliceView] resolveFolderName: 未找到匹配文件夹，使用 sessionId:', sessionId)
  return sessionId
}

/**
 * 加载所有数据并初始化渲染器
 */
async function loadData() {
  const folderName = await resolveFolderName()
  const anchorBatchIdx = parseInt(props.bid) - 1
  console.log('[SpliceView] loadData: folderName:', folderName, 'anchorBatchIdx:', anchorBatchIdx)

  try {
    // 1. 读取所有站位的位姿矩阵
    loadingText.value = '读取位姿数据...'
    const poses = await readGlobalPosesAll(folderName)

    // 2. 找出所有站位数量
    const batchDirs = []
    try {
      const dirFiles = await readdir(sessionFolder(folderName))
      for (const f of dirFiles.files || []) {
        const match = f.name?.match(/^Batch_(\d{3})$/)
        if (match && f.type === 'directory') {
          batchDirs.push(parseInt(match[1]))
        }
      }
      batchDirs.sort((a, b) => a - b)
    } catch (e) {
      logger.warn('[SpliceView] 读取批次目录失败:', e.message)
    }

    const totalStations = batchDirs.length
    if (totalStations === 0) {
      showToast('未找到站位数据')
      loading.value = false
      return
    }

    logger.info(`[SpliceView] 共发现 ${totalStations} 个站位，锚点站位: ${anchorBatchIdx + 1}`)

    // 3. 加载锚点站位的原始点云（可移动模型）
    loadingText.value = `加载锚点站位 ${props.bid} 数据...`
    const anchorPoints = await loadStationRawPoints(folderName, anchorBatchIdx)
    const anchorPose = poses.get(anchorBatchIdx + 1)

    logger.info(`[SpliceView] 锚点站位点云: ${anchorPoints.length} 个点`)

    // 4. 加载其他站位的原始点云（固定模型）
    loadingText.value = '加载其他站位数据...'
    const fixedPoints = []

    for (let i = 0; i < batchDirs.length; i++) {
      const batchIdx = batchDirs[i]
      if (batchIdx === anchorBatchIdx) continue // 跳过锚点站位

      loadingProgress.value = Math.round(((i + 1) / batchDirs.length) * 100)

      const points = await loadStationRawPoints(folderName, batchIdx)
      const pose = poses.get(batchIdx + 1)

      if (pose) {
        for (const p of points) {
          fixedPoints.push(applyPoseTransform(pose, p.x, p.y, p.z))
        }
      } else {
        fixedPoints.push(...points)
      }
    }

    loadingProgress.value = 100
    logger.info(`[SpliceView] 固定模型点云: ${fixedPoints.length} 个点`)

    // 5. 设置渲染器模型
    renderer.setFixedModel(fixedPoints)
    renderer.setMoveableModel(anchorPoints)
    // 恢复已保存的调整位姿（平移/旋转）
    if (anchorPose) {
      renderer.applyInitialPose(anchorPose)
    }

    loadingText.value = '加载完成'
    setTimeout(() => {
      loading.value = false
    }, 300)
  } catch (e) {
    logger.error('[SpliceView] 加载数据失败:', e)
    showToast('加载数据失败')
    loading.value = false
  }
}

// ==================== 模式切换 ====================

function switchMode(mode) {
  if (currentMode.value === mode || loading.value) return
  console.log('[SpliceView] switchMode 被调用:', mode)
  currentMode.value = mode
  renderer?.setMode(mode)
}

// ==================== 保存逻辑 ====================

async function handleSave() {
  if (saving.value || loading.value) return

  console.log('[SpliceView] ====== handleSave 开始 ======')
  saving.value = true
  showLoadingToast({ message: '拼接保存中...', forbidClick: true, duration: 0 })

  try {
    const folderName = await resolveFolderName()
    const anchorBatchNo = parseInt(props.bid)

    // 1. 获取用户操作的变换
    const transform = renderer.getMoveableTransform()
    const hasChanged = renderer.hasTransformChanged()

    console.log('[SpliceView] handleSave - folderName:', folderName)
    console.log('[SpliceView] handleSave - 变换数据:', transform)
    console.log('[SpliceView] handleSave - 是否有变化:', hasChanged)

    if (hasChanged) {
      // 2. 读取所有位姿矩阵
      const poses = await readGlobalPosesAll(folderName)
      const oldPose = poses.get(anchorBatchNo)

      // 3. 构建新的4x4位姿矩阵
      // 基础矩阵（单位矩阵或原有矩阵）
      let newMatrix
      if (oldPose) {
        newMatrix = oldPose.map((row) => [...row])
      } else {
        newMatrix = [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1],
        ]
      }

      // 应用旋转变换（仅绕Y轴旋转）
      const cosR = Math.cos(transform.rotationY)
      const sinR = Math.sin(transform.rotationY)

      // 旋转矩阵 * 现有矩阵的旋转部分
      const rotMatrix = [
        [cosR, 0, sinR, 0],
        [0, 1, 0, 0],
        [-sinR, 0, cosR, 0],
        [0, 0, 0, 1],
      ]

      // 更新平移分量（加上用户操作的偏移量）
      newMatrix[0][3] += transform.position.x
      newMatrix[1][3] += transform.position.y
      newMatrix[2][3] += transform.position.z

      // 如果原始姿态中没有旋转分量，直接使用用户旋转
      if (!oldPose || (Math.abs(oldPose[0][1]) < 0.0001 && Math.abs(oldPose[0][2]) < 0.0001)) {
        // 原始是纯平移，直接应用旋转
        const rotOnly = [
          [cosR, 0, sinR, newMatrix[0][3]],
          [0, 1, 0, newMatrix[1][3]],
          [-sinR, 0, cosR, newMatrix[2][3]],
          [0, 0, 0, 1],
        ]
        newMatrix = rotOnly
      }

      logger.info(
        `[SpliceView] 保存变换: pos=(${transform.position.x.toFixed(3)}, ${transform.position.y.toFixed(3)}, ${transform.position.z.toFixed(3)}), rotY=${transform.rotationY.toFixed(4)}`,
      )

      // 4. 更新位姿矩阵
      await appendPoseToGlobalPosesAll(folderName, anchorBatchNo, newMatrix)

      // 5. 重建合并点云
      loadingText.value = '重建合并点云...'
      const updatedPoses = await readGlobalPosesAll(folderName)
      await rebuildDenseCloud(folderName, updatedPoses)

      logger.info('[SpliceView] 合并点云重建完成')
    } else {
      logger.info('[SpliceView] 模型未移动，跳过保存')
    }

    closeToast()
    showToast({ message: '保存成功', position: 'bottom', duration: 1500 })

    console.log('[SpliceView] handleSave - 保存成功, 即将返回 pointCloud')

    // 返回 pointCloud（跳过 splice 和 BatchDetail，回退两步）
    setTimeout(() => {
      router.go(-2)
    }, 500)
  } catch (e) {
    closeToast()
    logger.error('[SpliceView] 保存失败:', e)
    showToast({ message: '保存失败: ' + (e.message || '未知错误'), position: 'bottom' })
    saving.value = false
  }
}

// ==================== 取消逻辑 ====================

function handleCancel() {
  console.log('[SpliceView] handleCancel 被调用')
  showCancelDialog.value = true
}

function confirmCancel() {
  console.log('[SpliceView] confirmCancel - 确认退出')
  showCancelDialog.value = false
  router.go(-2) // 直接返回 pointCloud 页面，跳过 BatchDetail
}

// ==================== 生命周期 ====================

onMounted(async () => {
  console.log('[SpliceView] onMounted 开始')

  // 设置状态栏
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setBackgroundColor({ color: '#0a0d12' })
    await StatusBar.setStyle({ style: 'LIGHT' })
  } catch (err) {
    logger.warn('StatusBar 设置失败:', err)
  }

  // 初始化渲染器
  if (threeContainer.value) {
    console.log('[SpliceView] 初始化渲染器, bid:', props.bid)
    renderer = useSpliceRenderer(threeContainer.value, { anchorBid: parseInt(props.bid) })
    renderer.init()
    await loadData()
  }
  console.log('[SpliceView] onMounted 完成')
})

onBeforeUnmount(async () => {
  console.log('[SpliceView] onBeforeUnmount')

  // 恢复状态栏
  try {
    await StatusBar.setBackgroundColor({ color: '#0a0a1a' })
  } catch (_) {}
})

onUnmounted(() => {
  console.log('[SpliceView] onUnmounted - 销毁渲染器')
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
})
</script>

<style scoped>
.splice-page {
  --bg-deep: #0a0d12;
  --bg-surface: rgba(16, 22, 32, 0.85);
  --bg-surface-hover: rgba(24, 32, 44, 0.9);
  --brand-primary: #2a7aff;
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
  user-select: none;
  -webkit-touch-callout: none;
  overflow: hidden;
}

/* ========== Three.js 容器 ========== */
.three-container {
  position: absolute;
  inset: 0;
  background: radial-gradient(#1a2a3a, #001122);
  overflow: hidden;
}

/* ========== 加载遮罩 ========== */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 13, 18, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 100;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.loading-spinner {
  width: 44px;
  height: 44px;
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
  font-size: 15px;
  color: var(--text-secondary);
}

.loading-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 240px;
}

.loading-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.loading-bar-fill {
  height: 100%;
  background: var(--brand-gradient);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.loading-bar-text {
  font-size: 12px;
  color: var(--text-tertiary);
  min-width: 36px;
}

/* ========== Header ========== */
.splice-header {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 16px;
  background: transparent;
  z-index: 50;
  pointer-events: none;
}

.header-btn {
  padding: 0 16px;
  height: 36px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
  letter-spacing: 0.5px;
}

.cancel-btn {
  background: rgba(16, 22, 32, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn:hover {
  background: rgba(26, 34, 48, 0.9);
  border-color: rgba(255, 255, 255, 0.2);
}

.cancel-btn:active {
  transform: scale(0.97);
}

.save-btn {
  background: var(--brand-gradient);
  color: white;
  box-shadow: 0 4px 12px var(--brand-glow);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.save-btn:hover:not(:disabled) {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
  box-shadow: 0 6px 16px var(--brand-glow);
  transform: translateY(-1px);
}

.save-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 1px;
  line-height: 36px;
  padding: 0 20px;
  background: rgba(16, 22, 32, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

/* ========== 模式切换面板 ========== */
.mode-panel {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 40px;
  padding: 6px;
  display: flex;
  gap: 4px;
  z-index: 50;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.mode-btn {
  padding: 10px 28px;
  border: none;
  border-radius: 34px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.25s ease;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.mode-btn.active {
  background: var(--brand-gradient);
  color: white;
  box-shadow: 0 4px 12px var(--brand-glow);
}

.mode-btn:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

/* ========== 取消确认弹窗 ========== */
.dialog-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 200;
}

.dialog-card {
  width: 320px;
  background: rgba(16, 22, 32, 0.98);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  animation: dialogIn 0.25s ease;
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-card h3 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-card p {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dialog-btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dialog-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.dialog-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}

.dialog-confirm {
  background: var(--brand-gradient);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.dialog-confirm:hover {
  background: linear-gradient(145deg, #4d9eff, #2a7aff);
}
</style>
