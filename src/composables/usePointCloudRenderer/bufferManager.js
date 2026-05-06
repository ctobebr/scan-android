/**
 * @fileoverview 缓冲区管理模块
 * 负责点云缓冲区的创建、扩容和管理
 */

import * as THREE from 'three'
import { showToast } from 'vant'
// 注意：直接从 logger.js 导入，避免与 utils/index.js 的循环依赖
import { createLogger } from '@/utils/logger'

const logger = createLogger('BufferManager')

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
    logger.debug('[createBuffers] 初始缓冲区创建完成', { capacity: cap, positionCount: pointsGeometry.attributes.position.count })
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
      const oldCount = pointsGeometry.attributes.position.count

      logger.debug('[ensureCapacity] 开始扩容', { oldCapacity: capacity, newCapacity: newCap, oldCount, oldArrayLength: oldPos.length })

      // 新建扩容区域 && 存储旧点位信息
      const newPos = new Float32Array(newCap * 3)
      const newCol = new Float32Array(newCap * 3)
      newPos.set(oldPos)
      newCol.set(oldCol)

      // Three.js 不支持直接替换 BufferAttribute.array 来改变缓冲区大小
      // 必须使用 setAttribute 重新创建 BufferAttribute，让 Three.js 内部创建新的 WebGLBuffer
      pointsGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(newPos, 3).setUsage(THREE.DynamicDrawUsage),
      )
      pointsGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(newCol, 3).setUsage(THREE.DynamicDrawUsage),
      )

      logger.debug('[ensureCapacity] 扩容完成', { newCapacity: newCap, newCount: pointsGeometry.attributes.position.count, newArrayLength: newPos.length })

      capacity = newCap
      return true
    } catch (err) {
      // 添加用户友好的错误提示
      logger.error('Memory allocation failed', err)
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
