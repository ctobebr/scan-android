<template>
  <div class="point-cloud-page">
    <h2 class="page-title">点云</h2>
    <div ref="container" class="three-container"></div>
    <div class="point-cloud-controls">
      <button class="control-btn" @click="startDataStream">开始采集</button>
      <button class="control-btn" @click="stopDataStream">暂停采集</button>
      <button class="control-btn" @click="clearPointCloudData">清空点云</button>
    </div>
    <div class="data-stats">
      <div class="stat-item">
        <span>点云数量</span>
        <span id="point-count">{{ pointCount }}</span>
      </div>
      <div class="stat-item">
        <span>点云速率</span>
        <span id="data-rate">   {{
          !hasStarted
            ? '0 点/秒'
            : isCollecting
              ? `${pointsPerSecond} 点/秒`
              : '已暂停'
        }}</span>
      </div>
      <div class="stat-item">
        <span>帧率</span>
        <span id="storage-status">{{ frameRate }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted,onUnmounted, watchEffect } from 'vue'
import { useBluetoothStore } from '@/stores/bluetooth'
import { usePointCloudRenderer } from '@/composables/usePointCloudRenderer'
import { showToast } from '@/utils/toast'

const bluetoothStore = useBluetoothStore()
const container = ref(null)
let renderer = null
let isRendererReady = ref(false)
let lastReportPointCount = ref(0)
let lastReportTime = ref(0)
let pointCount = ref(0)
let pointsPerSecond = ref(0)
let frameRate = ref(0)
const isCollecting = ref(false)  // true = 正在采集（向渲染器加点）
const hasStarted = ref(false)
// 初始化渲染器
onMounted(() => {
  // 延迟初始化，确保容器高度已计算
  setTimeout(() => {
    if (container.value) {
      renderer = usePointCloudRenderer(container.value)
      renderer.init()
      frameRate.value = renderer.TARGET_FPS
      isRendererReady.value = true
      // 监听窗口 resize
      window.addEventListener('resize', renderer.onResize)
    }
  }, 100)
})

// 清理资源
onUnmounted(() => {
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

})

// 开始数据流
function startDataStream() {
  isCollecting.value = true
  hasStarted.value = true
}

// 停止数据流
function stopDataStream() {
  isCollecting.value = false
}

function clearPointCloudData() {
  if (renderer?.resetPointCloud) {
    renderer.resetPointCloud()//  只重置点云
  }
  isCollecting.value = false
  // 重置 UI 计数
  pointCount.value = 0
  pointsPerSecond.value = 0
  lastReportTime.value = 0
  lastReportPointCount.value = 0
  hasStarted.value =false
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
    pointCount.value += newPoints.length //  只加本次新增数量
    // console.log(' 添加新点:',JSON.stringify(newPoints), newPoints.length, '累计:', pointCount.value)

    // ===== 计算 PPS（每秒点数）=====
    const now = performance.now() // 高精度时间（毫秒，带小数）

    // 首次初始化
    if (lastReportTime.value === 0) {
      lastReportTime.value = now
      lastReportPointCount.value = pointCount.value
      return
    }

    const timeDiff = now - lastReportTime.value // 毫秒
    if (timeDiff >= 1000) { // 满 1 秒
      const pointDiff = pointCount.value - lastReportPointCount.value
      const pps = Math.round(pointDiff / (timeDiff / 1000)) // 点/秒

      pointsPerSecond.value = pps

      // 更新“上次”状态
      lastReportTime.value = now
      lastReportPointCount.value = pointCount.value
    }
  } catch (err) {
     console.error('点云渲染异常，watchEffect 已中断！', err)
     showToast('重启应用')
    }

})
</script>

<style scoped>
.point-cloud-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  padding: 16px 0; /* 左右间距由 page-wrapper 控制 */
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
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.point-cloud-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

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
}

.control-btn:hover {
  background: #40a9ff;
}

.data-stats {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background: var(--surface);
  border-radius: 12px;
  padding: 12px 0;
  border: 1px solid #e6eaf0;
  text-align: center;
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
</style>
