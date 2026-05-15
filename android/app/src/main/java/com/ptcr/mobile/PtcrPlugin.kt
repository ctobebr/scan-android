package com.ptcr.mobile

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

@CapacitorPlugin(name = "PtcrPlugin")
class PtcrPlugin : Plugin() {

    private fun resolveBatchDir(dataDir: String, batchNo: String): File {
        val batchName = if (batchNo.startsWith("Batch_")) batchNo else "Batch_$batchNo"
        return File(AppContextHolder.getExternalFilesDir(), "pointcloud/$dataDir/$batchName")
    }

    private fun resolveRawDir(dataDir: String, batchNo: String): File {
        return File(resolveBatchDir(dataDir, batchNo), "allPicture")
    }

    private fun resolveWorkDir(dataDir: String, batchNo: String): File {
        return File(resolveBatchDir(dataDir, batchNo), "ptcr_output")
    }

    private fun findPointCloudFile(batchDir: File): String {
        val candidates = batchDir.listFiles { f ->
            f.isFile && f.name.startsWith("pointCloud_data_") && f.name.endsWith(".txt")
        } ?: emptyArray()
        return candidates.firstOrNull()?.absolutePath ?: ""
    }

    @PluginMethod
    fun healthCheck(call: PluginCall) {
        val ptcrRoot = AppContextHolder.getPtcrRoot()
        val onnxModel = AppContextHolder.getOnnxModel()
        val scriptsOk = ptcrRoot.exists() && ptcrRoot.isDirectory
        val scriptsInfo = if (scriptsOk) {
            val children = ptcrRoot.listFiles()?.map { it.name }?.joinToString(", ") ?: ""
            "dirs=[$children]"
        } else {
            "ptcrMobile\u76EE\u5F55\u4E0D\u5B58\u5728: ${ptcrRoot.absolutePath}"
        }

        val r = PtcrRunner.healthCheck()
        call.resolve(JSObject().apply {
            put("ok", r.ok && scriptsOk)
            put("task", r.task)
            put("log", "${r.log}\nptcrRoot: $scriptsInfo\nonnxModel: ${onnxModel.exists()}")
            if (!scriptsOk) put("scriptError", scriptsInfo)
            if (r.error != null) put("error", r.error)
        })
    }

    @PluginMethod
    fun generateCloud0(call: PluginCall) {
        val dataDir = call.getString("dataDir") ?: ""
        val batchNo = call.getString("batchNo") ?: ""

        if (dataDir.isEmpty() || batchNo.isEmpty()) {
            call.reject("dataDir \u548C batchNo \u662F\u5FC5\u586B\u53C2\u6570")
            return
        }

        val rawDir = resolveRawDir(dataDir, batchNo)
        val workDir = resolveWorkDir(dataDir, batchNo)
        val pointCloud = findPointCloudFile(resolveBatchDir(dataDir, batchNo))

        if (pointCloud.isEmpty()) {
            call.reject("\u5728 ${resolveBatchDir(dataDir, batchNo).absolutePath} \u4E2D\u672A\u627E\u5230 pointCloud_data_*.txt \u6587\u4EF6")
            return
        }

        workDir.mkdirs()

        val r = PtcrRunner.generateCloud0(
            projectRoot = AppContextHolder.getPtcrRoot().absolutePath,
            workDir = workDir.absolutePath,
            rawDir = rawDir.absolutePath,
            pointCloud = pointCloud,
            onProgress = { task, stage, msg ->
                notifyListeners("ptcrProgress", JSObject().apply {
                    put("task", task)
                    put("stage", stage)
                    put("message", msg)
                })
            }
        )
        call.resolve(resultToJson(r))
    }

    @PluginMethod
    fun generateCloudByRaw(call: PluginCall) {
        val dataDir = call.getString("dataDir") ?: ""
        val batchNo = call.getString("batchNo") ?: ""

        if (dataDir.isEmpty() || batchNo.isEmpty()) {
            call.reject("dataDir \u548C batchNo \u662F\u5FC5\u586B\u53C2\u6570")
            return
        }

        val rawDir = resolveRawDir(dataDir, batchNo)
        val workDir = resolveWorkDir(dataDir, batchNo)
        val pointCloud = findPointCloudFile(resolveBatchDir(dataDir, batchNo))

        if (pointCloud.isEmpty()) {
            call.reject("\u5728 ${resolveBatchDir(dataDir, batchNo).absolutePath} \u4E2D\u672A\u627E\u5230 pointCloud_data_*.txt \u6587\u4EF6")
            return
        }

        workDir.mkdirs()

        val r = PtcrRunner.generateCloudByRaw(
            projectRoot = AppContextHolder.getPtcrRoot().absolutePath,
            workDir = workDir.absolutePath,
            rawDir = rawDir.absolutePath,
            pointCloud = pointCloud,
            onnxModel = AppContextHolder.getOnnxModel().absolutePath,
            onProgress = { task, stage, msg ->
                notifyListeners("ptcrProgress", JSObject().apply {
                    put("task", task)
                    put("stage", stage)
                    put("message", msg)
                })
            }
        )
        call.resolve(resultToJson(r))
    }

    @PluginMethod
    fun generateCloudByStandard(call: PluginCall) {
        val dataDir = call.getString("dataDir") ?: ""
        val batchNo = call.getString("batchNo") ?: ""

        if (dataDir.isEmpty() || batchNo.isEmpty()) {
            call.reject("dataDir \u548C batchNo \u662F\u5FC5\u586B\u53C2\u53C2\u6570")
            return
        }

        val rawDir = resolveRawDir(dataDir, batchNo)
        val workDir = resolveWorkDir(dataDir, batchNo)
        val pointCloud = findPointCloudFile(resolveBatchDir(dataDir, batchNo))

        if (pointCloud.isEmpty()) {
            call.reject("\u5728 ${resolveBatchDir(dataDir, batchNo).absolutePath} \u4E2D\u672A\u627E\u5230 pointCloud_data_*.txt \u6587\u4EF6")
            return
        }

        workDir.mkdirs()

        val r = PtcrRunner.generateCloudByStandard(
            projectRoot = AppContextHolder.getPtcrRoot().absolutePath,
            workDir = workDir.absolutePath,
            rawDir = rawDir.absolutePath,
            pointCloud = pointCloud,
            onnxModel = AppContextHolder.getOnnxModel().absolutePath,
            onProgress = { task, stage, msg ->
                notifyListeners("ptcrProgress", JSObject().apply {
                    put("task", task)
                    put("stage", stage)
                    put("message", msg)
                })
            }
        )
        call.resolve(resultToJson(r))
    }

    private fun resultToJson(r: PtcrRunner.Result): JSObject = JSObject().apply {
        put("ok", r.ok)
        put("task", r.task)
        put("elapsedMs", r.elapsedMs)
        if (r.outputFile != null) put("outputFile", r.outputFile)
        put("log", r.log)
        if (r.error != null) put("error", r.error)
    }
}