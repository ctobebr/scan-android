import { defineStore } from 'pinia'
import { showToast } from '@/utils/toast'
import { bluetoothService } from '@/services/bluetoothService'
import { parseBinaryToCartesian } from '@/utils/parseBinaryToCartesian'

let rawMessagesForSave = []


export const useBluetoothStore = defineStore('bluetooth', {
  state: () => ({
    devices: [],
    scanning: false,
    connectingStatus: 0,  // 0: 未连接, 1: 连接中, 2: 已连接
    connectingDeviceId: null,
     // 完整原始数据（用于保存）
    // rawMessagesForSave: [],
    // 仅用于UI显示
    displayedMessages: [],
    MAX_DISPLAY_MESSAGES: 200, // UI 最多显示 200 条
    messages: [],
    parser: new parseBinaryToCartesian(),
    connectedPoints: [], // 解析后的点云数据
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
      if (!await this.requestRequirePermissions()) {
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

        const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
        const CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
        // let timeNow = performance.now()
        // let timeLast = timeNow
        // let count = 0
        await bluetoothService.subscribeToNotifications(
          device.deviceId,
          SERVICE_UUID,
          CHAR_UUID,
          (dataStr) => {
            // count = count + 1
            // timeNow = performance.now()
            // if (timeNow - timeLast >= 1000) {
            //   timeLast = timeNow
            //   console.log("每秒点数：", count)
            //   count = 0
            // }
            const { points, errors } = this.parser.parse(dataStr)
            points.forEach(point => {
              const { x, y, z } = point
              this.appendMessage(`x: ${x}\ny: ${y}\nz: ${z}`)
            })
            // this.connectedPoints = [...this.connectedPoints, ...points]  // 时间复杂度O(n + k) 读取旧connectedPoints大数据，新建大数据数组，在蓝牙快速回调中导致数据量变大时严重卡顿问题
            this.connectedPoints.push(...points)  // 时间复杂度O(k)
            // 解决此处的数量和速率非响应式的问题，而且没有性能杀手问题
            if (errors.length > 0) {
              console.warn('Parse errors:', errors)
            }
            // showToast('接收端到端的unit8Array成功',points ,errors)
          }
        )
        this.connectingStatus = 2 // 已连接
      } catch (err) {
        console.error('连接失败:', err)
        this.connectingStatus = 0 // 回到未连接
        this.connectingDeviceId = null
        showToast('连接失败')
      }
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
      rawMessagesForSave.push(msg)
      // 2. 限制 UI 显示数量
      if (this.displayedMessages.length >= this.MAX_DISPLAY_MESSAGES) {
        this.displayedMessages.shift() // 移除最旧的一条
      }
      this.displayedMessages.push(msg)
    },
    clearMessages() {
      rawMessagesForSave = [] // 重置外部数组
      this.displayedMessages = []
    },
    getRawMessages() {
      return rawMessagesForSave
    }
  },
  getters: {
    isConnected: (state) => state.connectingStatus === 2,
    getConnectedPoints: (state) => state.connectedPoints
  }
})
