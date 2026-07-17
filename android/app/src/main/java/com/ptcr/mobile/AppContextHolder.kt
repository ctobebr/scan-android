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
    }

    fun getExternalFilesDir(): File {
        return app.getExternalFilesDir(null)
            ?: throw IllegalStateException("ExternalFilesDir is null")
    }

    fun getPtcrRoot(): File {
        return File(getExternalFilesDir(), "ptcrMobile")
    }

    fun getOnnxModel(): File {
        return File(getPtcrRoot(), "dap_depth_only.onnx")
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
}
