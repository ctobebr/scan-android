// src/services/bluetoothService.js
import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { Filesystem, Directory } from '@capacitor/filesystem'
// ========== 协议常量 ==========
import {
  PROTOCOL_HEADER_HIGH,
  PROTOCOL_HEADER_LOW,
  CONTROL_COMMANDS,
  DEVICE_DATA_COMMANDS
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
  const frame = [
    PROTOCOL_HEADER_HIGH,
    PROTOCOL_HEADER_LOW,
    cmd,
    len,
    ...payload,
    checksum,
  ]

  return new Uint8Array(frame)
}
export class BluetoothService {
  constructor() {
    this.connectedDevice = null
    this.connected = false
    this.devices = new Map()
    this.initialized = false
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
            console.log('发现设备:', device.name, device.deviceId)
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
      await BleClient.connect(deviceId) //  参数是字符串，不是对象
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
  async saveBleDataToFile(dataLines) {
    if (!Array.isArray(dataLines) || dataLines.length === 0) {
      throw new Error('无数据可保存')
    }
    const content = dataLines.join('\n')
    const timestamp = new Date(Date.now() + 28800000)
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)

    const filename = `ble_data_${timestamp}.txt`
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Documents,
      encoding: 'utf8',
    })

    return {
      path: Directory.Documents,
      filePath: filename,
      lineCount: dataLines.length,
    }
  }
  /**
   * 列出 Documents 目录下的蓝牙数据文件
   * @param {string} [pattern='ble_data_'] - 文件名匹配模式，默认查找 'ble_data_' 开头的文件
   * @returns {Promise<{name: string, size: number, ctime: number, mtime: number}[]>} - 文件信息列表
   */
  async listBleDataFiles(pattern = 'ble_data_') {
    try {
      const result = await Filesystem.readdir({
        path: '', // 空字符串表示根目录（根据 Directory 指定）
        directory: Directory.Documents,
      })

      // 过滤出符合条件的 .txt 文件
      const filteredFiles = result.files
        .filter((file) => {
          // 检查文件名是否以 pattern 开头且扩展名为 .txt
          return file.name.startsWith(pattern) && file.name.endsWith('.txt')
        })
        .map((file) => ({
          name: file.name,
          size: file.size, // 文件大小（字节）
          ctime: file.mtime, // 返回 mtime，赋给 ctime
          mtime: file.mtime, // 最后修改时间（毫秒时间戳）
        }))

      // 可选：按修改时间倒序排列，最新的在前
      filteredFiles.sort((a, b) => b.mtime - a.mtime)

      return filteredFiles
    } catch (error) {
      console.error('读取文件列表失败:', error)
      throw new Error('读取文件列表失败: ' + error.message)
    }
  }
  /**
   * 读取指定的蓝牙数据文件内容
   * @param {string} filename - 文件名
   * @returns {Promise<string>} - 文件内容
   */
  async readBleDataFile(filename) {
    try {
      const result = await Filesystem.readFile({
        path: filename,
        directory: Directory.Documents,
        encoding: 'utf8', // 读取时也要指定编码
      })
      return result.data // Capacitor 返回的是 { data: 'file_content' }
    } catch (error) {
      console.log('读取失败')
      console.log(`读取文件 " ${filename}" 失败:`, error)
      throw new Error(`读取文件失败:  ${error.message}`)
    }
  }

  async getURL(filename) {
    try {
      const uriResult = await Filesystem.getUri({
        directory: Directory.Documents, // 确保与 bluetoothService 存储文件的目录一致
        path: filename,
      })
      console.log('URL', uriResult.uri)
      return uriResult.uri
    } catch (error) {
      console.log('获取URL出错', error)
    }
  }
  /**
   * 从本地 Documents 目录删除指定的蓝牙数据文件
   * @param {string} filename - 要删除的文件名
   * @returns {Promise<void>}
   */
  async deleteBleDataFile(filename) {
    try {
      // 验证文件名是否存在
      if (!filename) {
        throw new Error('文件名不能为空')
      }

      console.log(`开始删除本地文件:  ${filename}`)

      // 调用 Capacitor Filesystem API 删除文件
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Documents, // 确保与存储文件时的目录一致
      })

      console.log(`文件 " ${filename}" 删除成功`)
    } catch (error) {
      console.error(`删除文件 " ${filename}" 失败:`, error)
      // 如果是文件不存在的错误，可以提供更友好的提示
      if (error.message.includes('File does not exist')) {
        throw new Error(`文件 " ${filename}" 不存在，无法删除。`)
      }
      // 抛出原始错误或包装后的错误
      throw new Error(`删除文件失败:  ${error.message}`)
    }
  }
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
    console.log(`[指令] 已发送 0x ${command.toString(16).padStart(2, '0').toUpperCase()}: `, JSON.stringify(frame))
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
   * 发送“设置转动速度”指令
   * @param {number} speed - 速度值 (假设为 uint16_t)
   */
  // async sendSetRotateSpeed(deviceId, serviceUUID, characteristicUUID, speed) {
  //   // 假设下位机期望一个 uint16_t 类型的速度值
  //   const buffer = new ArrayBuffer(2) // 1 uint16_t * 2 bytes
  //   const view = new DataView(buffer)
  //   view.setUint16(0, speed, true) // 小端序
  //   await this.sendCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_SET_ROTATE_SPEED,
  //     buffer,
  //   )
  // }

  /**
   * 发送“设置扫描圈数”指令
   * @param {number} cycles - 扫描圈数 (需要确认下位机期望的数据类型和单位，例如 uint16_t)
   */
  // async sendSetScanCycles(deviceId, serviceUUID, characteristicUUID, cycles) {
  //   // 假设下位机期望一个 uint16_t 类型的圈数值
  //   const buffer = new ArrayBuffer(2) // 1 uint16_t * 2 bytes
  //   const view = new DataView(buffer)
  //   view.setUint16(0, cycles, true) // 小端序
  //   await this.sendCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_SET_SCAN_CYCLES,
  //     buffer,
  //   )
  // }

  /**
   * 发送“设置俯仰角上下限”指令
   * @param {number} minPitchRad - 最小俯仰角 (弧度)
   * @param {number} maxPitchRad - 最大俯仰角 (弧度)
   */
  // async sendSetPitchLimit(deviceId, serviceUUID, characteristicUUID, minPitchRad, maxPitchRad) {
  //   // 根据下位机代码中的 radiansToU16 函数，角度值需转换为 int16_t (弧度 * 1000)
  //   const int16MinPitch = Math.round(minPitchRad * 1000)
  //   const int16MaxPitch = Math.round(maxPitchRad * 1000)

  //   const buffer = new ArrayBuffer(4) // 2 int16_t * 2 bytes
  //   const view = new DataView(buffer)
  //   view.setInt16(0, int16MinPitch, true) // 小端序，第一个 int16_t
  //   view.setInt16(2, int16MaxPitch, true) // 小端序，第二个 int16_t
  //   await this.sendCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_SET_PITCH_LIMIT,
  //     buffer,
  //   )
  // }

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
  //     CONTROL_COMMANDS.CMD_CTRL_CAMERA,
  //     buffer,
  //   )
  // }

  /**
   * 发送读取参数指令 (无数据)
   * @param {number} readCommand - 读取命令字 (CONTROL_COMMANDS.CMD_READ_*)
   */
  // async sendReadCommand(deviceId, serviceUUID, characteristicUUID, readCommand) {
  //   // 可以加入验证，确保传入的是读取命令
  //   if (
  //     ![
  //       CONTROL_COMMANDS.CMD_READ_CALIB_PARAM,
  //       CONTROL_COMMANDS.CMD_READ_ROTATE_SPEED,
  //       CONTROL_COMMANDS.CMD_READ_SCAN_CYCLES,
  //       CONTROL_COMMANDS.CMD_READ_PITCH_LIMIT,
  //     ].includes(readCommand)
  //   ) {
  //     console.warn(`Warning: Command  $ {readCommand} might not be a standard read command.`)
  //   }
  //   await this.sendCommand(deviceId, serviceUUID, characteristicUUID, readCommand, null)
  // }

  /**
   * 发送读取转动速度指令
   */
  // async sendReadRotateSpeed(deviceId, serviceUUID, characteristicUUID) {
  //   await this.sendReadCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_READ_ROTATE_SPEED,
  //   )
  // }

  /**
   * 发送读取扫描圈数指令
   */
  // async sendReadScanCycles(deviceId, serviceUUID, characteristicUUID) {
  //   await this.sendReadCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_READ_SCAN_CYCLES,
  //   )
  // }

  /**
   * 发送读取俯仰角上下限指令
   */
  // async sendReadPitchLimit(deviceId, serviceUUID, characteristicUUID) {
  //   await this.sendReadCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_READ_PITCH_LIMIT,
  //   )
  // }

  /**
   * 发送读取标定参数指令
   */
  // async sendReadCalibParam(deviceId, serviceUUID, characteristicUUID) {
  //   await this.sendReadCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_READ_CALIB_PARAM,
  //   )
  // }
}

export const bluetoothService = new BluetoothService()
