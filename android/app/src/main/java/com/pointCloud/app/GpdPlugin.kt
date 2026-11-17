package com.pointCloud.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.gimbalpanodense.sdk.GpdNative
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * gpd（GimbalPanodense-DepthMaster）原生算法插件
 *
 * 封装 GpdNative.runProject 的同步阻塞调用：
 * - 单线程 Executor 串行执行（GpdNative 同进程任务必须串行）
 * - 任务期间启动前台服务防止进程被杀
 * - 运行资源目录：内部存储 files/gpd-runtime/（由 push-libs 部署，含 yaml 配置与 models/ 模型）
 * - 项目目录：外部存储 Android/data/<pkg>/files/<dataDir>（如 pointcloud/<folderName>）
 *
 * 成功返回 { ok, message, finalPlyPath, elapsedMs }，失败 reject（含 gpd 抛出的错误信息）。
 */
@CapacitorPlugin(name = "GpdPlugin")
class GpdPlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)

    private val supportedModes = setOf("default", "single", "panorama")
    private val supportedProfiles = setOf("standard", "low-memory")

    /** 拼接结果输出文件（项目根 final.ply） */
    private fun finalPlyFile(projectDir: File) = File(projectDir, "final.ply")

    /** 解析项目目录绝对路径（外部存储 files 下） */
    private fun resolveProjectDir(dataDir: String): File {
        val base = context.getExternalFilesDir(null)
            ?: throw IllegalStateException("外部存储不可用")
        return File(base, dataDir)
    }

    /** 运行资源目录（内部存储 files/gpd-runtime） */
    private fun resourceDir(): File = File(context.filesDir, "gpd-runtime")

    @PluginMethod
    fun runProject(call: PluginCall) {
        val dataDir = call.getString("dataDir")
        if (dataDir.isNullOrBlank()) {
            call.reject("缺少 dataDir 参数")
            return
        }
        val mode = call.getString("mode") ?: "default"
        val profile = call.getString("profile") ?: "low-memory"

        if (mode !in supportedModes) {
            call.reject("不支持的 mode: $mode")
            return
        }
        if (profile !in supportedProfiles) {
            call.reject("不支持的 profile: $profile")
            return
        }
        if (!running.compareAndSet(false, true)) {
            call.reject("拼接任务进行中，请等待完成")
            return
        }

        val projectDir = resolveProjectDir(dataDir)
        val resDir = resourceDir()

        // 输入校验（fail-fast，避免空跑长任务）
        if (!projectDir.isDirectory) {
            running.set(false)
            call.reject("项目目录不存在: ${projectDir.absolutePath}")
            return
        }
        if (!projectDir.resolve("calib_params.txt").isFile) {
            running.set(false)
            call.reject("项目缺少 calib_params.txt，请先连接设备读取标定参数")
            return
        }
        val profileYaml = if (profile == "low-memory") "gpd_low_memory.yaml" else "gpd_defaults.yaml"
        if (!resDir.resolve(profileYaml).isFile || !resDir.resolve("models").isDirectory) {
            running.set(false)
            call.reject("运行资源不完整（缺少 $profileYaml 或 models/），请先执行 npm run push-libs")
            return
        }

        GpdForegroundService.start(context)
        val startMs = System.currentTimeMillis()
        val projectPath = projectDir.absolutePath
        val resourcePath = resDir.absolutePath

        executor.execute {
            try {
                val message = GpdNative.runProject(projectPath, resourcePath, mode, profile)
                val elapsedMs = System.currentTimeMillis() - startMs
                val result = JSObject()
                result.put("ok", true)
                result.put("message", message)
                result.put("finalPlyPath", finalPlyFile(projectDir).absolutePath)
                result.put("elapsedMs", elapsedMs)
                call.resolve(result)
            } catch (e: Throwable) {
                call.reject(e.message ?: "gpd 计算失败")
            } finally {
                GpdForegroundService.stop(context)
                running.set(false)
            }
        }
    }

    /**
     * 健康检查：校验运行资源目录与 so 加载是否可用
     */
    @PluginMethod
    fun healthCheck(call: PluginCall) {
        val resDir = resourceDir()
        val detail = JSObject()
        detail.put("resourceDir", resDir.absolutePath)
        detail.put("hasDefaults", resDir.resolve("gpd_defaults.yaml").isFile)
        detail.put("hasLowMemory", resDir.resolve("gpd_low_memory.yaml").isFile)
        detail.put("hasModels", resDir.resolve("models").isDirectory)

        var soLoaded = false
        var soError: String? = null
        try {
            // 触发 GpdNative 静态初始化（System.loadLibrary("gpd_android")）
            Class.forName("com.gimbalpanodense.sdk.GpdNative")
            soLoaded = true
        } catch (e: Throwable) {
            soError = e.message
        }
        detail.put("soLoaded", soLoaded)
        if (soError != null) detail.put("soError", soError)

        val ok = detail.getBoolean("hasLowMemory") == true &&
            detail.getBoolean("hasModels") == true &&
            soLoaded
        val result = JSObject()
        result.put("ok", ok)
        result.put("detail", detail)
        call.resolve(result)
    }
}
