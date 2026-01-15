import { createRouter, createWebHistory } from 'vue-router'

// 示例：导入你的页面组件
// import About from '../views/About.vue'
import BluetoothView from '@/views/BluetoothView.vue'
import CaremaView from '@/views/CaremaView.vue'

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
    path: '/caremaView',
    name: 'CaremaView',
    component: CaremaView
  }
]

const router = createRouter({
  history: createWebHistory(), // HTML5 History 模式
  routes
})

export default router
