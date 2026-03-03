<template>
  <div v-if="!deviceDisconnected">
    <button @click="sendCalibParam">设置标定参数</button>
    <button @click="sendRotateSpeed">设置转动速度</button>
    <button @click="sendScanTime">设置扫描时间</button>
    <button @click="sendPitchLimit">设置俯仰角上下限</button>
  </div>
  <div v-else>
    <text>设备未连接，请先连接设备</text>
  </div>
</template>

<script setup>
import { ref, reactive, toRefs, onBeforeMount, onMounted, watch, onUnmounted, onActivated } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useBluetoothStore } from '@/stores/bluetooth'
import { bluetoothService } from '@/services/bluetoothService'
import { App } from '@capacitor/app'
import { parseBleData } from '@/utils/parseBleData'
import { NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/protocolCommands'
import { showToast } from '@/utils/toast'

const bluetoothStore = useBluetoothStore()

const route = useRoute();

const router = useRouter();
const data = reactive({})
let parser = null
let pauseListener = null
let resumeListener = null

// --- 设备断开相关状态 ---
const isSubscribed = ref(false)
const deviceDisconnected = ref(false)
let disconnectUnregister = null
// --- 结束：设备断开相关状态 ---

const calibParamResponse = ref(null)    // 标定参数响应
const rotateSpeedResponse = ref(null)   // 转动速度响应
const scanTimeResponse = ref(null)      // 扫描时间响应
const pitchLimitResponse = ref(null)    // 俯仰角限制响应

onBeforeRouteLeave(async (to, from, next) => {
  console.log('[SettingList] 路由守卫：即将离开页面，开始清理')
  await cleanupResourcesForExit()
  console.log('[SettingList] 路由守卫：清理完成')
  next()
})
onMounted(async () => {
  console.log('onmounted setting')
  await init()
  registerDisconnectListener()

})
onActivated(async () => {
  console.log('[SettingList] 组件被激活，等待上一页清理完成...')
  try {
    // --- 轮询等待 ---
    // 只要 Pointcloud 还在清理，就一直等
    while (bluetoothStore.isCleanupInProgress) {
      console.log('[SettingList] 检测到上一页正在清理，等待中...')
      await new Promise(resolve => setTimeout(resolve, 50)); // 每 50ms 检查一次
    }
    // --- 结束：轮询等待 ---
    console.log('[SettingList] 上一页清理完成，开始初始化')
    await init()
    registerDisconnectListener()
  } catch (error) {
    console.error('页面激活初始化失败', error)
  }
})
onUnmounted(async () => {
  console.log('[SettingList] 组件销毁，开始清理所有资源')
  // 退出时清理资源
  await cleanupResourcesForExit()
  console.log('[SettingList] 组件销毁，清理所有资源完毕')
})
// --- 监听蓝牙Store的连接状态变化 ---
watch(
  // 状态说明：
  // 0: 连接中
  // 1: 未连接
  // 2: 已连接
  () => bluetoothStore.connectingStatus,
  (newStatus, oldStatus) => {
    if (oldStatus === 2 && newStatus !== 2) {
      // 连接从已连接变为非已连接状态
      if (!deviceDisconnected.value) {
        console.log('[SettingList] 检测到全局连接状态变为未连接')
        deviceDisconnected.value = true
      }
    }
    // 从非连接状态(0或1)变为已连接(2)
    if (oldStatus !== 2 && newStatus === 2) {
      console.log('[SettingList] 检测到设备连接成功，恢复连接状态')
      deviceDisconnected.value = false
      // 重新建立连接时，重新订阅服务
      init()
    }

  },
)

async function handleAppResume() {
  registerDisconnectListener()
}
// 清理资源函数 (进入后台时调用)
async function cleanupResourcesForPause() {
  console.log('[SettingList] 组件进入后台，清理资源')
}
// 路由切换时彻底清理资源 停止订阅和清除监听器
async function cleanupResourcesForExit() {
  console.log('[SettingList] 组件销毁，开始清理所有资源')
  try {
    if (pauseListener) {
      pauseListener.remove()
      pauseListener = null
    }
    if (resumeListener) {
      resumeListener.remove()
      resumeListener = null
    }
    if (disconnectUnregister) {
      disconnectUnregister()
      disconnectUnregister = null
    }
    // deviceDisconnected.value = false   // 页面已经不可见，这里应该不用设置，避免闪动
    parser = null
    await unsubscribe() // unsubscribe 是异步的，可能需要一点时间
  } catch (error) {
    console.error('清理资源时出错', error)
  }
  console.log('[SettingList] 组件销毁，清理所有资源完毕')
}
const init = async () => {
    // --- 页面加载时检查连接状态 ---
  if (bluetoothStore.connectingStatus !== 2) {
    console.log('[SettingList] 页面加载时检测到设备未连接')
    deviceDisconnected.value = true
  } else {
    // 主动校验一次连接状态
    bluetoothService.checkConnectionStatus(bluetoothStore.connectingDeviceId).catch(() => {
      console.log('[SettingList] 页面加载时检测到连接已断开')
      deviceDisconnected.value = true
    })
  }
  // 先移除旧的监听器
  if (pauseListener) {
    await pauseListener.remove()
    pauseListener = null
  }
  // 再添加新的
  pauseListener = await App.addListener('pause', () => {
    cleanupResourcesForPause()
  })

  if (resumeListener) {
    await resumeListener.remove()
    resumeListener = null
  }
  resumeListener = await App.addListener('resume', async () => {
    await handleAppResume()
  })
  // 只有当已经建立连接时，才去订阅服务
  const deviceId = bluetoothStore.connectingDeviceId
  console.log('deviceID:',deviceId)
  if (!deviceId) {
    return
  }
  if (parser) {
    parser = null
  }
  try {
    await unsubscribe()
    // 等待一小会儿，让原生层有时间处理取消订阅
    await new Promise(resolve => setTimeout(resolve, 100))
    if (parser) {
      parser = null
    }
    parser = new parseBleData({
      enableDebug: true,
      onCalibParamResponse: (data) => {
        calibParamResponse.value = data
        // 在这里进行业务处理
        handleCalibParamResponse(data)
      },
      onRotateSpeedResponse: (data) => {
        rotateSpeedResponse.value = data
        handleRotateSpeedResponse(data)
      },
      onScanTimeResponse: (data) => {
        scanTimeResponse.value = data
        handleScanTimeResponse(data)
      },
      onPitchLimitResponse: (data) => {
        pitchLimitResponse.value = data
        handlePitchLimitResponse(data)
      }
    })

    await bluetoothService.subscribeToNotifications(  // await 等待订阅完成
      deviceId,
      NUS_SERVICE_UUID,
      NUS_NOTIFY_CHAR_UUID,
      (uint8) => {
        parser.parse(uint8)
      }
    )
    isSubscribed.value = true
    console.log('=====订阅成功')
  } catch (e) {
    console.warn('subscribeToNotifications failed', e)
    isSubscribed.value = false
  }
}
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
    console.log('[SettingList] 设备断开连接，手动断开:', isManualDisconnect)
    deviceDisconnected.value = true

    // 显示提示
    showToast('设备已断开连接', 3000)
  })
}
async function unsubscribe() {
  if (!isSubscribed.value) {
    console.log('[SettingList] unsubscribe: 当前未订阅，跳过取消操作')
    return
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
  } finally {
    isSubscribed.value = false
  }
}
const sendCalibParam = async () => {
  // if (!isSubscribed.value) {
  //   showToast('蓝牙订阅未就绪，请稍后重试')
  //   return
  // }
  try {
    await bluetoothStore.handleSendCalibParam(3,3,3)
    console.log('设置标定参数为：', 3,3,3)
  } catch (err) {
    console.log('设置标定参数失败：', err)
  }
}
const sendRotateSpeed = async () => {
  try {
    await bluetoothStore.handleSendRotateSpeed(0.04,0.0001)
    console.log('设置转动速度为：', 0.04,0.0001)
  } catch (err) {
    console.log('设置转动速度失败：', err)
  }
}
const sendScanTime = async () => {
  try {
    await bluetoothStore.handleSendScanTime(3)
    console.log('设置扫描时间为：', 3)
  } catch (err) {
    console.log('设置扫描时间失败：', err)
  }
}
const sendPitchLimit = async () => {
  try {
    await bluetoothStore.handleSendPitchLimit(0.9 * 3.14, 0.2 * 3.14)
    console.log('设置俯仰角上下限为：', 3)
  } catch (err) {
    console.log('设置俯仰角上下限失败：', err)
  }
}
function handleCalibParamResponse() {
  console.log('设置标定参数成功')
}
function handleRotateSpeedResponse() {
  console.log('设置转动速度成功')
}
function handleScanTimeResponse() {
  console.log('设置扫描时间成功')
}
function handlePitchLimitResponse() {
  console.log('设置俯仰角范围成功')
}
</script>
<style scoped >
</style>
