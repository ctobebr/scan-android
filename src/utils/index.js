/**
 * @fileoverview Utils 统一入口
 *
 * 统一导出所有工具模块，提供便捷的导入方式。
 *
 * 注意：为了避免循环依赖，本文件只导出不会反向依赖的模块。
 * logger 等基础工具请直接从 '@/utils/logger' 导入。
 *
 * @module @/utils
 * @version 1.2.0
 * @since 2026-03-24
 */

// ========== 基础工具（无依赖）==========
// 这些模块不依赖其他 utils 模块，可以安全导出

// 日志工具 - 基础工具，其他模块都依赖它
// 注意：请直接从 '@/utils/logger' 导入，避免循环依赖
export {
  logger,
  createLogger,
  LogLevel,
  configureLogger,
  getLoggerConfig,
  resetLoggerConfig,
} from './logger'

// ========== 设备相关工具 ==========
// 这些模块可能依赖 logger，请直接从子模块导入
// export * as camera from './device/camera'
// export * as screen from './device/screen'
// export * as immersive from './device/immersive'

// ========== 格式化工具 ==========
// 这些模块可能依赖 logger，请直接从子模块导入
// export * as bleProtocol from './format/bleProtocol'
// export * as sessionId from './format/sessionId'

// ========== UI 工具 ==========
// export * as toast from './ui/toast'

// ========== 存储相关工具 ==========
// export * as path from './storage/path'
// export * as validate from './storage/validate'

// ========== 使用指南 ==========
/**
 * 推荐导入方式：
 *
 * 1. 日志工具（直接从 logger 导入）：
 *    import { createLogger } from '@/utils/logger'
 *
 * 2. 设备工具（直接从子模块导入）：
 *    import cameraHelper from '@/utils/device/camera'
 *    import { lockToPortrait } from '@/utils/device/screen'
 *    import { setImmersive } from '@/utils/device/immersive'
 *
 * 3. 格式化工具（直接从子模块导入）：
 *    import { parseBleData } from '@/utils/format/bleProtocol'
 *    import { generateOptimizedSessionId } from '@/utils/format/sessionId'
 *
 * 4. 存储工具（直接从子模块导入）：
 *    import { sessionFolder, batchFolder } from '@/utils/storage/path'
 *    import { validateSessionId } from '@/utils/storage/validate'
 *
 * 5. UI 工具（直接从子模块导入）：
 *    import { showToast } from '@/utils/ui/toast'
 *
 * 不推荐（可能导致循环依赖）：
 *    import { bleProtocol } from '@/utils'  // ❌ 不推荐
 *    bleProtocol.parseBleData(...)           // ❌ 不推荐
 */
