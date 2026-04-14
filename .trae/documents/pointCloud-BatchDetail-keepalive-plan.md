# PointCloud 页面状态保持方案分析

## 问题背景

从 `pointCloud` 页面通过 `goToBatch` 跳转到 `BatchDetail` 页面后，再返回 `pointCloud` 页面时，点云渲染数据消失（UI 展示相关数据丢失），但实际文件夹中的数据仍然存在。

根本原因：`onBeforeRouteLeave` 中调用了 `cleanupResourcesForExit`，其中 `cleanupRenderer()` 会销毁 Three.js 渲染器，导致返回时需要重新初始化。

***

## 方案一：动态控制 keep-alive（推荐）

### 实现原理

利用 Vue 的 `<keep-alive>` 组件的 `include` 属性动态绑定，根据路由导航的目标页面决定是否缓存 `PointCloudView` 组件。

### 具体实施步骤

1. **创建路由缓存状态管理（Pinia Store）**

```javascript
// stores/keepAlive.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useKeepAliveStore = defineStore('keepAlive', () => {
  // 需要缓存的组件名称列表
  const cachedComponents = ref(['MainView']) // 默认缓存 MainView
  
  // 计算属性，返回数组格式供 keep-alive include 使用
  const includeList = computed(() => cachedComponents.value)
  
  // 添加缓存组件
  function addCache(name) {
    if (!cachedComponents.value.includes(name)) {
      cachedComponents.value.push(name)
    }
  }
  
  // 移除缓存组件
  function removeCache(name) {
    const index = cachedComponents.value.indexOf(name)
    if (index > -1) {
      cachedComponents.value.splice(index, 1)
    }
  }
  
  // 设置缓存列表（替换）
  function setCacheList(list) {
    cachedComponents.value = list
  }
  
  return {
    cachedComponents,
    includeList,
    addCache,
    removeCache,
    setCacheList
  }
})
```

1. **修改 App.vue 动态绑定 include**

```vue
<template>
  <div id="app">
    <div class="page-wrapper">
      <router-view v-slot="{ Component }">
        <keep-alive :include="keepAliveStore.includeList">
          <component :is="Component"/>
        </keep-alive>
      </router-view>
    </div>
  </div>
</template>

<script setup>
import { useKeepAliveStore } from '@/stores/keepAlive'

const keepAliveStore = useKeepAliveStore()
</script>
```

1. **在 pointCloud/index.vue 中控制缓存**

```javascript
// 在 onBeforeRouteLeave 中动态控制
onBeforeRouteLeave(async (to, from, next) => {
  const keepAliveStore = useKeepAliveStore()
  
  if (to.name === 'BatchDetail') {
    // 跳转到 BatchDetail，添加缓存
    keepAliveStore.addCache('PointCloudView')
    
    // 执行轻量级清理（不销毁渲染器）
    await cleanupResourcesForExit({
      restorePortrait: false,
      disableKeepAwake: false,
      disableImmersive: false,
      restoreStatusBar: false,
      resetState: false,
      cleanupRenderer: false  // 不清理渲染器
    })
  } else {
    // 跳转到其他页面，移除缓存
    keepAliveStore.removeCache('PointCloudView')
    await cleanupResourcesForExit()
  }
  
  next()
})
```

### 优点

1. **用户体验好**：返回时点云数据立即展示，无需重新加载
2. **性能优秀**：避免了重新初始化 Three.js 渲染器的开销
3. **内存可控**：只在需要时缓存，其他情况正常释放
4. **实现简洁**：利用 Vue 内置机制，代码侵入性小

### 缺点

1. **内存占用**：缓存期间组件占用内存不释放
2. **生命周期复杂**：需要处理 `activated` 和 `deactivated` 钩子

### 适用场景

* 详情页与列表页频繁切换的场景

* 对返回后即时展示有要求的场景

* 组件初始化开销较大的场景

***

## 方案二：路由元信息控制 keep-alive

### 实现原理

利用 Vue Router 的 `meta` 字段标记需要缓存的组件关系，在 `App.vue` 中根据路由配置自动管理缓存。

### 具体实施步骤

1. **修改路由配置**

```javascript
// router/index.js
const routes = [
  {
    path: '/pointcloud',
    name: 'PointCloud',
    component: () => import('@/views/pointCloud/index.vue'),
    meta: {
      keepAlive: true,  // 标记需要缓存
      cacheTo: ['BatchDetail']  // 只有跳转到这些路由时才缓存
    }
  },
  {
    path: '/batchdetail/:session/:bid',
    name: 'BatchDetail',
    component: () => import('@/views/batchDetail/index.vue'),
    meta: {
      isDetailPage: true,  // 标记为详情页
      parentRoute: 'PointCloud'  // 父级路由
    }
  }
]
```

1. **修改 App.vue 根据路由元信息控制**

```vue
<template>
  <div id="app">
    <div class="page-wrapper">
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="cachedComponents">
          <component :is="Component" :key="route.path"/>
        </keep-alive>
      </router-view>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const cachedComponents = ref(['MainView'])

// 监听路由变化，根据 meta 信息更新缓存列表
let previousRoute = null

router.beforeEach((to, from, next) => {
  // 检查是否需要缓存来源组件
  if (from.meta?.keepAlive && from.meta?.cacheTo?.includes(to.name)) {
    if (!cachedComponents.value.includes(from.name)) {
      cachedComponents.value.push(from.name)
    }
  }
  
  // 检查是否需要移除缓存（如果不是返回详情页）
  if (to.meta?.isDetailPage && from.name !== to.meta?.parentRoute) {
    // 从其他页面进入详情页，不需要保留 pointCloud 缓存
  }
  
  previousRoute = from
  next()
})
</script>
```

### 优点

1. **配置化**：通过路由配置管理缓存逻辑，清晰明了
2. **可扩展**：易于扩展到其他页面组合
3. **解耦**：业务逻辑与缓存控制分离

### 缺点

1. **灵活性较低**：需要预先定义缓存关系
2. **复杂场景难处理**：嵌套路由或动态路由场景较复杂

### 适用场景

* 路由结构清晰、关系固定的项目

* 需要统一管理缓存策略的项目

***

## 方案三：数据持久化 + 状态恢复

### 实现原理

不依赖组件缓存，而是将关键状态（非渲染状态）持久化存储，返回时从存储中恢复状态并重新渲染。

### 具体实施步骤

1. **创建状态管理 Store**

```javascript
// stores/pointCloudSession.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePointCloudSessionStore = defineStore('pointCloudSession', () => {
  // 会话状态
  const sessionState = ref({
    currentSessionId: null,
    dataBatchCounter: 0,
    batchButtons: [],
    enableSave: false,
    projectName: ''
  })
  
  // 保存状态
  function saveState(state) {
    sessionState.value = { ...sessionState.value, ...state }
    // 可选：持久化到 localStorage
    localStorage.setItem('pointCloudSession', JSON.stringify(sessionState.value))
  }
  
  // 恢复状态
  function restoreState() {
    // 从 localStorage 恢复
    const saved = localStorage.getItem('pointCloudSession')
    if (saved) {
      sessionState.value = JSON.parse(saved)
    }
    return sessionState.value
  }
  
  // 清除状态
  function clearState() {
    sessionState.value = {
      currentSessionId: null,
      dataBatchCounter: 0,
      batchButtons: [],
      enableSave: false,
      projectName: ''
    }
    localStorage.removeItem('pointCloudSession')
  }
  
  return {
    sessionState,
    saveState,
    restoreState,
    clearState
  }
})
```

1. **在 pointCloud/index.vue 中使用**

```javascript
// 离开时保存状态
onBeforeRouteLeave(async (to, from, next) => {
  if (to.name === 'BatchDetail') {
    // 保存当前状态
    sessionStore.saveState({
      currentSessionId: currentSessionId,
      dataBatchCounter: dataBatchCounter.value,
      batchButtons: batchButtons.value,
      enableSave: enableSave.value,
      projectName: projectName.value
    })
    
    // 轻量级清理，不销毁数据
    await cleanupResourcesForExit({
      cleanupRenderer: false  // 保留渲染器
    })
  } else {
    // 彻底清理
    sessionStore.clearState()
    await cleanupResourcesForExit()
  }
  
  next()
})

// 进入时恢复状态
onMounted(async () => {
  const savedState = sessionStore.restoreState()
  
  if (savedState.currentSessionId) {
    // 恢复状态
    currentSessionId = savedState.currentSessionId
    dataBatchCounter.value = savedState.dataBatchCounter
    batchButtons.value = savedState.batchButtons
    enableSave.value = savedState.enableSave
    projectName.value = savedState.projectName
    
    // 重新加载点云数据
    await loadExistingPointCloud()
  }
  
  await init()
})
```

### 优点

1. **可靠性高**：数据持久化，即使页面刷新也能恢复
2. **内存友好**：不缓存组件，内存占用小
3. **灵活性强**：可以精确控制需要保存的状态

### 缺点

1. **恢复延迟**：需要重新加载和渲染数据
2. **实现复杂**：需要处理状态序列化和反序列化
3. **用户体验稍差**：返回后需要等待数据恢复

### 适用场景

* 对数据可靠性要求高的场景

* 内存受限的设备

* 需要支持页面刷新后恢复的场景

***

## 方案对比分析

| 维度    | 方案一：动态 keep-alive | 方案二：路由元信息 | 方案三：数据持久化 |
| ----- | ----------------- | --------- | --------- |
| 实现复杂度 | 低                 | 中         | 高         |
| 用户体验  | 优秀（即时展示）          | 优秀（即时展示）  | 良好（有延迟）   |
| 内存占用  | 中（缓存期间）           | 中（缓存期间）   | 低         |
| 性能影响  | 小                 | 小         | 中（需重新渲染）  |
| 可维护性  | 高                 | 高         | 中         |
| 扩展性   | 高                 | 中         | 高         |

***

## 针对用户思路的专业分析

### 用户思路概述

> 当发生路由导航时判断是否进入详情页，将清理标志置为 true 以避免数据清理，返回时保留未主动清理的相关数据。

### 可行性评估

**技术上可行**，但需要注意以下几点：

1. **清理标志** **`_hasCleaned`** **的作用**

   * 当前代码中 `_hasCleaned` 用于防止重复执行清理

   * 置为 true 确实可以跳过清理，但这不是它的设计目的

2. **潜在风险**

   * **内存泄漏风险**：如果不清理渲染器，返回后可能重复初始化

   * **状态不一致**：渲染器状态与组件状态可能不同步

   * **蓝牙会话**：需要正确处理蓝牙连接的连续性

3. **优化建议**

```javascript
// 建议添加专门的标志控制渲染器清理
async function cleanupResourcesForExit(options = {}) {
  const {
    // ... 其他选项
    cleanupRenderer = true  // 新增选项
  } = options

  if (_hasCleaned) return
  _hasCleaned = true

  // 根据选项决定是否清理渲染器
  if (cleanupRenderer) {
    await cleanupRenderer()
  }
  
  // ... 其他清理逻辑
}

// 在 onBeforeRouteLeave 中使用
onBeforeRouteLeave(async (to, from, next) => {
  if (to.name === 'BatchDetail') {
    await cleanupResourcesForExit({
      cleanupRenderer: false,  // 不清理渲染器
      resetState: false
    })
  } else {
    await cleanupResourcesForExit()  // 完整清理
  }
  next()
})
```

### 工程性评估

| 维度    | 评估 | 说明            |
| ----- | -- | ------------- |
| 代码侵入性 | 低  | 只需修改清理函数和路由守卫 |
| 可测试性  | 高  | 易于单元测试        |
| 可维护性  | 中  | 需要文档说明清理选项的用法 |
| 兼容性   | 高  | 不影响其他功能       |

***

## 动态控制 keep-alive 的详细分析

### 实现方式

#### 方式一：include 属性动态绑定（推荐）

```vue
<keep-alive :include="cachedComponents">
  <component :is="Component"/>
</keep-alive>
```

**优点**：

* 精确控制每个组件的缓存状态

* 响应式更新，实时生效

**缺点**：

* 需要管理组件名称列表

#### 方式二：路由元信息控制

```javascript
// 路由配置
{
  path: '/pointcloud',
  name: 'PointCloud',
  component: () => import('@/views/pointCloud/index.vue'),
  meta: { keepAlive: true }
}
```

```vue
<keep-alive>
  <component 
    :is="Component" 
    v-if="route.meta.keepAlive"
  />
</keep-alive>
<component 
  :is="Component" 
  v-if="!route.meta.keepAlive"
/>
```

**优点**：

* 配置化，易于管理

**缺点**：

* 需要 v-if/v-else 控制，代码冗余

### 生命周期问题及解决方案

使用 `keep-alive` 后，组件生命周期发生变化：

```
正常路由：beforeUnmount -> unmounted
keep-alive：deactivated -> (返回时) activated
```

**需要注意的问题**：

1. **定时器未清理**

   ```javascript
   // 错误：在 onUnmounted 中清理定时器
   // 正确：在 onBeforeUnmount 中清理，或使用 deactivated

   onBeforeUnmount(() => {
     cleanupTimers()
   })

   onDeactivated(() => {
     // 组件被缓存时执行
     pauseRendering()
   })

   onActivated(() => {
     // 组件被激活时执行
     resumeRendering()
   })
   ```

2. **WebGL 上下文丢失**

   ```javascript
   // 需要在 activated 时检查并恢复 WebGL 上下文
   onActivated(() => {
     if (renderer && renderer.isContextLost()) {
       renderer.restoreContext()
     }
   })
   ```

### 与现有项目架构的兼容性

当前项目使用：

* Vue 3 + Composition API

* Pinia 状态管理

* Vue Router 4

**兼容性评估**：

* ✅ 完全兼容 Vue 3 的 keep-alive 机制

* ✅ 与 Pinia 状态管理无冲突

* ✅ 支持 Composition API 的生命周期钩子

***

## 最终推荐方案

**推荐方案一：动态控制 keep-alive**

理由：

1. 实现简单，代码侵入性低
2. 用户体验最佳，返回即时展示
3. 与现有架构完全兼容
4. 易于维护和扩展

**实施优先级**：

1. 创建 `keepAlive` store 管理缓存状态
2. 修改 `App.vue` 动态绑定 include
3. 修改 `pointCloud/index.vue` 控制缓存逻辑
4. 添加 `activated/deactivated` 生命周期处理
5. 测试验证各种场景

