import { defineStore } from 'pinia'
import { showToast } from '@/utils/toast'
import { bluetoothService } from '@/services/bluetoothService'
import { parseBinaryToCartesian } from '@/utils/parseBinaryToCartesian'
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
    // 完整原始数据（用于保存）
    // rawMessagesForSave: [],
    // 仅用于UI显示
    displayedMessages: [],
    MAX_DISPLAY_MESSAGES: 200, // UI 最多显示 200 条
    messages: [],
    parser: new parseBinaryToCartesian(),
    connectedPoints: [], // 解析后的点云数据
    rawMessagesForSave: [],

    // === 累积渲染机制 ===
    // 统计数据：每秒接收 ~100 个点，目标 30 FPS → 每帧累积 3-4 个点
    accumulationBuffer: [], // 累积缓冲（临时存放点数据）
    accumulationTimer: null, // 定时器 ID
    ACCUMULATION_INTERVAL: 33, // 毫秒（约 30 FPS）
    MIN_BATCH_SIZE: 3, // 最少累积点数（防止过于频繁的渲染）
    maxAccumulatedPoints: 0, // 峰值追踪（用于调试）
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
        this.startAccumulationTimer()
        let timeNow = performance.now()
        let timeLast = timeNow
        let count = 0
        await bluetoothService.subscribeToNotifications(
          device.deviceId,
          NUS_SERVICE_UUID,
          NUS_NOTIFY_CHAR_UUID,
          (dataStr) => {
            count = count + 1
            timeNow = performance.now()
            if (timeNow - timeLast >= 1000) {
              timeLast = timeNow
              // console.log("每秒点数：", count)
              count = 0
            }
            // 1. 解析蓝牙二进制数据
            // parse() 现在返回当前批次解析的点（来自内部累积缓冲）
            const { points, errors } = this.parser.parse(dataStr)
            // 2. 将解析的点加入累积缓冲（交给 bluetooth.js 的累积机制）
            if (points && points.length > 0) {
              this.accumulationBuffer.push(...points)

              // 记录峰值（调试用）
              if (this.accumulationBuffer.length > this.maxAccumulatedPoints) {
                this.maxAccumulatedPoints = this.accumulationBuffer.length
              }
              // if (process.env.NODE_ENV === 'development') {
              //   console.log(
              //     `[Bluetooth] Parsed ${points.length} points, accumulation buffer: ${this.accumulationBuffer.length}`,
              //   )
              // }
            }
            console.log('points和errors的内容', JSON.stringify(points), JSON.stringify(errors))
            // 3. 为了保存的原始消息（仅用于文件保存）
            // 这里只记录成功解析的点数据
            points.forEach((point) => {
              const { x, y, z } = point
              this.appendMessage(`${x / 10} ${y / 10} ${z / 10} \n`)
            })

            // 4. 报告解析错误
            if (errors.length > 0) {
              console.warn('[Bluetooth] Parse errors:', errors)
            }
          },
        )
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
      if (this.accumulationTimer !== null) {
        clearInterval(this.accumulationTimer)
        this.accumulationTimer = null

        // 清空未渲染的数据
        if (this.accumulationBuffer.length > 0) {
          console.log(
            `[Accumulation] Timer stopped, flushing ${this.accumulationBuffer.length} remaining points`,
          )
          this.flushAccumulatedPoints()
        }
        console.log(
          `[Accumulation] Timer stopped - Peak buffer size was: ${this.maxAccumulatedPoints} points`,
        )
      }
    },

    /**
     * 将累积缓冲中的点推送到 connectedPoints（触发渲染）
     */
    flushAccumulatedPoints() {
      const pointsToRender = this.accumulationBuffer
      this.accumulationBuffer = [] // 清空缓冲

      if (pointsToRender.length === 0) return

      // 一次性推送到 connectedPoints，触发单次 watchEffect
      this.connectedPoints.push(...pointsToRender)

      // 可选：打印日志用于性能监控
      // if (process.env.NODE_ENV === 'development') {
      //   console.log(`[Accumulation] Flushed ${pointsToRender.length} points to renderer`)
      // }
    },
    consumeConnectedPoints() {
      const points = [...this.connectedPoints] // 复制一份
      this.connectedPoints.length = 0 // 清空原数组, 但是不改变引用，保持响应式
      // this.connectedPoints = []  // 这行修改了引用，响应式丢失，无法使用
      return points
    },
    appendMessage(msg) {
      // 解决展示消息越来越多导致卡顿的问题
      // 1. 始终保存完整数据（用于后续保存）
      this.rawMessagesForSave.push(msg)
      // 2. 限制 UI 显示数量
      if (this.displayedMessages.length >= this.MAX_DISPLAY_MESSAGES) {
        this.displayedMessages.shift() // 移除最旧的一条
      }
      this.displayedMessages.push(msg)
    },
    async handleDisconnect(device) {
      try {
        // 断开连接时停止定时器
        this.stopAccumulationTimer()

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
    clearMessages() {
      this.displayedMessages = []
    },
    getRawMessages() {
      return this.rawMessagesForSave
    },
    clearRawMessagesForSave() {
      // 添加一个清空动作
      this.rawMessagesForSave = []
    },
  },
  getters: {
    isConnected: (state) => state.connectingStatus === 2,
    getConnectedPoints: (state) => state.connectedPoints,
  },
})
