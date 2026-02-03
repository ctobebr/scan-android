// todo
//  流式读取解析蓝牙收到的数据
//  用状态机对收到的数据帧按格式解析  // [Header: 2B] [Length: 1B] [Data: 6B] [Checksum: 1B]
//  校正每帧数据的完整性
//  将校正后的数据（小端序读取后（使用DataView不要手动位运算））解析成笛卡尔坐标系坐标


// 用状态机解析协议帧 // [Header: 2B] [Length: 1B] [Data: 6B] [Checksum: 1B] 先写成工厂函数再试试
export class parseBinaryToCartesian {
  constructor() {
    this.protocolState = {
      buffer: new Uint8Array(256),      // 滑动窗口缓冲区（找帧头用）
      bufferIndex: 0,                   // 当前写入位置
      expectingHeader: true,            // 当前是否在找帧头
      packetLength: 0,                  // 数据包长度（由协议定义）
      packetData: null,                 // 存放完整数据包
      packetDataIndex: 0                // 当前已接收的数据字节数
    }
  }
  // 验证数据包
 validateBinaryPacket(packetData) {
    if (!packetData || packetData.length < 1) return false

    const dataLength = packetData.length - 1
    let checksum = 0

    for (let i = 0; i < dataLength; i++) {
        checksum += packetData[i]
    }
    // 8位校验和方法
    //数据包长N 取数据包，前N-1个元素累计和的低八位，判断是否与数据包最后一位校验位相同
    return (checksum & 0xFF) === packetData[dataLength]
 }

  // 重置协议状态
  resetProtocolState() {
    this.protocolState.bufferIndex = 0
    this.protocolState.expectingHeader = true
    this.protocolState.packetLength = 0
    this.protocolState.packetData = null
    this.protocolState.packetDataIndex = 0
  }
  // 解析二进制点数据
   parseBinaryPointData(packetData) {
    const dataLength = packetData.length - 1
    const pointCount = Math.floor(dataLength / 6)

    if (pointCount * 6 !== dataLength) return
    // console.log('点计数pointCount：', pointCount)

    const points = []
    // 目前是单点，代码也适用后续可能的多点发送，一个点云6Byte
    for (let i = 0; i < pointCount; i++) {
        const startIndex = i * 6

        // 小端序读取有符号16位整数（角度）
        const yaw_int16 = (packetData[startIndex + 1] << 24 >> 16) | packetData[startIndex]
        const pitch_int16 = (packetData[startIndex + 3] << 24 >> 16) | packetData[startIndex + 2]

        // 小端序读取无符号16位整数（距离）
        const distance_u16 = (packetData[startIndex + 5] << 8) | packetData[startIndex + 4]

        // 转换为实际值（弧度 = int16_t / 1000.0）
        const yaw_rad = yaw_int16 / 1000.0
        const pitch_rad = -pitch_int16 / 1000.0 + 68 / 180 * 3.1415926
        const distance_m = distance_u16 / 100.0

        // 转换为笛卡尔坐标
        const point = this.sphericalToCartesian(pitch_rad, yaw_rad, distance_m, 1.0)
        points.push(point)
        //console.log(point)
    }
     return points
   }
  // pitch: 俯仰角（从水平面向上的角度，-π/2到π/2）
  // yaw: 方位角（在水平面上的角度，-π到π）
  // r: 距离（米）
  // intensity: 强度
  sphericalToCartesian(pitch, yaw, r, intensity) {
    // 计算笛卡尔坐标
    const x = (r * Math.cos(pitch) * Math.cos(yaw))
    const y = (r * Math.sin(pitch)) // 高度
    const z = (r * Math.cos(pitch) * Math.sin(yaw))

    // 返回点对象，包含原始数据方便调试
    return {
        x, y, z,
        pitch: pitch,           // 弧度
        yaw: yaw,               // 弧度
        distance: r * 1000,     // 毫米
        intensity: intensity,

        // 角度版本（方便查看）
        pitchDeg: pitch * 180 / Math.PI,
        yawDeg: yaw * 180 / Math.PI,
        distanceM: r
    }
  }
  /**
   * 输入原始蓝牙数据流（Uint8Array），返回解析出的点数组
   */
  parse(data) {
    const points = []
    const errors = []
    for (let i = 0; i < data.length; i++) {
        const byte = data[i]
        if (this.protocolState.expectingHeader) {
            // 寻找帧头
            this.protocolState.buffer[this.protocolState.bufferIndex++] = byte

            if (this.protocolState.bufferIndex >= 2) {
                if (this.protocolState.buffer[0] === 0xAA && this.protocolState.buffer[1] === 0x55) {
                    this.protocolState.expectingHeader = false
                    this.protocolState.bufferIndex = 0
                } else {
                    this.protocolState.buffer[0] = this.protocolState.buffer[1]
                    this.protocolState.bufferIndex = 1
                }
            }
        } else {
            // 收集数据包
            if (this.protocolState.packetData === null) {
                this.protocolState.packetLength = byte
                if (this.protocolState.packetLength % 6 !== 0) {
                    this.resetProtocolState()
                    // console.log('帧头后的第一个字节不是6的倍数，重新拿下一个字节，并且重新开始寻找帧头')
                    continue
                }
                this.protocolState.packetData = new Uint8Array(this.protocolState.packetLength + 1)
                this.protocolState.packetDataIndex = 0
                // console.log("开始收集数据包:", this.protocolState.packetLength, byte)
            } else if (this.protocolState.packetDataIndex < this.protocolState.packetLength + 1) {
                this.protocolState.packetData[this.protocolState.packetDataIndex++] = byte
                // console.log("继续收集数据包: ", this.protocolState.packetData, this.protocolState.packetDataIndex)
                // if(this.protocolState.packetDataIndex == 7) console.log('结束一段')
                // 数据包收集完成
                if (this.protocolState.packetDataIndex === this.protocolState.packetLength + 1) {
                  if (this.validateBinaryPacket(this.protocolState.packetData)) {
                    try {
                      const point = this.parseBinaryPointData(this.protocolState.packetData)
                      points.push(...point)
                    } catch (err) {
                      errors.push('解析失败: ' + err.message)
                      console.log('解析失败: ' + JSON.stringify(err.message))
                    }
                  } else {
                    errors.push('校验失败')
                    console.log('8位校验和校验失败')
                  }
                    // console.log("数据包收集完成: ", JSON.stringify(this.protocolState.packetData))
                    this.resetProtocolState()
                }
            }
        }
    }
    return { points, errors}
  }
}
