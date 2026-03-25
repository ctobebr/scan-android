/**
 * @fileoverview 蓝牙扫描模块
 *
 * 负责蓝牙设备的扫描、发现和列表管理等功能。
 *
 * @module @/services/bluetooth/core/scanner
 * @version 1.0.0
 * @since 2026-03-24
 */

import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { createLogger } from '@/utils/logger'
import {
  BluetoothErrorCode,
  wrapAsyncOperation,
} from '../utils/errors'
import { getScanConfig } from '../config'

// 创建扫描模块专用日志记录器
const logger = createLogger('Scanner')

/**
 * 扫描器类
 * 管理蓝牙设备的扫描和发现
 */
export class Scanner {
  constructor(parent) {
    this.parent = parent
    this.devices = new Map()
  }

  /**
   * 请求蓝牙权限
   * @returns {Promise<Object>} 权限请求结果
   */
  async requestPermissions() {
    return wrapAsyncOperation(
      async () => {
        if (BluetoothLe && typeof BluetoothLe.requestPermissions === 'function') {
          const result = await BluetoothLe.requestPermissions()
          logger.info('权限请求结果', result)
          return result
        } else {
          logger.warn('BluetoothLe.requestPermissions 不可用，确保已授予位置与蓝牙相关权限')
          return { bluetooth: 'granted', location: 'granted' }
        }
      },
      BluetoothErrorCode.PERMISSION_DENIED,
      '请求蓝牙权限失败',
      { method: 'requestPermissions' }
    )
  }

  /**
   * 扫描蓝牙设备
   * @param {number} [duration] - 扫描持续时间（毫秒）
   * @returns {Promise<Array>} 发现的设备列表
   */
  async scanDevices(duration) {
    return wrapAsyncOperation(
      async () => {
        // 使用配置管理器获取默认扫描时长
        const scanConfig = getScanConfig()
        const scanDuration = duration || scanConfig.duration

        // 检查是否允许重复设备
        const allowDuplicates = scanConfig.allowDuplicates

        this.devices.clear()

        // 确保蓝牙已初始化
        if (this.parent && this.parent.initBluetooth) {
          await this.parent.initBluetooth()
        }

        return new Promise((resolve) => {
          try {
            // 使用 BleClient.requestLEScan（新 API）
            BleClient.requestLEScan({ allowDuplicates }, (result) => {
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
              }
            })
          } catch (error) {
            logger.error('开始扫描失败', error)
          }

          // 使用配置值作为超时时间
          setTimeout(async () => {
            await this.stopScan()
            resolve(this.getDiscoveredDevices())
          }, scanDuration)
        })
      },
      BluetoothErrorCode.SCAN_FAILED,
      '扫描蓝牙设备失败',
      { method: 'scanDevices', duration }
    )
  }

  /**
   * 停止扫描
   * @returns {Promise<void>}
   */
  async stopScan() {
    return wrapAsyncOperation(
      async () => {
        await BleClient.stopLEScan()
        logger.info('停止扫描')
      },
      BluetoothErrorCode.SCAN_FAILED,
      '停止扫描失败',
      { method: 'stopScan' }
    )
  }

  /**
   * 获取已发现的设备列表
   * @returns {Array} 设备列表
   */
  getDiscoveredDevices() {
    return Array.from(this.devices.values())
  }

  /**
   * 清空设备列表
   */
  clearDevices() {
    this.devices.clear()
  }

  /**
   * 根据 deviceId 获取设备信息
   * @param {string} deviceId - 设备 ID
   * @returns {Object|undefined} 设备信息
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId)
  }

  /**
   * 检查设备是否已发现
   * @param {string} deviceId - 设备 ID
   * @returns {boolean} 是否已发现
   */
  hasDevice(deviceId) {
    return this.devices.has(deviceId)
  }

  /**
   * 获取设备数量
   * @returns {number} 设备数量
   */
  getDeviceCount() {
    return this.devices.size
  }

  /**
   * 清理扫描相关资源
   */
  cleanup() {
    this.devices.clear()
    logger.info('扫描器资源清理完成')
  }
}

export default Scanner
