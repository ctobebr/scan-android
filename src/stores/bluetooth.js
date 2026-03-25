import { defineStore } from 'pinia'
import { showLoadingToast, closeToast, showToast, showConfirmDialog } from 'vant'
import { bluetoothService } from '@/services/bluetooth'
import {
  NUS_SERVICE_UUID,
  NUS_WRITE_CHAR_UUID,
  NUS_NOTIFY_CHAR_UUID,
} from '@/constants/bluetooth'
// 导入全局日志工具
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger } from '@/utils/logger'

const logger = createLogger('BluetoothStore')

export const useBluetoothStore = defineStore('bluetooth', {
  state: () => ({
    devices: [],
    scanning: false,
    connectingStatus: 0, // 0: 未连接, 1: 连接中, 2: 已连接
    connectingDeviceId: null, // 已连接设备的deviceId
    MAX_DISPLAY_MESSAGES: 200, // UI 最多显示 200 条
    messages: [],
    // 存储断开监听的取消函数
    disconnectUnregister: null,
    isCleanupInProgress: false, // 标记断开订阅是否正在进行
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
        logger.warn('权限请求被拒绝或出错', err)
        return false
      }
    },
    // 流程：权限 → 初始化 → 蓝牙状态 → 扫描
    async autoScanOnEnter() {
      // 权限
      if (!(await this.requestRequirePermissions())) {
        showToast({ message: '需要蓝牙和位置权限才能扫描设备', position: 'bottom' })
        return
      }
      // 初始化
      try {
        await bluetoothService.initBluetooth()
      } catch (err) {
        logger.error('蓝牙初始化失败', err)
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
        const found = await bluetoothService.scanDevices(5000)
        logger.info('发现附近的设备', found)
        this.devices = found
      } catch (err) {
        logger.error('扫描异常', err)
        alert('扫描过程中出错')
      } finally {
        this.scanning = false
      }
    },

    // ========== 统一处理设备断开 ==========
    /**
     * 处理设备断开事件
     * @param {string} deviceId - 断开的设备ID
     * @param {boolean} isManualDisconnect - 是否为手动断开
     */
    handleDeviceDisconnected(deviceId, isManualDisconnect = false) {
      logger.info('设备断开处理', { deviceId, isManualDisconnect })

      // 只处理当前连接的设备
      if (this.connectingDeviceId !== deviceId) {
        return
      }

      // 更新状态
      this.connectingStatus = 0
      this.connectingDeviceId = null

      // 清理断开监听
      if (this.disconnectUnregister) {
        this.disconnectUnregister()
        this.disconnectUnregister = null
      }

      // 非手动断开才显示提示
      if (!isManualDisconnect) {
        showToast({ message: '设备已断开连接', position: 'bottom' })
      }
    },

    /**
     * 注册设备断开监听
     */
    registerDisconnectListener() {
      // 先移除旧的监听
      if (this.disconnectUnregister) {
        this.disconnectUnregister()
        this.disconnectUnregister = null
      }

      // 注册新监听
      this.disconnectUnregister = bluetoothService.onDeviceDisconnected(
        (deviceId, isManualDisconnect) => {
          this.handleDeviceDisconnected(deviceId, isManualDisconnect)
        },
      )
    },
    // ========== 结束：统一处理设备断开 ==========

    async handleConnect(device) {
      // 防止重复点击
      if (this.connectingStatus === 1) return

      this.connectingDeviceId = device.deviceId
      this.connectingStatus = 1 // 连接中

      try {
        await bluetoothService.connectDevice(device.deviceId)
        await bluetoothService.discoverServices(device.deviceId)

        // 连接成功：注册断开监听
        this.registerDisconnectListener()

        this.connectingStatus = 2 // 已连接
      } catch (err) {
        logger.error('连接失败', err)
        this.connectingStatus = 0 // 回到未连接
        this.connectingDeviceId = null
        this.stopAccumulationTimer()
        showToast({ message: '连接失败', position: 'bottom' })
      }
    },

    /**
     * 启动累积定时器
     * 每 ACCUMULATION_INTERVAL 毫秒检查是否有足够的数据点要渲染
     */
    startAccumulationTimer() {
      if (this.accumulationTimer !== null) {
        logger.warn('Accumulation timer already running')
        return
      }

      this.accumulationTimer = setInterval(() => {
        // 如果缓冲区中有足够的点，或者距离上次清空已经超过一定时间，则推送
        if (this.accumulationBuffer.length >= this.MIN_BATCH_SIZE) {
          this.flushAccumulatedPoints()
        }
      }, this.ACCUMULATION_INTERVAL)

      logger.info('Timer started', { interval: this.ACCUMULATION_INTERVAL, minBatch: this.MIN_BATCH_SIZE })
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
    // ========== 开始：发送指令方法 ==========
    async handleDisconnect(device) {
      try {
        // 断开连接时停止定时器
        await bluetoothService
          .unsubscribeFromNotifications(device.deviceId, NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID)
          .catch(() => {})

        await bluetoothService.disconnectDevice(device.deviceId)

        // handleDeviceDisconnected 会被 disconnectDevice 触发的回调调用
        // 这里不需要手动更新状态
        // 为了保险，可以清理一下
        this.connectingStatus = 0
        this.connectingDeviceId = null
      } catch (e) {
        this.connectingStatus = 2
        logger.error('断开连接失败', e)
      }
    },
    async handleSendStart() {
      try {
        // deviceId, serviceUUID, characteristicUUID
        await bluetoothService.sendStartScan(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
      } catch (err) {
        logger.error('发送开始指令失败', err)
      }
    },
    async handleSendEnd() {
      try {
        // deviceId, serviceUUID, characteristicUUID
        await bluetoothService.sendStopScan(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
      } catch (err) {
        logger.error('发送结束指令失败', err)
      }
    },

    async handleSendCalibParam(x, y, z) {
      try {
        // deviceId, serviceUUID, characteristicUUID
        await bluetoothService.sendSetCalibParam(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          x,
          y,
          z,
        )
      } catch (err) {
        logger.error('发送设置标定参数指令失败', err)
      }
    },
    async handleSendRotateSpeed(pitchSpeed, yawSpeed) {
      try {
        // deviceId, serviceUUID, characteristicUUID
        await bluetoothService.sendSetRotateSpeed(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          pitchSpeed,
          yawSpeed,
        )
      } catch (err) {
        logger.error('发送设置转动速度指令失败', err)
      }
    },
    async handleSendScanTime(seconds) {
      try {
        // deviceId, serviceUUID, characteristicUUID
        await bluetoothService.sendSetScanTime(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          seconds,
        )
      } catch (err) {
        logger.error('发送设置扫描时间指令失败', err)
      }
    },
    async handleSendPitchLimit(upperLimitRad, lowerLimitRad) {
      try {
        // deviceId, serviceUUID, characteristicUUID
        await bluetoothService.sendSetPitchLimit(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          upperLimitRad,
          lowerLimitRad,
        )
      } catch (err) {
        logger.error('发送设置俯仰角上下限指令失败', err)
      }
    },
    /**
     * 发送设置输出XYZ值指令
     * @param {boolean} on - true 表示开启，false 表示关闭
     */
    async handleSendOutputXYZ(on) {
      try {
        await bluetoothService.sendSetOutputXYZ(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          on,
        )
        logger.info('发送设置输出XYZ指令成功', { on })
      } catch (err) {
        logger.error('发送设置输出XYZ指令失败', err)
        throw err
      }
    },

    /**
     * 发送设置输出极坐标值指令
     * @param {boolean} on - true 表示开启，false 表示关闭
     */
    async handleSendOutputPolar(on) {
      try {
        await bluetoothService.sendSetOutputPolar(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          on,
        )
        logger.info('发送设置输出极坐标指令成功', { on })
      } catch (err) {
        logger.error('发送设置输出极坐标指令失败', err)
        throw err
      }
    },
    // ========== 结束：发送指令方法 ==========

    // ========== 开始：读取参数方法 ==========
    /**
     * 读取标定参数
     */
    async handleReadCalibParam() {
      try {
        await bluetoothService.sendReadCalibParam(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送读取标定参数指令成功')
      } catch (err) {
        logger.error('发送读取标定参数指令失败', err)
        throw err
      }
    },

    /**
     * 读取转动速度
     */
    async handleReadRotateSpeed() {
      try {
        await bluetoothService.sendReadRotateSpeed(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送读取转动速度指令成功')
      } catch (err) {
        logger.error('发送读取转动速度指令失败', err)
        throw err
      }
    },

    /**
     * 读取扫描时间
     */
    async handleReadScanTime() {
      try {
        await bluetoothService.sendReadScanCycles(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送读取扫描时间指令成功')
      } catch (err) {
        logger.error('发送读取扫描时间指令失败', err)
        throw err
      }
    },

    /**
     * 读取俯仰角限位
     */
    async handleReadPitchLimit() {
      try {
        await bluetoothService.sendReadPitchLimit(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送读取俯仰角限位指令成功')
      } catch (err) {
        logger.error('发送读取俯仰角限位指令失败', err)
        throw err
      }
    },
    /**
     * 查询输出XYZ状态
     */
    async handleReadOutputXYZ() {
      try {
        await bluetoothService.sendReadOutputXYZ(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送查询输出XYZ状态指令成功')
      } catch (err) {
        logger.error('发送查询输出XYZ状态指令失败', err)
        throw err
      }
    },

    /**
     * 查询输出极坐标状态
     */
    async handleReadOutputPolar() {
      try {
        await bluetoothService.sendReadOutputPolar(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送查询输出极坐标状态指令成功')
      } catch (err) {
        logger.error('发送查询输出极坐标状态指令失败', err)
        throw err
      }
    },

    /**
     * 发送设置速度环PID指令
     * @param {string} axis - 轴，'X'或'Y'
     * @param {number} p - P参数
     * @param {number} i - I参数
     * @param {number} d - D参数
     */
    async handleSendVPID(axis, p, i, d) {
      try {
        await bluetoothService.sendSetVPID(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          axis,
          p,
          i,
          d,
        )
        logger.info('发送设置速度环PID指令成功')
      } catch (err) {
        logger.error('发送设置速度环PID指令失败', err)
        throw err
      }
    },

    /**
     * 发送设置角度环PID指令
     * @param {string} axis - 轴，'X'或'Y'
     * @param {number} p - P参数
     * @param {number} i - I参数
     * @param {number} d - D参数
     */
    async handleSendAPID(axis, p, i, d) {
      try {
        await bluetoothService.sendSetAPID(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          axis,
          p,
          i,
          d,
        )
        logger.info('发送设置角度环PID指令成功')
      } catch (err) {
        logger.error('发送设置角度环PID指令失败', err)
        throw err
      }
    },

    /**
     * 发送设置俯仰角零偏指令
     * @param {number} offset - 俯仰角零偏值 (单位: 度)
     */
    async handleSendPitchOffset(offset) {
      try {
        await bluetoothService.sendSetPitchOffset(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          offset,
        )
        logger.info('发送设置俯仰角零偏指令成功')
      } catch (err) {
        logger.error('发送设置俯仰角零偏指令失败', err)
        throw err
      }
    },

    /**
     * 发送读取速度环PID指令
     * @param {string} axis - 轴，'X'或'Y'
     */
    async handleReadVPID(axis) {
      try {
        await bluetoothService.sendReadVPID(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          axis,
        )
        logger.info('发送读取速度环PID指令成功')
      } catch (err) {
        logger.error('发送读取速度环PID指令失败', err)
        throw err
      }
    },

    /**
     * 发送读取角度环PID指令
     * @param {string} axis - 轴，'X'或'Y'
     */
    async handleReadAPID(axis) {
      try {
        await bluetoothService.sendReadAPID(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          axis,
        )
        logger.info('发送读取角度环PID指令成功')
      } catch (err) {
        logger.error('发送读取角度环PID指令失败', err)
        throw err
      }
    },

    /**
     * 发送读取俯仰角零偏指令
     */
    async handleReadPitchOffset() {
      try {
        await bluetoothService.sendReadPitchOffset(
          this.connectingDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
        )
        logger.info('发送读取俯仰角零偏指令成功')
      } catch (err) {
        logger.error('发送读取俯仰角零偏指令失败', err)
        throw err
      }
    },
    // ==========结束： 读取参数方法 ==========
    setCleanupStatus(status) {
      this.isCleanupInProgress = status
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
