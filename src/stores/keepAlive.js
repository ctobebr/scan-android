import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * KeepAlive 状态管理 Store
 * 用于动态控制哪些组件需要被 keep-alive 缓存
 */
export const useKeepAliveStore = defineStore('keepAlive', () => {
  // 需要缓存的组件名称列表
  const cachedComponents = ref(['MainView']) // 默认缓存 MainView

  // 计算属性，返回数组格式供 keep-alive include 使用
  const includeList = computed(() => cachedComponents.value)

  /**
   * 添加缓存组件
   * @param {string} name - 组件名称
   */
  function addCache(name) {
    if (!cachedComponents.value.includes(name)) {
      cachedComponents.value.push(name)
    }
  }

  /**
   * 移除缓存组件
   * @param {string} name - 组件名称
   */
  function removeCache(name) {
    const index = cachedComponents.value.indexOf(name)
    if (index > -1) {
      cachedComponents.value.splice(index, 1)
    }
  }

  /**
   * 设置缓存列表（替换）
   * @param {string[]} list - 组件名称数组
   */
  function setCacheList(list) {
    cachedComponents.value = list
  }

  /**
   * 检查组件是否被缓存
   * @param {string} name - 组件名称
   * @returns {boolean}
   */
  function isCached(name) {
    return cachedComponents.value.includes(name)
  }

  return {
    cachedComponents,
    includeList,
    addCache,
    removeCache,
    setCacheList,
    isCached
  }
})
