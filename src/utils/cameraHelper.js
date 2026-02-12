import { CameraPreview } from '@capacitor-community/camera-preview'
// import { Filesystem, Directory } from '@capacitor/filesystem' // 不再需要直接写入
import { bluetoothService } from '@/services/bluetoothService'

let isPreviewRunning = false

const cameraHelper = {
  async startPreview(parentId = 'cameraPreview') {
    if (isPreviewRunning) {
      console.log('[CameraHelper] 预览已在运行，跳过启动')
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
      console.error('CameraPreview.start failed', err)
      isPreviewRunning = false
      return false
    }
  },

  async stopPreview() {
    if (!isPreviewRunning) {
      console.log('[CameraHelper] 相机未运行，无需停止')
      return true // 视为成功
    }
    try {
      await CameraPreview.stop()
      isPreviewRunning = false
      console.log('[CameraHelper] 相机预览已停止')
      return true
    } catch (err) {
      console.warn('CameraPreview.stop failed', err)
      isPreviewRunning = false
      return false
    }
  },

  /**
   * 拍照并返回 base64 数据，fileBaseName 不带扩展名
   * 返回 { fileName, base64Data }
   * 照片不会立即写入磁盘，而是由保存函数统一处理
   */
  async captureAndSave(fileBaseName) {
    if (!isPreviewRunning) {
      throw new Error('无法拍照：相机预览未启动')
    }

    const fileName = `${fileBaseName}.jpg`

    // 优先使用 CameraPreview.capture
    try {
      if (CameraPreview && typeof CameraPreview.capture === 'function') {
        const res = await CameraPreview.capture({ quality: 90 })
        let base64 = res?.value || res?.data || ''
        if (!base64) {
          throw new Error('CameraPreview.capture 未返回数据')
        }
        if (base64.indexOf(',') !== -1) {
          base64 = base64.split(',')[1]
        }
        // 不再写入 CameraPhotos 目录，直接返回 base64
        return { fileName, base64Data: base64 }
      }
    } catch (err) {
      console.warn('使用 CameraPreview.capture 拍照失败，尝试回退到 Camera.getPhoto：', err)
    }

    // 回退方案
    try {
      const dataUrl = await bluetoothService.takePhotoConfirmed()
      if (!dataUrl) throw new Error('takePhotoConfirmed 未返回数据')
      let base64 = dataUrl
      if (base64.indexOf(',') !== -1) base64 = base64.split(',')[1]
      // 不再写入 CameraPhotos 目录，直接返回 base64
      return { fileName, base64Data: base64 }
    } catch (err) {
      console.error('captureAndSave 回退方案也失败:', err)
      throw err
    }
  },

  isRunning() {
    return isPreviewRunning
  },
}

export default cameraHelper
