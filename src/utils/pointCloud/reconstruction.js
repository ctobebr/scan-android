/**
 * @fileoverview 点云重建工具模块
 * 提供位姿矩阵解析、点云变换和合并点云重建功能。
 * 核心职责：删除站位后，利用剩余站位的原始点云和全局位姿矩阵，
 * 重新计算并生成合并点云文件（final_dense_registered_cloud.txt），
 * 不依赖 HLMRF 算法，纯数学计算。
 *
 * @module @/utils/pointCloud/reconstruction
 */

import { readFile, writeFile, readdir, copyFile, deleteFile } from '@/services/storage/fileSystem'
import { sessionFolder } from '@/utils/storage/path'
import { HLMRF_OUTPUT, HLMRF_SESSION } from '@/config/hlmrf'
import { createLogger } from '@/utils/logger'

const logger = createLogger('Reconstruction')

/**
 * 4x4 单位矩阵（站位1的默认位姿）
 * @constant {number[][]}
 */
const IDENTITY_MATRIX = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
]

/**
 * 从文本行中解析一个 4x4 位姿矩阵
 * 期望每行包含4个空格分隔的浮点数
 *
 * @param {string[]} lines - 4行文本数组
 * @returns {number[][]} 4x4 矩阵（行优先二维数组）
 * @throws {Error} 当行格式不正确时抛出
 */
function parsePoseMatrix(lines) {
  const matrix = []
  for (let i = 0; i < 4; i++) {
    const parts = lines[i].trim().split(/\s+/)
    if (parts.length < 4) {
      throw new Error(`位姿矩阵第${i + 1}行格式错误，期望4列，实际${parts.length}列`)
    }
    matrix.push([
      parseFloat(parts[0]),
      parseFloat(parts[1]),
      parseFloat(parts[2]),
      parseFloat(parts[3]),
    ])
  }
  return matrix
}

/**
 * 将 4x4 矩阵格式化为文本行（每行6位小数）
 *
 * @param {number[][]} matrix - 4x4 矩阵
 * @returns {string[]} 4行格式化文本
 */
function formatPoseMatrix(matrix) {
  return matrix.map((row) => row.map((v) => v.toFixed(6)).join(' '))
}

/**
 * 将 4x4 位姿矩阵应用于单个三维点
 * 变换公式: [x', y', z', 1]^T = M × [x, y, z, 1]^T
 *
 * @param {number[][]} matrix - 4x4 变换矩阵
 * @param {number} x - 原始 x 坐标
 * @param {number} y - 原始 y 坐标
 * @param {number} z - 原始 z 坐标
 * @returns {{x: number, y: number, z: number}} 变换后的坐标
 */
function applyPoseTransform(matrix, x, y, z) {
  return {
    x: matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
    y: matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
    z: matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
  }
}

/**
 * 从 4x4 位姿矩阵中提取平移分量（即锚点坐标）
 * 平移分量位于矩阵第4列的前3行
 *
 * @param {number[][]} matrix - 4x4 位姿矩阵
 * @returns {{x: number, y: number, z: number}} 平移分量坐标
 */
export function getPoseTranslation(matrix) {
  return {
    x: matrix[0][3],
    y: matrix[1][3],
    z: matrix[2][3],
  }
}

/**
 * 从会话根目录读取 global_poses_all.txt 中的所有位姿矩阵
 *
 * @param {string} folderName - 会话文件夹名
 * @returns {Promise<Map<number, number[][]>>} Map<batchNo, 4x4Matrix>，batchNo 从1开始
 */
export async function readGlobalPosesAll(folderName) {
  const sessionDir = sessionFolder(folderName)
  const filePath = `${sessionDir}/${HLMRF_SESSION.GLOBAL_POSES_ALL_FILE}`

  try {
    const result = await readFile(filePath, { encoding: 'utf8' })
    const content = result.data
    if (!content || !content.trim()) {
      console.log('[Reconstruct] 📖 readGlobalPosesAll: 文件为空')
      return new Map()
    }

    const lines = content.trim().split('\n')
    const poses = new Map()

    let i = 0
    while (i < lines.length) {
      const line = lines[i].trim()
      const match = line.match(/^(\d+):$/)
      if (match) {
        const batchNo = parseInt(match[1])
        if (i + 4 <= lines.length) {
          const matrix = parsePoseMatrix(lines.slice(i + 1, i + 5))
          poses.set(batchNo, matrix)
          i += 5
        } else {
          i++
        }
      } else {
        i++
      }
    }

    const batchNos = Array.from(poses.keys()).sort((a, b) => a - b)
    console.log(`[Reconstruct] 📖 readGlobalPosesAll: 读取到 ${poses.size} 个站位位姿, batchNos=[${batchNos.join(', ')}]`)
    return poses
  } catch (e) {
    console.warn('[Reconstruct] 📖 readGlobalPosesAll: 读取失败,', e.message)
    return new Map()
  }
}

/**
 * 将所有批次位姿写入会话根目录的 global_poses_all.txt
 * 按 batchNo 升序排列输出
 *
 * @param {string} folderName - 会话文件夹名
 * @param {Map<number, number[][]>} poses - Map<batchNo, 4x4Matrix>
 * @returns {Promise<void>}
 */
export async function writeGlobalPosesAll(folderName, poses) {
  const sessionDir = sessionFolder(folderName)
  const filePath = `${sessionDir}/${HLMRF_SESSION.GLOBAL_POSES_ALL_FILE}`

  const lines = []
  const sortedEntries = Array.from(poses.entries()).sort(([a], [b]) => a - b)

  const batchNos = sortedEntries.map(([n]) => n)
  const expectedCount = sortedEntries.length
  console.log(`[Reconstruct] 📝 writeGlobalPosesAll: 写入 ${expectedCount} 个站位, batchNos=[${batchNos.join(', ')}]`)

  for (const [batchNo, matrix] of sortedEntries) {
    lines.push(`${batchNo}:`)
    lines.push(...formatPoseMatrix(matrix))
  }

  const content = lines.join('\n')

  // 先删除旧文件，确保完全覆盖（防止 Capacitor writeFile 在某些场景下未正确截断）
  try {
    await deleteFile(filePath)
  } catch (_) {
    // 文件可能不存在，忽略
  }

  await writeFile(filePath, content, { encoding: 'utf8' })

  // 立即读回验证写入结果
  try {
    const verifyPoses = await readGlobalPosesAll(folderName)
    if (verifyPoses.size !== expectedCount) {
      console.error(`[Reconstruct] ❌ writeGlobalPosesAll 验证失败: 期望 ${expectedCount} 个站位, 实际读回 ${verifyPoses.size} 个站位`)
      const verifyBatchNos = Array.from(verifyPoses.keys()).sort((a, b) => a - b)
      console.error(`[Reconstruct]    实际读回 batchNos=[${verifyBatchNos.join(', ')}]`)
    } else {
      console.log(`[Reconstruct] ✅ writeGlobalPosesAll 验证通过: ${verifyPoses.size} 个站位`)
    }
  } catch (e) {
    console.warn(`[Reconstruct] ⚠️ writeGlobalPosesAll 验证读取失败: ${e.message}`)
  }
}

/**
 * 初始化 global_poses_all.txt
 * 写入站位1的单位矩阵，仅在会话首次创建时调用
 *
 * @param {string} folderName - 会话文件夹名
 * @returns {Promise<void>}
 */
export async function initGlobalPosesAll(folderName) {
  const poses = new Map()
  poses.set(1, IDENTITY_MATRIX)
  await writeGlobalPosesAll(folderName, poses)
  logger.info(`[initGlobalPosesAll] 已初始化会话级位姿文件: ${folderName}`)
}

/**
 * 检查会话根目录下 global_poses_all.txt 是否存在
 *
 * @param {string} folderName - 会话文件夹名
 * @returns {Promise<boolean>}
 */
export async function globalPosesAllExists(folderName) {
  const sessionDir = sessionFolder(folderName)
  const filePath = `${sessionDir}/${HLMRF_SESSION.GLOBAL_POSES_ALL_FILE}`
  try {
    const { stat } = await import('@/services/storage/fileSystem')
    await stat(filePath)
    return true
  } catch (_) {
    return false
  }
}

/**
 * 向 global_poses_all.txt 追加新站位的位姿矩阵
 * 先读取现有内容，追加后整体写回
 *
 * @param {string} folderName - 会话文件夹名
 * @param {number} batchNo - 新站位的批次编号（1-based）
 * @param {number[][]} matrix - 4x4 位姿矩阵
 * @returns {Promise<void>}
 */
export async function appendPoseToGlobalPosesAll(folderName, batchNo, matrix) {
  const poses = await readGlobalPosesAll(folderName)
  poses.set(batchNo, matrix)
  await writeGlobalPosesAll(folderName, poses)
  logger.info(`[appendPoseToGlobalPosesAll] 已追加站位 ${batchNo} 的位姿`)
}

/**
 * 根据剩余站位的原始点云和位姿矩阵，重建合并点云
 * 遍历每个剩余站位，读取其原始点云文件，应用位姿变换后合并，
 * 将结果写入会话根目录的 final_dense_registered_cloud.txt
 *
 * @param {string} folderName - 会话文件夹名
 * @param {Map<number, number[][]>} poses - 剩余站位的位姿 Map<batchNo, 4x4Matrix>
 * @returns {Promise<string>} 重建后的合并点云文件路径
 */
export async function rebuildDenseCloud(folderName, poses) {
  const sessionDir = sessionFolder(folderName)
  const allLines = []

  console.log(`[Reconstruct] 🔨 rebuildDenseCloud: 开始重建，共 ${poses.size} 个站位`)

  for (const [batchNo, matrix] of poses) {
    const batchIdx = batchNo - 1
    const batchDir = `${sessionDir}/Batch_${String(batchIdx).padStart(3, '0')}`

    let pointCloudFile = null
    try {
      const { files } = await readdir(batchDir)
      pointCloudFile = files.find(
        (f) =>
          f.type === 'file' && f.name.startsWith('pointCloud_data_') && f.name.endsWith('.txt'),
      )
    } catch (e) {
      logger.warn(`[rebuildDenseCloud] 无法读取批次目录: ${batchDir}`, e.message)
      continue
    }

    if (!pointCloudFile) {
      logger.warn(`[rebuildDenseCloud] 批次 ${batchNo} 无原始点云文件，跳过`)
      continue
    }

    const pcPath = `${batchDir}/${pointCloudFile.name}`
    let content
    try {
      const result = await readFile(pcPath, { encoding: 'utf8' })
      content = result.data
    } catch (e) {
      logger.warn(`[rebuildDenseCloud] 无法读取点云文件: ${pcPath}`, e.message)
      continue
    }

    const rawLines = content.trim().split('\n')
    let pointCount = 0

    for (const line of rawLines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parts = trimmed.split(/\s+/)
      if (parts.length < 3) continue

      const x = parseFloat(parts[0])
      const y = parseFloat(parts[1])
      const z = parseFloat(parts[2])

      if (isNaN(x) || isNaN(y) || isNaN(z)) continue

      const transformed = applyPoseTransform(matrix, x, y, z)

      const extraCols = parts.slice(3).join(' ')
      if (extraCols) {
        allLines.push(
          `${transformed.x.toFixed(6)} ${transformed.y.toFixed(6)} ${transformed.z.toFixed(6)} ${extraCols}`,
        )
      } else {
        allLines.push(
          `${transformed.x.toFixed(6)} ${transformed.y.toFixed(6)} ${transformed.z.toFixed(6)}`,
        )
      }
      pointCount++
    }

    logger.info(`[rebuildDenseCloud] 批次 ${batchNo}: ${pointCount} 个点已变换`)
  }

  const outputPath = `${sessionDir}/${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`

  if (allLines.length === 0) {
    // 没有点云数据，删除旧文件（所有站位已删除的情况）
    try {
      await deleteFile(outputPath)
      logger.info(`[rebuildDenseCloud] 无点云数据，已删除旧合并点云文件: ${outputPath}`)
    } catch (_) {
      // 文件可能不存在
    }
    return outputPath
  }

  await writeFile(outputPath, allLines.join('\n'), { encoding: 'utf8' })
  logger.info(`[rebuildDenseCloud] 重建完成，共 ${allLines.length} 行，输出到 ${outputPath}`)

  return outputPath
}

/**
 * 将 HLMRF 拼接输出的合并点云同步到会话根目录
 * 每次拼接完成后调用，确保会话根目录始终保持最新合并结果
 *
 * @param {string} sourcePath - 源文件路径（stitch_output 中的 final_dense_registered_cloud.txt）
 * @param {string} folderName - 会话文件夹名
 * @returns {Promise<string>} 目标文件路径
 */
export async function syncDenseCloudToSession(sourcePath, folderName) {
  const sessionDir = sessionFolder(folderName)
  const destPath = `${sessionDir}/${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`

  await copyFile(sourcePath, destPath)
  logger.info(`[syncDenseCloud] 已同步合并点云到会话根目录: ${destPath}`)
  return destPath
}

/**
 * 获取会话根目录下合并点云文件的路径
 *
 * @param {string} folderName - 会话文件夹名
 * @returns {string} 合并点云文件路径
 */
export function getSessionDenseCloudPath(folderName) {
  return `${sessionFolder(folderName)}/${HLMRF_OUTPUT.DENSE_CLOUD_FILE}`
}

/**
 * 检查会话根目录下合并点云文件是否存在
 *
 * @param {string} folderName - 会话文件夹名
 * @returns {Promise<boolean>}
 */
export async function sessionDenseCloudExists(folderName) {
  const filePath = getSessionDenseCloudPath(folderName)
  try {
    const { stat } = await import('@/services/storage/fileSystem')
    await stat(filePath)
    return true
  } catch (_) {
    return false
  }
}