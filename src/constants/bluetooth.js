/**
 * @fileoverview 蓝牙协议常量
 *
 * 下位机代码是用memcpy 去直接拷贝数据区部分数据。而memcpy 是对CPU处理数据的直接映射
 * （如一般电脑CPU处理内存中的数据是小端序，所以使用memcpy之后，就是小端序去读取数据了），
 * 所以上位机读取数据区部分数据时需要用getFloat32（或者类似的getInt32）去小端序读取数据；
 * 上位机构建发送协议栈发送时也需要使用setFloat32（或者类似的seTInt32）去小端序设置数据
 *
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
 *
 * 点云数据帧 (CMD_OUTPUT_XYZ: 0xA1 / CMD_OUTPUT_POLAR: 0xA2):
 *   单帧包含 3 个点，每个点 6 字节(int16×3)，数据长度 N = 0x12 = 18 字节
 *   帧总长度 = 5 + 18 = 23 字节
 *   解析器通过 dataLength / 6 动态计算点数，兼容任意点数
 *
 * @module @/constants/bluetooth
 */

// ========== 协议帧头常量 ==========

/**
 * 协议帧头高字节
 * @constant {number}
 */
export const PROTOCOL_HEADER_HIGH = 0xaa

/**
 * 协议帧头低字节
 * @constant {number}
 */
export const PROTOCOL_HEADER_LOW = 0x55

// ========== Nordic UART Service (NUS) UUIDs ==========

/**
 * Nordic UART Service UUID
 * @constant {string}
 */
export const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'

/**
 * Nordic UART Write Characteristic UUID (手机 → 设备)
 * @constant {string}
 */
export const NUS_WRITE_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'

/**
 * Nordic UART Notify Characteristic UUID (设备 → 手机)
 * @constant {string}
 */
export const NUS_NOTIFY_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

// ========== 控制命令（上位机 → 设备）==========

/**
 * 控制命令枚举
 * @constant {Object}
 */
export const CONTROL_COMMANDS = Object.freeze({
  /** 开始自动任务 data:N/A */
  CMD_START: 0x01,
  /** 停止自动任务 data:N/A */
  CMD_STOP: 0x02,
  /** 转动到目标点 */
  CMD_ROTATE_TO_TARGET: 0x03,

  /** 设置标定参数 data（x，y，z）{float：毫米} data位长度12字节 */
  CMD_SET_CALIB_PARAM: 0x11,
  /** 设置转动速度（俯仰轴速度，偏航轴速度）(float, 单位: rad/ms) data位长度8字节 */
  CMD_SET_ROTATE_SPEED: 0x12,
  /** 设置扫描时间 data {uint16:秒} data位长度2字节 */
  CMD_SET_SCAN_TIME: 0x13,
  /** 设置俯仰角上下限 data{float:上限,float:下限} 单位:度 data位长度8字节 */
  CMD_SET_PITCH_LIMIT: 0x14,
  /** 设置输出xyz data{bool:on/off} */
  CMD_SET_OUTPUT_XYZ: 0x15,
  /** 设置输出极坐标 data{bool:on/off} */
  CMD_SET_OUTPUT_POLAR: 0x16,
  /** 设置俯仰角零偏 data{float:零偏值} 单位:度 data位长度4字节 */
  CMD_SET_PITCH_OFFSET: 0x17,
  /** 设置水平拍照角度步进 data{float:步进值} 单位:度 data位长度4字节 */
  CMD_SET_YAW_STEP: 0x18,
  /** 设置三个俯仰角目标 data{float:pitch0,float:pitch1,float:pitch2} 单位:度 data位长度12字节 */
  CMD_SET_PITCH_TARGETS: 0x19,
  // /** 设置速度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  // CMD_SET_V_PID: 0x1E,
  // /** 设置角度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  // CMD_SET_A_PID: 0x1F,
  /** 拍照准备就绪，通知下位机(设备)可以开始接收拍照指令(0x91) */
  CMD_CTRL_CAMERA_NEXT_PHOTO: 0x91,
})

// ========== 设备数据命令（设备 → 上位机）==========

/**
 * 设备数据命令枚举
 * @constant {Object}
 */
export const DEVICE_DATA_COMMANDS = Object.freeze({
  /** 输出XYZ值 - 用于接收点云数据 */
  CMD_OUTPUT_XYZ: 0xa1,
  /** 输出极坐标值 - 用于接收点云数据 */
  CMD_OUTPUT_POLAR: 0xa2,

  /** 读取标定参数 data位长度12字节 */
  CMD_READ_CALIB_PARAM: 0x31,
  /** 读取转动速度 data位长度8字节 */
  CMD_READ_ROTATE_SPEED: 0x32,
  /** 读取扫描时间 data {uint16:秒} data位长度2字节 */
  CMD_READ_SCAN_TIME: 0x33,
  /** 读取俯仰角上下限 data{float:上限,float:下限} 单位:度 data位长度8字节 */
  CMD_READ_PITCH_LIMIT: 0x34,
  /** 是否是输出XYZ值 data{bool:on/off} */
  CMD_READ_OUTPUT_XYZ: 0x35,
  /** 是否是输出极坐标值 data{bool:on/off} */
  CMD_READ_OUTPUT_POLAR: 0x36,
  /** 读取俯仰角零偏 data{float:零偏值} 单位:度 data位长度4字节 */
  CMD_READ_PITCH_OFFSET: 0x37,
  /** 读取水平拍照角度步进 data{float:步进值} 单位:度 data位长度4字节 */
  CMD_READ_YAW_STEP: 0x38,
  /** 读取三个俯仰角目标 data{float:pitch0,float:pitch1,float:pitch2} 单位:度 data位长度12字节 */
  CMD_READ_PITCH_TARGETS: 0x39,
  // /** 读取速度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  // CMD_READ_V_PID: 0x3E,
  // /** 读取角度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  // CMD_READ_A_PID: 0x3F,

  /** 控制上位机拍照（附带角度值回传）data{int:yaw,int:pitch}单位：弧度 */
  CMD_CTRL_CAMERA: 0x81,
  /** 自动拍摄任务完成 */
  CMD_CTRL_CAMERA_COMPLETE: 0x82,
  /** 开始自动拍摄任务 */
  CMD_CTRL_CAMERA_START: 0x83,
})

// ========== ACK 确认命令（双向）==========

/**
 * ACK 确认命令枚举（双向：上位机和下位机均可发送/接收）
 * @constant {Object}
 */
export const ACK_COMMANDS = Object.freeze({
  /** ACK 确认帧 data{uint8:被确认的命令字} */
  CMD_ACK: 0xe0,
})

/**
 * ACK 超时时间（毫秒）
 * BLE 连接间隔 15-50ms，300ms 提供 3-10 倍往返余量，匹配主流 BLE 应用实践
 * @constant {number}
 */
export const ACK_TIMEOUT_MS = 300

/**
 * ACK 最大重传次数（共 3 次尝试）
 * @constant {number}
 */
export const ACK_MAX_RETRY = 2

// ========== 协议限制常量 ==========

/**
 * 最大数据长度（字节）
 * @constant {number}
 */
export const MAX_DATA_LENGTH = 128

/**
 * 最大数据包大小（字节）
 * @constant {number}
 */
export const MAX_PACKET_SIZE = 512

// ========== 控制参数默认值 ==========

/**
 * 控制参数默认值
 * @constant {Object}
 */
export const SETTING_DEFAULT_VALUES = {
  /** 标定参数默认值 */
  CALIB: { x: -52.52, y: 10, z: 1 },
  /** 转动速度默认值（单位：rpm） */
  SPEED: { pitch: 16.7, yaw: 2.9 },
  /** 扫描时间默认值（秒） */
  SCAN_TIME: 250,
  /** 俯仰角上下限默认值（度）- 上限为仰角170°，下限为俯角-70° */
  PITCH_LIMIT: { upper: 170, lower: -70 },
  /** 输出格式默认值 */
  OUTPUT_FORMAT: {
    xyz: true,
    polar: false,
  },
  // /** PID参数默认值 */
  // PID: {
  //   loopType: 'V', // 速度环
  //   axis: 'x', // x轴
  //   p: 0,
  //   i: 0,
  //   d: 0
  // },
  /** 俯仰角零偏默认值（度） */
  PITCH_OFFSET: 0.0,
  /** 水平拍照角度步进默认值（度） */
  YAW_STEP: 30.0,
  /** 三个俯仰角目标默认值（度） */
  PITCH_TARGETS: { pitch0: -42, pitch1: -72, pitch2: -102 }
}
