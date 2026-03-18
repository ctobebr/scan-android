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
/**
 * 协议命令字常量
 * 该文件集中定义了所有蓝牙协议相关的命令字，
 * 便于在项目各处统一引用，避免硬编码。
 * 分类说明：
 * - CONTROL_COMMANDS: 上位机发送给设备的控制指令
 * - DEVICE_DATA_COMMANDS: 设备发送给上位机的数据指令
 */
// ========== 协议常量 ==========
export const PROTOCOL_HEADER_HIGH = 0xaa
export const PROTOCOL_HEADER_LOW = 0x55
export const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
export const NUS_WRITE_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e' // 手机 → 设备
export const NUS_NOTIFY_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // 设备 → 手机
// 上位机 -> 设备 的命令
export const CONTROL_COMMANDS = Object.freeze({
  CMD_START: 0x01, // 开始自动任务 data:N/A
  CMD_STOP: 0x02, // 停止自动任务 data:N/A
  CMD_ROTATE_TO_TARGET: 0x03, // 转动到目标点

  CMD_SET_CALIB_PARAM: 0x11, // 设置标定参数 data （x，y，z）{float：毫米}  data位长度12字节
  CMD_SET_ROTATE_SPEED: 0x12, // 设置转动速度（俯仰轴速度，偏航轴速度）(float, 单位: rad/ms) data位长度8字节
  CMD_SET_SCAN_TIME: 0x13, // 设置扫描时间 data {uint16:秒} data位长度2字节
  CMD_SET_PITCH_LIMIT: 0x14, // 设置俯仰角上下限 (单位: 弧度 rad) data位长度8字节
  CMD_SET_OUTPUT_XYZ: 0x15, // 设置输出xyz data{bool:on/off}
  CMD_SET_OUTPUT_POLAR: 0x16, // 设置输出极坐标 data{bool:on/off}
  CMD_SET_V_PID: 0x1E,        // 设置速度环PID data{uint32 axis:x/y,float:P,float:I,float:D} data位长度16字节
  CMD_SET_A_PID: 0x1F,        // 设置角度环PID data{uint32 axis:x/y,float:P,float:I,float:D} data位长度16字节
})
// 设备 -> 上位机 的指令
export const DEVICE_DATA_COMMANDS = Object.freeze({
  CMD_OUTPUT_XYZ: 0xa1, // 输出XYZ值  - 用于接收点云数据
  CMD_OUTPUT_POLAR: 0xa2, // 输出极坐标值 - 用于接收点云数据

  CMD_READ_CALIB_PARAM: 0x31, // 读取标定参数 data位长度12字节
  CMD_READ_ROTATE_SPEED: 0x32, // 读取转动速度   data位长度8字节
  CMD_READ_SCAN_TIME: 0x33, // 读取扫描时间 data {uint16:秒}  data位长度2字节
  CMD_READ_PITCH_LIMIT: 0x34, // 读取俯仰角上下限 data位长度8字节
  CMD_READ_OUTPUT_XYZ: 0x35, // 是否是输出XYZ值 data{bool:on/off}
  CMD_READ_OUTPUT_POLAR: 0x36, // 是否是输出极坐标值 data{bool:on/off}
  CMD_READ_V_PID: 0x3E,        // 读取速度环PID data{uint32 axis:x/y,float:P,float:I,float:D} data位长度16字节
  CMD_READ_A_PID: 0x3F,        // 读取角度环PID data{uint32 axis:x/y,float:P,float:I,float:D} data位长度16字节

  CMD_CTRL_CAMERA: 0x81, // 控制上位机拍照（附带角度值回传）data{int:yaw,int:pitch}单位：弧度
  CMD_CTRL_CAMERA_COMPLETE: 0x82, // 自动拍摄任务完成
  CMD_CTRL_CAMERA_START: 0x83, // 开始自动拍摄任务
})

export const TEMP_PREFIX = 'a7f3c9d1-'


// 控制下位机参数默认值
export const SETTING_DEFAULT_VALUES = {
  CALIB: { x: -52.52, y: 10, z: 1 },
  SPEED: { pitch: 0.002, yaw: 0.00005 },
  SCAN_TIME: 250,
  PITCH_LIMIT: { upper: 0.8 * 3.14, lower: 0.1 * 3.14 },
  OUTPUT_FORMAT: {
    xyz: true,
    polar: false,
  },
  PID: {
    loopType: 'V', // 速度环
    axis: 'X', // X轴
    p: 0,
    i: 0,
    d: 0
  }
}

/**
 * 顶层点云数据目录的路径
 */
//文件夹路径
export const POINTCLOUD_ROOT = 'pointcloud'

