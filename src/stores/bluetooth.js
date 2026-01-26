import { defineStore } from 'pinia'
import { showToast } from '@/utils/toast'
import { bluetoothService } from '@/services/bluetoothService'
import { parseBinaryToCartesian } from '@/utils/parseBinaryToCartesian'

export const useBluetoothStore = defineStore('bluetooth', {
  state: () => ({
    devices: [],
    scanning: false,
    connectingStatus: 0,  // 0: 未连接, 1: 连接中, 2: 已连接
    connectingDeviceId: null,
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

        await bluetoothService.subscribeToNotifications(
          device.deviceId,
          SERVICE_UUID,
          CHAR_UUID,
          (dataStr) => {
            //  dataStr 是 Uint8Array
            // 保存可读的十六进制日志（用于显示和保存）
            // const hexStr = Array.from(dataStr)
            //   .map(b => b.toString(16).padStart(2, '0'))
            //   .join(' ')
                // console.log('✅ 收到原始数据:', dataStr) // 👈 关键！看这里有没有输出


    // console.log('解析出点数:', points.length) // 👈 看是否解析成功
            const { points, errors } = this.parser.parse(dataStr)
            points.forEach(point => {
              const { x, y, z } = point
              this.appendMessage(`x: ${x}\ny: ${y}\nz: ${z}`)
              // console.log('调试mess',JSON.stringify(this.messages))
            })
            // this.points, errors:  [{"x":22.385643930238793,"y":2.5159214375472674,"z":-16.342031243044826,"pitch":3.0510658444444445,"yaw":2.511,"distance":27830,"intensity":1,"pitchDeg":174.81319590318523,"yawDeg":143.86970235734972,"distanceM":27.83}] []
            // console.log("this.points, errors: ",JSON.stringify(points), JSON.stringify(errors))
            this.connectedPoints = [...this.connectedPoints, ...points]
            // console.log('======',JSON.stringify( this.connectedPoints))
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
      this.connectedPoints = [] // 清空原数组
      return points
    },
    appendMessage(msg) {
      this.messages.push(msg)
    },
  },
  getters: {
    isConnected: (state) => state.connectingStatus === 2,
    getConnectedPoints: (state) => state.connectedPoints
  }
})
