import { registerPlugin } from '@capacitor/core'

/**
 * gpd 全景拼接算法插件
 * runProject(dataDir, mode, profile)：同步长任务，后台线程执行
 * - dataDir: 项目目录相对路径（如 pointcloud/<folderName>），需含 calib_params.txt 与 Batch_XXX
 * - mode: default(全站拼接) / single(仅最小站) / panorama(仅全景)
 * - profile: standard / low-memory
 */
const GpdPlugin = registerPlugin('GpdPlugin')

export default GpdPlugin
