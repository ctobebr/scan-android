/**
 * 资源管理模块
 * 职责：统一管理蓝牙服务的资源生命周期
 */

import { createLogger } from '@/utils/logger'

const logger = createLogger('bluetooth:resources')

/**
 * 资源管理器
 * 负责协调各模块的资源清理工作
 */
export class ResourceManager {
  constructor(parent) {
    this.parent = parent
    // 断开回调列表
    this.disconnectCallbacks = []
  }

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
   * 清理指定设备的资源
   * @param {string} deviceId - 设备ID
   */
  cleanupDeviceResources(deviceId) {
    logger.withContext({ deviceId }).debug('开始清理设备资源')

    // 调用 dataIO 的资源清理
    if (this.parent.dataIO) {
      this.parent.dataIO.cleanupDeviceResources(deviceId)
    }

    // 从设备列表中移除
    if (this.parent.devices && this.parent.devices.has(deviceId)) {
      this.parent.devices.delete(deviceId)
      logger.withContext({ deviceId }).debug('已从设备列表移除')
    }
  }

  /**
   * 清理所有资源
   */
  cleanupAllResources() {
    logger.info('开始清理所有蓝牙资源')

    // 调用 dataIO 的全局资源清理
    if (this.parent.dataIO) {
      this.parent.dataIO.cleanupAllResources()
    }

    // 调用 scanner 的资源清理
    if (this.parent.scanner) {
      this.parent.scanner.cleanup()
    }

    // 清理所有设备的资源
    if (this.parent.devices) {
      this.parent.devices.forEach((device, deviceId) => {
        this.parent.devices.delete(deviceId)
      })
    }

    // 清理断开回调
    this.disconnectCallbacks = []

    // 重置状态
    if (this.parent.connection) {
      this.parent.connection.connectedDevice = null
      this.parent.connection.connected = false
    }
    this.parent.initialized = false

    logger.info('蓝牙资源清理完成')
  }

  /**
   * 获取资源使用统计
   * @returns {Object} 资源统计信息
   */
  getResourceStats() {
    const stats = {
      devices: this.parent.devices ? this.parent.devices.size : 0,
      disconnectCallbacks: this.disconnectCallbacks.length,
      connected: this.parent.connection ? this.parent.connection.connected : false,
    }

    // 添加 dataIO 的统计
    if (this.parent.dataIO) {
      stats.notificationListeners = this.parent.dataIO._notificationListeners ? 
        Array.from(this.parent.dataIO._notificationListeners.keys()).length : 0
      stats.serviceCache = this.parent.dataIO._serviceCache ? 
        Array.from(this.parent.dataIO._serviceCache.keys()).length : 0
    }

    return stats
  }
}
