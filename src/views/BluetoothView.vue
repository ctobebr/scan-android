<template>
  <div class="bluetooth-page">
    <h2>附近蓝牙设备</h2>

    <!-- 扫描中 -->
    <div v-if="scanning" class="status">正在扫描...</div>

    <!-- 无设备 -->
    <div v-else-if="devices.length === 0" class="empty">未发现附近设备</div>

    <!-- 设备列表 -->
    <div class="device-list-container">
      <div v-for="device in devices" :key="device.deviceId" class="device-item">
        <div class="device-info">
          <strong>{{ device.name }}</strong>
          <small>MAC: {{ device.deviceId }}</small>
          <small>RSSI: {{ device.rssi }}</small>
          <!-- <small>UUIDS: {{ device.uuids?.length ? devices.uuids : 'NULL' }}</small> -->
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
            disabled
          >
            已连接
          </button>

          <!-- 情况3: 未连接（或连接的是其他设备）-->
          <button v-else @click="handleConnect(device)" class="connect-btn">连接</button>
        </div>
      </div>
    </div>
    <!-- 消息接收区域 -->
    <h3 class="section-title">接收数据</h3>
    <div ref="messageContainer" class="message-container" @scroll="onMessageScroll">
      <div v-for="(msg, index) in displayedMessages" :key="index" class="message-item">
        {{ msg }}
      </div>
    </div>
    <!-- 保存按钮 -->
    <button @click="saveMessages" class="save-btn" :disabled="displayedMessages.length === 0 || saving">
      {{ saving ? '保存中...' : '保存接收到的数据' }}
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { bluetoothService } from '@/services/bluetoothService'
import { showToast } from '@/utils/toast'
import { useBluetoothStore } from '@/stores/bluetooth'
import { storeToRefs } from 'pinia'

const bluetoothStore = useBluetoothStore()

onMounted(() => {
  bluetoothStore.autoScanOnEnter()
})

const handleConnect = (device) => {
  bluetoothStore.handleConnect(device)
}

const {
  devices,
  scanning,
  connectingStatus,
  connectingDeviceId,
  displayedMessages
} = storeToRefs(bluetoothStore)
const saving = ref(false) // 保存中状态
const messageContainer = ref(null)
// 标记用户是否正在查看历史（离开底部）
const isUserScrollingAway = ref(false)
let isProgrammaticScroll = ref(false)

// 阈值：距离底部多少像素以内算“在底部”
const SCROLL_THRESHOLD = 50 // 可根据 UI 调整
const fullMessages = bluetoothStore.getRawMessages()
watch(
  () => bluetoothStore.displayedMessages,
  () => {
    scrollToBottom()
  },
  { deep: true }
)
// watch(
//   () => bluetoothStore.messages, // 直接监听 store 属性（不是 ref）
//   () => {
//     scrollToBottom()
//   },
//   { deep: true } // Pinia的state属性 用storeToRefs转换时，需要开启深度监听，因为等同ref不是refstate
// )
const saveMessages = async () => {
  if (fullMessages.length === 0) return

  saving.value = true
  try {
    //  只传原始数组
    const result = await bluetoothService.saveBleDataToFile(fullMessages)
    // alert(JSON.stringify(result))
    showToast(`已保存 ${result.lineCount} 行数据`)
  } catch (error) {
    console.error('保存失败:', error)
    showToast('保存失败：' + (error.message || '未知错误'))
  } finally {
    // bluetoothStore.clearMessages()
    saving.value = false
  }
}
const scrollToBottom = () => {
  if(!messageContainer.value) return
  if (isUserScrollingAway.value && !isProgrammaticScroll.value) {
    return
  }
  isProgrammaticScroll.value = true
 requestAnimationFrame(() => {
    if (isUserScrollingAway.value || !messageContainer.value) return
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  })

}
const onMessageScroll = () => {
  if (isProgrammaticScroll.value) {
    // 忽略程序引起的滚动
    isProgrammaticScroll.value = false
    return
  }
  const { scrollTop, scrollHeight, clientHeight } = messageContainer.value
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight

  // 如果用户滚到离底部很近（比如 < 50px），视为“想看最新”，允许自动滚动
  isUserScrollingAway.value = distanceFromBottom > SCROLL_THRESHOLD
}




</script>

<style scoped>
.bluetooth-page {
  padding: 16px 0; /* 左右间距由 page-wrapper 控制 */
  background-color: transparent;
  /* height: calc(100vh - 72px); */
  height: 100%;
  display: flex;
  flex-direction: column;
}
.device-list-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
  width: 100%;
}
.status,
.empty {
  text-align: center;
  color: var(--muted, #666);
  padding: 24px 0;
}

.device-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f2f5;
  overflow: hidden;
}

.device-info {
  flex: 1;
  padding-right: 16px;
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

.section-title {
  margin: 12px 0 8px;
  font-size: 14px;
  color: var(--muted);
}

.message-container {
  height: 120px;
  background: var(--surface);
  border: 1px solid #eef2f6;
  border-radius: 8px;
  padding: 12px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.4;
  margin-bottom: 16px;
}

.message-item {
  padding: 4px 0;
  word-break: break-all;
}

/* 保存按钮 */
.save-btn {
  padding: 12px;
  background-color: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  width: 100%;
}
.save-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
