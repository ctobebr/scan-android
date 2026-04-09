import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import router from './router'

import '@/styles/base.css'
import * as storage from '@/api/pointCloudStorage'

// 按需引入
import { Button, Cell, Field, Toast, Dialog, Switch, DropdownMenu, DropdownItem } from 'vant'
import 'vant/lib/index.css'

createApp(App)
  .use(router)
  .use(createPinia())
  .use(Button)
  .use(Cell)
  .use(Field)
  .use(Toast)
  .use(Dialog)
  .use(Switch)
  .use(DropdownMenu)
  .use(DropdownItem)
  .mount('#app')
