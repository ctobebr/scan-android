/**
 * 数据I/O模块
 * 职责：处理蓝牙数据读写、通知订阅/取消订阅、协议帧发送等操作
 */

import { BleClient } from '@capacitor-community/bluetooth-le'
import { buildProtocolFrame } from '../utils/helpers.js'
import { wrapAsyncOperation, BluetoothErrorCode } from '../utils/errors.js'
import { getIoConfig } from '../config/index.js'
import { createLogger } from '@/utils/logger'

const logger = createLogger('bluetooth:io')

/**
 * 数据I/O管理器
 * 负责所有蓝牙数据读写操作
 */
export class DataIO {
  constructor(parent) {
    this.parent = parent
    // 通知监听器映射：deviceId -> Map<characteristicUUID, callback>
    this._notificationListeners = new Map()
    // 服务缓存：deviceId -> services
    this._serviceCache = new Map()
    // 缓存时间戳
    this._cacheTimestamps = new Map()
    // 缓存有效期（毫秒）- 从配置读取
    this._cacheTTL = getIoConfig().cacheDuration || 60000
  }

  /**
   * 发现设备服务
   * @param {string} deviceId - 设备ID
   * @returns {Promise<Array>} 服务列表
   */
  async discoverServices(deviceId) {
    return wrapAsyncOperation(
      async () => {
        const services = await BleClient.getServices(deviceId)
        logger.withContext({ deviceId }).info('发现的服务', services)
        // 缓存服务
        this._serviceCache.set(deviceId, services)
        this._cacheTimestamps.set(deviceId, Date.now())
        return services
      },
      BluetoothErrorCode.SERVICE_NOT_FOUND,
      '发现蓝牙服务失败',
      { method: 'discoverServices', deviceId }
    )
  }

  /**
   * 发送字符串数据
   * @param {string} deviceId - 设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @param {string} value - 要发送的字符串
   * @returns {Promise<boolean>}
   */
  async writeData(deviceId, serviceUUID, characteristicUUID, value) {
    return wrapAsyncOperation(
      async () => {
        const encoder = new TextEncoder()
        const data = encoder.encode(value)
        await BleClient.write(deviceId, serviceUUID, characteristicUUID, data)
        logger.withContext({ deviceId, serviceUUID, characteristicUUID }).info('字符串数据发送成功', { value })
        return true
      },
      BluetoothErrorCode.WRITE_FAILED,
      '发送字符串数据失败',
      { method: 'writeData', deviceId, serviceUUID, characteristicUUID }
    )
  }

  /**
   * 发送二进制数据（Uint8Array）
   * @param {string} deviceId - 设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @param {Uint8Array} value - 要发送的二进制数据
   * @returns {Promise<boolean>}
   */
  async writeBinaryData(deviceId, serviceUUID, characteristicUUID, value) {
    return wrapAsyncOperation(
      async () => {
        // 额外验证 value 必须是 Uint8Array
        if (!(value instanceof Uint8Array)) {
          const error = new Error('writeBinaryData: value 必须是 Uint8Array 类型')
          logger.withContext({ deviceId }).error('数据类型错误', { expected: 'Uint8Array', actual: typeof value })
          throw error
        }

        await BleClient.write(deviceId, serviceUUID, characteristicUUID, value)
        logger.withContext({ deviceId, serviceUUID, characteristicUUID }).info('二进制数据发送成功', {
          hex: Array.from(value)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')
        })
        return true
      },
      BluetoothErrorCode.WRITE_FAILED,
      '发送二进制数据失败',
      { method: 'writeBinaryData', deviceId, serviceUUID, characteristicUUID }
    )
  }

  /**
   * 读取数据
   * @param {string} deviceId - 设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @returns {Promise<string>} 读取到的字符串数据
   */
  async readData(deviceId, serviceUUID, characteristicUUID) {
    return wrapAsyncOperation(
      async () => {
        const value = await BleClient.read(deviceId, serviceUUID, characteristicUUID)
        const decoder = new TextDecoder()
        const str = decoder.decode(value)
        logger.withContext({ deviceId, serviceUUID, characteristicUUID }).info('读取数据', { data: str })
        return str
      },
      BluetoothErrorCode.READ_FAILED,
      '读取数据失败',
      { method: 'readData', deviceId, serviceUUID, characteristicUUID }
    )
  }

  /**
   * 订阅通知
   * @param {string} deviceId - 设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @param {Function} callback - 数据回调函数
   * @returns {Promise<boolean>}
   */
  async subscribeToNotifications(deviceId, serviceUUID, characteristicUUID, callback) {
    return wrapAsyncOperation(
      async () => {
        await BleClient.startNotifications(deviceId, serviceUUID, characteristicUUID, (value) => {
          // 统一处理 ArrayBuffer / DataView
          let buffer
          if (value instanceof ArrayBuffer) {
            buffer = value
          } else if (value?.buffer instanceof ArrayBuffer) {
            // 处理 DataView 或 TypedArray取偏移量后的数据
            buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
          } else {
            logger.error('不支持的数据类型', { type: typeof value, value })
            return
          }
          // 转为 Uint8Array 供parser.parse使用
          const uint8 = new Uint8Array(buffer)
          // 透传给业务逻辑
          callback(uint8)
        })

        // 记录监听器
        if (!this._notificationListeners.has(deviceId)) {
          this._notificationListeners.set(deviceId, new Map())
        }
        this._notificationListeners.get(deviceId).set(characteristicUUID, callback)

        logger.withContext({ deviceId, serviceUUID, characteristicUUID }).info('已订阅通知')
        return true
      },
      BluetoothErrorCode.NOTIFICATION_FAILED,
      '订阅通知失败',
      { method: 'subscribeToNotifications', deviceId, serviceUUID, characteristicUUID }
    )
  }

  /**
   * 取消订阅通知
   * @param {string} deviceId - 设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @returns {Promise<boolean>}
   */
  async unsubscribeFromNotifications(deviceId, serviceUUID, characteristicUUID) {
    return wrapAsyncOperation(
      async () => {
        if (!deviceId) {
          logger.warn('unsubscribeFromNotifications: deviceId为空')
          return false
        }
        await BleClient.stopNotifications(deviceId, serviceUUID, characteristicUUID)

        // 移除监听器记录
        if (this._notificationListeners.has(deviceId)) {
          this._notificationListeners.get(deviceId).delete(characteristicUUID)
        }

        logger.withContext({ deviceId, serviceUUID, characteristicUUID }).info('已取消订阅')
        return true
      },
      BluetoothErrorCode.NOTIFICATION_FAILED,
      '取消订阅通知失败',
      { method: 'unsubscribeFromNotifications', deviceId, serviceUUID, characteristicUUID }
    )
  }

  /**
   * 通用发送函数：根据命令字和数据构建协议帧并发送
   * @param {string} deviceId - 蓝牙设备ID
   * @param {string} serviceUUID - 服务UUID
   * @param {string} characteristicUUID - 特征值UUID
   * @param {number} command - 命令字
   * @param {ArrayBuffer|TypedArray|number[]|null|undefined} data - 要发送的数据 (可选)
   * @returns {Promise<boolean>}
   */
  async sendCommand(deviceId, serviceUUID, characteristicUUID, command, data = null) {
    return wrapAsyncOperation(
      async () => {
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
        const frameHex = Array.from(frame)
          .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
          .join(', ')
        logger.withContext({ deviceId, command: `0x${command.toString(16).padStart(2, '0').toUpperCase()}` }).info('指令已发送', { frame: `[${frameHex}]` })
        return true
      },
      BluetoothErrorCode.WRITE_FAILED,
      '发送指令失败',
      { method: 'sendCommand', deviceId, command }
    )
  }

  /**
   * 获取缓存的服务（如果未过期）
   * @param {string} deviceId - 设备ID
   * @returns {Array|null} 缓存的服务列表或null
   */
  getCachedServices(deviceId) {
    if (!this._serviceCache.has(deviceId)) {
      return null
    }
    const timestamp = this._cacheTimestamps.get(deviceId)
    if (Date.now() - timestamp > this._cacheTTL) {
      // 缓存过期，清理
      this._serviceCache.delete(deviceId)
      this._cacheTimestamps.delete(deviceId)
      return null
    }
    return this._serviceCache.get(deviceId)
  }

  /**
   * 清理指定设备的资源
   * @param {string} deviceId - 设备ID
   */
  cleanupDeviceResources(deviceId) {
    // 清理通知监听器
    if (this._notificationListeners.has(deviceId)) {
      const listeners = this._notificationListeners.get(deviceId)
      listeners.forEach((listener, characteristicUUID) => {
        logger.withContext({ deviceId, characteristicUUID }).debug('清理通知监听器')
      })
      this._notificationListeners.delete(deviceId)
    }

    // 清理服务缓存
    if (this._serviceCache.has(deviceId)) {
      this._serviceCache.delete(deviceId)
      this._cacheTimestamps.delete(deviceId)
      logger.withContext({ deviceId }).debug('清理服务缓存')
    }
  }

  /**
   * 清理所有资源
   */
  cleanupAllResources() {
    logger.info('开始清理数据I/O资源')

    // 清理所有通知监听器
    this._notificationListeners.forEach((listeners, deviceId) => {
      this.cleanupDeviceResources(deviceId)
    })

    logger.info('数据I/O资源清理完成')
  }
}
