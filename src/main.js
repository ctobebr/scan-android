import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import router from './router'

import '@/styles/base.css'
import * as filePathUtils from '@/utils/filePathUtils'

// 防止系统扫描 Documents 目录中的媒体文件
filePathUtils.ensureNoMedia('')

createApp(App).use(router).use(createPinia()).mount('#app')
