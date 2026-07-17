package com.hlmrf.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.ptcr.mobile.AppContextHolder
import java.io.File

@CapacitorPlugin(name = "HLMRFPlugin")
class HLMRFPlugin : Plugin() {
    companion object {
        private var libraryLoaded = false

        /**
         * 部署目录中 .so 的加载顺序（按依赖关系排列）
         */
        private val NATIVE_LIB_LOAD_ORDER = listOf(
            "libboost_system.so",
            "libboost_atomic.so",
            "libboost_date_time.so",
            "libboost_iostreams.so",
            "libboost_filesystem.so",
            "libboost_regex.so",
            "libflann_cpp.so",
            "libqhull_r.so",
            "libpcl_common.so",
            "libpcl_octree.so",
            "libpcl_kdtree.so",
            "libpcl_search.so",
            "libpcl_io_ply.so",
            "libpcl_io.so",
            "libpcl_filters.so",
            "libpcl_keypoints.so",
            "libpcl_sample_consensus.so",
            "libpcl_features.so",
            "libpcl_registration.so",
            "libhlmrf_plugin_core.so",
        )

        private fun ensureLibrary() {
            if (libraryLoaded) return

            // 1. 先尝试从 APK 原生库目录加载
            try {
                System.loadLibrary("hlmrf_plugin_core")
                libraryLoaded = true
                return
            } catch (_: UnsatisfiedLinkError) {
                // 不在 APK 中，尝试从部署目录加载
            }

            // 2. 从内部存储的部署目录按依赖顺序加载
            try {
                val libDir = AppContextHolder.getNativeLibDir()
                for (libName in NATIVE_LIB_LOAD_ORDER) {
                    val libFile = File(libDir, libName)
                    if (libFile.exists()) {
                        System.load(libFile.absolutePath)
                    }
                }
                libraryLoaded = true
                return
            } catch (e: UnsatisfiedLinkError) {
                android.util.Log.e("HLMRFPlugin", "从部署目录加载失败", e)
            } catch (e: Exception) {
                android.util.Log.e("HLMRFPlugin", "从部署目录加载异常", e)
            }
        }
    }

    external fun runNativeRegistration(
        inputDir: String,
        outputDir: String,
        blockSize: Int,
        downsampleSize: Float,
        downsampleSizeIcp: Float,
        lumIterations: Int,
        maxConsensusSet: Int,
        threads: Int,
        visualizeEachBlock: Int,
    ): String

    private fun resolvePath(relativePath: String): String {
        if (relativePath.startsWith("/")) {
            return relativePath
        }
        return File(AppContextHolder.getExternalFilesDir(), relativePath).absolutePath
    }

    @PluginMethod
    fun runRegistration(call: PluginCall) {
        ensureLibrary()
        if (!libraryLoaded) {
            call.reject("原生库加载失败: libhlmrf_plugin_core.so 不可用，请运行 npm run push-libs")
            return
        }

        val inputDir = call.getString("inputDir")
        val outputDir = call.getString("outputDir")
        if (inputDir.isNullOrBlank() || outputDir.isNullOrBlank()) {
            call.reject("inputDir and outputDir are required")
            return
        }

        val absInputDir = resolvePath(inputDir)
        val absOutputDir = resolvePath(outputDir)

        File(absOutputDir).mkdirs()

        val error = runNativeRegistration(
            absInputDir,
            absOutputDir,
            call.getInt("blockSize", 4) ?: 4,
            (call.getDouble("downsampleSize", 0.1) ?: 0.1).toFloat(),
            (call.getDouble("downsampleSizeIcp", 0.1) ?: 0.1).toFloat(),
            call.getInt("lumIterations", 3) ?: 3,
            call.getInt("maxConsensusSet", 10) ?: 10,
            call.getInt("threads", 2) ?: 2,
            if (call.getBoolean("visualizeEachBlock", false) == true) 1 else 0,
        )

        if (error.isNotEmpty()) {
            call.reject(error)
            return
        }

        val result = JSObject()
        result.put("ok", true)
        result.put("outputDir", outputDir)
        result.put("alignedPointCloudPath", "$outputDir/preview_sparse_registered_cloud.txt")
        result.put("alignedBlockPath", "$outputDir/final_dense_registered_cloud.txt")
        call.resolve(result)
    }
}