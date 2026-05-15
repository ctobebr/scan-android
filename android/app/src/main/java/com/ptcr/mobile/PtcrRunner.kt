package com.ptcr.mobile

import android.util.Log
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import org.json.JSONObject
import java.io.File

object PtcrRunner {

    private val TAG = "PtcrRunner"

    data class Result(
        val ok: Boolean,
        val task: String,
        val elapsedMs: Long = 0,
        val outputFile: String? = null,
        val outputs: List<String> = emptyList(),
        val log: String = "",
        val error: String? = null
    )

    fun interface ProgressCallback {
        fun onProgress(task: String, stage: String, msg: String)
    }

    fun healthCheck(): Result {
        return try {
            val py = ensurePython()
            val info = py.getModule("ptcr_bridge").callAttr("health_check").toString()
            Result(ok = true, task = "healthCheck", log = info)
        } catch (e: Exception) {
            Result(ok = false, task = "healthCheck", error = e.stackTraceToString())
        }
    }

    fun generateCloud0(
        projectRoot: String,
        workDir: String,
        rawDir: String,
        pointCloud: String,
        onnxModel: String = "",
        onProgress: ProgressCallback? = null
    ): Result {
        val tag = "generate_cloud_0"
        onProgress?.onProgress(tag, "start", "\u65E0\u6DF1\u5EA6\u4F30\u8BA1\uFF0C\u751F\u6210\u5F69\u8272\u7A00\u758F\u70B9\u4E91")
        val t0 = System.currentTimeMillis()
        val log = StringBuilder()

        try {
            runPy(tag, "prepare", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "stitch_raw", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "sparse_depth", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "geom_raw", projectRoot, workDir, rawDir, pointCloud, onProgress, log)

            val out = "$workDir/ply_raw.ply"
            onProgress?.onProgress(tag, "finish", "\u5B8C\u6210 \u2192 $out")
            return Result(ok = true, task = tag,
                elapsedMs = System.currentTimeMillis() - t0,
                outputFile = out, log = log.toString().trim())
        } catch (e: Exception) {
            Log.e(TAG, "$tag \u5931\u8D25", e)
            onProgress?.onProgress(tag, "error", e.message ?: "")
            return Result(ok = false, task = tag,
                elapsedMs = System.currentTimeMillis() - t0,
                error = e.stackTraceToString(), log = log.toString().trim())
        }
    }

    fun generateCloudByRaw(
        projectRoot: String,
        workDir: String,
        rawDir: String,
        pointCloud: String,
        onnxModel: String,
        onProgress: ProgressCallback? = null
    ): Result {
        val tag = "generate_cloud_by_raw"
        onProgress?.onProgress(tag, "start", "\u5FEB\u901F\u5BC6\u96C6\u5F69\u8272\u70B9\u4E91 (raw)")
        val t0 = System.currentTimeMillis()
        val log = StringBuilder()

        try {
            runPy(tag, "prepare", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "stitch_raw", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runOnnx(tag, "raw", workDir, onnxModel, onProgress, log)
            runPy(tag, "sparse_depth", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "fusion_raw", projectRoot, workDir, rawDir, pointCloud, onProgress, log)

            val out = "$workDir/fused_raw.ply"
            onProgress?.onProgress(tag, "finish", "\u5B8C\u6210 \u2192 $out")
            return Result(ok = true, task = tag,
                elapsedMs = System.currentTimeMillis() - t0,
                outputFile = out, log = log.toString().trim())
        } catch (e: Exception) {
            Log.e(TAG, "$tag \u5931\u8D25", e)
            onProgress?.onProgress(tag, "error", e.message ?: "")
            return Result(ok = false, task = tag,
                elapsedMs = System.currentTimeMillis() - t0,
                error = e.stackTraceToString(), log = log.toString().trim())
        }
    }

    fun generateCloudByStandard(
        projectRoot: String,
        workDir: String,
        rawDir: String,
        pointCloud: String,
        onnxModel: String,
        onProgress: ProgressCallback? = null
    ): Result {
        val tag = "generate_cloud_by_standard"
        onProgress?.onProgress(tag, "start", "\u6807\u51C6\u8D28\u91CF\u5BC6\u96C6\u5F69\u8272\u70B9\u4E91 (standard)")
        val t0 = System.currentTimeMillis()
        val log = StringBuilder()

        try {
            runPy(tag, "prepare", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "stitch_standard", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runOnnx(tag, "standard", workDir, onnxModel, onProgress, log)
            runPy(tag, "sparse_depth", projectRoot, workDir, rawDir, pointCloud, onProgress, log)
            runPy(tag, "fusion_standard", projectRoot, workDir, rawDir, pointCloud, onProgress, log)

            val out = "$workDir/fused_standard.ply"
            onProgress?.onProgress(tag, "finish", "\u5B8C\u6210 \u2192 $out")
            return Result(ok = true, task = tag,
                elapsedMs = System.currentTimeMillis() - t0,
                outputFile = out, log = log.toString().trim())
        } catch (e: Exception) {
            Log.e(TAG, "$tag \u5931\u8D25", e)
            onProgress?.onProgress(tag, "error", e.message ?: "")
            return Result(ok = false, task = tag,
                elapsedMs = System.currentTimeMillis() - t0,
                error = e.stackTraceToString(), log = log.toString().trim())
        }
    }

    private fun ensurePython(): Python {
        val app = AppContextHolder.app ?: throw IllegalStateException("App context not set")
        if (!Python.isStarted()) {
            Python.start(AndroidPlatform(app))
        }
        return Python.getInstance()
    }
    // 进度是 阶段驱动 没有百分比，没有中间更新
    private fun runPy(
        tag: String,
        taskName: String,
        projectRoot: String,
        workDir: String,
        rawDir: String,
        pointCloud: String,
        onProgress: ProgressCallback?,
        log: StringBuilder
    ) {
        onProgress?.onProgress(tag, "running", taskName)
        val py = ensurePython()
        val json = py.getModule("ptcr_bridge").callAttr(
            "run_task", projectRoot, taskName, workDir, rawDir, pointCloud, "raw,standard,opt"
        ).toString()
        val obj = JSONObject(json)
        log.appendLine(obj.optString("log"))
        if (!obj.optBoolean("ok")) {
            throw RuntimeException("$taskName \u5931\u8D25: ${obj.optString("log")}")
        }
        onProgress?.onProgress(tag, "success", "$taskName \u5B8C\u6210 (${"%.1f".format(obj.optDouble("elapsedSec"))}s)")
    }

    private fun runOnnx(
        tag: String,
        mode: String,
        workDir: String,
        onnxModel: String,
        onProgress: ProgressCallback?,
        log: StringBuilder
    ) {
        val taskName = "depth_$mode"
        onProgress?.onProgress(tag, "running", "$taskName (ONNX)")
        val result = DapOnnxDepthEstimator.inferDepthPng(
            modelFile = File(onnxModel),
            inputImage = File(workDir, "pano_$mode.png"),
            outputFile = File(workDir, "depth_$mode.png"),
            inputWidth = 640,
            inputHeight = 320,
            clipMax = 0.1f,
        )
        log.appendLine("[ONNX] $taskName size=${result.width}x${result.height} min=${result.minDepth} max=${result.maxDepth} mean=${result.meanDepth} elapsed=${result.elapsedMs}ms")
        onProgress?.onProgress(tag, "success", "$taskName \u5B8C\u6210 (${result.elapsedMs}ms)")
    }
}