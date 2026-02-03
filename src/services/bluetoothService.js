// src/services/bluetoothService.js
import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { Filesystem, Directory } from '@capacitor/filesystem'
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

  async writeData(deviceId, serviceUUID, characteristicUUID, value) {
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(value)
      await BleClient.write(deviceId, serviceUUID, characteristicUUID, data)
      console.log('数据发送成功:', value)
    } catch (error) {
      console.error('数据发送失败:', error)
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
        throw new Error('文件名不能为空');
      }

      console.log(`开始删除本地文件:  ${filename}`);

      // 调用 Capacitor Filesystem API 删除文件
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Documents, // 确保与存储文件时的目录一致
      });

      console.log(`文件 " ${filename}" 删除成功`);

    } catch (error) {
      console.error(`删除文件 " ${filename}" 失败:`, error);
      // 如果是文件不存在的错误，可以提供更友好的提示
      if (error.message.includes('File does not exist')) {
         throw new Error(`文件 " ${filename}" 不存在，无法删除。`);
      }
      // 抛出原始错误或包装后的错误
      throw new Error(`删除文件失败:  ${error.message}`);
    }
  }

}

export const bluetoothService = new BluetoothService()
