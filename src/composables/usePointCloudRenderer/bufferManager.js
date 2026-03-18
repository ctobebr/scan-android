/**
 * @fileoverview 缓冲区管理模块
 * 负责点云缓冲区的创建、扩容和管理
 */

import * as THREE from 'three'
import { showToast } from 'vant'

/**
 * 创建缓冲区管理器
 * @param {Object} config - 配置对象
 * @param {number} config.maxPoints - 最大点云数量
 * @returns {Object} 缓冲区管理器
 */
export function createBufferManager(config) {
  let pointsGeometry = null
  let capacity = config.initialCapacity
  let currentPointCount = 0

  /**
   * 创建初始 buffer
   * @param {number} cap - 缓冲区容量
   */
  function createBuffers(cap) {
    const positions = new Float32Array(cap * 3)
    const colors = new Float32Array(cap * 3)

    pointsGeometry = new THREE.BufferGeometry()
    pointsGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    )
    pointsGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
    )
  }

  /**
   * 确保缓冲区容量足够
   * @param {number} additional - 需要添加的点数
   * @param {number} currentCount - 当前点数
   * @returns {boolean} 是否成功
   */
  function ensureCapacity(additional, currentCount) {
    const needed = currentCount + additional
    if (needed <= capacity) return true

    if (needed > config.maxPoints) {
      showToast({ message: `点云数量已达上限 ${config.maxPoints} 点`, position: 'bottom' })
      throw new Error('capacity exceed')
    }

    // 更保守的扩容策略：按1.5倍增长而非2倍，减少内存碎片
    let newCap = Math.max(capacity, 1024)
    while (newCap < needed) {
      newCap = Math.floor(newCap * 1.5)
    }
    newCap = Math.min(newCap, config.maxPoints)

    try {
      const oldPos = pointsGeometry.attributes.position.array
      const oldCol = pointsGeometry.attributes.color.array

      // 新建扩容区域 && 存储旧点位信息
      const newPos = new Float32Array(newCap * 3)
      const newCol = new Float32Array(newCap * 3)
      newPos.set(oldPos)
      newCol.set(oldCol)

      // 直接替换buffer而不是创建新的Attribute，减少GC--虽然这样会导致新旧点位全量更新，但是给GPU带来的副作用小于一次性分配超大内存空间
      pointsGeometry.attributes.position.array = newPos
      pointsGeometry.attributes.color.array = newCol
      pointsGeometry.attributes.position.needsUpdate = true
      pointsGeometry.attributes.color.needsUpdate = true

      capacity = newCap
      return true
    } catch (err) {
      // MODIFIED: 添加用户友好的错误提示
      console.error('[Renderer] Memory allocation failed:', err)
      showToast({ message: '内存不足，无法添加更多点云', position: 'bottom' })
      throw new Error(`无法分配 ${newCap} 个点的内存: ${err.message}`)
    }
  }

  /**
   * 获取几何体
   * @returns {THREE.BufferGeometry} 点云几何体
   */
  function getGeometry() {
    return pointsGeometry
  }

  /**
   * 获取容量
   * @returns {number} 缓冲区容量
   */
  function getCapacity() {
    return capacity
  }

  /**
   * 设置容量
   * @param {number} cap - 新容量
   */
  function setCapacity(cap) {
    capacity = cap
  }

  /**
   * 重置缓冲区
   */
  function reset() {
    if (pointsGeometry) {
      pointsGeometry.setDrawRange(0, 0)
    }
    currentPointCount = 0
  }

  /**
   * 更新绘制范围
   * @param {number} count - 当前点数
   */
  function updateDrawRange(count) {
    if (pointsGeometry) {
      pointsGeometry.setDrawRange(0, count)
    }
  }

  /**
   * 释放资源
   */
  function dispose() {
    if (pointsGeometry) {
      pointsGeometry.dispose()
      pointsGeometry = null
    }
    capacity = 0
    currentPointCount = 0
  }

  // 初始化缓冲区
  createBuffers(capacity)

  return {
    createBuffers,
    ensureCapacity,
    getGeometry,
    getCapacity,
    setCapacity,
    reset,
    updateDrawRange,
    dispose,
  }
}
