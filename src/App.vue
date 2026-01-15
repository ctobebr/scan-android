<template>

<div id="app">
  <!-- 全局页面包装器：为所有页面保留左右间距并在大屏上居中 -->
  <div class="page-wrapper">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>

  <!-- 底部导航栏 -->
  <div class="tab-bar">
    <router-link to="/bluetooth" class="tab-item" active-class="active">
      蓝牙
    </router-link>
    <router-link to="/caremaView" class="tab-item" active-class="active">
      拍照
    </router-link>
  </div>
</div>
</template>

<script setup>





</script>

<style>

#app {
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg);
  color: var(--text);
}

/* 页面包装器：手机端左右留 32px，大屏幕居中并限制最大宽度 */
.page-wrapper{
  padding-left: 32px;
  padding-right: 32px;
  box-sizing: border-box;
  max-width: 980px;
  margin: 0 auto;
  padding-bottom: 72px; /* 为底部导航留空间 */
  /* min-height: calc(100vh - 56px); */
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
  box-shadow: 0 -2px 8px rgba(16,24,40,0.04);
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
@media (max-width: 420px) {
  .page-wrapper{ padding-left: 20px; padding-right: 20px; }
}
</style>
