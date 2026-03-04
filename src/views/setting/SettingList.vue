<template>
  <div class="setting-container">
    <!-- 参数卡片列表 - 滚动区域 -->
    <div class="cards-scroll">
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">标定参数</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('calib')"
            :loading="savingState.calib"
            :disabled="deviceDisconnected || savingState.calib"
            >保存</van-button
          >
        </div>

        <div class="six-axis-grid">
          <!-- 第一行 X Y Z -->
          <div class="axis-row">
            <div class="axis-item">
              <label>X <span class="unit">(mm)</span></label>
              <van-field
                v-model="calibParams.x"
                type="text"
                placeholder="0.00"
                inputmode="decimal"
                @blur="() => formatNumber('calib', 'x', 2)"
                @input="validateDecimalInput"
                :disabled="deviceDisconnected"
              />
            </div>
            <div class="axis-item">
              <label>Y <span class="unit">(mm)</span></label>
              <van-field
                v-model="calibParams.y"
                type="text"
                placeholder="0.00"
                inputmode="decimal"
                @blur="() => formatNumber('calib', 'y', 2)"
                @input="validateDecimalInput"
                :disabled="deviceDisconnected"
              />
            </div>
            <div class="axis-item">
              <label>Z <span class="unit">(mm)</span></label>
              <van-field
                v-model="calibParams.z"
                type="text"
                placeholder="0.00"
                inputmode="decimal"
                @blur="() => formatNumber('calib', 'z', 2)"
                @input="validateDecimalInput"
                :disabled="deviceDisconnected"
              />
            </div>
          </div>
          <!-- 第二行 pitch roll yaw -->
          <!-- <div class="axis-row">
            <div class="axis-item">
              <label>pitch <span class="unit">(rad)</span></label>
              <van-field v-model="calibParams.pitch" type="digit" placeholder="0.00" />
            </div>
            <div class="axis-item">
              <label>roll <span class="unit">(rad)</span></label>
              <van-field v-model="calibParams.roll" type="digit" placeholder="0.00" />
            </div>
            <div class="axis-item">
              <label>yaw <span class="unit">(rad)</span></label>
              <van-field v-model="calibParams.yaw" type="digit" placeholder="0.00" />
            </div>
          </div> -->
        </div>
      </div>

      <!-- 转动速度卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">转动速度</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('speed')"
            :loading="savingState.speed"
            :disabled="deviceDisconnected || savingState.speed"
            >保存</van-button
          >
        </div>

        <div class="dual-row">
          <div class="axis-item">
            <label>pitch <span class="unit">(rad/ms)</span></label>
            <van-field
              v-model="speedParams.pitchSpeed"
              type="text"
              placeholder="0.0000"
              inputmode="decimal"
              @blur="() => formatNumber('speed', 'pitchSpeed', 4)"
              @input="validateDecimalInput"
              :disabled="deviceDisconnected"
            />
          </div>
          <div class="axis-item">
            <label>yaw <span class="unit">(rad/ms)</span></label>
            <van-field
              v-model="speedParams.yawSpeed"
              type="text"
              placeholder="0.0000"
              inputmode="decimal"
              @blur="() => formatNumber('speed', 'yawSpeed', 4)"
              @input="validateDecimalInput"
              :disabled="deviceDisconnected"
            />
          </div>
        </div>
      </div>

      <!-- 扫描时间卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">扫描时间</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('scan')"
            :loading="savingState.scan"
            :disabled="deviceDisconnected || savingState.scan"
            >保存</van-button
          >
        </div>

        <div class="scan-row">
          <div class="scan-input">
            <van-field
              v-model="scanTime.seconds"
              type="text"
              placeholder="输入秒数"
              @blur="validateScanTime"
              @input="validateIntegerInput"
              :disabled="deviceDisconnected"
            />
          </div>
          <span class="scan-unit">秒</span>
        </div>
      </div>

      <!-- 俯仰角限位卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">俯仰角限位</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('pitchLimit')"
            :loading="savingState.pitchLimit"
            :disabled="deviceDisconnected || savingState.pitchLimit || !isPitchLimitValid"
            >保存</van-button
          >
        </div>

        <div class="dual-row">
          <div class="axis-item">
            <label>上限 <span class="unit">(rad)</span></label>
            <van-field
              v-model="pitchLimit.upperLimitRad"
              type="text"
              placeholder="0.00"
              inputmode="decimal"
              @blur="() => formatNumber('pitchLimit', 'upperLimitRad', 2)"
              @input="validateDecimalInput"
              :disabled="deviceDisconnected"
            />
          </div>
          <div class="axis-item">
            <label>下限 <span class="unit">(rad)</span></label>
            <van-field
              v-model="pitchLimit.lowerLimitRad"
              type="text"
              placeholder="0.00"
              inputmode="decimal"
              @blur="() => formatNumber('pitchLimit', 'lowerLimitRad', 2)"
              @input="validateDecimalInput"
              :disabled="deviceDisconnected"
            />
          </div>
        </div>

        <!-- 上限小于下限的提示 -->
        <div v-if="!isPitchLimitValid" class="limit-error-hint">
          <van-icon name="warning-o" /> 上限必须大于下限
        </div>
      </div>

      <!-- 输出格式设置卡片  目前同时开启会渲染两套点云，一个是偏移校准前一个是偏移校准后。。保存的txt一个点位也会包含两行xyz数据-->
      <!-- <div class="param-card output-format-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">输出格式</span>
          </div>
          <div class="output-hint">开关即时生效</div>
        </div>

        <div class="output-switch-row">
          <div class="output-switch-item">
            <div class="output-label">
              <span class="output-name">XYZ坐标</span>
            </div>
            <van-switch
              v-model="outputFormat.xyz"
              size="24px"
              active-color="#1890ff"
              :disabled="deviceDisconnected || savingState.outputFormat"
              @change="handleOutputChange('xyz', $event)"
              :loading="savingState.outputFormat"
            />
          </div>

          <div class="output-switch-item">
            <div class="output-label">
              <span class="output-name">极坐标</span>
            </div>
            <van-switch
              v-model="outputFormat.polar"
              size="24px"
              active-color="#1890ff"
              :disabled="deviceDisconnected || savingState.outputFormat"
              @change="handleOutputChange('polar', $event)"
              :loading="savingState.outputFormat"
            />
          </div>
        </div>
      </div> -->

      <!-- 底部双按钮行：刷新和恢复默认值 -->
      <div class="bottom-actions">
        <van-button
          class="action-button refresh-button"
          type="primary"
          plain
          @click="handleManualRefresh"
          :loading="refreshing"
          loading-text="刷新中"
          :disabled="deviceDisconnected"
        >
          <template #icon>
            <van-icon name="replay" />
          </template>
          刷新
        </van-button>
        <van-button
          class="action-button reset-button"
          type="primary"
          @click="resetToDefault"
          :disabled="deviceDisconnected"
          >恢复默认值</van-button
        >
      </div>

      <!-- 底部留白，避免被按钮遮挡 -->
      <div class="bottom-spacing"></div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  onMounted,
  onActivated,
  onBeforeUnmount,
  watch,
  computed,
  onUnmounted,
} from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useBluetoothStore } from '@/stores/bluetooth'
import { bluetoothService } from '@/services/bluetoothService'
import { App } from '@capacitor/app'
import { parseBleData } from '@/utils/parseBleData'
import { NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/protocolCommands'
import { showToast } from '@/utils/toast'
import { SETTING_DEFAULT_VALUES } from '@/constants/protocolCommands'
import { showConfirmDialog } from 'vant'

const bluetoothStore = useBluetoothStore()

let parser = null
let pauseListener = null
let resumeListener = null

// 设备断开相关状态
const isSubscribed = ref(false)
const deviceDisconnected = ref(false)
let disconnectUnregister = null

// 刷新状态
const refreshing = ref(false)

// 标记是否来自保存操作的响应
const isFromSaveAction = ref(false)

// 参数数据  保留 2位小数
const calibParams = reactive({
  x: -52.52,
  y: 10,
  z: 1,
  // pitch: 0.12,
  // roll: -0.05,
  // yaw: 1.47
})
// 保留 4位小数
const speedParams = reactive({
  pitchSpeed: 0.02,
  yawSpeed: 0.00005,
})
// 保留 0位小数
const scanTime = ref({
  seconds: 250,
})
// 保留 2位小数 - 初始化时就格式化，修改 key 名以匹配返回的字段
const pitchLimit = reactive({
  upperLimitRad: (0.8 * 3.14).toFixed(2),
  lowerLimitRad: (0.1 * 3.14).toFixed(2),
})

// 输出格式设置
const outputFormat = reactive({
  xyz: true,
  polar: false,
})

// 保存状态
const savingState = reactive({
  calib: false,
  speed: false,
  scan: false,
  pitchLimit: false,
  outputFormat: false, // 输出格式保存状态
})

// 计算属性：检查俯仰角上限是否大于下限
const isPitchLimitValid = computed(() => {
  const upper = parseFloat(pitchLimit.upperLimitRad)
  const lower = parseFloat(pitchLimit.lowerLimitRad)
  return upper > lower
})

// 获取连接状态文本
// const getConnectionStatusText = () => {
//   if (deviceDisconnected.value) return '未连接'
//   if (bluetoothStore.connectingStatus === 0) return '连接中'
//   if (bluetoothStore.connectingStatus === 2) return '已连接'
//   return '未连接'
// }
const isConnected = computed(() => {
  return !deviceDisconnected.value && bluetoothStore.connectingStatus === 2
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
      init().then(() => {
        // 重连后自动读取
        if (isSubscribed.value && !deviceDisconnected.value) {
          readAllParams()
        }
      })
    }
  },
)

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
  // 订阅成功后自动读取所有参数
  if (isSubscribed.value && !deviceDisconnected.value) {
    await readAllParams()
  }
})

onActivated(async () => {
  console.log('[SettingList] 组件被激活，等待上一页清理完成...')
  try {
    // --- 轮询等待 ---
    // 只要 Pointcloud 还在清理，就一直等
    while (bluetoothStore.isCleanupInProgress) {
      console.log('[SettingList] 检测到上一页正在清理，等待中...')
      await new Promise((resolve) => setTimeout(resolve, 50)) // 每 50ms 检查一次
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
  console.log('deviceID:', deviceId)
  if (!deviceId) {
    return
  }

  if (parser) {
    parser = null
  }
  try {
    await unsubscribe()
    // 等待一小会儿，让原生层有时间处理取消订阅
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (parser) {
      parser = null
    }
    parser = new parseBleData({
      enableDebug: true,
      onCalibParamResponse: (data) => {
        handleCalibParamResponse(data)
      },
      onRotateSpeedResponse: (data) => {
        handleRotateSpeedResponse(data)
      },
      onScanTimeResponse: (data) => {
        handleScanTimeResponse(data)
      },
      onPitchLimitResponse: (data) => {
        handlePitchLimitResponse(data)
      },
      onOutputXYZResponse: (data) => {
        handleOutputXYZResponse(data)
      },
      onOutputPolarResponse: (data) => {
        handleOutputPolarResponse(data)
      },
    })

    await bluetoothService.subscribeToNotifications(
      // await 等待订阅完成
      deviceId,
      NUS_SERVICE_UUID,
      NUS_NOTIFY_CHAR_UUID,
      (uint8) => {
        parser.parse(uint8)
      },
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

// 通用数字格式化函数
const formatNumber = (category, field, decimals) => {
  let value
  switch (category) {
    case 'calib':
      value = calibParams[field]
      break
    case 'speed':
      value = speedParams[field]
      break
    case 'pitchLimit':
      value = pitchLimit[field]
      break
    default:
      return
  }

  if (value === undefined || value === null || value === '') return

  const num = parseFloat(value)
  if (!isNaN(num)) {
    switch (category) {
      case 'calib':
        calibParams[field] = num.toFixed(decimals)
        break
      case 'speed':
        speedParams[field] = num.toFixed(decimals)
        break
      case 'pitchLimit':
        pitchLimit[field] = num.toFixed(decimals)
        break
    }
  }
}

// ：小数输入实时过滤
const validateDecimalInput = (e) => {
  const value = e.target.value
  // 允许：数字、小数点、负号
  e.target.value = value.replace(/[^\d.-]/g, '')
}

// 整数输入实时过滤
const validateIntegerInput = (e) => {
  const value = e.target.value
  // 只允许数字和负号
  e.target.value = value.replace(/[^\d-]/g, '')
}

// 修改验证函数 - 使用数字类型
const validateScanTime = () => {
  let value = parseInt(scanTime.value.seconds)
  if (isNaN(value)) {
    scanTime.value.seconds = 0
  } else {
    if (value > 65535) value = 65535
    if (value < 0) value = 0
    scanTime.value.seconds = value
  }
}

// 更新响应处理函数，将收到的数据更新到UI并格式化
// 根据 isFromSaveAction 标记决定是否显示提示
function handleCalibParamResponse(data) {
  console.log('设置标定参数成功', JSON.stringify(data))
  // 将收到的标定参数值更新到UI
  if (data && typeof data === 'object') {
    if (data.x !== undefined) calibParams.x = parseFloat(data.x).toFixed(2)
    if (data.y !== undefined) calibParams.y = parseFloat(data.y).toFixed(2)
    if (data.z !== undefined) calibParams.z = parseFloat(data.z).toFixed(2)
    // if (data.pitch !== undefined) calibParams.pitch = data.pitch
    // if (data.roll !== undefined) calibParams.roll = data.roll
    // if (data.yaw !== undefined) calibParams.yaw = data.yaw
  }
  if (isFromSaveAction.value) {
    showToast('标定参数保存成功')
    isFromSaveAction.value = false // 重置标记
  }
}

function handleRotateSpeedResponse(data) {
  console.log('设置转动速度成功', JSON.stringify(data))
  // 将收到的转动速度值更新到UI
  if (data && typeof data === 'object') {
    if (data.pitchSpeed !== undefined) {
      speedParams.pitchSpeed = parseFloat(data.pitchSpeed).toFixed(4)
    }
    if (data.yawSpeed !== undefined) {
      speedParams.yawSpeed = parseFloat(data.yawSpeed).toFixed(4)
    }
  }
  if (isFromSaveAction.value) {
    showToast('转动速度保存成功')
    isFromSaveAction.value = false // 重置标记
  }
}

function handleScanTimeResponse(data) {
  console.log('设置扫描时间成功', JSON.stringify(data))
  // 将收到的扫描时间值更新到UI
  if (data && typeof data === 'object') {
    if (data.seconds !== undefined) {
      scanTime.value.seconds = parseInt(data.seconds)
    }
  } else if (typeof data === 'number') {
    scanTime.value.seconds = parseInt(data)
  }
  if (isFromSaveAction.value) {
    showToast('扫描时间保存成功')
    isFromSaveAction.value = false // 重置标记
  }
}

function handlePitchLimitResponse(data) {
  console.log('设置俯仰角上下限成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.upperLimitRad !== undefined) {
      pitchLimit.upperLimitRad = parseFloat(data.upperLimitRad).toFixed(2)
    }
    if (data.lowerLimitRad !== undefined) {
      pitchLimit.lowerLimitRad = parseFloat(data.lowerLimitRad).toFixed(2)
    }
  }
  if (isFromSaveAction.value) {
    showToast('俯仰角限位保存成功')
    isFromSaveAction.value = false // 重置标记
  }
}
// 处理查询输出XYZ状态响应
function handleOutputXYZResponse(data) {
  console.log('查询输出XYZ状态成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.status !== undefined) {
      outputFormat.xyz = data.status
    }
  }
  // 如果是来自保存操作的响应，显示成功提示
  if (isFromSaveAction.value) {
    showToast(`XYZ坐标输出已${data.status ? '开启' : '关闭'}`)
    isFromSaveAction.value = false
  }
}

// 处理查询输出极坐标状态响应
function handleOutputPolarResponse(data) {
  console.log('查询输出极坐标状态成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.status !== undefined) {
      outputFormat.polar = data.status
    }
  }
  // 如果是来自保存操作的响应，显示成功提示
  if (isFromSaveAction.value) {
    showToast(`极坐标输出已${data.status ? '开启' : '关闭'}`)
    isFromSaveAction.value = false
  }
}

// 保存单个参数 - 移除 showToast 参数，不在发送后提示
// 设置标记，表示这是来自保存操作的响应
// MODIFIED: 添加 silent 参数，用于控制是否显示提示（恢复默认值时使用）
const saveParam = async (type, silent = false) => {
  if (deviceDisconnected.value) {
    showToast('请先连接设备')
    return
  }

  // 保存前格式化
  switch (type) {
    case 'calib':
      formatNumber('calib', 'x', 2)
      formatNumber('calib', 'y', 2)
      formatNumber('calib', 'z', 2)
      break
    case 'speed':
      formatNumber('speed', 'pitchSpeed', 4)
      formatNumber('speed', 'yawSpeed', 4)
      break
    case 'pitchLimit':
      formatNumber('pitchLimit', 'upperLimitRad', 2)
      formatNumber('pitchLimit', 'lowerLimitRad', 2)
      break
  }

  // 俯仰角限位特殊校验
  if (type === 'pitchLimit' && !isPitchLimitValid.value) {
    showToast('俯仰角上限必须大于下限')
    return
  }

  try {
    savingState[type] = true
    // MODIFIED: 只有在非静默模式时才设置标记，这样就不会触发响应中的提示
    if (!silent) {
      isFromSaveAction.value = true
    }

    switch (type) {
      case 'calib':
        await bluetoothStore.handleSendCalibParam(
          parseFloat(calibParams.x),
          parseFloat(calibParams.y),
          parseFloat(calibParams.z),
        )
        break

      case 'speed':
        await bluetoothStore.handleSendRotateSpeed(
          parseFloat(speedParams.pitchSpeed),
          parseFloat(speedParams.yawSpeed),
        )
        break

      case 'scan':
        await bluetoothStore.handleSendScanTime(scanTime.value.seconds)
        break

      case 'pitchLimit':
        await bluetoothStore.handleSendPitchLimit(
          parseFloat(pitchLimit.upperLimitRad),
          parseFloat(pitchLimit.lowerLimitRad),
        )
        break
    }
  } catch (error) {
    console.error(`保存${type}失败:`, error)
    showToast('保存失败')
    // MODIFIED: 只有在非静默模式时才重置标记
    if (!silent) {
      isFromSaveAction.value = false
    }
  } finally {
    savingState[type] = false
  }
}

// 处理输出格式开关变化
// MODIFIED: 添加 silent 参数，保持与 saveParam 一致
const handleOutputChange = async (type, value, silent = false) => {
  if (deviceDisconnected.value) {
    showToast('请先连接设备')
    // 如果设备未连接，恢复开关状态
    outputFormat[type] = !value
    return
  }

  try {
    savingState.outputFormat = true
    // MODIFIED: 只有在非静默模式时才设置标记
    if (!silent) {
      isFromSaveAction.value = true
    }

    if (type === 'xyz') {
      await bluetoothStore.handleSendOutputXYZ(value)
    } else {
      await bluetoothStore.handleSendOutputPolar(value)
    }
  } catch (error) {
    console.error(`设置输出格式${type}失败:`, error)
    showToast('设置失败')
    // 发生错误时恢复开关状态
    outputFormat[type] = !value
    // MODIFIED: 只有在非静默模式时才重置标记
    if (!silent) {
      isFromSaveAction.value = false
    }
  } finally {
    savingState.outputFormat = false
  }
}

// 恢复默认值函数 - 修改为只显示一个提示
const resetToDefault = async () => {
  if (deviceDisconnected.value) {
    showToast('请先连接设备')
    return
  }

  try {
    // 添加确认对话框
    const confirmed = await showConfirmDialog({
      title: '恢复默认值',
      message: '确定要恢复所有参数到默认值吗？',
    }).catch(() => false)

    if (!confirmed) return
    console.log('开始恢复默认值...')

    // 先更新UI显示为默认值并格式化
    calibParams.x = SETTING_DEFAULT_VALUES.CALIB.x.toFixed(2)
    calibParams.y = SETTING_DEFAULT_VALUES.CALIB.y.toFixed(2)
    calibParams.z = SETTING_DEFAULT_VALUES.CALIB.z.toFixed(2)

    speedParams.pitchSpeed = SETTING_DEFAULT_VALUES.SPEED.pitch.toFixed(4)
    speedParams.yawSpeed = SETTING_DEFAULT_VALUES.SPEED.yaw.toFixed(4)

    scanTime.value.seconds = SETTING_DEFAULT_VALUES.SCAN_TIME // 数字，不转字符串

    pitchLimit.upperLimitRad = SETTING_DEFAULT_VALUES.PITCH_LIMIT.upper.toFixed(2)
    pitchLimit.lowerLimitRad = SETTING_DEFAULT_VALUES.PITCH_LIMIT.lower.toFixed(2)

    // 输出格式默认值
    outputFormat.xyz = SETTING_DEFAULT_VALUES.OUTPUT_FORMAT.xyz
    outputFormat.polar = SETTING_DEFAULT_VALUES.OUTPUT_FORMAT.polar

    // MODIFIED: 使用 silent 模式调用保存函数，不触发单个提示
    await saveParam('calib', true)
    await saveParam('speed', true)
    await saveParam('scan', true)
    await saveParam('pitchLimit', true)

    // 输出格式需要单独发送，也使用 silent 模式
    await handleOutputChange('xyz', outputFormat.xyz, true)
    await handleOutputChange('polar', outputFormat.polar, true)

    showToast('所有参数已恢复默认值') // 只保留这一个提示
  } catch (error) {
    console.error('恢复默认值失败:', error)
    showToast('恢复默认值失败')
  }
}

// 读取所有参数函数
const readAllParams = async () => {
  if (deviceDisconnected.value) {
    showToast('设备未连接')
    return
  }

  refreshing.value = true
  try {
    console.log('开始读取所有参数...')

    // 并发读取所有参数
    await Promise.all([
      bluetoothStore.handleReadCalibParam(),
      bluetoothStore.handleReadRotateSpeed(),
      bluetoothStore.handleReadScanTime(),
      bluetoothStore.handleReadPitchLimit(),
      bluetoothStore.handleReadOutputXYZ(),
      bluetoothStore.handleReadOutputPolar(),
    ])
    showToast('参数已刷新') // 只有一个提示
  } catch (error) {
    console.error('读取参数失败:', error)
    showToast('读取参数失败')
  } finally {
    refreshing.value = false
  }
}

// 手动刷新处理
const handleManualRefresh = async () => {
  await readAllParams()
}
</script>

<style scoped>
.setting-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #e6f7ff 0%, #f0f9ff 100%);
  box-sizing: border-box;
}

/* 滚动区域 */
.cards-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.cards-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* 参数卡片 */
.param-card {
  background: white;
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 40, 80, 0.08);
  border: 1px solid rgba(24, 144, 255, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

/* 六轴布局 */
.six-axis-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.axis-row {
  display: flex;
  gap: 12px;
}

.axis-item {
  flex: 1;
}

.axis-item label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  margin-left: 4px;
}

.unit {
  color: #999;
  font-size: 10px;
}

:deep(.van-field) {
  background-color: #f5f9ff;
  border-radius: 12px;
  padding: 8px 12px;
  border: 1px solid #e6f0fa;
  transition: all 0.2s;
}

:deep(.van-field:focus-within) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

:deep(.van-field__control) {
  color: #2c3e50;
  font-size: 14px;
}

/* 双列布局 */
.dual-row {
  display: flex;
  gap: 16px;
}

/* 扫描时间 */
.scan-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scan-input {
  flex: 3;
}

.scan-unit {
  flex: 0.8;
  background: #f0f9ff;
  border: 1px solid #d9e9ff;
  border-radius: 12px;
  text-align: center;
  padding: 10px 0;
  font-size: 16px;
  font-weight: 500;
  color: #1890ff;
}

.limit-error-hint {
  margin-top: 8px;
  padding: 6px 12px;
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 8px;
  color: #f56c6c;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.limit-error-hint :deep(.van-icon) {
  font-size: 14px;
}

/* 输出格式卡片样式 */
.output-format-card {
  /* 继承 param-card 样式 */
}

.output-hint {
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  padding: 4px 10px;
  border-radius: 30px;
  border: 1px solid rgba(24, 144, 255, 0.3);
}

.output-switch-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 8px;
}

.output-switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.output-label {
  display: flex;
  flex-direction: column;
}

.output-name {
  font-size: 15px;
  font-weight: 500;
  color: #2c3e50;
}

.output-desc {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

/* 底部双按钮行 */
.bottom-actions {
  display: flex;
  gap: 12px;
  margin: 16px 0 8px 0;
  padding: 0 4px;
}

.action-button {
  flex: 1;
  height: 44px;
  border-radius: 22px;
  font-size: 15px;
  font-weight: 500;
}

.refresh-button {
  background: white;
  border: 1px solid #1890ff;
  color: #1890ff;
}

.refresh-button:active {
  background: #e6f7ff;
}

.reset-button {
  background-color: #1890ff;
  border: none;
  color: white;
}

.reset-button:active {
  opacity: 0.8;
}

.reset-button:disabled {
  background-color: #a0cfff;
}

.bottom-spacing {
  height: 20px;
}

:deep(.van-button--primary) {
  background-color: #1890ff;
  border: none;
  border-radius: 30px;
  padding: 0 16px;
  height: 36px;
}

:deep(.van-button--primary.van-button--plain) {
  background: white;
  border: 1px solid #1890ff;
  color: #1890ff;
}

:deep(.van-button--primary.van-button--plain:active) {
  background: #e6f7ff;
}
</style>
