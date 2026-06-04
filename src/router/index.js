import { createRouter, createWebHistory } from 'vue-router'
import { lockToLandscape, lockToPortrait } from '@/utils/device/screen'
import { setImmersive } from '@/utils/device/immersive'

const routes = [
  {
    path: '/',
    redirect: '/main',
  },
  {
    path: '/main',
    name: 'MainView',
    component: () => import('@/views/main/index.vue'),
    meta: { orientation: 'portrait', immersive: false },
  },
  {
    path: '/pointcloud',
    name: 'PointCloud',
    component: () => import('@/views/pointCloud/index.vue'),
    meta: { orientation: 'landscape', immersive: true },
  },
  {
    path: '/batchdetail/:currentSessionId/:bid',
    name: 'BatchDetail',
    component: () => import('@/views/batchDetail/index.vue'),
    props: true,
    meta: { orientation: 'landscape', immersive: true },
  },
  {
    path: '/settings',
    name: 'SettingsView',
    component: () => import('@/views/settings/index.vue'),
  },
  {
    path: '/overview',
    name: 'Overview',
    component: () => import('@/views/pointCloud/component/overView.vue'),
    meta: { orientation: 'landscape', immersive: true },
  },
  {
    path: '/splice/:currentSessionId/:bid',
    name: 'SpliceView',
    component: () => import('@/views/splice/index.vue'),
    props: true,
    meta: { orientation: 'landscape', immersive: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * 全局路由守卫：统一管理屏幕方向 + 沉浸式模式
 * 只有当目标路由与当前路由的 meta 不同时才切换，避免页面间跳转时闪烁
 */
router.beforeEach(async (to, from) => {
  const toOrientation = to.meta?.orientation
  const fromOrientation = from.meta?.orientation
  const toImmersive = to.meta?.immersive
  const fromImmersive = from.meta?.immersive

  // 屏幕方向：仅在变化时切换
  if (toOrientation !== fromOrientation) {
    if (toOrientation === 'landscape') {
      await lockToLandscape()
    } else if (toOrientation === 'portrait') {
      await lockToPortrait()
    }
  }

  // 沉浸式模式：仅在变化时切换
  if (toImmersive !== fromImmersive) {
    await setImmersive(!!toImmersive)
  }
})

export default router
