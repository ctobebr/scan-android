import { defineStore } from 'pinia'
import { showToast } from '@/utils/toast'
import { bluetoothService } from '@/services/bluetoothService'
import {
  NUS_SERVICE_UUID,
  NUS_WRITE_CHAR_UUID,
  NUS_NOTIFY_CHAR_UUID,
} from '@/constants/protocolCommands'

export const useBluetoothStore = defineStore('bluetooth', {
  state: () => ({
    devices: [],
    scanning: false,
    connectingStatus: 0, // 0: 未连接, 1: 连接中, 2: 已连接
    connectingDeviceId: null, // 已连接设备的deviceId
    MAX_DISPLAY_MESSAGES: 200, // UI 最多显示 200 条
    messages: [],
  }),
  actions: {
    // 请求蓝牙相关权限
    async requestRequirePermissions() {
      try {
        const result = await bluetoothService.requestPermissions()
        const hasBluetoothScan = result?.BLUETOOTH_SCAN === 'granted'
        const hasFineLocation = result?.ACCESS_FINE_LOCATION === 'granted'
        const hasCoarseLocation = result?.ACCESS_COARSE_LOCATION === 'granted'
        // Android 要求：BLUETOOTH_SCAN + 任一位置权限
        return hasBluetoothScan && (hasFineLocation || hasCoarseLocation)
      } catch (err) {
        console.warn('权限请求被拒绝或出错:', err)
        return false
      }
    },
    // 流程：权限 → 初始化 → 蓝牙状态 → 扫描
    async autoScanOnEnter() {
      // 权限
      if (!(await this.requestRequirePermissions())) {
        showToast('需要蓝牙和位置权限才能扫描设备')
        return
      }
      // 初始化
      try {
        await bluetoothService.initBluetooth()
      } catch (err) {
        console.error('蓝牙初始化失败:', err)
        alert('蓝牙初始化失败，请重试')
        return
      }
      // 蓝牙状态
      const enabled = await bluetoothService.isBluetoothEnabled()
      if (!enabled) {
        alert('请先打开手机蓝牙')
        return
      }
      // 扫描
      this.scanning = true
      try {
        // showToast(JSON.stringify(122))
        const found = await bluetoothService.scanDevices(5000)
        // showToast(JSON.stringify(found))
        this.devices = found
      } catch (err) {
        console.error('扫描异常:', err)
        alert('扫描过程中出错')
      } finally {
        this.scanning = false
      }
    },
    async handleConnect(device) {
      // 防止重复点击
      if (this.connectingStatus === 1) return

      this.connectingDeviceId = device.deviceId
      this.connectingStatus = 1 // 连接中

      try {
        await bluetoothService.connectDevice(device.deviceId)
        await bluetoothService.discoverServices(device.deviceId)
        // 连接成功：不在全局 store 中订阅通知，通知订阅应由会话页面（如 PointCloud）自行管理
        this.connectingStatus = 2 // 已连接
      } catch (err) {
        console.error('连接失败:', err)
        this.connectingStatus = 0 // 回到未连接
        this.connectingDeviceId = null
        this.stopAccumulationTimer()
        showToast('连接失败')
      }
    },

    /**
     * 启动累积定时器
     * 每 ACCUMULATION_INTERVAL 毫秒检查是否有足够的数据点要渲染
     */
    startAccumulationTimer() {
      if (this.accumulationTimer !== null) {
        console.warn('Accumulation timer already running')
        return
      }

      this.accumulationTimer = setInterval(() => {
        // 如果缓冲区中有足够的点，或者距离上次清空已经超过一定时间，则推送
        if (this.accumulationBuffer.length >= this.MIN_BATCH_SIZE) {
          this.flushAccumulatedPoints()
        }
      }, this.ACCUMULATION_INTERVAL)

      console.log(
        `[Accumulation] Timer started - Interval: ${this.ACCUMULATION_INTERVAL}ms, Min batch: ${this.MIN_BATCH_SIZE}`,
      )
    },

    /**
     * 停止累积定时器
     */
    stopAccumulationTimer() {
      // 已移除累积渲染管理，session 应在页面层面管理
    },

    /**
     * 将累积缓冲中的点推送到 connectedPoints（触发渲染）
     */
    flushAccumulatedPoints() {
      // 已移除累积渲染管理，session 层负责处理
    },
    consumeConnectedPoints() {
      return []
    },
    // appendMessage(msg) {
    //   // 仅用于 UI 展示（不保存会话数据于全局 store）
    //   if (this.displayedMessages.length >= this.MAX_DISPLAY_MESSAGES) {
    //     this.displayedMessages.shift()
    //   }
    //   this.displayedMessages.push(msg)
    // },
    async handleDisconnect(device) {
      try {
        // 断开连接时停止定时器
        await bluetoothService
          .unsubscribeFromNotifications(device.deviceId, NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID)
          .catch(() => {})

        await bluetoothService.disconnectDevice(device.deviceId)
        this.connectingDeviceId = null
        this.connectingStatus = 0
      } catch (e) {
        this.connectingStatus = 2
        console.log('断开连接失败', e)
      }
    },
    handleSendStart() {
      try {
        // deviceId, serviceUUID, characteristicUUID
        bluetoothService.sendStartScan(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
      } catch (err) {
        console.log('发送开始指令失败：', err)
      }
    },
    handleSendEnd() {
      try {
        // deviceId, serviceUUID, characteristicUUID
        bluetoothService.sendStopScan(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
      } catch (err) {
        console.log('发送结束指令失败：', err)
      }
    },
    // clearMessages() {
    //   this.displayedMessages = []
    // },
  },
  getters: {
    isConnected: (state) => state.connectingStatus === 2,
    // getConnectedPoints: (state) => {
    //   return []
    // },
  },
})
