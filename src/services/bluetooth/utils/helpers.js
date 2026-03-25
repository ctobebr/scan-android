/**
 * @fileoverview 蓝牙服务辅助函数
 *
 * 提供协议帧构建、数据转换等辅助功能。
 *
 * @module @/services/bluetooth/utils/helpers
 * @version 1.0.0
 * @since 2026-03-24
 */

import {
  PROTOCOL_HEADER_HIGH,
  PROTOCOL_HEADER_LOW,
} from '@/constants/bluetooth'

/**
 * 构建协议帧
 *
 * 帧格式：帧头(2B) + 命令字(1B) + 数据长度(1B) + 数据(nB) + 校验和(1B)
 * - 帧头：0xAA55
 * - 命令字：0～255
 * - 数据长度：0～255
 * - 校验和：CMD + LEN + DATA 之和的低 8 位
 *
 * @param {number} cmd - 命令字 (0～255)
 * @param {number[]|Uint8Array} [data=[]] - 数据字节数组
 * @returns {Uint8Array} 完整的协议帧
 * @throws {Error} 命令字无效时抛出错误
 */
export function buildProtocolFrame(cmd, data = []) {
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

/**
 * 将 Uint8Array 转换为十六进制字符串
 *
 * @param {Uint8Array} arr - 字节数组
 * @returns {string} 十六进制字符串，每个字节用空格分隔
 */
export function uint8ArrayToHex(arr) {
  if (!arr) return ''
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

/**
 * 将十六进制字符串转换为 Uint8Array
 *
 * @param {string} hex - 十六进制字符串（如 "AA 55 01 02"）
 * @returns {Uint8Array} 字节数组
 */
export function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/\s+/g, '')
  const bytes = []
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16))
  }
  return new Uint8Array(bytes)
}

/**
 * 计算校验和
 *
 * @param {number} cmd - 命令字
 * @param {number[]} data - 数据字节数组
 * @returns {number} 校验和（低 8 位）
 */
export function calculateChecksum(cmd, data) {
  let checksum = cmd + data.length
  for (const byte of data) {
    checksum += byte
  }
  return checksum & 0xff
}

/**
 * 验证协议帧完整性
 *
 * @param {Uint8Array} frame - 协议帧
 * @returns {boolean} 是否有效
 */
export function validateProtocolFrame(frame) {
  if (frame.length < 5) return false
  if (frame[0] !== PROTOCOL_HEADER_HIGH || frame[1] !== PROTOCOL_HEADER_LOW) return false

  const cmd = frame[2]
  const len = frame[3]
  const payload = Array.from(frame.slice(4, 4 + len))
  const receivedChecksum = frame[4 + len]
  const calculatedChecksum = calculateChecksum(cmd, payload)

  return receivedChecksum === calculatedChecksum
}

// ========== 默认导出 ==========

export default {
  buildProtocolFrame,
  uint8ArrayToHex,
  hexToUint8Array,
  calculateChecksum,
  validateProtocolFrame,
}
