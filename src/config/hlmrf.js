export const HLMRF_OUTPUT = {
  DENSE_CLOUD_FILE: 'final_dense_registered_cloud.txt',
  SPARSE_CLOUD_FILE: 'preview_sparse_registered_cloud.txt',
  GLOBAL_POSES_FILE: 'global_poses.txt',
}

export const HLMRF_STITCH = {
  INPUT_DIR: 'stitch_input',
  OUTPUT_DIR: 'stitch_output',
  STITCH_DIR: 'stitch',
}

/**
 * 会话级文件配置
 * 存放在会话根目录（pointcloud/{sessionId}/），
 * 作为全局状态的唯一数据源，供渲染和 HLMRF 拼接使用
 */
export const HLMRF_SESSION = {
  /** 全局位姿记录文件，包含所有当前站位的4x4位姿矩阵 */
  GLOBAL_POSES_ALL_FILE: 'global_poses_all.txt',
  /** 最新合并点云文件，用于渲染，每次拼接或删除后更新 */
  DENSE_CLOUD_FILE: 'final_dense_registered_cloud.txt',
}
