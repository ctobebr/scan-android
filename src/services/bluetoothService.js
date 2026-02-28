// src/services/bluetoothService.js
import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
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

  // ========== 开始：文件状态信息相关===========
  dispatchFolderUpdate(type, data) {
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(
          new CustomEvent('pointcloud-updated', {
            detail: {
              type,
              timestamp: Date.now(),
              ...data,
            },
          }),
        )
        console.log(`[bluetoothService] dispatched pointcloud-updated: ${type}`, data)
      }
    } catch (e) {
      console.warn('[bluetoothService] dispatch pointcloud-updated failed', e)
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

      // 检查目录是否存在，不存在则创建
      try {
        // 尝试读取目录内容，如果成功，说明目录存在
        await Filesystem.readdir({
          path: sessionDirPath,
          directory: Directory.Documents,
        })
        console.log(`目录已存在: ${sessionDirPath}`)
      } catch (readdirError) {
        // readdir 失败，检查错误信息
        if (
          readdirError.message.includes('Directory does not exist') ||
          readdirError.message.includes('ENOENT')
        ) {
          console.log(`目录不存在，即将创建: ${sessionDirPath}`)
          // 目录不存在，尝试创建它及其父目录
          await Filesystem.mkdir({
            path: sessionDirPath,
            directory: Directory.Documents,
            recursive: true,
          })
          console.log(`目录创建成功: ${sessionDirPath}`)
        } else {
          console.error('检查目录时发生未知错误:', readdirError)
          throw readdirError
        }
      }

      // 生成时间戳文件名
      const content = dataLines.join('\n')
      const timestamp = new Date(Date.now() + 28800000) // 东八区时间戳
        .toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14)
      const txtFilename = `pointCloud_data_${timestamp}.txt`
      const txtFilePath = `${sessionDirPath}/${txtFilename}`

      // 写入数据文件
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

      // 保存照片
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
          console.warn(`照片 ${i} 缺少有效的 base64 字段，跳过。`, photo)
        }
      }

      // 输出保存结果
      console.log(`本次共保存了 ${savedPhotoPaths.length} 张照片。`)
      console.log(`数据文件保存路径: ${fullTxtUri.uri}`)
      if (savedPhotoPaths.length > 0) {
        console.log(`照片保存路径列表:`, savedPhotoPaths)
      } else {
        console.log(`没有照片被保存。`)
      }

      // 广播更新事件，通知界面刷新项目/数据列表
      this.dispatchFolderUpdate('new_session', { session: sessionID })

      const result = {
        path: Directory.Documents,
        filePath: txtFilePath,
        fullUri: fullTxtUri.uri,
        photoPaths: savedPhotoPaths,
        lineCount: dataLines.length,
        sessionId: sessionID,
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
      this.dispatchFolderUpdate('file_deleted', { filename })
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
   * 删除 pointcloud 下的指定会话文件夹及其内容
   * @param {string} folderOrRel - 可以是 'pointcloud/<folder>' 或 '<folder>' 或仅文件夹名
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteFolder(folderOrRel) {
    if (!folderOrRel) throw new Error('folderOrRel required')

    let rel = folderOrRel
    if (rel.startsWith('pointcloud/')) {
      rel = rel.replace('pointcloud/', '')
    }

    const folderPath = `pointcloud/${rel}`
    let deletedFilesCount = 0

    try {
      // 列出文件夹中的所有文件
      const files = await this.listFilesInFolder(folderPath)
      console.log(
        `[bluetoothService] deleteFolder listing for ${folderPath}:`,
        files.length,
        'files found',
      )

      // 删除文件夹中的所有文件
      for (const f of files) {
        try {
          await Filesystem.deleteFile({
            path: `${folderPath}/${f.name}`,
            directory: Directory.Documents,
          })
          console.log(`[bluetoothService] 删除文件: ${folderPath}/${f.name}`)
          deletedFilesCount++
        } catch (e) {
          console.warn(`[bluetoothService] 删除文件失败: ${folderPath}/${f.name}`, e)
        }
      }

      // 尝试删除目录本身
      try {
        // 检查平台是否支持 rmdir
        if (Filesystem.rmdir) {
          await Filesystem.rmdir({
            path: folderPath,
            directory: Directory.Documents,
          })
          console.log('[bluetoothService] rmdir 成功:', folderPath)
        } else {
          // 某些平台没有 rmdir，尝试用 deleteFile 删除目录（可能失败）
          try {
            await Filesystem.deleteFile({
              path: folderPath,
              directory: Directory.Documents,
            })
            console.log('[bluetoothService] 使用 deleteFile 删除目录成功:', folderPath)
          } catch (deleteErr) {
            console.log(
              '[bluetoothService] 使用 deleteFile 删除目录失败（可能正常）:',
              deleteErr.message,
            )
          }
        }
      } catch (e) {
        // 如果目录非空或平台不支持，记录警告但继续
        console.warn('[bluetoothService] 删除目录失败（可能非空或平台不支持）:', e.message)
      }

      // 广播更新事件，通知界面刷新项目/数据列表
      this.dispatchFolderUpdate('delete', { folder: rel, deletedFilesCount })

      console.log(
        `[bluetoothService] 文件夹删除操作完成: ${folderPath}, 删除了 ${deletedFilesCount} 个文件`,
      )

      setTimeout(async () => {
        try {
          const folders = await this.listPointCloudFolders()
          console.log(
            `[bluetoothService] 删除后验证，当前文件夹列表:`,
            folders.map((f) => f.name),
          )

          // 检查被删除的文件夹是否还在列表中
          const stillExists = folders.some((f) => f.name === rel)
          if (stillExists) {
            console.error(`[bluetoothService] ⚠️ 警告：文件夹 ${rel} 删除后仍然出现在列表中！`)
          }
        } catch (e) {
          console.warn('[bluetoothService] 验证失败', e)
        }
      }, 500)
      return true
    } catch (error) {
      console.error('[bluetoothService] deleteFolder 失败:', error)
      throw new Error('删除文件夹失败: ' + (error.message || error))
    }
  }
  /**
   *  列出Documents目录下的pointcloud文件夹下的所有文件夹
   * @returns
   */
  async listPointCloudFolders() {
    const folderPath = 'pointcloud' // 指定要列出子文件夹的父文件夹路径
    try {
      const result = await Filesystem.readdir({
        path: folderPath, // 指向 'pointcloud' 文件夹
        directory: Directory.Documents,
      })

      // 过滤出类型为目录的条目
      const folders = result.files
        .filter((item) => item.type === 'directory') // 只保留目录
        .map((folder) => ({
          name: folder.name, // 文件夹名称
          // uri: folder.uri, // 文件夹的 URI (可选，取决于 Capacitor 版本和平台)。
        }))

      // console.log('读取文件夹列表成功:', JSON.stringify(folders))
      return folders
    } catch (error) {
      console.error('读取文件夹列表失败:', error)
      // 检查错误是否是因为 pointcloud 文件夹不存在
      if (error.message.includes('ENOENT')) {
        console.warn(`文件夹 Documents/${folderPath} 不存在或路径错误.`)
        return [] // 如果文件夹不存在，返回一个空数组而不是抛出错误
      }
      throw new Error('读取文件夹列表失败: ' + error.message)
    }
  }

  /**
   * 列出指定目录下的文件（不递归）
   * @param {string} folderPath - 相对于 Documents 的路径，例如 'pointcloud/sessionId'
   * @returns {Promise<Array<{name:string,uri?:string,type?:string}>>}
   */
  async listFilesInFolder(folderPath) {
    try {
      const result = await Filesystem.readdir({
        path: folderPath,
        directory: Directory.Documents,
      })
      // result.files 可能包含 name、uri、type
      return result.files || []
    } catch (error) {
      console.error('读取文件夹内容失败:', folderPath, error)
      return []
    }
  }

  /**
   * 获取 session 下的第一张图片的 URI（如果有）
   * @param {string} sessionId
   * @returns {Promise<string|null>} 返回可用的 URI 或 null
   */
  async getFirstPhotoUri(sessionId) {
    if (!sessionId) return null
    const folderPath = `pointcloud/${sessionId}`
    try {
      const files = await this.listFilesInFolder(folderPath)
      if (!files || files.length === 0) return null
      // 挑选第一个图片文件（严格筛选图片扩展名，若无图片则返回 null）
      const imageRe = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i
      const img = files.find((f) => imageRe.test(f.name))
      if (!img) {
        console.log('[bluetoothService] getFirstPhotoUri: no image file found in', folderPath)
        return null
      }
      try {
        const uriResult = await Filesystem.getUri({
          directory: Directory.Documents,
          path: `${folderPath}/${img.name}`,
        })
        console.log('[bluetoothService] getFirstPhotoUri getUri ->', uriResult)
        return uriResult?.uri || null
      } catch (e) {
        console.warn('[bluetoothService] getFirstPhotoUri getUri 失败，尝试读取 base64 回退:', e)
        try {
          const read = await Filesystem.readFile({
            directory: Directory.Documents,
            path: `${folderPath}/${img.name}`,
          })
          if (read && read.data) {
            // 根据扩展名猜 MIME
            const lower = img.name.toLowerCase()
            const mime = lower.endsWith('.png')
              ? 'image/png'
              : lower.endsWith('.webp')
                ? 'image/webp'
                : 'image/jpeg'
            const dataUri = `data:${mime};base64,${read.data}`
            console.log('[bluetoothService] getFirstPhotoUri 返回 dataURI 大小:', read.data.length)
            return dataUri
          }
        } catch (e2) {
          console.warn('[bluetoothService] getFirstPhotoUri 读取文件回退也失败:', e2)
        }
        return null
      }
    } catch (e) {
      console.warn('获取第一张照片失败:', e)
      return null
    }
  }

  /**
   * 将 session 文件夹内的文件打包为 zip，并写入 Documents，返回 zip 的 uri
   * @param {string} sessionFolderName - pointcloud 下的文件夹名
   * @param {string} zipFileName - 输出 zip 名（不含扩展名）
   * @returns {Promise<{uri:string, path:string}>}
   */
  async zipSessionToFile(sessionFolderName, zipFileName) {
    if (!sessionFolderName) throw new Error('sessionFolderName required')
    const folderPath = `pointcloud/${sessionFolderName}`

    // 尝试确保 JSZip 可用：优先使用 window.JSZip（CDN 注入），其次尝试从模块导入
    let JSZipLib = null
    if (typeof window !== 'undefined' && window.JSZip) {
      JSZipLib = window.JSZip
    } else {
      // 尝试通过模块导入（需要在 package.json 中安装 jszip）
      try {
        // 动态 import，构建环境若支持会从 node_modules 加载
        const mod = await import('jszip')
        JSZipLib = mod.default || mod
      } catch (impErr) {
        // 若模块导入失败，再尝试通过 CDN 注入脚本（浏览器运行时）
        if (typeof window !== 'undefined') {
          try {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script')
              script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.0/dist/jszip.min.js'
              script.onload = resolve
              script.onerror = reject
              document.head.appendChild(script)
            })
            JSZipLib = window.JSZip
          } catch (cdnErr) {
            console.warn('加载 JSZip 失败（模块导入和 CDN 注入均失败）', impErr, cdnErr)
          }
        }
      }
    }

    if (!JSZipLib) {
      throw new Error('无法加载压缩库 JSZip（请确保网络可用或在项目中安装 jszip 依赖）')
    }

    // ---在创建 zip 对象和处理文件之前检查 ---
    // 过滤文件名非法字符
    const sanitize = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
    const safeBase = sanitize(zipFileName || sessionFolderName)
    const zipName = `${safeBase}.zip`
    // 写入到 pointcloud/<sessionFolderName>/ 下，避免与 Documents 根冲突
    const targetDir = `pointcloud/${sessionFolderName}`
    const zipPath = `${targetDir}/${zipName}`

    console.log('[bluetoothService] zipSessionToFile 检查 zip 是否已存在 -> path=' + zipPath)

    // 如果 zip 已存在则直接返回现有文件，避免重复生成
    try {
      const stat = await Filesystem.stat({ path: zipPath, directory: Directory.Documents })
      if (stat) {
        const existingUri = (
          await Filesystem.getUri({ path: zipPath, directory: Directory.Documents })
        ).uri
        console.log('[bluetoothService] zip 已存在，返回已有文件 -> ' + String(existingUri))
        return { uri: existingUri, path: zipPath, relativePath: zipPath }
      }
    } catch (eStat) {
      // stat 失败表示文件不存在或平台不支持 stat，继续生成
      console.log('[bluetoothService] zip 不存在或 stat 不可用，准备生成: ' + String(eStat))
    }

    const zip = new JSZipLib()

    try {
      const files = await this.listFilesInFolder(folderPath)
      if (!files || files.length === 0) throw new Error('项目下无文件')

      // 读取每个文件并加入 zip
      for (const f of files) {
        try {
          // 先尝试以 base64 读取（适合图片）
          const read = await Filesystem.readFile({
            path: `${folderPath}/${f.name}`,
            directory: Directory.Documents,
          })
          const data = read.data
          // 假设 data 为 base64
          zip.file(f.name, data, { base64: true })
        } catch (e) {
          console.warn('读取文件失败，尝试获取 URI 并 fetch:', f.name, e)
          try {
            const uriRes = await Filesystem.getUri({
              path: `${folderPath}/${f.name}`,
              directory: Directory.Documents,
            })
            const resp = await fetch(uriRes.uri)
            const blob = await resp.blob()
            const arrayBuffer = await blob.arrayBuffer()
            zip.file(f.name, arrayBuffer)
          } catch (e2) {
            console.warn('从 URI 获取并添加到 zip 失败:', f.name, e2)
          }
        }
      }
      // 将二进制数据通过base64编码转文本字符串
      const content = await zip.generateAsync({ type: 'base64' })

      console.log(
        '[bluetoothService] zipSessionToFile 生成 zip -> path=' +
          zipPath +
          ' sizeBase64=' +
          String(content.length),
      )

      // 确保目录存在  写入前创建pointcloud/76jev5vt0/文件夹
      try {
        await Filesystem.mkdir({ path: targetDir, directory: Directory.Documents, recursive: true })
        console.log('[bluetoothService] mkdir 成功 or 已存在: ' + targetDir)
      } catch (mkErr) {
        console.warn('[bluetoothService] mkdir 可能失败或已存在: ' + String(mkErr))
      }

      // 将生成的contentbase64形式的字符串转二进制，并写入磁盘
      await Filesystem.writeFile({ path: zipPath, data: content, directory: Directory.Documents })
      const uriRes = await Filesystem.getUri({ path: zipPath, directory: Directory.Documents })
      console.log(
        '[bluetoothService] zipSessionToFile 写入完成 uri -> ' + String(uriRes && uriRes.uri),
      )
      this.dispatchFolderUpdate('zip_created', { folder: sessionFolderName, zipName: zipFileName })
      return { uri: uriRes.uri, path: zipPath, relativePath: zipPath }
    } catch (error) {
      console.error('打包项目失败', error)
      throw error
    }
  }
  // ========== 结束：文件状态信息相关===========
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
   * @param {number} lowerLimitRad - 俯仰角下限 (单位: 弧度 rad)
   * @param {number} upperLimitRad - 俯仰角上限 (单位: 弧度 rad)
   */
  async sendSetPitchLimit(deviceId, serviceUUID, characteristicUUID, lowerLimitRad, upperLimitRad) {
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
  // async sendReadCommand(deviceId, serviceUUID, characteristicUUID, readCommand) {
  //   // 可以加入验证，确保传入的是读取命令
  //   if (
  //     ![
  //       CONTROL_COMMANDS.CMD_READ_CALIB_PARAM,
  //       CONTROL_COMMANDS.CMD_READ_ROTATE_SPEED,
  //       CONTROL_COMMANDS.CMD_READ_SCAN_TIME,
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
   * 发送读取扫描时间指令
   */
  // async sendReadScanCycles(deviceId, serviceUUID, characteristicUUID) {
  //   await this.sendReadCommand(
  //     deviceId,
  //     serviceUUID,
  //     characteristicUUID,
  //     CONTROL_COMMANDS.CMD_READ_SCAN_TIME,
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
