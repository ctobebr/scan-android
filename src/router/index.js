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
    path: '/batchdetail/:session/:bid',
    name: 'BatchDetail',
    component: () => import('@/views/batchDetail/index.vue'),
    props: true,
  },
  {
    path: '/settings',
    name: 'SettingsView',
    component: () => import('@/views/settings/index.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(), // HTML5 History 模式
  routes
})

export default router
