import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/main',
  },
  {
    path: '/main',
    name: 'MainView',
    component: () => import('@/views/main/index.vue'),
  },
  {
    path: '/pointcloud',
    name: 'PointCloud',
    component: () => import('@/views/pointCloud/index.vue'),
  },
  {
    path: '/batchdetail/:currentSessionId/:bid',
    name: 'BatchDetail',
    component: () => import('@/views/batchDetail/index.vue'),
    props: true,
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
  },
  {
    path: '/splice',
    name: 'SpliceView',
    component: () => import('@/views/splice/index.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(), // HTML5 History 模式
  routes
})

export default router
