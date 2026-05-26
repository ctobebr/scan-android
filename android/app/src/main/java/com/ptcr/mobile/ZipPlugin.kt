package com.ptcr.mobile

import android.net.Uri
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@CapacitorPlugin(name = "ZipPlugin")
class ZipPlugin : Plugin() {

    companion object {
        private const val TAG = "ZipPlugin"
        private const val BUFFER_SIZE = 8192
    }

    @PluginMethod
    fun createZip(call: PluginCall) {
        val sessionFolderName = call.getString("sessionFolderName") ?: ""
        val zipFileName = call.getString("zipFileName") ?: ""

        if (sessionFolderName.isEmpty()) {
            call.reject("sessionFolderName 是必填参数")
            return
        }

        val externalDir = AppContextHolder.getExternalFilesDir()
        val sourceDir = File(externalDir, "pointcloud/$sessionFolderName")

        if (!sourceDir.exists() || !sourceDir.isDirectory) {
            call.reject("项目文件夹不存在: ${sourceDir.absolutePath}")
            return
        }

        val safeBase = sanitizeFileName(if (zipFileName.isNotEmpty()) zipFileName else sessionFolderName)
        val zipFile = File(sourceDir, "$safeBase.zip")

        if (zipFile.exists()) {
            val contentUri = getFileUri(zipFile)
            call.resolve(JSObject().apply {
                put("uri", contentUri)
                put("path", "pointcloud/$sessionFolderName/$safeBase.zip")
                put("relativePath", "pointcloud/$sessionFolderName/$safeBase.zip")
                put("cached", true)
            })
            return
        }

        try {
            val fileCount = zipDirectory(sourceDir, zipFile)

            if (fileCount == 0) {
                zipFile.delete()
                call.reject("项目文件夹下无文件")
                return
            }

            val contentUri = getFileUri(zipFile)
            call.resolve(JSObject().apply {
                put("uri", contentUri)
                put("path", "pointcloud/$sessionFolderName/$safeBase.zip")
                put("relativePath", "pointcloud/$sessionFolderName/$safeBase.zip")
                put("cached", false)
                put("fileCount", fileCount)
                put("zipSize", zipFile.length())
            })
        } catch (e: Exception) {
            Log.e(TAG, "创建ZIP失败", e)
            if (zipFile.exists()) {
                zipFile.delete()
            }
            call.reject("创建ZIP失败: ${e.message}")
        }
    }

    private fun zipDirectory(sourceDir: File, zipFile: File): Int {
        var fileCount = 0
        ZipOutputStream(BufferedOutputStream(FileOutputStream(zipFile))).use { zos ->
            zos.setLevel(java.util.zip.Deflater.DEFAULT_COMPRESSION)
            val sourcePath = sourceDir.absolutePath
            fileCount = addFilesToZip(zos, sourceDir, sourcePath)
        }
        return fileCount
    }

    private fun addFilesToZip(zos: ZipOutputStream, dir: File, sourcePath: String): Int {
        var count = 0
        val files = dir.listFiles() ?: return 0

        for (file in files) {
            if (file.name.endsWith(".zip")) continue

            if (file.isDirectory) {
                count += addFilesToZip(zos, file, sourcePath)
            } else {
                val entryName = file.absolutePath.substring(sourcePath.length + 1)
                val entry = ZipEntry(entryName)
                zos.putNextEntry(entry)

                BufferedInputStream(FileInputStream(file), BUFFER_SIZE).use { bis ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    var read: Int
                    while (bis.read(buffer).also { read = it } != -1) {
                        zos.write(buffer, 0, read)
                    }
                }

                zos.closeEntry()
                count++
            }
        }
        return count
    }

    private fun sanitizeFileName(fileName: String): String {
        return fileName
            .replace(Regex("[\\\\/:*?\"<>|]"), "_")
            .replace(Regex("\\s+"), "_")
            .take(100)
    }

    private fun getFileUri(file: File): String {
        return Uri.fromFile(file).toString()
    }
}
