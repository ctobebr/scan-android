// src/services/bluetoothService.js
import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
// ========== 协议常量 ==========
import {
  PROTOCOL_HEADER_HIGH,
  PROTOCOL_HEADER_LOW,
  CONTROL_COMMANDS,
  DEVICE_DATA_COMMANDS,
} from '@/constants/protocolCommands'

/**
 * 构造符合协议的完整帧（含校验和）
 * @param {number} cmd - 命令字 (1 byte)
 * @param {Uint8Array|number[]} data - 数据负载（可选，默认空数组）
 * @returns {Uint8Array} 完整帧：[AA, 55, CMD, LEN, ...DATA, CHECKSUM]
 */
function buildProtocolFrame(cmd, data = []) {
  if (typeof cmd !== 'number' || cmd < 0 || cmd > 255) {
    throw new Error('命令字必须是 0～255 的整数')
  }

  const payload = Array.isArray(data) ? data : Array.from(data)
  const len = payload.length

  // 校验和 = CMD + LEN + 所有 DATA 字节之和，取低 8 位
  let checksum = cmd + len
  for (const byte of payload) {
    checksum += byte
  }
  checksum &= 0xff // 取低 8 位

  // 构造完整帧
  const frame = [PROTOCOL_HEADER_HIGH, PROTOCOL_HEADER_LOW, cmd, len, ...payload, checksum]

  return new Uint8Array(frame)
}
export class BluetoothService {
  constructor() {
    this.connectedDevice = null
    this.connected = false
    this.devices = new Map()
    this.initialized = false
    // 添加断开监听器回调列表
    this.disconnectCallbacks = []
  }

  // 检查蓝牙是否已开启
  async isBluetoothEnabled() {
    try {
      return await BleClient.isEnabled()
    } catch (error) {
      console.warn('检查蓝牙状态失败:', error)
      return false
    }
  }

  async initBluetooth() {
    try {
      if (!this.initialized) {
        // 优先调用原生 plugin 的 initialize（确保 native 端完成初始化）
        if (BluetoothLe && typeof BluetoothLe.initialize === 'function') {
          console.log('调用 BluetoothLe.initialize()')
          await BluetoothLe.initialize()
          this.initialized = true
          console.log('BluetoothLe 初始化完成')
        } else if (BleClient && typeof BleClient.initialize === 'function') {
          console.log('调用 BleClient.initialize()')
          await BleClient.initialize()
          this.initialized = true
          console.log('BleClient 初始化完成')
        } else {
          console.warn('没有可用的 initialize 方法，跳过初始化')
          this.initialized = true
        }
      }
      return true
    } catch (error) {
      console.error('初始化蓝牙失败:', error)
      throw error
    }
  }

  async requestPermissions() {
    try {
      if (BluetoothLe && typeof BluetoothLe.requestPermissions === 'function') {
        const result = await BluetoothLe.requestPermissions()
        console.log('权限请求结果:', JSON.stringify(result, null, 2))
        return result
      } else {
        console.warn('BluetoothLe.requestPermissions 不可用，确保已授予位置与蓝牙相关权限。')
        return { bluetooth: 'granted', location: 'granted' }
      }
    } catch (error) {
      console.error('权限请求失败:', error)
      throw error
    }
  }

  async scanDevices(duration = 5000) {
    this.devices.clear()

    await this.initBluetooth()

    return new Promise((resolve) => {
      try {
        //  使用 BleClient.requestLEScan（新 API）
        BleClient.requestLEScan({}, (result) => {
          if (result.device?.deviceId) {
            const device = {
              deviceId: result.device.deviceId,
              name: result.device.name || result.localName || 'N/A',
              rssi: result.rssi || 0,
              txPower: result.txPower,
              manufacturerData: result.manufacturerData,
              serviceData: result.serviceData,
              uuids: result.uuids,
              rawAdvertisement: result.rawAdvertisement,
            }
            this.devices.set(device.deviceId, device)
            // console.log('发现设备:', device.name, device.deviceId)
          }
        })
      } catch (error) {
        console.error('开始扫描失败:', error)
      }

      setTimeout(async () => {
        await this.stopScan()
        resolve(this.getDiscoveredDevices())
      }, duration)
    })
  }

  async stopScan() {
    try {
      await BleClient.stopLEScan() //  新方法名
      console.log('停止扫描')
    } catch (error) {
      console.error('停止扫描失败:', error)
    }
  }

  async connectDevice(deviceId) {
    try {
      // 在连接前先移除该设备可能存在的旧监听
      this.removeDisconnectListener(deviceId)

      await BleClient.connect(deviceId, (deviceId) => {
        // 这是断开连接的回调！当设备意外断开时触发-------这里利用插件提供的方法，一直不断的监听连接是否活跃，如果不活跃则触发所有注册的断开回调
        console.log('设备意外断开连接:', deviceId)
        // 更新内部状态
        this.connected = false
        this.connectedDevice = null
        // 触发所有注册的断开回调
        this.triggerDisconnectCallbacks(deviceId)
      })

      this.connectedDevice = { deviceId }
      this.connected = true
      console.log('设备连接成功:', deviceId)
    } catch (error) {
      console.error('连接失败:', error)
      throw error
    }
  }

  async disconnectDevice(deviceId) {
    try {
      await BleClient.disconnect(deviceId) //  参数是字符串
      this.connectedDevice = null
      this.connected = false
      // 手动断开时也触发回调，但带上 isManualDisconnect 标记
      this.triggerDisconnectCallbacks(deviceId, true)
      console.log('设备已断开连接')
    } catch (error) {
      console.error('断开连接失败:', error)
      throw error
    }
  }

  async discoverServices(deviceId) {
    try {
      const services = await BleClient.getServices(deviceId)
      console.log('发现的服务:', JSON.stringify(services))
      return services
    } catch (error) {
      console.error('发现服务失败:', error)
      throw error
    }
  }
  /**
   * 发送字符串数据（原有方法，保持不变）
   */
  async writeData(deviceId, serviceUUID, characteristicUUID, value) {
    if (!deviceId) {
      console.log('writeData:deviceId为空')
      return
    }
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(value)
      await BleClient.write(deviceId, serviceUUID, characteristicUUID, data)
      console.log('字符串数据发送成功:', value)
    } catch (error) {
      console.error('字符串数据发送失败:', error)
      throw error
    }
  }
  /**
   * 发送二进制数据（Uint8Array）
   */
  async writeBinaryData(deviceId, serviceUUID, characteristicUUID, value) {
    if (!deviceId) {
      console.log('writeBinaryData:deviceId为空')
      return
    }
    if (!(value instanceof Uint8Array)) {
      throw new Error('writeBinaryData: value 必须是 Uint8Array 类型')
    }
    try {
      await BleClient.write(deviceId, serviceUUID, characteristicUUID, value)
      console.log(
        '二进制数据发送成功:',
        Array.from(value)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' '),
      )
    } catch (error) {
      console.error('二进制数据发送失败:', error)
      throw error
    }
  }
  async readData(deviceId, serviceUUID, characteristicUUID) {
    if (!deviceId) {
      console.log('readData:deviceId为空')
      return
    }
    try {
      const value = await BleClient.read(deviceId, serviceUUID, characteristicUUID)
      const decoder = new TextDecoder()
      const str = decoder.decode(value)
      console.log('读取数据:', str)
      return str
    } catch (error) {
      console.error('读取失败:', error)
      throw error
    }
  }

  async subscribeToNotifications(deviceId, serviceUUID, characteristicUUID, callback) {
    if (!deviceId) {
      console.log('subscribeToNotifications:deviceId为空')
      return
    }
    try {
      await BleClient.startNotifications(deviceId, serviceUUID, characteristicUUID, (value) => {
        //  统一处理 ArrayBuffer / DataView
        let buffer
        if (value instanceof ArrayBuffer) {
          buffer = value
        } else if (value?.buffer instanceof ArrayBuffer) {
          // 处理 DataView 或 TypedArray取偏移量后的数据，都能用typedarray去新建
          buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
        } else {
          console.error('不支持的数据类型:', typeof value, value)
          return
        }
        // 转为 Uint8Array 供parser.parse使用
        const uint8 = new Uint8Array(buffer)
        // 透传给业务逻辑
        callback(uint8)
      })
      console.log('已订阅通知')
    } catch (error) {
      console.error('订阅失败:', error)
      throw error
    }
  }

  async unsubscribeFromNotifications(deviceId, serviceUUID, characteristicUUID) {
    if (!deviceId) {
      console.log('unsubscribeFromNotifications:deviceId为空')
      return
    }
    try {
      await BleClient.stopNotifications(deviceId, serviceUUID, characteristicUUID)
      console.log('已取消订阅')
    } catch (error) {
      console.error('取消订阅失败:', error)
      throw error
    }
  }

  getDiscoveredDevices() {
    return Array.from(this.devices.values())
  }

  isConnected() {
    return this.connected
  }

  getConnectedDevice() {
    return this.connectedDevice
  }

  clearDevices() {
    this.devices.clear()
  }

  // ========== 连接状态监控方法 ==========

  /**
   * 注册设备意外断开回调
   * @param {Function} callback - 回调函数，接收参数 (deviceId, isManualDisconnect)
   * @returns {Function} 取消注册的函数
   */
  onDeviceDisconnected(callback) {
    if (typeof callback === 'function') {
      this.disconnectCallbacks.push(callback)
    }
    // 返回一个用于取消注册的函数
    return () => {
      this.disconnectCallbacks = this.disconnectCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * 触发所有断开回调
   * @param {string} deviceId - 断开连接的设备ID
   * @param {boolean} isManualDisconnect - 是否为手动断开
   */
  triggerDisconnectCallbacks(deviceId, isManualDisconnect = false) {
    console.log(`触发断开回调，设备: ${deviceId}, 手动断开: ${isManualDisconnect}`)
    this.disconnectCallbacks.forEach((callback) => {
      try {
        callback(deviceId, isManualDisconnect)
      } catch (err) {
        console.error('执行断开回调时出错:', err)
      }
    })
  }

  /**
   * 移除指定设备的断开监听（连接新设备前调用）
   * @param {string} deviceId
   */
  removeDisconnectListener(deviceId) {
    // 这个方法主要是为了清理状态，实际回调注册在组件层面管理
    console.log('准备连接新设备，清理旧状态:', deviceId)
  }

  /**
   * 主动检查连接状态
   * @param {string} deviceId
   * @returns {Promise<boolean>}
   */
  async checkConnectionStatus(deviceId) {
    if (!deviceId) return false
    try {
      // 尝试读取一个特征值来验证连接是否真的存活
      // 注意：这里需要一个已知存在的特征值，这里假设 NUS_SERVICE_UUID 是存在的
      // 如果没有合适的特征值，需要捕获错误
      const services = await BleClient.getServices(deviceId)
      return services && services.length > 0
    } catch (error) {
      console.warn('检查连接状态失败，设备可能已断开:', error)
      // 连接状态异常，触发断开回调
      if (this.connectedDevice?.deviceId === deviceId) {
        this.connected = false
        this.connectedDevice = null
        this.triggerDisconnectCallbacks(deviceId, false)
      }
      return false
    }
  }

  // ========== 结束：连接状态监控方法 ==========

  /**
   * 通用发送函数：根据命令字和数据构建协议帧并发送
   * @param {string} deviceId - 蓝牙设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @param {number} command - 命令字 (CONTROL_COMMANDS 中的常量)
   * @param {ArrayBuffer|TypedArray|number[]|null|undefined} data - 要发送的数据 (可选)
   */
  async sendCommand(deviceId, serviceUUID, characteristicUUID, command, data = null) {
    let payload = []
    if (data !== null && data !== undefined) {
      if (data instanceof ArrayBuffer) {
        payload = Array.from(new Uint8Array(data))
      } else if (
        data instanceof Uint8Array ||
        data instanceof Int8Array ||
        data instanceof Int16Array ||
        data instanceof Uint16Array ||
        data instanceof Int32Array ||
        data instanceof Uint32Array ||
        data instanceof Float32Array ||
        data instanceof Float64Array
      ) {
        payload = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      } else if (Array.isArray(data)) {
        payload = data.map((b) => parseInt(b, 10)).filter((b) => !isNaN(b) && b >= 0 && b <= 255)
      } else {
        throw new Error(
          'Data must be an ArrayBuffer, TypedArray (e.g., Int16Array, Float32Array), or Array of numbers (0-255).',
        )
      }
    }

    const frame = buildProtocolFrame(command, payload)
    await this.writeBinaryData(deviceId, serviceUUID, characteristicUUID, frame)
    console.log(
      `[指令] 已发送 0x ${command.toString(16).padStart(2, '0').toUpperCase()}: `,
      JSON.stringify(frame),
    )
  }
  /**
   * 发送“启动扫描”指令：AA55 01 00 [checksum]
   * 根据协议，CMD=0x01, LEN=0, DATA=[]
   */
  async sendStartScan(deviceId, serviceUUID, characteristicUUID) {
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_START,
      null,
    )
  }

  /**
   * 发送“停止扫描”指令：AA55 02 00 [checksum]
   */
  async sendStopScan(deviceId, serviceUUID, characteristicUUID) {
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_STOP,
      null,
    )
  }
  /**
   * 发送“转动到目标点”指令
   * @param {number} targetAngleRad - 目标角度 (弧度)
   */
  // async sendRotateToTarget(deviceId, serviceUUID, characteristicUUID, targetAngleRad) {
  //   // 根据下位机代码中的 radiansToU16 函数，角度值需转换为 int16_t (弧度 * 1000)
  //   const int16Angle = Math.round(targetAngleRad * 1000)
  //   const buffer = new ArrayBuffer(2) // 1 int16_t * 2 bytes
  //   const view = new DataView(buffer)
  //   view.setInt16(0, int16Angle, true) // 小端序，使用 setInt16
  //   await this.sendCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_ROTATE_TO_TARGET,
  //     buffer,
  //   )
  // }
  /**
   * 发送“设置标定参数”指令
   * @param {number} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} x - X轴标定参数 (float, 单位: mm)
   * @param {number} y - Y轴标定参数 (float, 单位: mm)
   * @param {number} z - Z轴标定参数 (float, 单位: mm)
   */
  async sendSetCalibParam(deviceId, serviceUUID, characteristicUUID, x, y, z) {
    const buffer = new ArrayBuffer(12) // 3 * float = 12 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, x, true) // X, 小端序
    view.setFloat32(4, y, true) // Y, 小端序 (偏移 4 字节)
    view.setFloat32(8, z, true) // Z, 小端序 (偏移 8 字节)
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_CALIB_PARAM, // 注意：这里命令码可能也需要同步修改，如果协议改变了
      buffer,
    )
  }
  /**
   * 发送“设置转动速度”指令
   * @param {number} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} pitchSpeed - 俯仰轴速度 (float, 单位: rad/ms)
   * @param {number} yawSpeed - 偏航轴速度 (float, 单位: rad/ms)
   */
  async sendSetRotateSpeed(deviceId, serviceUUID, characteristicUUID, pitchSpeed, yawSpeed) {
    const buffer = new ArrayBuffer(8) // 2 * float = 8 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, pitchSpeed, true) // pitch speed, 小端序
    view.setFloat32(4, yawSpeed, true) // yaw speed, 小端序 (偏移 4 字节)
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_ROTATE_SPEED,
      buffer,
    )
  }

  /**
   * 发送“设置扫描时间”指令
   * @param {number} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} seconds - 扫描时间 (uint16_t, 单位: 秒)
   */
  async sendSetScanTime(deviceId, serviceUUID, characteristicUUID, seconds) {
    const buffer = new ArrayBuffer(2) // 1 * uint16_t = 2 bytes
    const view = new DataView(buffer)
    view.setUint16(0, seconds, true) // 小端序
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_SCAN_TIME,
      buffer,
    )
  }

  /**
   * 发送“设置俯仰角上下限”指令
   * @param {number} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} upperLimitRad - 俯仰角上限 (单位: 弧度 rad)
   * @param {number} lowerLimitRad - 俯仰角下限 (单位: 弧度 rad)
   */
  async sendSetPitchLimit(deviceId, serviceUUID, characteristicUUID, upperLimitRad, lowerLimitRad) {
    const buffer = new ArrayBuffer(8) // 2 * float = 8 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, upperLimitRad, true) // 上限 limit, 小端序，第一个 float
    view.setFloat32(4, lowerLimitRad, true) // 下限 limit, 小端序，第二个 float (偏移 4 字节)
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_PITCH_LIMIT,
      buffer,
    )
  }

  /**
   * 发送“设置输出XYZ值”指令
   * @param {number} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {boolean} on - true 表示开启，false 表示关闭
   */
  async sendSetOutputXYZ(deviceId, serviceUUID, characteristicUUID, on) {
    const buffer = new ArrayBuffer(1) // 1 * bool = 1 byte
    const view = new Uint8Array(buffer)
    view[0] = on ? 1 : 0 // 1 表示开启，0 表示关闭
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_OUTPUT_XYZ,
      buffer,
    )
  }

  /**
   * 发送“设置输出极坐标值”指令
   * @param {number} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {boolean} on - true 表示开启，false 表示关闭
   */
  async sendSetOutputPolar(deviceId, serviceUUID, characteristicUUID, on) {
    const buffer = new ArrayBuffer(1) // 1 * bool = 1 byte
    const view = new Uint8Array(buffer)
    view[0] = on ? 1 : 0 // 1 表示开启，0 表示关闭
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_OUTPUT_POLAR,
      buffer,
    )
  }

  /**
   * 发送“设置速度环PID”指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'X'或'Y'
   * @param {number} p - P参数 (float)
   * @param {number} i - I参数 (float)
   * @param {number} d - D参数 (float)
   */
  async sendSetVPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d) {
    const buffer = new ArrayBuffer(16) // 4 bytes axis + 3 * float = 16 bytes
    const view = new DataView(buffer)
    view.setUint32(0, axis === 'X' ? 0 : 1, true) // 轴值：X=0, Y=1，小端序
    view.setFloat32(4, p, true) // P参数，小端序 (偏移 4 字节)
    view.setFloat32(8, i, true) // I参数，小端序 (偏移 8 字节)
    view.setFloat32(12, d, true) // D参数，小端序 (偏移 12 字节)
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_V_PID,
      buffer,
    )
  }

  /**
   * 发送“设置角度环PID”指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'X'或'Y'
   * @param {number} p - P参数 (float)
   * @param {number} i - I参数 (float)
   * @param {number} d - D参数 (float)
   */
  async sendSetAPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d) {
    const buffer = new ArrayBuffer(16) // 4 bytes axis + 3 * float = 16 bytes
    const view = new DataView(buffer)
    view.setUint32(0, axis === 'X' ? 0 : 1, true) // 轴值：X=0, Y=1，小端序
    view.setFloat32(4, p, true) // P参数，小端序 (偏移 4 字节)
    view.setFloat32(8, i, true) // I参数，小端序 (偏移 8 字节)
    view.setFloat32(12, d, true) // D参数，小端序 (偏移 12 字节)
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_A_PID,
      buffer,
    )
  }

  /**
   * 发送“控制上位机拍照”指令
   * @param {number} yaw - 偏航角 (弧度)
   * @param {number} pitch - 俯仰角 (弧度)
   */
  // async sendCtrlCamera(deviceId, serviceUUID, characteristicUUID, yaw, pitch) {
  //   // 协议明确指出 data{float:yaw,float:pitch}
  //   const buffer = new ArrayBuffer(8) // 2 float32 * 4 bytes
  //   const view = new DataView(buffer)
  //   view.setFloat32(0, yaw, true) // 小端序
  //   view.setFloat32(4, pitch, true) // 小端序
  //   await this.sendCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     DEVICE_DATA_COMMANDS.CMD_CTRL_CAMERA,
  //     buffer,
  //   )
  // }

  /**
   * 发送读取参数指令 (无数据)
   * @param {number} readCommand - 读取命令字 (CONTROL_COMMANDS.CMD_READ_*)
   */
  async sendReadCommand(deviceId, serviceUUID, characteristicUUID, readCommand) {
    // 可以加入验证，确保传入的是读取命令
    if (
      ![
        DEVICE_DATA_COMMANDS.CMD_READ_CALIB_PARAM,
        DEVICE_DATA_COMMANDS.CMD_READ_ROTATE_SPEED,
        DEVICE_DATA_COMMANDS.CMD_READ_SCAN_TIME,
        DEVICE_DATA_COMMANDS.CMD_READ_PITCH_LIMIT,
      ].includes(readCommand)
    ) {
      console.warn(`Warning: Command  ${readCommand} might not be a standard read command.`)
    }
    await this.sendCommand(deviceId, serviceUUID, characteristicUUID, readCommand, null)
  }

  /**
   * 发送读取转动速度指令
   */
  async sendReadRotateSpeed(deviceId, serviceUUID, characteristicUUID) {
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_ROTATE_SPEED,
    )
  }

  /**
   * 发送读取扫描时间指令
   */
  async sendReadScanCycles(deviceId, serviceUUID, characteristicUUID) {
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_SCAN_TIME,
    )
  }

  /**
   * 发送读取俯仰角上下限指令
   */
  async sendReadPitchLimit(deviceId, serviceUUID, characteristicUUID) {
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_PITCH_LIMIT,
    )
  }

  /**
   * 发送读取标定参数指令
   */
  async sendReadCalibParam(deviceId, serviceUUID, characteristicUUID) {
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_CALIB_PARAM,
    )
  }

  /**
   * 发送查询输出XYZ状态指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadOutputXYZ(deviceId, serviceUUID, characteristicUUID) {
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_OUTPUT_XYZ,
      null,
    )
  }

  /**
   * 发送查询输出极坐标状态指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadOutputPolar(deviceId, serviceUUID, characteristicUUID) {
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_OUTPUT_POLAR,
      null,
    )
  }

  /**
   * 发送“读取速度环PID”指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'X'或'Y'
   */
  async sendReadVPID(deviceId, serviceUUID, characteristicUUID, axis) {
    const buffer = new ArrayBuffer(1) // 1 byte axis
    const view = new Uint8Array(buffer)
    view[0] = axis === 'X' ? 0 : 1 // 轴值：X=0, Y=1
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_V_PID,
      buffer,
    )
  }

  /**
   * 发送“读取角度环PID”指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'X'或'Y'
   */
  async sendReadAPID(deviceId, serviceUUID, characteristicUUID, axis) {
    const buffer = new ArrayBuffer(1) // 1 byte axis
    const view = new Uint8Array(buffer)
    view[0] = axis === 'X' ? 0 : 1 // 轴值：X=0, Y=1
    await this.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_A_PID,
      buffer,
    )
  }
}

export const bluetoothService = new BluetoothService()
