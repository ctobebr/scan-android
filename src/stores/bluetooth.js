import { defineStore } from 'pinia'
import { closeToast, showToast, showDialog, showConfirmDialog } from 'vant'
import { bluetoothService } from '@/services/bluetooth'
import { NUS_SERVICE_UUID, NUS_WRITE_CHAR_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/bluetooth'
// 导入全局日志工具
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger } from '@/utils/logger'

const logger = createLogger('BluetoothStore')

export const useBluetoothStore = defineStore('bluetooth', {
  state: () => ({
    devices: [],
    scanning: false,
    connectionStatus: 0, // 0: 未连接, 1: 连接中, 2: 已连接
    connectedDeviceId: null, // 已连接设备的deviceId
    // 存储断开监听的取消函数
    disconnectUnregister: null,
    isCleanupInProgress: false, // 标记断开订阅是否正在进行
  }),

  actions: {
    /**
     * 请求蓝牙相关权限
     * @returns {Promise<boolean>} 是否获取到所需权限
     * @description 请求蓝牙扫描权限和位置权限，Android要求BLUETOOTH_SCAN + 任一位置权限
     */
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
    /**
     * 自动扫描设备流程
     * @returns {Promise<void>}
     * @description 完整的自动扫描流程：权限检查 → 蓝牙初始化 → 蓝牙状态检查 → 设备扫描
     * @example
     * // 调用自动扫描
     * await bluetoothStore.autoScanOnEnter()
     * // 扫描完成后，设备列表会更新到 bluetoothStore.devices
     */
    async autoScanOnEnter() {
      logger.info('开始自动扫描流程')

      // 权限
      logger.debug('检查蓝牙和位置权限')
      if (!(await this.requestRequirePermissions())) {
        logger.warn('权限请求被拒绝')
        showToast({
          message: '需要蓝牙和位置权限才能扫描设备',
          position: 'bottom',
          duration: 3000,
        })
        return
      }

      // 初始化
      logger.debug('初始化蓝牙服务')
      try {
        await bluetoothService.initBluetooth()
        logger.info('蓝牙初始化成功')
      } catch (err) {
        logger.error('蓝牙初始化失败', err)
        await showDialog({
          title: '提示',
          message: '蓝牙初始化失败，请重试',
          theme: 'round-button',
        })
        return
      }

      // 蓝牙状态
      logger.debug('检查蓝牙状态')
      const enabled = await bluetoothService.isBluetoothEnabled()
      if (!enabled) {
        logger.warn('蓝牙未开启')
        await showDialog({
          title: '提示',
          message: '请先打开手机蓝牙',
          theme: 'round-button',
        })
        return
      }

      // 扫描
      logger.info('开始扫描设备')
      this.scanning = true
      try {
        const found = await bluetoothService.scanDevices(5000)
        logger.info(`扫描完成，发现 ${found.length} 个设备`, { deviceCount: found.length })
        this.devices = found
      } catch (err) {
        logger.error('扫描异常', err)
        await showDialog({
          title: '提示',
          message: '扫描过程中出错',
          theme: 'round-button',
        })
      } finally {
        this.scanning = false
        logger.debug('扫描结束')
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
      if (this.connectedDeviceId !== deviceId) {
        return
      }

      // 更新状态
      this.connectionStatus = 0
      this.connectedDeviceId = null

      // 清理断开监听
      if (this.disconnectUnregister) {
        this.disconnectUnregister()
        this.disconnectUnregister = null
      }

      // 非手动断开才显示提示
      if (!isManualDisconnect) {
        showToast({
          message: '设备已断开连接',
          position: 'bottom',
          duration: 2000,
        })
      }
    },

    /**
     * 注册设备断开监听
     * @returns {Function} 取消监听的函数
     * @description 注册设备断开事件监听器，当设备断开连接时会触发handleDeviceDisconnected方法
     * @example
     * // 注册断开监听
     * const unregister = bluetoothStore.registerDisconnectListener()
     * // 取消监听
     * unregister()
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

      return this.disconnectUnregister
    },
    // ========== 结束：统一处理设备断开 ==========

    /**
     * 连接蓝牙设备
     * @param {Object} device - 设备对象
     * @param {string} device.deviceId - 设备ID
     * @returns {Promise<void>}
     * @description 连接指定的蓝牙设备，包括连接设备、发现服务和注册断开监听
     * @example
     * // 连接设备
     * await bluetoothStore.handleConnect({ deviceId: 'device123' })
     * // 连接成功后，connectionStatus会变为2，connectedDeviceId会设置为设备ID
     */
    async handleConnect(device) {
      // 防止重复点击
      if (this.connectionStatus === 1) return

      // 参数验证
      if (!device || !device.deviceId) {
        logger.error('连接失败：设备信息无效', { device })
        showToast({
          message: '设备信息无效',
          position: 'bottom',
          duration: 2000,
        })
        return
      }

      this.connectedDeviceId = device.deviceId
      this.connectionStatus = 1 // 连接中

      try {
        await bluetoothService.connectDevice(device.deviceId)
        await bluetoothService.discoverServices(device.deviceId)

        // 连接成功：注册断开监听
        this.registerDisconnectListener()

        this.connectionStatus = 2 // 已连接
        closeToast()
        showToast({
          message: '连接成功',
          position: 'bottom',
          duration: 2000,
          type: 'success',
        })
      } catch (err) {
        logger.error('连接失败', err)
        this.connectionStatus = 0 // 回到未连接
        this.connectedDeviceId = null
        closeToast()
        showToast({
          message: '连接失败，请重试',
          position: 'bottom',
          duration: 3000,
          type: 'fail',
        })
      }
    },

    /**
     * 通用蓝牙指令发送方法
     * @param {Function} commandFn - 蓝牙服务的指令函数
     * @param {Array} args - 指令参数
     * @param {string} successMsg - 成功消息
     * @param {string} errorMsg - 错误消息
     * @param {boolean} throwError - 是否抛出错误
     * @returns {Promise<any>} 指令执行结果
     */
    async sendBluetoothCommand(commandFn, args, successMsg, errorMsg, throwError = false) {
      // 提取公共的蓝牙指令发送逻辑并添加参数验证
      try {
        // 参数验证
        if (typeof commandFn !== 'function') {
          const error = new Error('commandFn 必须是函数')
          logger.error(errorMsg, error)
          if (throwError) {
            throw error
          }
          return null
        }

        if (!this.connectedDeviceId) {
          const error = new Error('未连接设备')
          logger.error(errorMsg, error)
          showToast({
            message: '请先连接设备',
            position: 'bottom',
            duration: 2000,
          })
          if (throwError) {
            throw error
          }
          return null
        }

        const result = await commandFn(
          this.connectedDeviceId,
          NUS_SERVICE_UUID,
          NUS_WRITE_CHAR_UUID,
          ...args,
        )
        if (successMsg) {
          logger.info(successMsg)
        }
        return result
      } catch (err) {
        logger.error(errorMsg, err)
        // 提供友好的错误提示
        if (!throwError) {
          showToast({
            message: '操作失败，请重试',
            position: 'bottom',
            duration: 2000,
            type: 'fail',
          })
        }
        if (throwError) {
          throw err
        }
        return null
      }
    },

    // ========== 开始：发送指令方法 ==========
    async handleDisconnect(device) {
      logger.info('开始断开设备连接', { deviceId: device?.deviceId })

      if (!device || !device.deviceId) {
        logger.error('断开连接失败：设备信息无效', { device })
        showToast({
          message: '设备信息无效',
          position: 'bottom',
          duration: 2000,
        })
        return
      }

      try {
        // 断开连接时停止定时器
        logger.debug('取消通知订阅', { deviceId: device.deviceId })
        await bluetoothService
          .unsubscribeFromNotifications(device.deviceId, NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID)
          .catch((err) => {
            logger.warn('取消通知订阅失败', err)
          })

        logger.debug('断开设备连接', { deviceId: device.deviceId })
        await bluetoothService.disconnectDevice(device.deviceId)
        logger.info('设备断开连接成功', { deviceId: device.deviceId })

        // handleDeviceDisconnected 会被 disconnectDevice 触发的回调调用
        // 这里不需要手动更新状态
        // 为了保险，可以清理一下
        this.connectionStatus = 0
        this.connectedDeviceId = null
      } catch (e) {
        this.connectionStatus = 2
        logger.error('断开连接失败', e)
        showToast({
          message: '断开连接失败，请重试',
          position: 'bottom',
          duration: 2000,
          type: 'fail',
        })
      }
    },
    async handleSendStart() {
      return this.sendBluetoothCommand((...args) => bluetoothService.sendStartScan(...args), [], null, '发送开始指令失败')
    },
    async handleSendEnd() {
      return this.sendBluetoothCommand((...args) => bluetoothService.sendStopScan(...args), [], null, '发送结束指令失败')
    },

    async handleSendCalibParam(x, y, z) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetCalibParam(...args),
        [x, y, z],
        null,
        '发送设置标定参数指令失败'
      )
    },
    async handleSendRotateSpeed(pitchSpeed, yawSpeed) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetRotateSpeed(...args),
        [pitchSpeed, yawSpeed],
        null,
        '发送设置转动速度指令失败'
      )
    },
    async handleSendScanTime(seconds) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetScanTime(...args),
        [seconds],
        null,
        '发送设置扫描时间指令失败'
      )
    },
    async handleSendPitchLimit(upperLimitRad, lowerLimitRad) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetPitchLimit(...args),
        [upperLimitRad, lowerLimitRad],
        null,
        '发送设置俯仰角上下限指令失败'
      )
    },
    /**
     * 发送设置输出XYZ值指令
     * @param {boolean} on - true 表示开启，false 表示关闭
     */
    async handleSendOutputXYZ(on) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetOutputXYZ(...args),
        [on],
        '发送设置输出XYZ指令成功',
        '发送设置输出XYZ指令失败',
        true
      )
    },

    /**
     * 发送设置输出极坐标值指令
     * @param {boolean} on - true 表示开启，false 表示关闭
     */
    async handleSendOutputPolar(on) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetOutputPolar(...args),
        [on],
        '发送设置输出极坐标指令成功',
        '发送设置输出极坐标指令失败',
        true
      )
    },
    // ========== 结束：发送指令方法 ==========

    // ========== 开始：读取参数方法 ==========
    /**
     * 读取标定参数
     */
    async handleReadCalibParam() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadCalibParam(...args),
        [],
        '发送读取标定参数指令成功',
        '发送读取标定参数指令失败',
        true
      )
    },

    /**
     * 读取转动速度
     */
    async handleReadRotateSpeed() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadRotateSpeed(...args),
        [],
        '发送读取转动速度指令成功',
        '发送读取转动速度指令失败',
        true
      )
    },

    /**
     * 读取扫描时间
     */
    async handleReadScanTime() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadScanCycles(...args),
        [],
        '发送读取扫描时间指令成功',
        '发送读取扫描时间指令失败',
        true
      )
    },

    /**
     * 读取俯仰角限位
     */
    async handleReadPitchLimit() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadPitchLimit(...args),
        [],
        '发送读取俯仰角限位指令成功',
        '发送读取俯仰角限位指令失败',
        true
      )
    },
    /**
     * 查询输出XYZ状态
     */
    async handleReadOutputXYZ() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadOutputXYZ(...args),
        [],
        '发送查询输出XYZ状态指令成功',
        '发送查询输出XYZ状态指令失败',
        true
      )
    },

    /**
     * 查询输出极坐标状态
     */
    async handleReadOutputPolar() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadOutputPolar(...args),
        [],
        '发送查询输出极坐标状态指令成功',
        '发送查询输出极坐标指令失败',
        true
      )
    },

    /**
     * 发送设置速度环PID指令
     * @param {string} axis - 轴，'x'或'y'
     * @param {number} p - P参数
     * @param {number} i - I参数
     * @param {number} d - D参数
     */
    async handleSendVPID(axis, p, i, d) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetVPID(...args),
        [axis, p, i, d],
        '发送设置速度环PID指令成功',
        '发送设置速度环PID指令失败',
        true
      )
    },

    /**
     * 发送设置角度环PID指令
     * @param {string} axis - 轴，'x'或'y'
     * @param {number} p - P参数
     * @param {number} i - I参数
     * @param {number} d - D参数
     */
    async handleSendAPID(axis, p, i, d) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetAPID(...args),
        [axis, p, i, d],
        '发送设置角度环PID指令成功',
        '发送设置角度环PID指令失败',
        true
      )
    },

    /**
     * 发送设置俯仰角零偏指令
     * @param {number} offset - 俯仰角零偏值 (单位: 度)
     */
    async handleSendPitchOffset(offset) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendSetPitchOffset(...args),
        [offset],
        '发送设置俯仰角零偏指令成功',
        '发送设置俯仰角零偏指令失败',
        true
      )
    },

    /**
     * 发送读取速度环PID指令
     * @param {string} axis - 轴，'x'或'y'
     */
    async handleReadVPID(axis) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadVPID(...args),
        [axis],
        '发送读取速度环PID指令成功',
        '发送读取速度环PID指令失败',
        true
      )
    },

    /**
     * 发送读取角度环PID指令
     * @param {string} axis - 轴，'x'或'y'
     */
    async handleReadAPID(axis) {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadAPID(...args),
        [axis],
        '发送读取角度环PID指令成功',
        '发送读取角度环PID指令失败',
        true
      )
    },

    /**
     * 发送读取俯仰角零偏指令
     */
    async handleReadPitchOffset() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendReadPitchOffset(...args),
        [],
        '发送读取俯仰角零偏指令成功',
        '发送读取俯仰角零偏指令失败',
        true
      )
    },

    /**
     * 发送拍照准备就绪指令(0x91)
     * @description 通知下位机当前已准备就绪，可以开始接收拍照指令
     */
    async handleSendCameraNextPhoto() {
      return this.sendBluetoothCommand(
        (...args) => bluetoothService.sendCameraNextPhoto(...args),
        [],
        null,
        '发送拍照准备就绪指令失败'
      )
    },
    // ==========结束： 读取参数方法 ==========
    /**
     * 设置清理状态
     * @param {boolean} status - 清理状态
     * @description 设置断开订阅的清理状态，用于标记是否正在进行清理操作
     * @example
     * // 设置清理状态为进行中
     * bluetoothStore.setCleanupStatus(true)
     * // 设置清理状态为完成
     * bluetoothStore.setCleanupStatus(false)
     */
    setCleanupStatus(status) {
      this.isCleanupInProgress = status
    },
  },

  getters: {
    isConnected: (state) => state.connectionStatus === 2,
  },
})
