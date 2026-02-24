// src/services/bluetoothService.js
import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
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

  async saveBleDataToFile(dataLines) {
    if (!Array.isArray(dataLines) || dataLines.length === 0) {
      throw new Error('无数据可保存')
    }
    const content = dataLines.join('\n')
    const timestamp = new Date(Date.now() + 28800000)
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)

    const filename = `pointCloud_data_${timestamp}.txt`
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
   * 在 Documents/pointcloud/<sessionId>/ 目录下保存 BLE 数据和照片
   * @param {string[]} dataLines - 要保存的数据行数组
   * @param {string} sessionID - 会话 ID，用于创建子文件夹
   * @param {Array<{path?: string, base64?: string, name: string}>} photos - 照片数组，
   *                        每项应包含 path (本地路径) 或 base64 (Base64字符串) 和 name (文件名)。
   *                        例如: [{base64: "...", name: "photo1.jpg"}, {path: "/path/to/photo2.jpg", name: "photo2.jpg"}]
   * @returns {Promise<{path: string, filePath: string, photoPaths: string[], lineCount: number}>} 保存结果对象
   */

  async saveBleDataToFileWithSessionStructure(dataLines, sessionID, photos = []) {
    console.log('--- [saveBleDataToFileWithSessionStructure] 开始执行 ---')

    if (!Array.isArray(dataLines) || dataLines.length === 0) {
      const error = new Error('无数据可保存')
      console.error(error.message)
      throw error
    }
    if (!sessionID || typeof sessionID !== 'string') {
      const error = new Error('无效的 sessionID')
      console.error(error.message)
      throw error
    }
    if (!Array.isArray(photos)) {
      const error = new Error('photos 必须是一个数组')
      console.error(error.message)
      throw error
    }

    try {
      const baseDirPath = 'pointcloud'
      const sessionDirPath = `${baseDirPath}/${sessionID}`

      // --- 修改点：检查目录是否存在 ---
      try {
        // 尝试读取目录内容，如果成功，说明目录存在
        await Filesystem.readdir({
          path: sessionDirPath,
          directory: Directory.Documents,
        })
        console.log(`目录已存在: ${sessionDirPath}`)
        // 目录存在，无需创建，直接继续
      } catch (readdirError) {
        // readdir 失败，检查错误信息是否是 "Directory does not exist"
        if (readdirError.message.includes('Directory does not exist')) {
          console.log(`目录不存在，即将创建: ${sessionDirPath}`)
          // 目录不存在，尝试创建它及其父目录
          await Filesystem.mkdir({
            path: sessionDirPath,
            directory: Directory.Documents,
            recursive: true,
          })
          console.log(`目录创建成功: ${sessionDirPath}`)
        } else {
          // 如果不是 "Directory does not exist" 的错误，则抛出
          console.error('检查目录时发生未知错误:', readdirError)
          throw readdirError
        }
      }
      // --- 结束修改 ---

      const content = dataLines.join('\n')
      const timestamp = new Date(Date.now() + 28800000) // 注意：这是东八区时间戳
        .toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14)
      const txtFilename = `pointCloud_data_${timestamp}.txt`
      const txtFilePath = `${sessionDirPath}/${txtFilename}`

      await Filesystem.writeFile({
        path: txtFilePath,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      })

      const fullTxtUri = await Filesystem.getUri({
        path: txtFilePath,
        directory: Directory.Documents,
      })

      const savedPhotoPaths = []
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]

        if (!photo || typeof photo !== 'object' || Array.isArray(photo)) {
          console.warn(`照片 ${i} 格式不正确，跳过。`)
          continue
        }

        // --- 只处理 base64 数据 ---
        if (photo.base64 && typeof photo.base64 === 'string') {
          const targetFileName = photo.name || `unnamed_photo_${i}.jpg`
          const photoPath = `${sessionDirPath}/${targetFileName}` // 直接构建最终路径

          try {
            await Filesystem.writeFile({
              path: photoPath, // 写入最终目录
              data: photo.base64,
              directory: Directory.Documents,
            })
            const fullPhotoUri = await Filesystem.getUri({
              path: photoPath,
              directory: Directory.Documents,
            })
            savedPhotoPaths.push(fullPhotoUri.uri)
          } catch (writeError) {
            console.error('写入 base64 照片失败:', photo.name || photoPath, writeError)
          }
        } else {
          // 不再处理 photo.path 路径
          console.warn(`照片 ${i} 缺少有效的 base64 字段，跳过。`, photo)
        }
      }

      // --- 关键输出 ---
      console.log(`本次共保存了 ${savedPhotoPaths.length} 张照片。`)
      console.log(`数据文件保存路径: ${fullTxtUri.uri}`)
      if (savedPhotoPaths.length > 0) {
        console.log(`照片保存路径列表:`, savedPhotoPaths)
      } else {
        console.log(`没有照片被保存。`)
      }
      // --- End of 关键输出 ---

      const result = {
        path: Directory.Documents,
        filePath: txtFilePath,
        fullUri: fullTxtUri.uri,
        photoPaths: savedPhotoPaths,
        lineCount: dataLines.length,
      }

      console.log('--- [saveBleDataToFileWithSessionStructure] 执行完成 ---')
      return result
    } catch (error) {
      console.error('--- [saveBleDataToFileWithSessionStructure] 执行失败 ---', error)
      throw error
    }
  }
  /**
   * 列出 Documents 目录下的蓝牙数据文件
   * @param {string} [pattern='pointCloud_data_'] - 文件名匹配模式，默认查找 'pointCloud_data_' 开头的文件
   * @returns {Promise<{name: string, size: number, ctime: number, mtime: number}[]>} - 文件信息列表
   */
  async listBleDataFiles(pattern = 'pointCloud_data_') {
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
