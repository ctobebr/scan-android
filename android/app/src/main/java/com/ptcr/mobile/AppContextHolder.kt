package com.ptcr.mobile

import android.app.Application
import android.util.Log
import java.io.File

object AppContextHolder {
    private val TAG = "AppContextHolder"
    lateinit var app: Application
        private set

    fun init(application: Application) {
        app = application
        ensureNativeLibs()
        ensurePtcrResources()
    }

    fun getExternalFilesDir(): File {
        return app.getExternalFilesDir(null)
            ?: throw IllegalStateException("ExternalFilesDir is null")
    }

    /**
     * ptcrMobile 资源根目录（内部存储，Python 脚本可执行）
     * Android 15 不允许 app 访问 ExternalFilesDir 下 adb push 的 shell-owned 目录，
     * 因此资源需部署到内部存储（app-owned），Python os.chdir 才能正常工作。
     */
    fun getPtcrRoot(): File {
        return File(app.getFilesDir(), "ptcrMobile")
    }

    /**
     * ONNX 模型路径（外部存储，由 Kotlin DapOnnxDepthEstimator 通过框架 API 访问）
     * 1.3GB 文件不适合复制到内部存储；cloud0 方法不使用 ONNX。
     */
    fun getOnnxModel(): File {
        return File(getExternalFilesDir(), "ptcrMobile/dap_depth_only.onnx")
    }

    private fun getAppVersionCode(): Int {
        return try {
            val pi = app.packageManager.getPackageInfo(app.packageName, 0)
            pi.longVersionCode.toInt()
        } catch (e: Exception) {
            0
        }
    }

    /**
     * 原生库部署目录（内部存储，支持执行）
     */
    fun getNativeLibDir(): File {
        return File(app.getFilesDir(), "native_lib")
    }

    /**
     * 从外部存储（adb push 目标目录）复制 .so 文件到内部存储
     * 外部存储目录: /sdcard/Android/data/com.pointCloud.app/files/lib/arm64-v8a/
     * 内部存储目录: /data/data/com.pointCloud.app/files/native_lib/
     */
    private fun ensureNativeLibs() {
        val targetDir = getNativeLibDir()
        val versionFile = File(targetDir, ".deployed_version")
        val currentVersion = getAppVersionCode()

        // 已部署且版本一致则跳过
        if (versionFile.exists() && versionFile.readText().trim() == currentVersion.toString()) {
            val count = targetDir.listFiles()?.count { it.name.endsWith(".so") } ?: 0
            if (count > 0) {
                Log.d(TAG, "原生库已部署 (version=$currentVersion, count=$count)")
                return
            }
        }

        // 外部存储中的 .so 来源目录
        val sourceDir = File(getExternalFilesDir(), "lib/arm64-v8a")
        if (!sourceDir.exists() || !sourceDir.isDirectory) {
            Log.d(TAG, "外部存储无原生库目录: $sourceDir")
            return
        }

        val soFiles = sourceDir.listFiles()?.filter { it.name.endsWith(".so") } ?: return
        if (soFiles.isEmpty()) {
            Log.d(TAG, "外部存储无 .so 文件")
            return
        }

        Log.i(TAG, "开始部署原生库 (${soFiles.size} 个文件)...")
        targetDir.mkdirs()

        var success = 0
        for (src in soFiles) {
            try {
                val dst = File(targetDir, src.name)
                src.copyTo(dst, overwrite = true)
                // 确保可执行权限
                dst.setExecutable(true, false)
                dst.setReadable(true, false)
                success++
                Log.d(TAG, "  部署: ${src.name}")
            } catch (e: Exception) {
                Log.e(TAG, "  部署失败: ${src.name}", e)
            }
        }

        if (success > 0) {
            versionFile.writeText(currentVersion.toString())
            Log.i(TAG, "原生库部署完成 ($success/${soFiles.size})")
        }
    }

    /**
     * 从外部存储（adb push 目标目录）复制 ptcrMobile Python 脚本到内部存储
     * 外部存储目录: /sdcard/Android/data/com.pointCloud.app/files/ptcrMobile/
     * 内部存储目录: /data/data/com.pointCloud.app/files/ptcrMobile/
     *
     * Android 15 不允许 Python (os.chdir) 访问 ExternalFilesDir 下 shell-owned 目录，
     * 但 Kotlin File API 可通过 FUSE 读取，复制到内部存储后变为 app-owned。
     */
    private fun ensurePtcrResources() {
        val targetDir = getPtcrRoot()
        val versionFile = File(targetDir, ".deployed_version")
        val currentVersion = getAppVersionCode()

        // 已部署且版本一致则跳过
        if (versionFile.exists() && versionFile.readText().trim() == currentVersion.toString()) {
            val count = countPyFiles(targetDir)
            if (count > 0) {
                Log.d(TAG, "ptcrMobile 资源已部署 (version=$currentVersion, scripts=$count)")
                return
            }
        }

        val sourceDir = File(getExternalFilesDir(), "ptcrMobile")
        if (!sourceDir.exists() || !sourceDir.isDirectory) {
            Log.w(TAG, "ptcrMobile 源目录不存在: ${sourceDir.absolutePath}")
            return
        }

        Log.i(TAG, "开始部署 ptcrMobile 资源到内部存储...")
        targetDir.mkdirs()

        var success = 0
        var fail = 0
        sourceDir.walkTopDown().forEach { source ->
            if (source == sourceDir) return@forEach
            // 跳过 ONNX 模型（1.3GB，保留在外部存储，由 Kotlin 框架 API 访问）
            if (source.name == "dap_depth_only.onnx") return@forEach

            val relative = source.relativeTo(sourceDir)
            val target = File(targetDir, relative.path)
            try {
                if (source.isDirectory) {
                    target.mkdirs()
                } else {
                    target.parentFile?.mkdirs()
                    source.copyTo(target, overwrite = true)
                    target.setReadable(true, false)
                    success++
                }
            } catch (e: Exception) {
                Log.e(TAG, "  ptcr 部署失败: $relative", e)
                fail++
            }
        }

        if (success > 0 && fail == 0) {
            versionFile.writeText(currentVersion.toString())
            Log.i(TAG, "ptcrMobile 资源部署完成 ($success 个文件)")
        } else {
            Log.w(TAG, "ptcrMobile 资源部署有失败 ($success 成功, $fail 失败)")
        }
    }

    private fun countPyFiles(dir: File): Int {
        return dir.walkTopDown().filter { it.isFile && it.name.endsWith(".py") }.count()
    }
}
