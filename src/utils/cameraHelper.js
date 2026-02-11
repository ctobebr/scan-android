import { CameraPreview } from '@capacitor-community/camera-preview'
import { Filesystem, Directory } from '@capacitor/filesystem'
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
   * 拍照并保存为文件，fileBaseName 不带扩展名
   * 返回 { fileName, uri }
   */
  async captureAndSave(fileBaseName) {
    if (!isPreviewRunning) {
      throw new Error('无法拍照：相机预览未启动')
    }
    // 优先使用 CameraPreview.capture
    try {
      if (CameraPreview && typeof CameraPreview.capture === 'function') {
        const res = await CameraPreview.capture({ quality: 90 })
        let base64 = res?.value || res?.data || ''
        if (!base64) {
          throw new Error('CameraPreview.capture 未返回数据')
        }
        // 如果包含 data:image 前缀，去掉
        if (base64.indexOf(',') !== -1) {
          base64 = base64.split(',')[1]
        }

        const fileName = `${fileBaseName}.jpg`
        const path = `CameraPhotos/${fileName}`
        const writeRes = await Filesystem.writeFile({
          path,
          data: base64,
          directory: Directory.Documents,
          recursive: true,
        })
        return { fileName, uri: writeRes.uri }
      }
    } catch (err) {
      console.warn('使用 CameraPreview.capture 拍照保存失败，尝试回退到 Camera.getPhoto：', err)
    }

    // 回退方案：使用 bluetoothService.takePhotoConfirmed (Camera.getPhoto)
    try {
      const dataUrl = await bluetoothService.takePhotoConfirmed()
      if (!dataUrl) throw new Error('takePhotoConfirmed 未返回数据')
      let base64 = dataUrl
      if (base64.indexOf(',') !== -1) base64 = base64.split(',')[1]
      const fileName = `${fileBaseName}.jpg`
      const path = `CameraPhotos/${fileName}`
      const writeRes = await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
      return { fileName, uri: writeRes.uri }
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
