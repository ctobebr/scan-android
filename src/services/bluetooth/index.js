/**
 * @fileoverview 蓝牙服务统一入口
 *
 * 提供蓝牙设备的扫描、连接、通信等功能。
 * 基于 @capacitor-community/bluetooth-le 插件。
 *
 * 架构说明：
 * 本文件作为统一外观(Facade)，组合多个子模块：
 * - core/connection: 连接管理
 * - core/scanner: 设备扫描
 * - core/io: 数据读写
 * - commands/control: 控制指令
 * - commands/query: 查询指令
 * - resources/manager: 资源管理
 *
 * @module @/services/bluetooth
 */

import { BluetoothLe, BleClient } from '@capacitor-community/bluetooth-le'
import { createLogger } from '@/utils/logger'
import { BluetoothError, ConnectionError } from './utils/errors'
import { CONTROL_COMMANDS } from '@/constants/bluetooth'
import {
  getConfig,
  getScanConfig,
  getConnectionConfig,
  getIoConfig,
  getProtocolConfig,
  getFeaturesConfig,
  isFeatureEnabled,
} from './config'

// 子模块导入
import { ConnectionManager } from './core/connection'
import { Scanner } from './core/scanner'
import { DataIO } from './core/io'
import { ControlCommands } from './commands/control'
import { QueryCommands } from './commands/query'
import { ResourceManager } from './resources/manager'

const logger = createLogger('Bluetooth')

/**
 * 蓝牙服务类
 * 作为统一外观，组合并代理所有子模块功能
 */
export class BluetoothService {
  constructor() {
    // 初始化子模块
    this.connection = new ConnectionManager(this)
    this.scanner = new Scanner(this)
    this.dataIO = new DataIO(this)
    this.control = new ControlCommands(this)
    this.query = new QueryCommands(this)
    this.resources = new ResourceManager(this)

    // 状态属性
    this.connectedDevice = null
    this.connected = false
    this.devices = new Map()  // 扫描设备列表
    this.initialized = false
  }

  // ==================== 基础方法 ====================

  async isBluetoothEnabled() {
    try {
      return await BleClient.isEnabled()
    } catch (error) {
      logger.warn('检查蓝牙状态失败', error)
      return false
    }
  }

  async initBluetooth() {
    if (this.initialized) return true

    try {
      if (BluetoothLe?.initialize) {
        await BluetoothLe.initialize()
        logger.info('BluetoothLe 初始化完成')
      } else if (BleClient?.initialize) {
        await BleClient.initialize()
        logger.info('BleClient 初始化完成')
      }
      this.initialized = true
      return true
    } catch (error) {
      logger.error('蓝牙初始化失败', error)
      throw new BluetoothError('蓝牙初始化失败', 'NOT_INITIALIZED')
    }
  }

  async requestPermissions() {
    try {
      if (BluetoothLe?.requestPermissions) {
        const result = await BluetoothLe.requestPermissions()
        logger.info('权限请求结果', result)
        return result
      }
      return { bluetooth: 'granted', location: 'granted' }
    } catch (error) {
      logger.error('请求蓝牙权限失败', error)
      throw new BluetoothError('请求蓝牙权限失败', 'PERMISSION_DENIED')
    }
  }

  // ==================== 扫描方法 ====================

  async scanDevices(duration) {
    const scanConfig = getScanConfig()
    const scanDuration = duration || scanConfig.duration

    this.devices.clear()
    await this.initBluetooth()

    return new Promise((resolve) => {
      try {
        BleClient.requestLEScan({ allowDuplicates: scanConfig.allowDuplicates }, (result) => {
          if (result.device?.deviceId) {
            this.devices.set(result.device.deviceId, {
              deviceId: result.device.deviceId,
              name: result.device.name || result.localName || 'N/A',
              rssi: result.rssi || 0,
              txPower: result.txPower,
              manufacturerData: result.manufacturerData,
              serviceData: result.serviceData,
              uuids: result.uuids,
              rawAdvertisement: result.rawAdvertisement,
            })
          }
        })
      } catch (error) {
        logger.error('开始扫描失败', error)
      }

      setTimeout(async () => {
        await this.stopScan()
        resolve(this.getDiscoveredDevices())
      }, scanDuration)
    })
  }

  async stopScan() {
    await BleClient.stopLEScan()
    logger.info('停止扫描')
  }

  getDiscoveredDevices() {
    return Array.from(this.devices.values())
  }

  clearDevices() {
    this.devices.clear()
  }

  // ==================== 连接方法 ====================

  async connectDevice(deviceId) {
    this.removeDisconnectListener(deviceId)

    await BleClient.connect(deviceId, (deviceId) => {
      logger.withContext({ deviceId }).warn('设备意外断开连接')
      this.connected = false
      this.connectedDevice = null
      this.triggerDisconnectCallbacks(deviceId)
    })

    this.connectedDevice = { deviceId }
    this.connected = true
    logger.withContext({ deviceId }).info('设备连接成功')
    return true
  }

  async disconnectDevice(deviceId) {
    await BleClient.disconnect(deviceId)
    this.cleanupDeviceResources(deviceId)
    this.connectedDevice = null
    this.connected = false
    this.triggerDisconnectCallbacks(deviceId, true)
    logger.withContext({ deviceId }).info('设备已断开连接')
    return true
  }

  isConnected() {
    return this.connected
  }

  getConnectedDevice() {
    return this.connectedDevice
  }

  async checkConnectionStatus(deviceId) {
    if (!deviceId) return false
    try {
      const services = await BleClient.getServices(deviceId)
      return services && services.length > 0
    } catch (error) {
      logger.withContext({ deviceId }).warn('检查连接状态失败', error)
      if (this.connectedDevice?.deviceId === deviceId) {
        this.connected = false
        this.connectedDevice = null
        this.triggerDisconnectCallbacks(deviceId, false)
      }
      return false
    }
  }

  removeDisconnectListener(deviceId) {
    logger.withContext({ deviceId }).debug('准备连接新设备，清理旧状态')
  }

  // ==================== 数据I/O代理 ====================

  async discoverServices(deviceId) {
    return this.dataIO.discoverServices(deviceId)
  }

  async writeData(deviceId, serviceUUID, characteristicUUID, value) {
    return this.dataIO.writeData(deviceId, serviceUUID, characteristicUUID, value)
  }

  async writeBinaryData(deviceId, serviceUUID, characteristicUUID, value) {
    return this.dataIO.writeBinaryData(deviceId, serviceUUID, characteristicUUID, value)
  }

  async readData(deviceId, serviceUUID, characteristicUUID) {
    return this.dataIO.readData(deviceId, serviceUUID, characteristicUUID)
  }

  async subscribeToNotifications(deviceId, serviceUUID, characteristicUUID, callback) {
    return this.dataIO.subscribeToNotifications(deviceId, serviceUUID, characteristicUUID, callback)
  }

  async unsubscribeFromNotifications(deviceId, serviceUUID, characteristicUUID) {
    return this.dataIO.unsubscribeFromNotifications(deviceId, serviceUUID, characteristicUUID)
  }

  async sendCommand(deviceId, serviceUUID, characteristicUUID, command, data = null) {
    return this.dataIO.sendCommand(deviceId, serviceUUID, characteristicUUID, command, data)
  }

  // ==================== 控制指令代理 ====================

  async sendStartScan(deviceId, serviceUUID, characteristicUUID) {
    return this.control.sendStartScan(deviceId, serviceUUID, characteristicUUID)
  }

  async sendStopScan(deviceId, serviceUUID, characteristicUUID) {
    return this.control.sendStopScan(deviceId, serviceUUID, characteristicUUID)
  }

  async sendSetCalibParam(deviceId, serviceUUID, characteristicUUID, x, y, z) {
    return this.control.sendSetCalibParam(deviceId, serviceUUID, characteristicUUID, x, y, z)
  }

  async sendSetRotateSpeed(deviceId, serviceUUID, characteristicUUID, pitchSpeed, yawSpeed) {
    return this.control.sendSetRotateSpeed(deviceId, serviceUUID, characteristicUUID, pitchSpeed, yawSpeed)
  }

  async sendSetScanTime(deviceId, serviceUUID, characteristicUUID, seconds) {
    return this.control.sendSetScanTime(deviceId, serviceUUID, characteristicUUID, seconds)
  }

  async sendSetPitchLimit(deviceId, serviceUUID, characteristicUUID, upperLimitDeg, lowerLimitDeg) {
    return this.control.sendSetPitchLimit(deviceId, serviceUUID, characteristicUUID, upperLimitDeg, lowerLimitDeg)
  }

  async sendSetOutputXYZ(deviceId, serviceUUID, characteristicUUID, on) {
    return this.control.sendSetOutputXYZ(deviceId, serviceUUID, characteristicUUID, on)
  }

  async sendSetOutputPolar(deviceId, serviceUUID, characteristicUUID, on) {
    return this.control.sendSetOutputPolar(deviceId, serviceUUID, characteristicUUID, on)
  }

  // async sendSetVPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d) {
  //   return this.control.sendSetVPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d)
  // }
  //
  // async sendSetAPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d) {
  //   return this.control.sendSetAPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d)
  // }

  async sendSetPitchOffset(deviceId, serviceUUID, characteristicUUID, offset) {
    return this.control.sendSetPitchOffset(deviceId, serviceUUID, characteristicUUID, offset)
  }

  async sendSetYawStep(deviceId, serviceUUID, characteristicUUID, yawStep) {
    return this.control.sendSetYawStep(deviceId, serviceUUID, characteristicUUID, yawStep)
  }

  async sendSetPitchTargets(deviceId, serviceUUID, characteristicUUID, pitch0, pitch1, pitch2) {
    return this.control.sendSetPitchTargets(deviceId, serviceUUID, characteristicUUID, pitch0, pitch1, pitch2)
  }

  async sendCameraNextPhoto(deviceId, serviceUUID, characteristicUUID) {
    return this.control.sendCameraNextPhoto(deviceId, serviceUUID, characteristicUUID)
  }

  async sendAck(deviceId, serviceUUID, characteristicUUID, ackCmd) {
    return this.control.sendAck(deviceId, serviceUUID, characteristicUUID, ackCmd)
  }

  // ==================== 查询指令代理 ====================

  async sendReadPitchOffset(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadPitchOffset(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadYawStep(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadYawStep(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadPitchTargets(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadPitchTargets(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadCommand(deviceId, serviceUUID, characteristicUUID, readCommand) {
    return this.query.sendReadCommand(deviceId, serviceUUID, characteristicUUID, readCommand)
  }

  async sendReadRotateSpeed(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadRotateSpeed(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadScanCycles(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadScanCycles(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadPitchLimit(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadPitchLimit(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadCalibParam(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadCalibParam(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadOutputXYZ(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadOutputXYZ(deviceId, serviceUUID, characteristicUUID)
  }

  async sendReadOutputPolar(deviceId, serviceUUID, characteristicUUID) {
    return this.query.sendReadOutputPolar(deviceId, serviceUUID, characteristicUUID)
  }

  // async sendReadVPID(deviceId, serviceUUID, characteristicUUID, axis) {
  //   return this.query.sendReadVPID(deviceId, serviceUUID, characteristicUUID, axis)
  // }
  //
  // async sendReadAPID(deviceId, serviceUUID, characteristicUUID, axis) {
  //   return this.query.sendReadAPID(deviceId, serviceUUID, characteristicUUID, axis)
  // }

  // ==================== 资源管理代理 ====================

  cleanupDeviceResources(deviceId) {
    return this.resources.cleanupDeviceResources(deviceId)
  }

  cleanupAllResources() {
    return this.resources.cleanupAllResources()
  }

  getResourceStats() {
    return this.resources.getResourceStats()
  }

  onDeviceDisconnected(callback) {
    return this.resources.onDeviceDisconnected(callback)
  }

  triggerDisconnectCallbacks(deviceId, isManualDisconnect = false) {
    return this.resources.triggerDisconnectCallbacks(deviceId, isManualDisconnect)
  }
}

// 导出单例
export const bluetoothService = new BluetoothService()
export default bluetoothService
