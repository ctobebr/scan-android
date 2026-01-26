import { createRouter, createWebHistory } from 'vue-router'

// 示例：导入你的页面组件
// import About from '../views/About.vue'
import BluetoothView from '@/views/BluetoothView.vue'
import PointCloud from '@/views/PointCloud.vue'
import CaremaView from '@/views/CaremaView.vue'
import FileSave from '@/views/FileSave.vue'

const routes = [
  {
    path: '/',
    redirect: '/bluetooth' // 默认进入蓝牙页
  },
  {
    path: '/bluetooth',
    name: 'Bluetooth',
    component: BluetoothView
  },
  {
    path: '/pointCloud',
    name: 'PointCloud',
    component: PointCloud
  },
  {
    path: '/caremaView',
    name: 'CaremaView',
    component: CaremaView
  },
  {
    path: '/fileSave',
    name: 'FileSave',
    component: FileSave
  }
]

const router = createRouter({
  history: createWebHistory(), // HTML5 History 模式
  routes
})

export default router
