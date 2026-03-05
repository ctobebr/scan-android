// services/sessionService.js
import * as filePathUtils from '@/utils/filePathUtils'
import { bluetoothService } from '@/services/bluetoothService'
import cameraHelper from '@/utils/cameraHelper'
import { NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/protocolCommands'
import { useBluetoothStore } from '@/stores/bluetooth'
import { disableScreenKeepAwake } from '@/utils/screen'

let parser = null
let accumulationTimer = null

export const sessionService = {
  // 设置解析器引用（用于组件传递）
  setParser(p) {
    parser = p
  },

  setAccumulationTimer(t) {
    accumulationTimer = t
  },

  // 停止会话解析器
  async stopSessionParser() {
    if (!parser) {
      return
    }
    console.log('[stopSessionParser] Stopping parser and subscription...')
    if (accumulationTimer) {
      clearInterval(accumulationTimer)
      accumulationTimer = null
    }
    try {
      const bluetoothStore = useBluetoothStore()
      const deviceId = bluetoothStore.connectingDeviceId
      if (deviceId) {
        await bluetoothService.unsubscribeFromNotifications(
          deviceId,
          NUS_SERVICE_UUID,
          NUS_NOTIFY_CHAR_UUID,
        )
      }
    } catch (e) {
      console.warn('unsubscribe failed', e)
    }
    await cameraHelper.stopPreview().catch(() => {})
    parser = null
  },

  // 保存当前批次数据
  async saveCurrentBatch(sessionId, currentBatchData, dataBatchCounter) {
    if (!currentBatchData || !currentBatchData.photos || currentBatchData.photos.length === 0) {
      console.warn('[saveCurrentBatch] 当前批次无照片数据，跳过保存')
      return
    }

    try {
      const batchId = `${sessionId}_batch_${dataBatchCounter}`
      await filePathUtils.saveBatch(
        sessionId,
        batchId,
        currentBatchData.rawLines || [],
        currentBatchData.photos,
      )
      console.log(`[saveCurrentBatch] 批次 ${batchId} 保存成功`)
    } catch (e) {
      console.error('[saveCurrentBatch] 保存批次失败', e)
      throw e
    }
  },

  // 清理资源
  async cleanupResources(renderer, disconnectUnregister) {
    console.log('[sessionService] 开始清理资源')

    // 停止相机预览
    await cameraHelper.stopPreview()

    // 停止会话解析器
    try {
      await this.stopSessionParser()
    } catch (e) {
      console.warn('[sessionService] 清理会话失败', e)
    }

    // 清理渲染器
    if (renderer?.onResize) {
      window.removeEventListener('resize', renderer.onResize)
    }
    setTimeout(() => {
      if (renderer?.dispose && typeof renderer.dispose === 'function') {
        renderer.dispose()
      }
    }, 100)

    // 禁用屏幕常亮
    await disableScreenKeepAwake()

    // 移除断开监听
    if (disconnectUnregister) {
      disconnectUnregister()
    }

    console.log('[sessionService] 资源清理完成')
  },

  // 重命名会话
  async renameSession(oldSessionId, newSessionId) {
    try {
      await filePathUtils.renameSession(oldSessionId, newSessionId)
      console.log('[renameSession] 重命名成功')
    } catch (e) {
      console.error('[renameSession] 重命名失败', e)
      throw e
    }
  },

  // 删除批次
  async deleteBatch(sessionId, batchId) {
    try {
      await filePathUtils.deletePath(filePathUtils.batchFolder(sessionId, batchId))
      console.log(`[deleteBatch] 批次 ${batchId} 删除成功`)
    } catch (e) {
      console.error(`[deleteBatch] 删除批次 ${batchId} 失败`, e)
      throw e
    }
  },

  // 读取批次数据
  async readBatch(sessionId, batchId) {
    return await filePathUtils.readBatch(sessionId, batchId)
  },

  // 列出批次
  async listBatches(sessionId) {
    return await filePathUtils.listBatches(sessionId)
  },
}

export default sessionService
