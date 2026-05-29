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
        init {
            System.loadLibrary("hlmrf_plugin_core")
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