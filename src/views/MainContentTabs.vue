<template>
  <div class="project-collection-container">
    <!-- 外层滚动容器 -->
    <div class="scroll-container">
      <!-- 标签切换区 -->
      <div class="tabs">
        <button
          class="tab-button"
          :class="{ active: activeTab === 'Projects' }"
          @click="switchTo('Projects')"
        >
          项目
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'FileList' }"
          @click="switchTo('FileList')"
        >
          数据
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'SettingList' }"
          @click="switchTo('SettingList')"
        >
          设置
        </button>
      </div>

      <!-- 内容区域 - 使用动态组件和 Transition -->
      <div class="content-area">
        <transition name="slide-left" mode="out-in">
          <component :is="currentComponent" :key="activeTab" />
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
                  <!-- <small>{{ device.deviceId }}</small> -->
                  <!-- 可选：显示ID -->
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
import SettingList from './SettingList.vue'
import { bluetoothService } from '@/services/bluetoothService'
import { showToast } from '@/utils/toast'
import { useBluetoothStore } from '@/stores/bluetooth'
import { useFoldersStore } from '@/stores/folders'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { lockToPortrait } from '@/utils/screen'
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
// 当连接状态或连接设备ID变化时，强制刷新设备列表的计算属性
watch(
  [connectingStatus, connectingDeviceId],
  () => {
    console.log('连接状态变化，更新设备列表显示')
  },
  { deep: false },
)

onMounted(async () => {
  await lockToPortrait()
  console.log('onmounted')
  bluetoothStore.autoScanOnEnter()

  // 使用 store 加载项目文件夹列表
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

  // 重新扫描以获取最新的设备状态
  if (showConnectionDialog.value) {
    bluetoothStore.autoScanOnEnter()
  }

  // 加载本地项目文件夹列表（使用 store，利用缓存机制）
  await folderStore.loadProjectFolders()
})

onBeforeUnmount(() => {
})

const handleStartRecord = () => {
  if (connectingStatus.value != 2) {
    showToast('请先连接设备')
    return
  }
  closeConnectionDialog()
  router.push('/pointCloud')
  showToast('请旋转手机，并放置在云台上')
}

const handleConnect = (device) => {
  bluetoothStore.handleConnect(device)
}

const handleDisconnect = (device) => {
  bluetoothStore.handleDisconnect(device)
  showToast('已断开连接')
}

// 定义 Tab 数据，关联到具体的组件
const tabs = [
  { id: 'Projects', label: '项目', component: ProjectList },
  { id: 'FileList', label: '文件', component: FileList },
  { id: 'SettingList', label: '设置', component: SettingList },
]

// 管理当前激活的 Tab
const activeTab = ref(tabs[0].id) // 默认显示“项目”

// 计算属性：根据 activeTab 获取当前应渲染的组件
const currentComponent = computed(() => {
  const activeTabObj = tabs.find((tab) => tab.id === activeTab.value)
  return activeTabObj ? activeTabObj.component : null
})

// 切换标签的方法
const switchTo = (tabId) => {
  activeTab.value = tabId
}

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
  height: 100vh; /* 使用 height 而不是 min-height */
  display: flex; /* 启用 Flexbox */
  flex-direction: column; /* 垂直排列子元素 */
  padding: 16px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
    'Helvetica Neue', sans-serif;
  box-sizing: border-box;
}

/* 外层滚动容器 - 所有 sticky 元素都在这里滚动 */
.scroll-container {
  flex: 1; /* 占据主容器剩余空间 */
  overflow-y: auto; /* 关键：提供滚动容器 */
  display: flex;
  flex-direction: column; /* 确保子元素垂直堆叠 */
  /* 可以添加滚动条样式 */
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: #c1c1c1 transparent; /* Firefox */
}

.scroll-container::-webkit-scrollbar {
  width: 6px; /* Chrome, Safari */
}

.scroll-container::-webkit-scrollbar-thumb {
  background-color: #c1c1c1; /* Chrome, Safari */
  border-radius: 3px;
}

.scroll-container::-webkit-scrollbar-track {
  background: transparent; /* Chrome, Safari */
}

/* 吸顶的顶部导航栏容器 */
.sticky-top-nav {
  position: sticky; /* 关键：实现吸顶效果 */
  top: 0; /* 吸附到滚动容器的顶部 */
  background: linear-gradient(180deg, #e6f7ff 0%, #f0f9ff 100%); /* 与主背景色一致 */
  z-index: 100; /* 确保在滚动时能盖住下面的内容 */
  padding: 0 16px 16px 16px; /* 保持原有间距，但与标签区分离 */
}

/* 顶部导航栏 */
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px; /* 与标签区的距离 */
  /* flex-shrink: 0; /* 可选：防止此区域在空间不足时收缩 */
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.user-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* 确保 team-badge 紧贴内容 */
}

.username {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.team-badge {
  font-size: 12px;
  background-color: #1890ff;
  color: white;
  padding: 2px 6px; /* 调整内边距 */
  border-radius: 8px;
  /* display: inline-block; /* 默认 inline-block 在 flex 容器里行为会改变，但 align-items: flex-start 已经解决了 */
  /* width: auto; /* 不需要固定宽度 */
}

.notification-icon {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.icon-bell {
  font-size: 20px;
  color: #666;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 12px;
  height: 12px;
  background-color: #ff4d4f;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 8px;
  color: white;
}

/* 吸顶的标签区容器 */
.sticky-tabs {
  position: sticky;
  top: 0; /* 标签区初始位置也是0，但会被导航栏顶上去 */
  background: linear-gradient(180deg, #e6f7ff 0%, #f0f9ff 100%); /* 与主背景色一致 */
  z-index: 99; /* 低于导航栏 */
  padding: 0 16px 16px 16px; /* 与内容区域分离 */
}

/* 标签切换区 */
.tabs {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  /* border-bottom: 1px solid #ddd; */
  padding-bottom: 8px;
  /* flex-shrink: 0; /* 可选：防止此区域在空间不足时收缩 */
}

/* Tab 按钮样式 - 去掉按钮外观 */
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

/* 选中状态的 Tab 按钮样式 */
.tab-button.active {
  font-weight: bold;
  color: #1890ff;
  border-bottom: 2px solid #1890ff;
  padding-bottom: 6px;
}

/* 内容区域 - 修改为 flex-grow: 1 */
.content-area {
  flex: 1; /* 占据剩余空间 */
  overflow-y: hidden; /* 让子组件内部滚动 */
  /* margin-bottom: 20px; /* 可选：保留底部外边距，已移至主容器 */
  /* 移除 height: calc(100vh - 200px); */
  /* overflow: hidden; /* 移除，因为 flex-grow 已处理空间 */
}

/* --- 动画样式 --- */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.1s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
}

.slide-left-leave-to {
  transform: translateX(-100%);
}

/* 浮动底部按钮 - 脱离文档流，固定在视口底部 */
.floating-bottom-buttons {
  position: fixed; /* 固定定位 */
  bottom: 16px; /* 距离视口底部 */
  left: 0; /* 左侧对齐 */
  right: 0; /* 右侧对齐 */
  display: flex;
  justify-content: space-between; /* 水平居中 */
  align-items: center; /* 垂直居中 */
  gap: 8px; /* 按钮间距 */
  z-index: 1001; /* 确保在对话框之上 */
  background: transparent; /* 完全透明 */
  padding: 0 20px; /* 添加左右内边距，防止按钮紧贴屏幕边缘 */
  pointer-events: none; /* 关键：使该区域不拦截鼠标事件，允许点击穿透 */
}

/* 底部按钮 - 添加 pointer-events: auto 确保按钮本身可点击 */
.floating-bottom-buttons button {
  pointer-events: auto; /* 恢复按钮的交互能力 */
}

.btn-start {
  padding: 16px 32px; /* 根据需要调整padding以匹配之前的尺寸 */
  background-color: rgba(24, 144, 255, 0.7); /* 保持原有透明度 */
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
  /* flex-shrink: 0; 不要让它收缩 */
  -webkit-tap-highlight-color: transparent;
  flex: 3;
}

.connect-button {
  background: none; /* 保持无背景 */
  border: none;
  cursor: pointer;
  padding: 0; /* 移除默认 padding */
  border-radius: 50%;
  width: 40px; /* 设定固定宽度，例如 40px */
  height: 40px; /* 设定固定高度，与宽度相同，确保是正方形 */
  display: flex;
  justify-content: center;
  align-items: center; /* 在按钮内部垂直居中图标 */
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  flex: 1;
  outline: none; /* 移除焦点轮廓 */
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
  transform: scale(0.95); /* 可选：添加按下效果 */
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
  max-height: 50vh; /* 限制最大高度 */
  overflow-y: auto; /* 允许内容滚动 */
}

.scan-status-item,
.no-devices-item {
  padding: 12px 0;
  font-size: 14px;
  color: #999; /* 或其他表示状态的颜色 */
  text-align: center; /* 居中显示文字 */
  /* 移除 border-bottom 和 cursor */
  border-bottom: none;
  cursor: default;
}

.device-item {
  padding: 12px 0;
  border-bottom: 1px solid #eee;
  font-size: 14px;
  color: #333;
  /* cursor: pointer; */ /* 移除整体的 cursor pointer，让按钮自己处理 */
  display: flex;
  align-items: center;
  justify-content: space-between; /* 分别对齐左侧信息和右侧操作按钮 */
}

.device-info {
  flex: 1;
  padding-right: 16px;
  display: flex;
  min-width: 0; /* 关键：允许 flex 容器收缩其内容，否则 flex item 可能不会按预期缩小 */
}
.device-name {
  /* 类名对应的样式 */
  flex: 1; /* 占据所有可用空间 */
  overflow: hidden; /* 隐藏超出部分 */
  text-overflow: ellipsis; /* 超出部分显示省略号 */
  white-space: nowrap; /* 防止文字换行 */
  margin: 0; /* 重置 strong 标签默认的 margin */
}

.device-info small {
  color: #9aa4b2;
  display: block;
  margin-top: 4px;
}

.connect-btn {
  padding: 6px 12px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap; /* 防止按钮文字换行 */
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

.projects-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
}
.project-card {
  width: 120px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.project-card .thumb {
  height: 80px;
  background: #f3f3f3;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.project-card .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.project-meta {
  padding: 8px;
}
.project-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.project-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.project-actions button {
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: #1890ff;
  color: #fff;
  cursor: pointer;
}

/* 移除旧的 add-device 样式 */
/* .device-item.add-device { ... } */
/* .icon-refresh { ... } */

.device-item:hover {
  /* 移除 hover 效果，因为现在只有按钮可点击 */
  /* background-color: #f0f7ff; */
}
</style>
