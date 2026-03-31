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
  /** 设置俯仰角上下限 (单位: 弧度 rad) data位长度8字节 */
  CMD_SET_PITCH_LIMIT: 0x14,
  /** 设置输出xyz data{bool:on/off} */
  CMD_SET_OUTPUT_XYZ: 0x15,
  /** 设置输出极坐标 data{bool:on/off} */
  CMD_SET_OUTPUT_POLAR: 0x16,
  /** 设置俯仰角零偏 data{float:零偏值} 单位:度 data位长度4字节 */
  CMD_SET_PITCH_OFFSET: 0x17,
  /** 设置速度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  CMD_SET_V_PID: 0x1E,
  /** 设置角度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  CMD_SET_A_PID: 0x1F,
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
  /** 读取俯仰角上下限 data位长度8字节 */
  CMD_READ_PITCH_LIMIT: 0x34,
  /** 是否是输出XYZ值 data{bool:on/off} */
  CMD_READ_OUTPUT_XYZ: 0x35,
  /** 是否是输出极坐标值 data{bool:on/off} */
  CMD_READ_OUTPUT_POLAR: 0x36,
  /** 读取俯仰角零偏 data{float:零偏值} 单位:度 data位长度4字节 */
  CMD_READ_PITCH_OFFSET: 0x37,
  /** 读取速度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  CMD_READ_V_PID: 0x3E,
  /** 读取角度环PID data{uint32 axis:pitch/yaw,float:P,float:I,float:D} data位长度16字节 */
  CMD_READ_A_PID: 0x3F,

  /** 控制上位机拍照（附带角度值回传）data{int:yaw,int:pitch}单位：弧度 */
  CMD_CTRL_CAMERA: 0x81,
  /** 自动拍摄任务完成 */
  CMD_CTRL_CAMERA_COMPLETE: 0x82,
  /** 开始自动拍摄任务 */
  CMD_CTRL_CAMERA_START: 0x83,
})

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
  /** 转动速度默认值 */
  SPEED: { pitch: 0.002, yaw: 0.00005 },
  /** 扫描时间默认值（秒） */
  SCAN_TIME: 250,
  /** 俯仰角上下限默认值（弧度） */
  PITCH_LIMIT: { upper: 0.8 * 3.14, lower: 0.1 * 3.14 },
  /** 输出格式默认值 */
  OUTPUT_FORMAT: {
    xyz: true,
    polar: false,
  },
  /** PID参数默认值 */
  PID: {
    loopType: 'V', // 速度环
    axis: 'x', // x轴
    p: 0,
    i: 0,
    d: 0
  },
  /** 俯仰角零偏默认值（度） */
  PITCH_OFFSET: 0.0
}
