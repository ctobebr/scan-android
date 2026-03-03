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
import { CONTROL_COMMANDS, DEVICE_DATA_COMMANDS } from '@/constants/protocolCommands'
// import { bluetoothService } from '@/services/bluetoothService'

// helper to convert Uint8Array to hex string
function uint8ArrayToHex(arr) {
  if (!arr) return ''
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export class parseBleData {
  constructor(options = {}) {
    this.options = options || {}
    this.protocolState = {
      buffer: new Uint8Array(512), // 增大缓冲区
      bufferIndex: 0,
      frameState: 'WAITING_HEADER', // 状态：WAITING_HEADER, READING_CMD, READING_LEN, READING_DATA, READING_CHECKSUM
      cmd: 0,
      dataLength: 0,
      dataIndex: 0,
      packetData: null,
      checksum: 0, // 校验和需要包含 Cmd, Len, Data
      accumulatedPoints: [], // 用于累积解析出的点  目前单帧单点并没有累积，但是如果后续有单帧多点目前的程序是支持累积的
      photoSession: {
        active: false,
        previewStarted: false,
      },
    }
    this.cameraReadyPromise = null

    this.isProcessingPhoto = false // 标记是否正在处理拍照
    this.pendingEndRequests = [] // 存储等待处理的结束请求
    this.photoRequestQueue = [] // queue for take-photo commands received while busy
    // debug counters
    this.cameraCmdCount = 0
    this.cameraCallbackCount = 0
    this.enableDebugLogging = !!options.enableDebug
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
   * 在这里根据命令字处理下位机传过来的数据包（开始和结束是上位机传给下位机不在此处）
   * 处理协议数据包
   * @param {number} cmd - 命令字节 (0xA1: CMD_POINT_DATA)
   * @param {Uint8Array} data - 数据区内容
   */
  handleProtocolPacket(cmd, data) {
    // if (typeof cmd === 'number') {
    //   console.log('cmd::', cmd.toString(16).padStart(2, '0'))
    // } else {
    //   console.log('cmd::', cmd)
    // }
    // 使用对象映射查找处理器
    const commandHandlers = {
      // [CONTROL_COMMANDS.CMD_START]: this._handleStart,
      [CONTROL_COMMANDS.CMD_STOP]: this._handleStop,

      [DEVICE_DATA_COMMANDS.CMD_CTRL_CAMERA_START]: this._handleStartTakePhoto,
      [DEVICE_DATA_COMMANDS.CMD_CTRL_CAMERA_COMPLETE]: this._handleEndTakePhoto,

      [DEVICE_DATA_COMMANDS.CMD_CTRL_CAMERA]: this._handleTakePhoto,
      [DEVICE_DATA_COMMANDS.CMD_OUTPUT_XYZ]: this._handlePointData,
      [DEVICE_DATA_COMMANDS.CMD_OUTPUT_POLAR]: this._handleRawPointData,
      [DEVICE_DATA_COMMANDS.CMD_READ_CALIB_PARAM]: this._handleReadCalibParam,
      [DEVICE_DATA_COMMANDS.CMD_READ_ROTATE_SPEED]: this._handleReadRotateSpeed,
      [DEVICE_DATA_COMMANDS.CMD_READ_SCAN_TIME]: this._handleReadScanTime,
      [DEVICE_DATA_COMMANDS.CMD_READ_PITCH_LIMIT]: this._handleReadPitchLimit,
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
      console.log(` Received unknown command: 0x ${cmd.toString(16).padStart(2, '0')}`)
    }
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
        // console.log('parseBinaryPointDataXYZ', '处理直角系坐标结束')
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
        1.0,
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
   * 4. parse() 返回累积的点，并清空内部缓冲==============目前因为每帧只有一个点所以不会累积点，都是一个点返回，代码对于后续一帧多点具有可扩展性
   *
   * bluetooth.js 中实现累积渲染：
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
              if (
                this.enableDebugLogging &&
                this.protocolState.cmd === DEVICE_DATA_COMMANDS.CMD_CTRL_CAMERA
              ) {
                this.cameraCmdCount++
                console.log(
                  `[Parser][${new Date().toISOString()}] camera cmd #${this.cameraCmdCount}, data=${uint8ArrayToHex(
                    this.protocolState.packetData,
                  )}`,
                )
              }
              this.handleProtocolPacket(this.protocolState.cmd, this.protocolState.packetData)
            } catch (err) {
              let cmdStr =
                typeof this.protocolState.cmd === 'number'
                  ? '0x' + this.protocolState.cmd.toString(16)
                  : String(this.protocolState.cmd)
              const errMsg = `[Parser] Failed to handle packet (cmd=${cmdStr}): ${err && err.message ? err.message : err}`
              errors.push(errMsg)
              console.error(errMsg, err)
            }
          } else {
            let calcStr =
              typeof (this.protocolState.checksum & 0xff) === 'number'
                ? (this.protocolState.checksum & 0xff).toString(16)
                : String(this.protocolState.checksum & 0xff)
            let byteStr = typeof byte === 'number' ? byte.toString(16) : String(byte)
            const errMsg = `[Parser] Checksum mismatch: calculated=0x${calcStr}, received=0x${byteStr}`
            errors.push(errMsg)
            console.warn(errMsg)
          }
          // 无论校验成功与否，都重置状态机
          this.resetProtocolState()
          break
      }
    }

    // 返回当前批次内累积的点（目前只有一个点）
    // 这样 bluetooth.js 可以直接使用 parse() 的返回值
    const points = this.protocolState.accumulatedPoints.slice()
    this.protocolState.accumulatedPoints = [] // 清空内部缓冲

    return { points, errors }
  }

  // _handleStart(data) {
  //   // TODO: 实现启动扫描逻辑
  //   console.log('_handleStart成功')
  //   console.log(' CMD_START (0x' + CONTROL_COMMANDS.CMD_START.toString(16) + ') received')
  // }

  _handleStop(data) {
    // TODO: 实现停止扫描逻辑
    console.log(' CMD_STOP (0x' + CONTROL_COMMANDS.CMD_STOP.toString(16) + ') received')
  }

  _handleStartTakePhoto() {
    // 收到开始拍照指令：进入拍照预览并让调用方启动预览
    if (this.protocolState.photoSession.active && this.protocolState.photoSession.previewStarted) {
      return
    }
    this.protocolState.photoSession.active = true
    this.protocolState.photoSession.previewStarted = false

    if (this.options.onStartPreview) {
      this.cameraReadyPromise = Promise.resolve()
        .then(() => this.options.onStartPreview())
        .then((ok) => {
          if (this.protocolState.photoSession.active) {
            this.protocolState.photoSession.previewStarted = !!ok
            if (ok) console.log('相机预览已通过回调启动')
          }
          return ok
        })
        .catch((err) => {
          console.error('onStartPreview 回调抛错:', err)
          this.protocolState.photoSession.previewStarted = false
          throw err
        })
    } else {
      this.cameraReadyPromise = Promise.resolve(false)
    }
    console.log('_handleStartTakePhoto  over')
  }

  async _handleTakePhoto(data) {
    if (this.enableDebugLogging) {
      console.log(
        `[Camera][${new Date().toISOString()}] _handleTakePhoto start data=${uint8ArrayToHex(data)}`,
      )
    }
    console.log('CMD_CTRL_CAMERA received')

    // --- 将拍照请求加入处理流程 ---
    return new Promise((resolve, reject) => {
      // if already processing, enqueue for later
      if (this.isProcessingPhoto) {
        if (this.enableDebugLogging) {
          console.log(
            `[Camera][${new Date().toISOString()}] photo command queued (busy). queue_length=${this.photoRequestQueue.length}`,
          )
        }
        this.photoRequestQueue.push({ data, resolve, reject })
        return
      }
      const task = async () => {
        try {
          // 设置处理标志
          this.isProcessingPhoto = true

          const meta = this.parseBinaryTakePhotoData(data)
          if (!meta) {
            console.warn('_handleTakePhoto: 无效的拍照数据')
            return
          }

          const currentBatchCounter = this.options.getDataBatchCounter
            ? this.options.getDataBatchCounter()
            : 'unknown'

          const yawStr = meta.yawDeg !== undefined ? meta.yawDeg.toFixed(2) : meta.yawRaw
          const pitchStr = meta.pitchDeg !== undefined ? meta.pitchDeg.toFixed(2) : meta.pitchRaw
          const fileBaseName = `${currentBatchCounter}_${pitchStr}_${yawStr}`

          if (!this.protocolState.photoSession.active) {
            console.warn('收到拍照命令但未处于拍照会话，自动进入预览')
            this._handleStartTakePhoto()
          }

          let cameraReady = false
          if (this.cameraReadyPromise) {
            try {
              cameraReady = await this.cameraReadyPromise
            } catch (e) {
              console.warn('等待相机就绪时出错:', e)
              cameraReady = false
            }
          }

          if (!cameraReady) {
            console.warn('相机未就绪，跳过本次拍照')
            return
          }

          if (this.options.onTakePhoto && typeof this.options.onTakePhoto === 'function') {
            if (this.enableDebugLogging) {
              this.cameraCallbackCount++
              console.log(
                `[Camera][${new Date().toISOString()}] invoking onTakePhoto callback. cmdCount=${this.cameraCmdCount}, callbackCount=${this.cameraCallbackCount}`,
              )
            }
            console.log('即将执行 onTakePhoto 回调')
            await this.options.onTakePhoto({ fileBaseName, meta })
            console.log('onTakePhoto 回调执行完成')
          }
        } catch (err) {
          console.error('HandleTakePhoto 内部发生错误:', err)
        } finally {
          // 清理处理标志
          this.isProcessingPhoto = false
          // 尝试处理挂起的结束请求
          this._tryProcessPendingEndRequests()
          if (this.enableDebugLogging) {
            console.log(
              `[Camera][${new Date().toISOString()}] _handleTakePhoto finally counts: cmd=${this.cameraCmdCount}, callbacks=${this.cameraCallbackCount}`,
            )
          }
          resolve() // 完成当前任务
          // check queue for more requests
          if (this.photoRequestQueue.length > 0) {
            const next = this.photoRequestQueue.shift()
            // fire next command asynchronously
            this._handleTakePhoto(next.data).then(next.resolve).catch(next.reject)
          }
        }
      }

      // 如果正在处理，等待；否则立即执行
      if (this.isProcessingPhoto) {
        console.log('拍照正在进行，将此请求加入等待队列')
        resolve()
      } else {
        task() // 立即执行
      }
    })
  }
  _handleEndTakePhoto() {
    console.log('收到结束拍照请求')

    // --- 检查是否有拍照正在进行 ---
    if (this.isProcessingPhoto) {
      console.log('拍照正在进行，将结束请求加入等待队列')
      return new Promise((resolve) => {
        this.pendingEndRequests.push(resolve) // 将 resolve 函数存起来，以便稍后调用
      })
    }

    // 如果没有拍照在进行，则立即执行结束逻辑
    this._executeEndTakePhotoLogic()
  }
  _executeEndTakePhotoLogic() {
    // --- 执行真正的结束逻辑 ---
    try {
      this.protocolState.photoSession.active = false
      if (this.protocolState.photoSession.previewStarted) {
        if (this.options.onEndPreview) {
          try {
            this.options.onEndPreview()
          } catch (e) {
            console.warn('onEndPreview 回调失败', e)
          }
        }
        this.protocolState.photoSession.previewStarted = false
      }
      this.cameraReadyPromise = null
      console.log('[_handleEndTakePhoto  结束拍照退出相机预览页面')

      if (
        this.options.onPhotoSessionEnded &&
        typeof this.options.onPhotoSessionEnded === 'function'
      ) {
        try {
          this.options.onPhotoSessionEnded()
        } catch (callbackErr) {
          console.error('onPhotoSessionEnded callback failed:', callbackErr)
        }
      }
    } catch (err) {
      console.error(' _handleEndTakePhoto 错误:', err)
    }
  }
  _tryProcessPendingEndRequests() {
    // 当一个拍照任务完成后，检查是否有挂起的结束请求
    if (!this.isProcessingPhoto && this.pendingEndRequests.length > 0) {
      console.log('处理挂起的结束请求')
      // 取出并执行一个挂起的结束请求
      const resolvePending = this.pendingEndRequests.shift()
      this._executeEndTakePhotoLogic() // 执行逻辑
      resolvePending() // 解决挂起的 Promise
    }
  }
  // 解析下位机发送的拍照数据（uint16 小端序）
  parseBinaryTakePhotoData(packetData) {
    if (!packetData || packetData.length < 4) {
      console.warn('[Parser] parseBinaryTakePhotoData: 数据长度不足')
      return null
    }
    // 创建 DataView（默认大端，需显式指定小端）
    const view = new DataView(packetData.buffer, packetData.byteOffset, packetData.byteLength)

    // 读取两个小端序的 int16（有符号 16 位整数）
    const yawRaw = view.getInt16(0, true) // true 表示小端序
    const pitchRaw = view.getInt16(2, true)

    // 按照既有代码惯例，下位机传角度为弧度*1000（int16/int16），这里假设为弧度*1000
    const yawRad = yawRaw / 1000.0
    const pitchRad = pitchRaw / 1000.0

    const yawDeg = (yawRad * 180) / Math.PI
    const pitchDeg = (pitchRad * 180) / Math.PI

    return {
      yawRaw,
      pitchRaw,
      yawRad,
      pitchRad,
      yawDeg,
      pitchDeg,
    }
  }
  // _handleSetSpeed(data) {
  //   // TODO: 实现设置速度逻辑
  //   console.log(
  //     ' CMD_SET_SPEED (0x' + CONTROL_COMMANDS.CMD_SET_SPEED.toString(16) + ') received',
  //   )
  // }

  // _handleGetPos(data) {
  //   // TODO: 实现查询位置逻辑
  //   console.log(
  //     ' CMD_GET_POS (0x' + CONTROL_COMMANDS.CMD_GET_POS.toString(16) + ') received',
  //   )
  // }

  // _handleSetHome(data) {
  //   // TODO: 实现设置零点逻辑
  //   console.log(
  //     ' CMD_SET_HOME (0x' + CONTROL_COMMANDS.CMD_SET_HOME.toString(16) + ') received',
  //   )
  // }

  // _handleGetStatus(data) {
  //   // TODO: 实现查询状态逻辑
  //   console.log(
  //     ' CMD_GET_STATUS (0x' +
  //       CONTROL_COMMANDS.CMD_GET_STATUS.toString(16) +
  //       ') received',
  //   )
  // }

  // _handleSetAccel(data) {
  //   // TODO: 实现设置加速度逻辑
  //   console.log(
  //     ' CMD_SET_ACCEL (0x' + CONTROL_COMMANDS.CMD_SET_ACCEL.toString(16) + ') received',
  //   )
  // }
  // 传递的xyz坐标是毫米单位
  _handlePointData(data) {
    // 如果处于拍照会话，忽略点云数据
    if (this.protocolState.photoSession && this.protocolState.photoSession.active) {
      console.log('处于拍照会话，忽略点云数据')
      return
    }
    if (data && data.length > 0) {
      // 数据长度必须是 6 的倍数（每个点占 6 字节）
      if (data.length % 6 === 0) {
        // 解析笛卡尔坐标 (XYZ) 数据
        const points = this.parseBinaryPointDataXYZ(data)
        if (points && points.length > 0) {
          this.protocolState.accumulatedPoints.push(...points)
          // if (process.env.NODE_ENV === 'development') {
          // console.log(` Parsed ${points.length} points from CMD_POINT_DATA`)
        } else {
          console.warn(
            ` CMD_POINT_DATA (0x ${CONTROL_COMMANDS.CMD_OUTPUT_XYZ.toString(16)}) has invalid data length:  ${data.length}. Expected multiple of 6.`,
          )
        }
      }
    }
  }
  _handleRawPointData(data) {
    // 如果处于拍照会话，忽略点云数据
    if (this.protocolState.photoSession && this.protocolState.photoSession.active) {
      console.log('处于拍照会话，忽略点云数据')
      return
    }
    if (data && data.length > 0) {
      // 数据长度必须是 6 的倍数（每个点占 6 字节）
      if (data.length % 6 === 0) {
        // 解析笛卡尔坐标 (XYZ) 数据
        const points = this.parseBinaryPointData(data)
        if (points && points.length > 0) {
          this.protocolState.accumulatedPoints.push(...points)
          // if (process.env.NODE_ENV === 'development') {
          // console.log(` Parsed ${points.length} points from CMD_POINT_DATA`)
        } else {
          console.warn(
            ` CMD_POINT_DATA (0x ${CONTROL_COMMANDS.CMD_OUTPUT_XYZ.toString(16)}) has invalid data length:  ${data.length}. Expected multiple of 6.`,
          )
        }
      }
    }
  }
  /**
   * 处理读取标定参数的响应
   * @param {Uint8Array} data - 从蓝牙接收到的原始数据（实际是Uint8Array）
   */
  _handleReadCalibParam(data) {
    if (data.byteLength !== 12) {
      console.warn('标定参数数据长度错误，期望 12 字节，实际:', data.byteLength)
      return
    }
    // 统一使用 data.buffer, data.byteOffset
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const x = view.getFloat32(0, true)
    const y = view.getFloat32(4, true)
    const z = view.getFloat32(8, true)

    console.log('✅ 收到下位机标定参数响应: X轴_mm=' + x + ', Y轴_mm=' + y + ', Z轴_mm=' + z)
    if (this.options.onCalibParamResponse) {
      this.options.onCalibParamResponse({ x, y, z })
    }
  }

  /**
   * 处理读取转动速度的响应
   * @param {Uint8Array} data - 从蓝牙接收到的原始数据
   */
  _handleReadRotateSpeed(data) {
    if (data.byteLength !== 8) {
      console.warn('转动速度数据长度错误，期望 8 字节，实际:', data.byteLength)
      return
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const pitchSpeed = view.getFloat32(0, true)
    const yawSpeed = view.getFloat32(4, true)

    console.log(
      '✅ 收到下位机转动速度响应: 俯仰轴速度_rad_ms=' +
        pitchSpeed +
        ', 偏航轴速度_rad_ms=' +
        yawSpeed,
    )
    if (this.options.onRotateSpeedResponse) {
      this.options.onRotateSpeedResponse({ pitchSpeed, yawSpeed })
    }
  }

  /**
   * 处理读取扫描时间的响应
   * @param {Uint8Array} data - 从蓝牙接收到的原始数据
   */
  _handleReadScanTime(data) {
    console.log('_handleReadScanTime===', data.byteLength)
    if (data.byteLength !== 2) {
      console.warn('扫描时间数据长度错误，期望 2 字节，实际:', data.byteLength)
      return
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const seconds = view.getUint16(0, true)

    console.log('✅ 收到下位机扫描时间响应: 扫描时间_秒=' + seconds)
    if (this.options.onScanTimeResponse) {
      this.options.onScanTimeResponse({ seconds })
    }
  }

  /**
   * 处理读取俯仰角上下限的响应
   * @param {Uint8Array} data - 从蓝牙接收到的原始数据
   */
  _handleReadPitchLimit(data) {
    if (data.byteLength !== 8) {
      console.warn('俯仰角限制数据长度错误，期望 8 字节，实际:', data.byteLength)
      return
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const upperLimitRad = view.getFloat32(0, true)
    const lowerLimitRad = view.getFloat32(4, true)

    console.log(
      '✅ 收到下位机俯仰角限制响应: 俯仰角上限_rad=' +
        upperLimitRad +
        ', 俯仰角下限_rad=' +
        lowerLimitRad,
    )
    if (this.options.onPitchLimitResponse) {
      this.options.onPitchLimitResponse({ upperLimitRad, lowerLimitRad })
    }
  }
  // 将原始数据输入该函数 + dx dy dz 做一下校正保存
  sphericalToCartesian1(pitch, yaw, r, intensity, dx = 0, dy = 0, dz = 0) {
    // 理想点坐标
    const x = r * Math.cos(pitch) * Math.cos(yaw)
    const y = r * Math.sin(pitch) // 高度方向
    const z = r * Math.cos(pitch) * Math.sin(yaw)

    // 偏移量旋转补偿
    // 先绕 x 轴（pitch），再绕 y 轴（yaw）
    const cosPitch = Math.cos(pitch)
    const sinPitch = Math.sin(pitch)
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)

    // 偏移量在全局坐标系下的分量
    const dxPrime = cosYaw * dx + sinYaw * cosPitch * dz + sinYaw * sinPitch * dy
    const dyPrime = -sinPitch * dz + cosPitch * dy
    const dzPrime = -sinYaw * dx + cosYaw * cosPitch * dz + cosYaw * sinPitch * dy

    // 修正后的点坐标
    const xCorrected = x + dxPrime
    const yCorrected = y + dyPrime
    const zCorrected = z + dzPrime

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
