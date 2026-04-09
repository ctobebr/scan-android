/**
 * @fileoverview 蓝牙连接管理模块
 *
 * 负责蓝牙设备的连接、断开、状态监控等功能。
 *
 * @module @/services/bluetooth/core/connection
 */

import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { createLogger } from '@/utils/logger'
import {
  BluetoothErrorCode,
  wrapAsyncOperation,
} from '../utils/errors'

// 创建连接管理专用日志记录器
const logger = createLogger('ConnectionManager')

/**
 * 连接管理器类
 * 管理蓝牙设备的连接状态和断开回调
 */
export class ConnectionManager {
  constructor(parent) {
    this.parent = parent
    this.connectedDevice = null
    this.connected = false
    // 添加断开监听器回调列表
    this.disconnectCallbacks = []
  }

  /**
   * 检查蓝牙是否已开启
   * @returns {Promise<boolean>} 蓝牙是否已开启
   */
  async isBluetoothEnabled() {
    try {
      return await BleClient.isEnabled()
    } catch (error) {
      logger.warn('检查蓝牙状态失败', error)
      return false
    }
  }

  /**
   * 连接蓝牙设备
   * @param {string} deviceId - 设备 ID
   * @returns {Promise<boolean>} 是否连接成功
   */
  async connectDevice(deviceId) {
    return wrapAsyncOperation(
      async () => {
        // 在连接前先移除该设备可能存在的旧监听
        this.removeDisconnectListener(deviceId)

        await BleClient.connect(deviceId, (deviceId) => {
          // 这是断开连接的回调！当设备意外断开时触发
          logger.withContext({ deviceId }).warn('设备意外断开连接')
          // 更新内部状态
          this.connected = false
          this.connectedDevice = null
          // 触发所有注册的断开回调
          this.triggerDisconnectCallbacks(deviceId)
        })

        this.connectedDevice = { deviceId }
        this.connected = true
        logger.withContext({ deviceId }).info('设备连接成功')
        return true
      },
      BluetoothErrorCode.CONNECTION_FAILED,
      '连接蓝牙设备失败',
      { method: 'connectDevice', deviceId }
    )
  }

  /**
   * 断开蓝牙设备连接
   * @param {string} deviceId - 设备 ID
   * @returns {Promise<boolean>} 是否断开成功
   */
  async disconnectDevice(deviceId) {
    return wrapAsyncOperation(
      async () => {
        await BleClient.disconnect(deviceId)

        // 断开连接时清理资源
        if (this.parent.resources) {
          this.parent.resources.cleanupDeviceResources(deviceId)
        }

        this.connectedDevice = null
        this.connected = false
        // 手动断开时也触发回调，但带上 isManualDisconnect 标记
        this.triggerDisconnectCallbacks(deviceId, true)
        logger.withContext({ deviceId }).info('设备已断开连接')
        return true
      },
      BluetoothErrorCode.CONNECTION_LOST,
      '断开蓝牙设备连接失败',
      { method: 'disconnectDevice', deviceId }
    )
  }

  /**
   * 主动检查连接状态
   * @param {string} deviceId - 设备 ID
   * @returns {Promise<boolean>} 是否连接正常
   */
  async checkConnectionStatus(deviceId) {
    if (!deviceId) return false
    try {
      // 尝试读取服务列表来验证连接是否真的存活
      const services = await BleClient.getServices(deviceId)
      return services && services.length > 0
    } catch (error) {
      return false
    }
  }

  /**
   * 获取当前连接状态
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return this.connected
  }

  /**
   * 获取当前连接的设备
   * @returns {Object|null} 设备信息对象
   */
  getConnectedDevice() {
    return this.connectedDevice
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
    logger.withContext({ deviceId, isManualDisconnect }).info('触发断开回调')
    this.disconnectCallbacks.forEach((callback) => {
      try {
        callback(deviceId, isManualDisconnect)
      } catch (err) {
        logger.withContext({ deviceId }).error('执行断开回调时出错', err)
      }
    })
  }

  /**
   * 移除指定设备的断开监听（连接新设备前调用）
   * @param {string} deviceId - 设备 ID
   */
  removeDisconnectListener(deviceId) {
    // 这个方法主要是为了清理状态，实际回调注册在组件层面管理
    logger.withContext({ deviceId }).debug('准备连接新设备，清理旧状态')
  }

  /**
   * 清理连接相关资源
   */
  cleanup() {
    this.disconnectCallbacks = []
    this.connectedDevice = null
    this.connected = false
    logger.info('连接管理器资源清理完成')
  }
}

export default ConnectionManager
