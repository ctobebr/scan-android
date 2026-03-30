import { CameraPreview } from '@capacitor-community/camera-preview'
import { Filesystem, Directory } from '@capacitor/filesystem'
// 导入全局日志工具
// 原因：统一日志管理，后续逐步替换 console.log
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger } from '@/utils/logger'

// 创建相机辅助专用日志记录器
const logger = createLogger('CameraHelper')

let isPreviewRunning = false

const cameraHelper = {
  async startPreview(parentId = 'cameraPreview') {
    if (isPreviewRunning) {
      logger.info('预览已在运行，跳过启动')
      return true
    }
    try {
      await CameraPreview.start({
        position: 'rear',
        width: window.screen.width,
        height: window.screen.height,
        parent: parentId,
        toBack: false,
        disableAudio: true,
      })
      isPreviewRunning = true
      return true
    } catch (err) {
      logger.error('CameraPreview.start failed', err)
      isPreviewRunning = false
      return false
    }
  },

  async stopPreview() {
    if (!isPreviewRunning) {
      logger.info('相机未运行，无需停止')
      return true
    }
    try {
      await CameraPreview.stop()
      isPreviewRunning = false
      logger.info('相机预览已停止')
      return true
    } catch (err) {
      logger.warn('CameraPreview.stop failed', err)
      isPreviewRunning = false
      return false
    }
  },

  /**
   * 拍照并返回结果，文件保存在后台执行
   * 确保拍照操作的实时性，避免文件写入阻塞主线程
   * @param {string} fileBaseName - 文件名（不含扩展名）
   * @param {string} targetDir - 目标目录路径（相对于Documents）
   * @returns {Promise<{fileName: string, filePath: string}>} 照片信息
   */
  async captureAndSave(fileBaseName, targetDir) {
    if (!isPreviewRunning) {
      throw new Error('无法拍照：相机预览未启动')
    }

    const fileName = `${fileBaseName}.jpg`
    const filePath = `${targetDir}/${fileName}`

    try {
      // logger.info('====CameraPreview.capture')
      if (CameraPreview && typeof CameraPreview.capture === 'function') {
        // 1. 立即捕获照片（实时性关键）
        const res = await CameraPreview.capture({ quality: 90 })
        let base64 = res?.value || res?.data || ''
        if (!base64) {
          throw new Error('CameraPreview.capture 未返回数据')
        }
        if (base64.indexOf(',') !== -1) {
          base64 = base64.split(',')[1]
        }

        // 1. 同步创建目录和.nomedia文件（防止照片被系统相册扫描）
        try {
          // 确保目录存在（忽略已存在错误）
          try {
            await Filesystem.mkdir({
              path: targetDir,
              directory: Directory.Documents,
              recursive: true,
            })
          } catch (mkdirErr) {
            // 忽略目录已存在的错误，更宽松的错误处理
            const errorMessage = String(mkdirErr.message || mkdirErr)
            if (!errorMessage.toLowerCase().includes('exist')) {
              throw mkdirErr
            }
          }

          // 创建 .nomedia 标记文件（在保存照片前创建，防止被系统相册扫描）
          try {
            await Filesystem.writeFile({
              path: `${targetDir}/.nomedia`,
              data: '',
              directory: Directory.Documents,
            })
            // logger.info('.nomedia标记已创建', { targetDir })
          } catch (nomediaErr) {
            // .nomedia创建失败不是致命错误，继续保存照片
            logger.warn('.nomedia标记创建失败（可忽略）', nomediaErr)
          }
        } catch (err) {
          logger.warn('创建目录或.nomedia文件失败', err)
        }

        // 2. 后台异步保存文件（不阻塞主线程）
        setTimeout(async () => {
          try {
            // 写入文件
            await Filesystem.writeFile({
              path: filePath,
              data: base64,
              directory: Directory.Documents,
            })
            logger.info('照片已后台保存', { filePath })
          } catch (err) {
            logger.error('后台保存照片失败', err)
          }
        }, 0)
        // 3. 立即返回结果，确保拍照实时性
        // logger.info('照片已捕获，正在后台保存')
        return { fileName, filePath }
      }
    } catch (err) {
      logger.warn('使用 CameraPreview.capture 拍照失败', err)
      throw err
    }
  },

  isRunning() {
    return isPreviewRunning
  },
}

export default cameraHelper
