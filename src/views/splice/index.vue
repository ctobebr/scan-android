<template>
  <div class="splice-container">
    <div class="page-content">
      <div class="page-header">
        <h2 class="page-title">点云拼接</h2>
      </div>

      <div class="splice-workspace">
        <div class="control-panel">
          <div class="panel-section">
            <h3 class="section-title">操作</h3>
            <div class="button-group">
              <van-button type="primary" size="small" block @click="handleSplice">开始拼接</van-button>
              <van-button type="default" size="small" block @click="handleReset">重置</van-button>
            </div>
          </div>

          <div class="panel-section">
            <h3 class="section-title">参数设置</h3>
            <div class="param-list">
              <div class="param-item">
                <label>拼接精度</label>
                <van-stepper v-model="precision" min="0.1" max="10" step="0.1" />
              </div>
            </div>
          </div>
        </div>

        <div class="preview-area">
          <div class="preview-placeholder">
            <span>拼接预览区域</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({
  name: 'SpliceView'
})

import { ref } from 'vue'
import { showToast } from 'vant'
import { createLogger } from '@/utils/logger'

const logger = createLogger('SpliceView')
const precision = ref(1.0)

const handleSplice = () => {
  logger.info('开始拼接，精度：', precision.value)
  showToast('拼接功能开发中...')
}

const handleReset = () => {
  precision.value = 1.0
  showToast('已重置参数')
}
</script>

<style scoped>
.splice-container {
  width: 100%;
  height: 100%;
  background: #f5f7fa;
}

.page-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.splice-workspace {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.control-panel {
  width: 240px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-section {
  border-bottom: 1px solid #eee;
  padding-bottom: 16px;
}

.panel-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.param-item label {
  font-size: 14px;
  color: #666;
}

.preview-area {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.preview-placeholder {
  color: #999;
  font-size: 16px;
}
</style>
