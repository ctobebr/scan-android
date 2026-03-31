/**
 * 控制指令模块
 * 职责：处理所有设备控制相关的指令发送
 */

import { CONTROL_COMMANDS } from '@/constants/bluetooth'
import { validateNumber, validateBoolean, validateNumberRange, validateAxis } from '../utils/validator.js'
import { createLogger } from '@/utils/logger'

const logger = createLogger('bluetooth:commands:control')

/**
 * 控制指令管理器
 * 负责发送各类控制指令到蓝牙设备
 */
export class ControlCommands {
  constructor(parent) {
    this.parent = parent
  }

  /**
   * 发送"启动扫描"指令：AA55 01 00 [checksum]
   * 根据协议，CMD=0x01, LEN=0, DATA=[]
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendStartScan(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送启动扫描指令')
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_START,
      null,
    )
  }

  /**
   * 发送"停止扫描"指令：AA55 02 00 [checksum]
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   */
  async sendStopScan(deviceId, serviceUUID, characteristicUUID) {
    logger.withContext({ deviceId }).debug('发送停止扫描指令')
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_STOP,
      null,
    )
  }

  /**
   * 发送"设置标定参数"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} x - X轴标定参数 (float, 单位: mm)
   * @param {number} y - Y轴标定参数 (float, 单位: mm)
   * @param {number} z - Z轴标定参数 (float, 单位: mm)
   */
  async sendSetCalibParam(deviceId, serviceUUID, characteristicUUID, x, y, z) {
    // 添加特有参数验证
    // 原因：防御性编程，确保标定参数为有效数值
    validateNumber(x, 'x')
    validateNumber(y, 'y')
    validateNumber(z, 'z')

    logger.withContext({ deviceId, x, y, z }).debug('发送设置标定参数指令')

    const buffer = new ArrayBuffer(12) // 3 * float = 12 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, x, true) // X, 小端序
    view.setFloat32(4, y, true) // Y, 小端序 (偏移 4 字节)
    view.setFloat32(8, z, true) // Z, 小端序 (偏移 8 字节)
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_CALIB_PARAM,
      buffer,
    )
  }

  /**
   * 发送"设置转动速度"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} pitchSpeed - 俯仰轴速度 (float, 单位: rad/ms)
   * @param {number} yawSpeed - 偏航轴速度 (float, 单位: rad/ms)
   */
  async sendSetRotateSpeed(deviceId, serviceUUID, characteristicUUID, pitchSpeed, yawSpeed) {
    // 添加特有参数验证
    // 原因：防御性编程，确保速度参数为有效数值
    validateNumber(pitchSpeed, 'pitchSpeed')
    validateNumber(yawSpeed, 'yawSpeed')

    logger.withContext({ deviceId, pitchSpeed, yawSpeed }).debug('发送设置转动速度指令')

    const buffer = new ArrayBuffer(8) // 2 * float = 8 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, pitchSpeed, true) // pitch speed, 小端序
    view.setFloat32(4, yawSpeed, true) // yaw speed, 小端序 (偏移 4 字节)
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_ROTATE_SPEED,
      buffer,
    )
  }

  /**
   * 发送"设置扫描时间"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} seconds - 扫描时间 (uint16_t, 单位: 秒)
   */
  async sendSetScanTime(deviceId, serviceUUID, characteristicUUID, seconds) {
    // 添加特有参数验证
    // 原因：防御性编程，确保扫描时间为有效数值
    validateNumber(seconds, 'seconds')
    validateNumberRange(seconds, 0, 65535, 'seconds')

    logger.withContext({ deviceId, seconds }).debug('发送设置扫描时间指令')

    const buffer = new ArrayBuffer(2) // 1 * uint16_t = 2 bytes
    const view = new DataView(buffer)
    view.setUint16(0, seconds, true) // 小端序
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_SCAN_TIME,
      buffer,
    )
  }

  /**
   * 发送"设置俯仰角上下限"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} upperLimitRad - 俯仰角上限 (单位: 弧度 rad)
   * @param {number} lowerLimitRad - 俯仰角下限 (单位: 弧度 rad)
   */
  async sendSetPitchLimit(deviceId, serviceUUID, characteristicUUID, upperLimitRad, lowerLimitRad) {
    // 添加特有参数验证
    // 原因：防御性编程，确保俯仰角限制为有效数值
    validateNumber(upperLimitRad, 'upperLimitRad')
    validateNumber(lowerLimitRad, 'lowerLimitRad')

    logger.withContext({ deviceId, upperLimitRad, lowerLimitRad }).debug('发送设置俯仰角上下限指令')

    const buffer = new ArrayBuffer(8) // 2 * float = 8 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, upperLimitRad, true) // 上限 limit, 小端序，第一个 float
    view.setFloat32(4, lowerLimitRad, true) // 下限 limit, 小端序，第二个 float (偏移 4 字节)
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_PITCH_LIMIT,
      buffer,
    )
  }

  /**
   * 发送"设置输出XYZ值"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {boolean} on - true 表示开启，false 表示关闭
   */
  async sendSetOutputXYZ(deviceId, serviceUUID, characteristicUUID, on) {
    // 添加特有参数验证
    // 原因：防御性编程，确保开关参数为布尔值
    validateBoolean(on, 'on')

    logger.withContext({ deviceId, on }).debug('发送设置输出XYZ值指令')

    const buffer = new ArrayBuffer(1) // 1 * bool = 1 byte
    const view = new Uint8Array(buffer)
    view[0] = on ? 1 : 0 // 1 表示开启，0 表示关闭
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_OUTPUT_XYZ,
      buffer,
    )
  }

  /**
   * 发送"设置输出极坐标值"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {boolean} on - true 表示开启，false 表示关闭
   */
  async sendSetOutputPolar(deviceId, serviceUUID, characteristicUUID, on) {
    // 添加特有参数验证
    // 原因：防御性编程，确保开关参数为布尔值
    validateBoolean(on, 'on')

    logger.withContext({ deviceId, on }).debug('发送设置输出极坐标值指令')

    const buffer = new ArrayBuffer(1) // 1 * bool = 1 byte
    const view = new Uint8Array(buffer)
    view[0] = on ? 1 : 0 // 1 表示开启，0 表示关闭
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_OUTPUT_POLAR,
      buffer,
    )
  }

  /**
   * 发送"设置速度环PID"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'x' 或 'y'
   * @param {number} p - P参数 (float)
   * @param {number} i - I参数 (float)
   * @param {number} d - D参数 (float)
   */
  async sendSetVPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d) {
    // 添加特有参数验证
    // 原因：防御性编程，确保PID参数为有效数值
    validateAxis(axis, 'axis')
    validateNumber(p, 'p')
    validateNumber(i, 'i')
    validateNumber(d, 'd')

    logger.withContext({ deviceId, axis, p, i, d }).debug('发送设置速度环PID指令')

    const buffer = new ArrayBuffer(16) // 4 bytes axis + 3 * float = 16 bytes
    const view = new DataView(buffer)
    view.setUint32(0, axis === 'x' ? 0 : 1, true) // 轴值：x=0, y=1，小端序
    view.setFloat32(4, p, true) // P参数，小端序 (偏移 4 字节)
    view.setFloat32(8, i, true) // I参数，小端序 (偏移 8 字节)
    view.setFloat32(12, d, true) // D参数，小端序 (偏移 12 字节)
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_V_PID,
      buffer,
    )
  }

  /**
   * 发送"设置角度环PID"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {string} axis - 轴，'x' 或 'y'
   * @param {number} p - P参数 (float)
   * @param {number} i - I参数 (float)
   * @param {number} d - D参数 (float)
   */
  async sendSetAPID(deviceId, serviceUUID, characteristicUUID, axis, p, i, d) {
    // 添加特有参数验证
    // 原因：防御性编程，确保PID参数为有效数值
    validateAxis(axis, 'axis')
    validateNumber(p, 'p')
    validateNumber(i, 'i')
    validateNumber(d, 'd')

    logger.withContext({ deviceId, axis, p, i, d }).debug('发送设置角度环PID指令')

    const buffer = new ArrayBuffer(16) // 4 bytes axis + 3 * float = 16 bytes
    const view = new DataView(buffer)
    view.setUint32(0, axis === 'x' ? 0 : 1, true) // 轴值：x=0, y=1，小端序
    view.setFloat32(4, p, true) // P参数，小端序 (偏移 4 字节)
    view.setFloat32(8, i, true) // I参数，小端序 (偏移 8 字节)
    view.setFloat32(12, d, true) // D参数，小端序 (偏移 12 字节)
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_A_PID,
      buffer,
    )
  }

  /**
   * 发送"设置俯仰角零偏"指令
   * @param {string} deviceId - 设备 ID
   * @param {string} serviceUUID - 服务 UUID
   * @param {string} characteristicUUID - 特征 UUID
   * @param {number} offset - 俯仰角零偏值 (float, 单位: 度)
   */
  async sendSetPitchOffset(deviceId, serviceUUID, characteristicUUID, offset) {
    // 添加特有参数验证
    // 原因：防御性编程，确保零偏值为有效数值
    validateNumber(offset, 'offset')

    logger.withContext({ deviceId, offset }).debug('发送设置俯仰角零偏指令')

    const buffer = new ArrayBuffer(4) // 1 * float = 4 bytes
    const view = new DataView(buffer)
    view.setFloat32(0, offset, true) // 零偏值，小端序
    await this.parent.sendCommand(
      deviceId,
      serviceUUID,
      characteristicUUID,
      CONTROL_COMMANDS.CMD_SET_PITCH_OFFSET,
      buffer,
    )
  }
}
