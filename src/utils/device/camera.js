import { CameraPreview } from '@capacitor-community/camera-preview'
import { Filesystem, Directory } from '@capacitor/filesystem'
// 导入全局日志工具
// 原因：统一日志管理，后续逐步替换 console.log
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger } from '@/utils/logger'
import { dispatchFolderUpdate } from '@/services/storage/pointCloud'

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
        focusMode: 'continuous', // 连续自动对焦：云台转动后画面变化，CAF持续搜索合焦
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
        // const res = await CameraPreview.capture({ quality: 90 })

        // 高清 宽高比 16:9  网络传输、屏幕适配、节省存储=========实际1920*1080
        // const res = await CameraPreview.capture({
        //   quality: 90,
        //   width: 1920, // 限制宽度
        //   height: 1080, // 限制高度
        // })
        // 2k 宽高比 16:9  高清显示、打印小尺寸照片=========实际3840*1760
        // const res = await CameraPreview.capture({
        //   quality: 90,
        //   width: 2560, // 限制宽度
        //   height: 1440, // 限制高度
        // })
        // 全高清+ 	 宽高比 4:3  常规拍照、平衡画质与文件大小=========实际3264*2448
        // const res = await CameraPreview.capture({
        //   quality: 90,
        //   width: 3264, // 限制宽度
        //   height: 2448, // 限制高度
        // })
        // 等待自动对焦合焦：云台转动后CAF需要重新搜索对焦，
        // 立即capture可能捕获到搜索中的画面导致糊片
        await new Promise((r) => setTimeout(r, 300))

        // 2K 宽高比 16:9 高清显示、打印小尺寸照片=========实际2560*1440
        // 降低分辨率：对焦精度要求更低、快门时间更短，减少糊片概率
        const res = await CameraPreview.capture({
          quality: 90,
          width: 2560, // 限制宽度
          height: 1440, // 限制高度
        })
        let base64 = res?.value || res?.data || ''
        if (!base64) {
          throw new Error('CameraPreview.capture 未返回数据')
        }
        if (base64.indexOf(',') !== -1) {
          base64 = base64.split(',')[1]
        }

        // 1. 同步创建目录（如果不存在）
        try {
          // 先检查目录是否存在
          await Filesystem.stat({
            path: targetDir,
            directory: Directory.External,
          })
        } catch (err) {
          // 目录不存在，创建它
          try {
            await Filesystem.mkdir({
              path: targetDir,
              directory: Directory.External,
              recursive: true,
            })
          } catch (mkdirErr) {
            logger.warn('创建目录失败', mkdirErr)
          }
        }

        // 2. 后台异步保存文件
        setTimeout(async () => {
          try {
            // 写入文件
            await Filesystem.writeFile({
              path: filePath,
              data: base64,
              directory: Directory.External,
            })
            // logger.info('照片已后台保存', { filePath })

            // 检查是否是第一张照片（文件名以 ====1.jpg 结尾）
            const isFirstPhoto = filePath.endsWith('====1.jpg')
            if (isFirstPhoto) {
              // 触发文件夹更新事件，通知列表刷新缩略图
              const folderName = filePath.split('/')[1]
              if (folderName) {
                dispatchFolderUpdate('partial_update', {
                  action: 'folder_refreshed',
                  folders: [folderName],
                })
                logger.debug('第一张照片保存后触发文件夹刷新', { folderName })
              }
            }
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
