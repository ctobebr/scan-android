<template>
  <div class="project-collection-container">
    <!-- 外层滚动容器 -->
    <div class="scroll-container">
      <!-- 标签切换区 -->
      <div class="tabs">
        <button
          v-for="tab in displayedTabs"
          :key="tab.id"
          class="tab-button"
          :class="{ active: activeTab === tab.id }"
          @click="handleTabClick(tab)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 内容区域 - 使用动态组件和 Transition -->
      <div class="content-area">
        <transition name="slide-left" mode="out-in">
          <keep-alive>
            <component :is="currentComponent" :key="activeTab" />
          </keep-alive>
        </transition>
      </div>
    </div>

    <div class="floating-bottom-buttons">
      <button class="connect-button" @click="toggleConnectionDialog">
        <img :src="getConnectIconSrc()" alt="Connection Status" class="connect-icon" />
      </button>
      <button class="btn-start" @click="handleStartRecord">开始采集</button>
    </div>

    <!-- 连接设备选择对话框 -->
    <teleport to="body">
      <div
        v-if="showConnectionDialog"
        class="connection-dialog-overlay"
        @click="closeConnectionDialog"
      >
        <div class="connection-dialog-content" @click.stop>
          <div class="dialog-header">
            <div class="dialog-title">选择设备</div>
          </div>
          <div class="dialog-body">
            <!-- 条件渲染：扫描中 -->
            <div v-if="scanning" class="scan-status-item">正在扫描中...</div>
            <!-- 条件渲染：未发现设备（且非扫描中） -->
            <div v-else-if="filteredDevices.length === 0" class="no-devices-item">
              未发现附近设备
            </div>
            <!-- 条件渲染：显示设备列表（且非扫描中、非无设备） -->
            <div v-else>
              <div v-for="device in filteredDevices" :key="device.deviceId" class="device-item">
                <div class="device-info">
                  <strong class="device-name">{{ device.name }}</strong>
                </div>
                <div class="action">
                  <!-- 情况1: 正在连接当前设备 -->
                  <div
                    v-if="connectingStatus === 1 && connectingDeviceId === device.deviceId"
                    class="spinner"
                  ></div>

                  <!-- 情况2: 已连接当前设备 -->
                  <button
                    v-else-if="connectingStatus === 2 && connectingDeviceId === device.deviceId"
                    @click="handleDisconnect(device)"
                    class="connect-btn connected"
                  >
                    已连接
                  </button>
                  <!-- 情况3: 未连接（或连接的是其他设备）-->
                  <button v-else @click="handleConnect(device)" class="connect-btn">连接</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onActivated, defineOptions, onBeforeUnmount, watch } from 'vue'
import FileList from './FileList.vue'
import ProjectList from './ProjectList.vue'
import SettingList from './setting/SettingList.vue'
import { bluetoothService } from '@/services/bluetoothService'
// import { showToast } from '@/utils/toast'
import { useBluetoothStore } from '@/stores/bluetooth'
import { useFoldersStore } from '@/stores/folders'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { lockToPortrait } from '@/utils/screen'
import { StatusBar } from '@capacitor/status-bar'
import { showLoadingToast, closeToast, showToast } from 'vant'

defineOptions({
  name: 'MainContentTabs',
})

const router = useRouter()
const bluetoothStore = useBluetoothStore()
const folderStore = useFoldersStore()

const { devices, scanning, connectingStatus, connectingDeviceId } = storeToRefs(bluetoothStore)

// 计算属性：过滤掉 name 为 "N/A" 的设备
const filteredDevices = computed(() => {
  return devices.value.filter((device) => device.name !== 'N/A')
})

// ========== 监听连接状态变化，更新设备列表中的显示 ==========
watch(
  [connectingStatus, connectingDeviceId],
  () => {
    console.log('连接状态变化，更新设备列表显示')
  },
  { deep: false },
)

onMounted(async () => {
  await lockToPortrait()
  await StatusBar.setOverlaysWebView({ overlay: false })
  await StatusBar.setBackgroundColor({ color: '#e6f7ff' })
  bluetoothStore.autoScanOnEnter()

  // 使用 store 加载项目文件夹列表，maincontenttabs作为容器，负责整体数据管理和初始化，逻辑上看不放在其下的动态组件中去做会更好一点
  await folderStore.loadProjectFolders()

  // 如果显示已连接，但实际可能已断开，做个状态校验
  setTimeout(() => {
    if (connectingStatus.value === 2 && connectingDeviceId.value) {
      bluetoothService.checkConnectionStatus(connectingDeviceId.value).catch(() => {
        console.log('页面启动时检测到连接已断开')
      })
    }
  }, 500)
})

onActivated(async () => {
  await lockToPortrait()
  await StatusBar.setOverlaysWebView({ overlay: false })
  await StatusBar.setBackgroundColor({ color: '#e6f7ff' })
  // 重新扫描以获取最新的设备状态
  if (showConnectionDialog.value) {
    bluetoothStore.autoScanOnEnter()
  }

  // 页面激活时刷新项目列表，确保获取最新数据
  // await folderStore.refreshFolders()
})

onBeforeUnmount(() => {
})

const handleStartRecord = () => {
  // if (connectingStatus.value != 2) {
  //   showToast({
  //     message: '请先连接设备',
  //     position: 'bottom',
  //   })
  //   return
  // }
  closeConnectionDialog()
  router.push('/pointCloud')
  showToast({
    message: '请旋转手机，并放置在云台上',
    position: 'bottom',
  })
}

const handleConnect = (device) => {
  bluetoothStore.handleConnect(device)
}

const handleDisconnect = (device) => {
  bluetoothStore.handleDisconnect(device)
  showToast({
    message: '已断开连接',
    position: 'bottom',
  })
}

const baseTabs = [
  { id: 'Projects', label: '项目', component: ProjectList },
  { id: 'FileList', label: '数据', component: FileList },
]

  // 完整的 Tabs
const allTabs = [
  { id: 'Projects', label: '项目', component: ProjectList },
  { id: 'FileList', label: '数据', component: FileList },
  { id: 'SettingList', label: '设置', component: SettingList },
]

// ========== 开始：解锁设置页面相关 ==========
//  控制设置页面是否解锁
const isSettingUnlocked = ref(false)

// 计数器相关变量
let clickCount = 0
let lastClickTime = 0
const REQUIRED_CLICKS = 7 // 需要点7次
// 时间窗口设定：1000ms (1秒)

// 1秒内点7次大约是每秒7下的频率。
const TIME_WINDOW_MS = 1000

// 计算属性：根据是否解锁返回不同的 Tab 列表
const displayedTabs = computed(() => {
  return isSettingUnlocked.value ? allTabs : baseTabs
})
// --- 根据 displayedTabs 的变化自动生效 ---
const currentComponent = computed(() => {
  // 注意：这里我们直接从 displayedTabs 中找，确保只渲染可见的组件
  const activeTabObj = displayedTabs.value.find((tab) => tab.id === activeTab.value)
  return activeTabObj ? activeTabObj.component : null
})

// 管理当前激活的 Tab
const activeTab = ref('Projects') // 默认显示“项目”

// 切换标签的方法
const switchTo = (tabId) => {
  activeTab.value = tabId
}
// 点击处理逻辑
const handleTabClick = (tab) => {
  switchTo(tab.id);

  // 只有在未解锁且点击数据页面时才处理计数
  if (tab.id === 'FileList' && !isSettingUnlocked.value && connectingStatus.value == 2) {
    const now = Date.now()

    // 检查时间窗口
    if (now - lastClickTime > TIME_WINDOW_MS) {
      clickCount = 0
    }
    clickCount++
    lastClickTime = now

    // 检查是否触发彩蛋
    if (clickCount >= REQUIRED_CLICKS) {
      isSettingUnlocked.value = true
      // 只提示一次
      showToast({
        message: '设置页面已解锁',
        position: 'bottom',
      })
      clickCount = 0
    }
  }

  // 解锁后点击数据页面不做任何事
}
// ========== 结束：解锁设置页面相关 ==========

// 获取连接状态图标路径
const getConnectIconSrc = () => {
  switch (connectingStatus.value) {
    case 2:
      return new URL('@/assets/img/connect_suc.png', import.meta.url).href // 连接成功
    // case 'failed':
    //   return new URL('@/assets/img/connect_fail.png', import.meta.url).href; // 连接失败
    default:
      return new URL('@/assets/img/connect.png', import.meta.url).href // 未连接
  }
}

// 控制连接对话框的显示/隐藏
const showConnectionDialog = ref(false)
// 监听对话框状态变化，控制状态栏样式
watch(showConnectionDialog, async (newVal) => {
  if (newVal) {
    // 显示对话框时：进入沉浸式，让遮罩层覆盖状态栏
    // await StatusBar.setOverlaysWebView({ overlay: true })  // 开启全面屏
    await StatusBar.setBackgroundColor({ color: '80000000' })// 透明背景上用亮色文字
  } else {
    // 关闭对话框时：恢复普通模式
    // await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setBackgroundColor({ color: '#e6f7ff' }) // 浅色背景上用深色文字
  }
}, { immediate: false }) // immediate: false 表示只在变化时触发
// 显示连接对话框
const toggleConnectionDialog = () => {
  showConnectionDialog.value = !showConnectionDialog.value
  // 只在打开对话框（新状态为 true）且设备未连接时扫描
  // 如果蓝牙设备已经连接，再去搜索，会搜索不到蓝牙设备
  if (showConnectionDialog.value && connectingStatus.value !== 2) {
    bluetoothStore.autoScanOnEnter()
  }
}

// 关闭连接对话框
const closeConnectionDialog = () => {
  showConnectionDialog.value = false
}
</script>

<style scoped>
/* 主容器 - 用于整体布局和固定底部按钮 */
.project-collection-container {
  width: 100%;
  height: 100vh;  /* 使用视口高度确保占满整个屏幕 */
  min-height: 100vh;  /* 即使内容很少也保持最小高度 */
  display: flex;
  flex-direction: column;
  padding: 16px;
  padding-bottom: 0;  /* 移除底部padding，由滚动容器处理 */
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
    'Helvetica Neue', sans-serif;
  box-sizing: border-box;
  background: transparent;  /* 透明，让父容器渐变显示 */
  position: relative;  /* 为子元素定位提供参考 */
}

.scroll-container {
  flex: 1;
  min-height: 0;  /* 防止flex溢出 */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: #c1c1c1 transparent;
  background: transparent;
  /* 为底部固定按钮预留空间，确保内容不会被按钮遮挡 */
  padding-bottom: 86px;  /* 按钮容器高度(56px) + 底部间距(16px) + 额外空间(14px) */
}

.scroll-container::-webkit-scrollbar {
  width: 6px;
}

.scroll-container::-webkit-scrollbar-thumb {
  background-color: #c1c1c1;
  border-radius: 3px;
}

.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.tabs {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 8px;
  flex-shrink: 0;  /* 防止被压缩 */
  background: transparent;
}

.tab-button {
  border: none;
  background: transparent;
  padding: 8px 0;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  outline: none;
  transition: color 0.2s ease;
  text-align: center;
  box-shadow: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.tab-button.active {
  font-weight: bold;
  color: #1890ff;
  border-bottom: 2px solid #1890ff;
  padding-bottom: 6px;
}

.content-area {
  flex: 1;
  min-height: 0;  /* 允许内容区域滚动 */
  overflow-y: hidden;
  background: transparent;
  position: relative;  /* 为子元素定位提供参考 */
}

/* 确保动态组件容器也占满 */
.content-area > * {
  height: 100%;
  background: transparent;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.1s ease;
  position: absolute;  /* 绝对定位避免动画期间布局问题 */
  width: 100%;
  height: 100%;
}

.slide-left-enter-from {
  transform: translateX(100%);
}

.slide-left-leave-to {
  transform: translateX(-100%);
}

.floating-bottom-buttons {
  position: fixed;
  bottom: 16px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  z-index: 1001;
  background: transparent;
  padding: 0 20px;
  pointer-events: none;
  flex-shrink: 0;
  height: 56px;  /* 固定按钮容器高度 */
}

.floating-bottom-buttons button {
  pointer-events: auto;
  z-index: 2;
}

.btn-start {
  padding: 16px 32px;
  background-color: rgba(24, 144, 255, 0.7);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
  -webkit-tap-highlight-color: transparent;
  flex: 3;
}

.connect-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  flex: 1;
  outline: none;
}

.connect-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.connect-button:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.connect-button:active,
.connect-button:focus {
  background-color: transparent;
  outline: none;
  box-shadow: none;
  transform: scale(0.95);
}

/* 连接对话框样式 */
.connection-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.connection-dialog-content {
  background-color: white;
  border-radius: 16px;
  width: 300px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
  background-color: #f8f9fa;
}

.dialog-title {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  text-align: center;
}

.dialog-body {
  padding: 16px 20px;
  max-height: 50vh;
  overflow-y: auto;
}

.scan-status-item,
.no-devices-item {
  padding: 12px 0;
  font-size: 14px;
  color: #999;
  text-align: center;
  border-bottom: none;
  cursor: default;
}

.device-item {
  padding: 12px 0;
  border-bottom: 1px solid #eee;
  font-size: 14px;
  color: #333;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.device-info {
  flex: 1;
  padding-right: 16px;
  display: flex;
  min-width: 0;
}

.device-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}

.connect-btn {
  padding: 6px 12px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.connect-btn.connected {
  background: #4cd964;
  border-color: #4cd964;
  cursor: default;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid var(--primary);
  border-radius: 50%;
  margin-right: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.device-item:last-child {
  border-bottom: none;
}
</style>
