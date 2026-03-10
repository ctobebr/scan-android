<template>
  <div id="app">
    <!-- 全局页面包装器：为所有页面保留左右间距并在大屏上居中 -->
    <div class="page-wrapper">
    <router-view v-slot="{ Component }">
      <keep-alive :include="['MainContentTabs']">
        <component :is="Component"/>
      </keep-alive>
    </router-view>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import * as filePathUtils from '@/utils/filePathUtils'

async function cleanupOrphanedSessions() {
  try {
    console.log('[App] 启动时清理孤儿会话...')
    const folders = await filePathUtils.listPointCloudFolders(true)

    for (const folder of folders) {
      const folderName = folder.name
      const info = filePathUtils.parseFolderName(folderName)

      // 只删除临时文件夹（isTemp为true的）
      if (info.isTemp) {
        console.log('[App] 删除未保存的临时会话:', folderName)
        // await filePathUtils.deleteSession(folderName).catch(e => {
        //   console.warn('[App] 删除失败', folderName, e)
        // })
        // 暂时不删除临时文件夹，后期使用临时文件夹这个TEMP_PREFIX，去区分是已经保存的项目还是未保存的临时项目，以便临时项目继续编辑
      }
      // 纯会话ID（已保存）和项目名_会话ID都保留
    }
  } catch (e) {
    console.error('[App] 启动时清理失败', e)
  }
}

onMounted(() => {
  cleanupOrphanedSessions()
})

</script>

<style>
#app {
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg);
  color: var(--text);
}

/* 页面包装器：手机端左右留 32px，大屏幕居中并限制最大宽度 */
.page-wrapper {
  /* padding-left: 32px;
  padding-right: 32px; */
  /* padding-left: 16px;
  padding-right: 16px; */
  box-sizing: border-box;
  background: linear-gradient(180deg, #e6f7ff 0%, #f0f9ff 100%);
  max-width: 980px;
  margin: 0 auto;
  height: 100%;
}

.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  height: 56px;
  background: var(--surface);
  border-top: 1px solid #e6eaf0;
  box-shadow: 0 -2px 8px rgba(16, 24, 40, 0.04);
}

.tab-item {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  text-decoration: none;
  color: var(--muted);
  font-size: 14px;
}

.tab-item.active {
  color: var(--primary);
  font-weight: 600;
}

/* 小屏时确保页面高度自适应 */
/* @media (max-width: 420px) {
  .page-wrapper{ padding-left: 20px; padding-right: 20px; }
} */
</style>
