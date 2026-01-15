<template>
  <div class="camera-page">
    <h2 class="page-title">拍照</h2>

    <div class="camera-card">
      <div class="camera-top">
        <button class="primary-btn" @click="onTakeClick" :disabled="isTaking">
          {{ isTaking ? '拍照中...' : '拍照' }}
        </button>
        <button class="secondary-btn" @click="clearPhoto" v-if="photo">清除</button>
      </div>

      <div class="camera-preview" v-if="photo">
        <img :src="photo" alt="拍摄预览" />
      </div>

      <div class="camera-empty" v-else>
        <p>拍一张照片，预览会显示在这里</p>
      </div>

      <div class="camera-actions" v-if="photo">
        <button class="primary-btn" @click="savePhoto">保存到手机</button>
      </div>
    </div>

    <!-- 应用内确认弹窗（简单实现，中文） -->
    <div v-if="showConfirm" class="confirm-mask">
      <div class="confirm-card">
        <div class="confirm-title">拍照确认</div>
        <div class="confirm-body">应用将打开相机进行拍照，允许继续吗？</div>
        <div class="confirm-actions">
          <button class="secondary-btn" @click="showConfirm = false">取消</button>
          <button class="primary-btn" @click="takePhotoConfirmed">继续拍照</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Filesystem, Directory } from '@capacitor/filesystem'
// import { showToast } from '@/utils/toast'

const photo = ref(null)
const isTaking = ref(false)
const showConfirm = ref(false)

function onTakeClick() {
  showConfirm.value = true
}

async function takePhotoConfirmed() {
  showConfirm.value = false
  if (isTaking.value) return
  isTaking.value = true
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
    })
    photo.value = image.dataUrl
  } catch (err) {
    console.error('拍照失败', err, err.code)
  } finally {
    isTaking.value = false
  }
}

const clearPhoto = () => {
  photo.value = null
}

const savePhoto = async () => {
  if (!photo.value) return
  try {
    const base64Data = photo.value.split(',')[1]
    const fileName = `photo_${Date.now()}.png`
    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Documents,
    })
    alert('已保存：' + fileName)
  } catch (err) {
    console.error('保存失败', err)
    alert('保存失败：' + (err.message || '请检查权限'))
  }
}
</script>

<style scoped>
.camera-page {
  padding: 16px 0;
  height: calc(100vh - 72px);
  display: flex;
  flex-direction: column;
}
.page-title {
  margin: 8px 0 12px;
  color: var(--text);
}
.camera-card {
  background: var(--surface);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
}
.camera-top {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.primary-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
}
.secondary-btn {
  background: #eef2f6;
  color: var(--text);
  border: none;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.camera-preview img {
  width: 100%;
  border-radius: 8px;
  display: block;
}
.camera-empty {
  padding: 28px;
  text-align: center;
  color: var(--muted);
}
.camera-actions {
  margin-top: 12px;
}

/* 确认弹窗样式 */
.confirm-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 1200;
}
.confirm-card {
  width: 90%;
  max-width: 420px;
  background: var(--surface);
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.15);
}
.confirm-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.confirm-body {
  color: var(--muted);
  margin-bottom: 12px;
}
.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
