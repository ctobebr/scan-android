/**
 * 查询指令模块
 * 职责：处理所有设备查询相关的指令发送
 */

import { DEVICE_DATA_COMMANDS } from '@/constants/bluetooth'
import { validateNumber, validateAxis } from '../utils/validator.js'
import { createLogger } from '@/utils/logger'

const logger = createLogger('bluetooth:commands:query')

/**
 * 查询指令管理器
 * 负责发送各类查询指令到蓝牙设备
 */
export class QueryCommands {
  constructor(parent) {
    this.parent = parent
  }

  /**
   * 发送"读取俯仰角零偏"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadPitchOffset(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送读取俯仰角零偏指令')
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_PITCH_OFFSET,
      null,
    )
  }

  /**
   * 发送读取参数指令 (无数据)
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} readCommand - 读取命令字 (DEVICE_DATA_COMMANDS.CMD_READ_*)
   */
  async sendReadCommand(deviceId, serviceUUID, characteristicUUID, readCommand) {
    // 添加特有参数验证
    // 原因：防御性编程，确保读取命令字有效
    validateNumber(readCommand, 'readCommand')

    // 可以加入验证，确保传入的是读取命令
    if (
      ![
        DEVICE_DATA_COMMANDS.CMD_READ_CALIB_PARAM,
        DEVICE_DATA_COMMANDS.CMD_READ_ROTATE_SPEED,
        DEVICE_DATA_COMMANDS.CMD_READ_SCAN_TIME,
        DEVICE_DATA_COMMANDS.CMD_READ_PITCH_LIMIT,
      ].includes(readCommand)
    ) {
      logger.withContext({ readCommand }).warn('Command might not be a standard read command')
    }
    await this.parent.sendCommand(deviceId, serviceUUID, characteristicUUID, readCommand, null)
  }

  /**
   * 发送读取转动速度指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadRotateSpeed(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送读取转动速度指令')
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_ROTATE_SPEED,
    )
  }

  /**
   * 发送读取扫描时间指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadScanCycles(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送读取扫描时间指令')
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_SCAN_TIME,
    )
  }

  /**
   * 发送读取俯仰角上下限指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadPitchLimit(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送读取俯仰角上下限指令')
    await this.sendReadCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_PITCH_LIMIT,
    )
  }

  /**
   * 发送读取标定参数指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendReadCalibParam(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送读取标定参数指令')
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
    logger.withContext({ deviceId }).debug('发送查询输出XYZ状态指令')
    await this.parent.sendCommand(
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
    logger.withContext({ deviceId }).debug('发送查询输出极坐标状态指令')
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_OUTPUT_POLAR,
      null,
    )
  }

  /**
   * 发送"读取速度环PID"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'pitch' 或 'yaw'
   */
  async sendReadVPID(deviceId, serviceUUID, characteristicUUID, axis) {
    // 添加特有参数验证
    // 原因：防御性编程，确保轴参数有效
    validateAxis(axis, 'axis')

    logger.withContext({ deviceId, axis }).debug('发送读取速度环PID指令')

    const buffer = new ArrayBuffer(1) // 1 byte axis
    const view = new Uint8Array(buffer)
    view[0] = axis === 'pitch' ? 0 : 1 // 轴值：pitch=0, yaw=1
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_V_PID,
      buffer,
    )
  }

  /**
   * 发送"读取角度环PID"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'pitch' 或 'yaw'
   */
  async sendReadAPID(deviceId, serviceUUID, characteristicUUID, axis) {
    // 添加特有参数验证
    // 原因：防御性编程，确保轴参数有效
    validateAxis(axis, 'axis')

    logger.withContext({ deviceId, axis }).debug('发送读取角度环PID指令')

    const buffer = new ArrayBuffer(1) // 1 byte axis
    const view = new Uint8Array(buffer)
    view[0] = axis === 'pitch' ? 0 : 1 // 轴值：pitch=0, yaw=1
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      DEVICE_DATA_COMMANDS.CMD_READ_A_PID,
      buffer,
    )
  }
}
