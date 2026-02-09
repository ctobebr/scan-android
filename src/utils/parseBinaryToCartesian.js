/**
 * 协议帧结构
 *
 * [字节位置] [字段名称]       [大小] [说明]
 *   0       帧头(高字节)     1字节  固定为 0xAA
 *   1       帧头(低字节)     1字节  固定为 0x55
 *   2       命令字           1字节  标识命令类型（见下表）
 *   3       数据长度         1字节  数据区字节数（不含校验和）
 *   4~N+3   数据区          N字节  根据命令字内容，数据不同
 *   N+4     校验和           1字节  校验和，见下说明
 *
 * 帧总长度 = 5 + N 字节
 *
 * 校验和计算：
 *   只对 CMD + Length + Data 三部分求和，取低 8 位
 */
import { CONTROL_COMMANDS, DEVICE_DATA_COMMANDS } from "@/constants/protocolCommands"
export class parseBinaryToCartesian {
  constructor() {
    this.protocolState = {
      buffer: new Uint8Array(512), // 增大缓冲区
      bufferIndex: 0,
      frameState: 'WAITING_HEADER', // 状态：WAITING_HEADER, READING_CMD, READING_LEN, READING_DATA, READING_CHECKSUM
      cmd: 0,
      dataLength: 0,
      dataIndex: 0,
      packetData: null,
      checksum: 0, // 校验和需要包含 Cmd, Len, Data
      accumulatedPoints: [], // 用于累积解析出的点
    }
  }
  // 验证数据包
  validateBinaryPacket(receivedChecksum) {
    const calculatedChecksum = this.protocolState.checksum & 0xff
    return calculatedChecksum === receivedChecksum
  }

  // 重置协议状态
  resetProtocolState() {
    this.protocolState.bufferIndex = 0
    this.protocolState.frameState = 'WAITING_HEADER'
    this.protocolState.cmd = 0
    this.protocolState.dataLength = 0
    this.protocolState.dataIndex = 0
    this.protocolState.packetData = null
    this.protocolState.checksum = 0
  }

  /**
   * 处理协议数据包
   * @param {number} cmd - 命令字节 (0xA1: CMD_POINT_DATA)
   * @param {Uint8Array} data - 数据区内容
   */
  handleProtocolPacket(cmd, data) {
    // 使用对象映射查找处理器
    const commandHandlers = {
      [CONTROL_COMMANDS.CMD_START]: this._handleStart,
      [CONTROL_COMMANDS.CMD_STOP]: this._handleStop,
      [DEVICE_DATA_COMMANDS.CMD_OUTPUT_XYZ]: this._handlePointData,
      [DEVICE_DATA_COMMANDS.CMD_OUTPUT_POLAR]: this._handleRawPointData,
      // [CONTROL_COMMANDS.CMD_CTRL_CAMERA]: this._handleTakePhoto,
      // [CONTROL_COMMANDS.CMD_SET_ROTATE_SPEED]: this._handleSetSpeed,
      // [CONTROL_COMMANDS.CMD_GET_POS]: this._handleGetPos,
      // [CONTROL_COMMANDS.CMD_SET_HOME]: this._handleSetHome,
      // [CONTROL_COMMANDS.CMD_GET_STATUS]: this._handleGetStatus,
      // [CONTROL_COMMANDS.CMD_SET_ACCEL]: this._handleSetAccel,
    }
    const handler = commandHandlers[cmd]
    if (handler) {
      // 调用对应的处理器
      handler.call(this, data)
    } else {
      console.log(`[Protocol] Received unknown command: 0x ${cmd.toString(16).padStart(2, '0')}`)
    }
    // CMD_POINT_DATA = 0xA1：发送点云数据
    // if (cmd === 0xa1) {
    //   if (data && data.length > 0) {
    //     // 数据长度必须是 6 的倍数（每个点占 6 字节）
    //     if (data.length % 6 === 0) {
    //       // 解析笛卡尔坐标 (XYZ) 数据
    //       const points = this.parseBinaryPointDataXYZ(data)
    //       if (points && points.length > 0) {
    //         this.protocolState.accumulatedPoints.push(...points)
    //         // if (process.env.NODE_ENV === 'development') {
    //         //   console.log(`[Protocol] Parsed ${points.length} points from CMD_POINT_DATA`)
    //         // }
    //       }
    //     } else {
    //       console.warn(
    //         `[Protocol] CMD_POINT_DATA (0xA1) has invalid data length: ${data.length}. Expected multiple of 6.`,
    //       )
    //     }
    //   }
    // } else {
    //   console.log(`[Protocol] Received unknown command: 0x${cmd.toString(16).padStart(2, '0')}`)
    // }
  }

  /**
   * 解析 XYZ 笛卡尔坐标格式的点云数据
   *
   * 数据格式：每个点占 6 字节，小端序
   *   Bytes 0-1: X 坐标（int16，单位：cm）
   *   Bytes 2-3: Y 坐标（int16，单位：cm）
   *   Bytes 4-5: Z 坐标（int16，单位：cm）
   *
   * 转换：原始值 / 100.0 = 实际值（单位：m）
   *
   * @param {Uint8Array} packetData - 完整数据区内容
   * @returns {Array|null} 解析的点对象数组，如果数据格式错误返回 null
   */
  parseBinaryPointDataXYZ(packetData) {
    const dataLength = packetData.length

    if (dataLength === 0) {
      console.warn('[Parser] Empty packet data for XYZ parsing')
      return null
    }

    const pointCount = Math.floor(dataLength / 6)

    if (pointCount * 6 !== dataLength) {
      console.warn(`[Parser] Data length ${dataLength} is not a multiple of 6 for XYZ parsing`)
      return null
    }

    const points = []
    for (let i = 0; i < pointCount; i++) {
      const startIndex = i * 6

      try {
        // 使用 DataView 确保小端序读取（比特位运算更安全）
        const view = new DataView(packetData.buffer, packetData.byteOffset + startIndex, 6)

        // 小端序读取有符号 16 位整数（true = littleEndian）
        const x_int16 = view.getInt16(0, true)
        const y_int16 = view.getInt16(2, true)
        const z_int16 = view.getInt16(4, true)

        // 转换为实际值（单位：厘米 → 米）
        const x = x_int16 / 100.0
        const y = y_int16 / 100.0
        const z = z_int16 / 100.0

        const point = { x, y, z }
        points.push(point)
      } catch (err) {
        console.error(`[Parser] Failed to parse point ${i}:`, err)
        return null
      }
    }

    // if (process.env.NODE_ENV === 'development') {
    //   console.log(
    //     `[Parser] Parsed ${points.length} XYZ points. Sample: {x: ${points[0]?.x}, y: ${points[0]?.y}, z: ${points[0]?.z}}`,
    //   )
    // }

    return points
  }

  // 解析二进制点数据 (球面坐标转笛卡尔)
  parseBinaryPointData(packetData) {
    const dataLength = packetData.length
    const pointCount = Math.floor(dataLength / 6)

    if (pointCount * 6 !== dataLength) {
      console.warn(`Data length  ${dataLength} is not a multiple of 6 for spherical parsing.`)
      return null
    }

     const points = []
    // 目前是单点，代码也适用后续可能的多点发送，一个点云6Byte
    for (let i = 0; i < pointCount; i++) {
      const startIndex = i * 6

      // 小端序读取有符号16位整数（角度）
      const yaw_int16 = ((packetData[startIndex + 1] << 24) >> 16) | packetData[startIndex]
      const pitch_int16 = ((packetData[startIndex + 3] << 24) >> 16) | packetData[startIndex + 2]

      // 小端序读取无符号16位整数（距离）
      const distance_u16 = (packetData[startIndex + 5] << 8) | packetData[startIndex + 4]

      // 转换为实际值（弧度 = int16_t / 1000.0）
      const yaw_rad = yaw_int16 / 1000.0 // 弧度
      const pitch_rad = -pitch_int16 / 1000.0 + (68 / 180) * 3.1415926 // 弧度
      const distance_m = distance_u16 / 100.0 // 分米
      // const pitch_rad1 = -pitch_int16 / 1000.0  //

      // 转换为笛卡尔坐标
      // const point = this.sphericalToCartesian(pitch_rad, yaw_rad, distance_m, 1.0)
      // pitch 和 yaw 是 弧度（radians）
      // distance_m 是分米 ，所以此处dy，dy，dz也传入分米单位数据
      const point = this.sphericalToCartesian1(
        pitch_rad,
        yaw_rad,
        distance_m,
        0.18,
        -0.141,
        0.5225,
      )
      points.push(point)
    }
     return points
   }
  // pitch: 俯仰角（从水平面向上的角度，-π/2到π/2）
  // yaw: 方位角（在水平面上的角度，-π到π）
  // r: 距离（分米）
  // intensity: 强度
  // sphericalToCartesian(pitch, yaw, r, intensity) {
  //   // 计算笛卡尔坐标
  //   const x1 = (r * Math.cos(pitch) * Math.cos(yaw))
  //   const y1 = (r * Math.sin(pitch)) // 高度
  //   const z1 = (r * Math.cos(pitch) * Math.sin(yaw))
  //   const x = r * Math.cos(pitch) * Math.cos(yaw)
  //   const y = r * Math.sin(pitch) // 高度
  //   const z = r * Math.cos(pitch) * Math.sin(yaw)
  //   // 返回点对象，包含原始数据方便调试
  //   return {
  //       x1, y1, z1,       // 分米
  //       x,y,z,
  //       pitch: pitch,     // 弧度
  //       yaw: yaw,         // 弧度
  //       distance: r * 1000,
  //       intensity: intensity,

  //       // 角度版本（方便查看） => 弧度转角度  (degree * 180 / π)
  //       pitchDeg: pitch * 180 / Math.PI,  // 角度
  //       yawDeg: yaw * 180 / Math.PI,  // 角度
  //       distanceM: r     // 这里是分米，这里如果转成米，点云显示会很密集
  //   }
  // }

  /**
   * 输入原始蓝牙数据流（Uint8Array），解析并返回当前累积的点
   *
   * 工作流程：
   * 1. 逐字节解析协议帧（状态机）
   * 2. 完整帧校验成功时，调用 handleProtocolPacket 处理
   * 3. handleProtocolPacket 将解析的点累积到内部缓冲
   * 4. parse() 返回累积的点，并清空内部缓冲
   *
   * 这种设计与 bluetooth.js 的累积渲染机制相匹配：
   * parse() → accumulationBuffer → flushAccumulatedPoints() → renderer
   */
  parse(data) {
    const errors = []

    for (let i = 0; i < data.length; i++) {
      const byte = data[i]

      switch (this.protocolState.frameState) {
        case 'WAITING_HEADER':
          this.protocolState.buffer[this.protocolState.bufferIndex++] = byte
          if (this.protocolState.bufferIndex >= 2) {
            if (this.protocolState.buffer[0] === 0xaa && this.protocolState.buffer[1] === 0x55) {
              this.protocolState.frameState = 'READING_CMD'
              this.protocolState.bufferIndex = 0
              this.protocolState.checksum = 0 // 校验和从 CMD 开始计算
            } else {
              // 滑动窗口技术，继续寻找帧头
              this.protocolState.buffer[0] = this.protocolState.buffer[1]
              this.protocolState.bufferIndex = 1
            }
          }
          break

        case 'READING_CMD':
          this.protocolState.cmd = byte
          this.protocolState.checksum += byte
          this.protocolState.frameState = 'READING_LEN'
          break

        case 'READING_LEN':
          this.protocolState.dataLength = byte
          this.protocolState.checksum += byte

          if (this.protocolState.dataLength === 0) {
            // 无数据区，直接跳转到校验和
            this.protocolState.frameState = 'READING_CHECKSUM'
          } else if (this.protocolState.dataLength <= 128) {
            // 限制单帧最大数据长度为 128 字节（防止异常）
            this.protocolState.packetData = new Uint8Array(this.protocolState.dataLength)
            this.protocolState.dataIndex = 0
            this.protocolState.frameState = 'READING_DATA'
          } else {
            // 数据长度超过限制，重置状态机
            errors.push(
              `[Parser] Data length exceeded limit: ${this.protocolState.dataLength} > 128. Resetting state.`,
            )
            console.warn(
              `[Parser] Data length exceeded limit: ${this.protocolState.dataLength}. Resetting state.`,
            )
            this.resetProtocolState()
          }
          break

        case 'READING_DATA':
          if (
            this.protocolState.packetData &&
            this.protocolState.dataIndex < this.protocolState.dataLength
          ) {
            this.protocolState.packetData[this.protocolState.dataIndex] = byte
            this.protocolState.checksum += byte
            this.protocolState.dataIndex++

            if (this.protocolState.dataIndex === this.protocolState.dataLength) {
              this.protocolState.frameState = 'READING_CHECKSUM'
            }
          }
          break

        case 'READING_CHECKSUM':
          if (this.validateBinaryPacket(byte)) {
            try {
              // 校验成功，处理协议数据包
              this.handleProtocolPacket(this.protocolState.cmd, this.protocolState.packetData)
            } catch (err) {
              const errMsg = `[Parser] Failed to handle packet (cmd=0x${this.protocolState.cmd.toString(16)}): ${err.message}`
              errors.push(errMsg)
              console.error(errMsg, err)
            }
          } else {
            const errMsg = `[Parser] Checksum mismatch: calculated=0x${(this.protocolState.checksum & 0xff).toString(16)}, received=0x${byte.toString(16)}`
            errors.push(errMsg)
            console.warn(errMsg)
          }
          // 无论校验成功与否，都重置状态机
          this.resetProtocolState()
          break
      }
    }

    // 关键改进：返回当前批次内累积的点（而非空数组）
    // 这样 bluetooth.js 可以直接使用 parse() 的返回值
    const points = this.protocolState.accumulatedPoints.slice()
    this.protocolState.accumulatedPoints = [] // 清空内部缓冲

    return { points, errors }
  }

  _handleStart(data) {
    // TODO: 实现启动扫描逻辑
    console.log('_handleStart成功')
    console.log('[Protocol] CMD_START (0x' + CONTROL_COMMANDS.CMD_START.toString(16) + ') received')
  }

  _handleStop(data) {
    // TODO: 实现停止扫描逻辑
    console.log('[Protocol] CMD_STOP (0x' + CONTROL_COMMANDS.CMD_STOP.toString(16) + ') received')
  }

  // _handleTakePhoto(data) {
  //   // TODO: 实现拍照逻辑
  //   console.log(
  //     '[Protocol] CMD_TAKE_PHOTO (0x' +
  //       CONTROL_COMMANDS.CMD_TAKE_PHOTO.toString(16) +
  //       ') received',
  //   )
  // }

  // _handleSetSpeed(data) {
  //   // TODO: 实现设置速度逻辑
  //   console.log(
  //     '[Protocol] CMD_SET_SPEED (0x' + CONTROL_COMMANDS.CMD_SET_SPEED.toString(16) + ') received',
  //   )
  // }

  // _handleGetPos(data) {
  //   // TODO: 实现查询位置逻辑
  //   console.log(
  //     '[Protocol] CMD_GET_POS (0x' + CONTROL_COMMANDS.CMD_GET_POS.toString(16) + ') received',
  //   )
  // }

  // _handleSetHome(data) {
  //   // TODO: 实现设置零点逻辑
  //   console.log(
  //     '[Protocol] CMD_SET_HOME (0x' + CONTROL_COMMANDS.CMD_SET_HOME.toString(16) + ') received',
  //   )
  // }

  // _handleGetStatus(data) {
  //   // TODO: 实现查询状态逻辑
  //   console.log(
  //     '[Protocol] CMD_GET_STATUS (0x' +
  //       CONTROL_COMMANDS.CMD_GET_STATUS.toString(16) +
  //       ') received',
  //   )
  // }

  // _handleSetAccel(data) {
  //   // TODO: 实现设置加速度逻辑
  //   console.log(
  //     '[Protocol] CMD_SET_ACCEL (0x' + CONTROL_COMMANDS.CMD_SET_ACCEL.toString(16) + ') received',
  //   )
  // }

  _handlePointData(data) {
    if (data && data.length > 0) {
      // 数据长度必须是 6 的倍数（每个点占 6 字节）
      if (data.length % 6 === 0) {
        // 解析笛卡尔坐标 (XYZ) 数据
        const points = this.parseBinaryPointDataXYZ(data)
        if (points && points.length > 0) {
          this.protocolState.accumulatedPoints.push(...points)
          // if (process.env.NODE_ENV === 'development') {
          // console.log(`[Protocol] Parsed ${points.length} points from CMD_POINT_DATA`)
        } else {
          console.warn(
            `[Protocol] CMD_POINT_DATA (0x ${CONTROL_COMMANDS.CMD_OUTPUT_XYZ.toString(16)}) has invalid data length:  ${data.length}. Expected multiple of 6.`,
          )
        }
      }
    }
  }
  _handleRawPointData(data) {
    if (data && data.length > 0) {
      // 数据长度必须是 6 的倍数（每个点占 6 字节）
      if (data.length % 6 === 0) {
        // 解析笛卡尔坐标 (XYZ) 数据
        const points = this.parseBinaryPointData(data)
        if (points && points.length > 0) {
          this.protocolState.accumulatedPoints.push(...points)
          // if (process.env.NODE_ENV === 'development') {
          // console.log(`[Protocol] Parsed ${points.length} points from CMD_POINT_DATA`)
        } else {
          console.warn(
            `[Protocol] CMD_POINT_DATA (0x ${CONTROL_COMMANDS.CMD_OUTPUT_XYZ.toString(16)}) has invalid data length:  ${data.length}. Expected multiple of 6.`,
          )
        }
      }
    }
  }
  // 将原始数据输入该函数 + dx dy dz 做一下校正保存
  sphericalToCartesian1(pitch, yaw, r, intensity, dx = 0, dy = 0, dz = 0) {
    // 理想点坐标
    const x = r * Math.cos(pitch) * Math.cos(yaw);
    const y = r * Math.sin(pitch); // 高度方向
    const z = r * Math.cos(pitch) * Math.sin(yaw);

    // 偏移量旋转补偿
    // 先绕 x 轴（pitch），再绕 y 轴（yaw）
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    // 偏移量在全局坐标系下的分量
    const dxPrime = cosYaw * dx + sinYaw * cosPitch * dz + sinYaw * sinPitch * dy;
    const dyPrime = -sinPitch * dz + cosPitch * dy;
    const dzPrime = -sinYaw * dx + cosYaw * cosPitch * dz + cosYaw * sinPitch * dy;

    // 修正后的点坐标
    const xCorrected = x + dxPrime;
    const yCorrected = y + dyPrime;
    const zCorrected = z + dzPrime;

    // 返回点对象
    return {
      x: xCorrected,
      y: yCorrected,
      z: zCorrected,
      pitch: pitch, // 弧度
      yaw: yaw, // 弧度
      distance: r * 1000,
      intensity: intensity,
      pitchDeg: (pitch * 180) / Math.PI, // 角度
      yawDeg: (yaw * 180) / Math.PI, // 角度
      distanceM: r,
    }
  }
}
