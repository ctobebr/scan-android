package com.ptcr.mobile

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import java.io.File
import java.io.FileOutputStream
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.math.min

object DapOnnxDepthEstimator {
    private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }

    data class Result(
        val outputFile: File,
        val width: Int,
        val height: Int,
        val minDepth: Float,
        val maxDepth: Float,
        val meanDepth: Float,
        val elapsedMs: Long,
    )

    fun inferDepthPng(
        modelFile: File,
        inputImage: File,
        outputFile: File,
        inputWidth: Int = 640,
        inputHeight: Int = 320,
        clipMax: Float = 0.1f,
    ): Result {
        require(modelFile.exists()) { "ONNX model not found: ${modelFile.absolutePath}" }
        require(inputImage.exists()) { "Input pano not found: ${inputImage.absolutePath}" }
        require(inputWidth > 0 && inputHeight > 0) { "Input size must be positive." }

        val start = System.currentTimeMillis()
        val bitmap = BitmapFactory.decodeFile(inputImage.absolutePath)
            ?: error("Failed to decode image: ${inputImage.absolutePath}")
        val resized = Bitmap.createScaledBitmap(bitmap, inputWidth, inputHeight, true)
        val inputData = bitmapToChwFloat(resized)

        var outWidth = inputWidth
        var outHeight = inputHeight
        var depthData = FloatArray(inputWidth * inputHeight)

        OrtSession.SessionOptions().use { sessionOptions ->
            sessionOptions.setIntraOpNumThreads(1)
            sessionOptions.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT)

            env.createSession(modelFile.absolutePath, sessionOptions).use { session ->
                val inputName = session.inputNames.firstOrNull() ?: "input"
                val inputShape = longArrayOf(1, 3, inputHeight.toLong(), inputWidth.toLong())
                OnnxTensor.createTensor(env, FloatBuffer.wrap(inputData), inputShape).use { tensor ->
                    session.run(mapOf(inputName to tensor)).use { outputs ->
                        val outTensor = outputs[0] as? OnnxTensor
                            ?: error("Model output[0] is not OnnxTensor.")
                        val (w, h, data) = extractDepth(outTensor)
                        outWidth = w
                        outHeight = h
                        depthData = data
                    }
                }
            }
        }

        outputFile.parentFile?.mkdirs()
        val depthBitmap = depthToGrayBitmap(depthData, outWidth, outHeight, clipMax)
        FileOutputStream(outputFile).use { output ->
            check(depthBitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                "Failed to write PNG: ${outputFile.absolutePath}"
            }
        }

        var dMin = Float.POSITIVE_INFINITY
        var dMax = Float.NEGATIVE_INFINITY
        var sum = 0.0f
        for (v in depthData) {
            dMin = min(dMin, v)
            dMax = max(dMax, v)
            sum += v
        }
        val mean = if (depthData.isNotEmpty()) sum / depthData.size else 0.0f

        return Result(
            outputFile = outputFile,
            width = outWidth,
            height = outHeight,
            minDepth = dMin,
            maxDepth = dMax,
            meanDepth = mean,
            elapsedMs = System.currentTimeMillis() - start,
        )
    }

    private fun bitmapToChwFloat(bitmap: Bitmap): FloatArray {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val hw = width * height
        val data = FloatArray(3 * hw)
        for (i in pixels.indices) {
            val c = pixels[i]
            data[i] = ((c shr 16) and 0xFF) / 255.0f
            data[hw + i] = ((c shr 8) and 0xFF) / 255.0f
            data[2 * hw + i] = (c and 0xFF) / 255.0f
        }
        return data
    }

    private fun extractDepth(outTensor: OnnxTensor): Triple<Int, Int, FloatArray> {
        val shape = outTensor.info.shape
        require(shape.size >= 2) { "Unexpected output shape: ${shape.contentToString()}" }

        val outHeight = shape[shape.size - 2].toInt()
        val outWidth = shape[shape.size - 1].toInt()
        val data = FloatArray(outWidth * outHeight)
        val buffer = outTensor.floatBuffer
        buffer.rewind()
        buffer.get(data)
        return Triple(outWidth, outHeight, data)
    }

    private fun depthToGrayBitmap(depth: FloatArray, width: Int, height: Int, clipMax: Float): Bitmap {
        val pixels = IntArray(width * height)
        val safeClip = clipMax.takeIf { it > 0.0f } ?: 0.1f
        for (i in depth.indices) {
            val norm = (depth[i].coerceIn(0.0f, safeClip) / safeClip).coerceIn(0.0f, 1.0f)
            val gray = (norm * 255.0f).toInt().coerceIn(0, 255)
            pixels[i] = Color.rgb(gray, gray, gray)
        }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }
}