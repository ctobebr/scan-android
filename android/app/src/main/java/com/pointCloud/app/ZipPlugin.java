package com.pointCloud.app;

import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 原生 ZIP 压缩插件
 * 将指定会话文件夹打包为 ZIP 文件
 */
@CapacitorPlugin(name = "ZipPlugin")
public class ZipPlugin extends Plugin {

    private static final String TAG = "ZipPlugin";
    private static final int BUFFER_SIZE = 8192;

    /**
     * 创建 ZIP 压缩包
     * 参数:
     *   sessionFolderName: 会话文件夹名 (如 "a7f3c9d1-xxx" 或 "项目名_sessionId")
     *   zipFileName: ZIP 文件名 (不含扩展名，可选)
     * 返回:
     *   uri: 文件 content URI
     *   path: 相对路径
     *   cached: 是否使用了已存在的 ZIP
     */
    @PluginMethod
    public void createZip(PluginCall call) {
        String sessionFolderName = call.getString("sessionFolderName", "");
        String zipFileName = call.getString("zipFileName", "");

        if (sessionFolderName.isEmpty()) {
            call.reject("sessionFolderName 是必填参数");
            return;
        }

        File externalDir = AppContextHolder.getExternalFilesDir();
        File sourceDir = new File(externalDir, "pointcloud/" + sessionFolderName);

        if (!sourceDir.exists() || !sourceDir.isDirectory()) {
            call.reject("项目文件夹不存在: " + sourceDir.getAbsolutePath());
            return;
        }

        String safeBase = sanitizeFileName(zipFileName.isEmpty() ? sessionFolderName : zipFileName);
        File zipFile = new File(sourceDir, safeBase + ".zip");

        // 如果 ZIP 已存在，直接返回
        if (zipFile.exists()) {
            String contentUri = getFileUri(zipFile);
            JSObject result = new JSObject();
            result.put("uri", contentUri);
            result.put("path", "pointcloud/" + sessionFolderName + "/" + safeBase + ".zip");
            result.put("relativePath", "pointcloud/" + sessionFolderName + "/" + safeBase + ".zip");
            result.put("cached", true);
            call.resolve(result);
            return;
        }

        try {
            int fileCount = zipDirectory(sourceDir, zipFile);

            if (fileCount == 0) {
                zipFile.delete();
                call.reject("项目文件夹下无文件");
                return;
            }

            String contentUri = getFileUri(zipFile);
            JSObject result = new JSObject();
            result.put("uri", contentUri);
            result.put("path", "pointcloud/" + sessionFolderName + "/" + safeBase + ".zip");
            result.put("relativePath", "pointcloud/" + sessionFolderName + "/" + safeBase + ".zip");
            result.put("cached", false);
            result.put("fileCount", fileCount);
            result.put("zipSize", zipFile.length());
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "创建ZIP失败", e);
            if (zipFile.exists()) {
                zipFile.delete();
            }
            call.reject("创建ZIP失败: " + e.getMessage());
        }
    }

    /**
     * 将目录压缩为 ZIP 文件
     */
    private int zipDirectory(File sourceDir, File zipFile) throws Exception {
        int fileCount;
        ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(zipFile)));
        try {
            zos.setLevel(java.util.zip.Deflater.DEFAULT_COMPRESSION);
            String sourcePath = sourceDir.getAbsolutePath();
            fileCount = addFilesToZip(zos, sourceDir, sourcePath);
        } finally {
            zos.close();
        }
        return fileCount;
    }

    /**
     * 递归添加文件到 ZIP
     */
    private int addFilesToZip(ZipOutputStream zos, File dir, String sourcePath) throws Exception {
        int count = 0;
        File[] files = dir.listFiles();
        if (files == null) return 0;

        for (File file : files) {
            // 跳过已有的 zip 文件
            if (file.getName().endsWith(".zip")) continue;

            if (file.isDirectory()) {
                count += addFilesToZip(zos, file, sourcePath);
            } else {
                String entryName = file.getAbsolutePath().substring(sourcePath.length() + 1);
                ZipEntry entry = new ZipEntry(entryName);
                zos.putNextEntry(entry);

                BufferedInputStream bis = new BufferedInputStream(new FileInputStream(file), BUFFER_SIZE);
                try {
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int read;
                    while ((read = bis.read(buffer)) != -1) {
                        zos.write(buffer, 0, read);
                    }
                } finally {
                    bis.close();
                }

                zos.closeEntry();
                count++;
            }
        }
        return count;
    }

    /**
     * 清理文件名中的非法字符
     */
    private String sanitizeFileName(String fileName) {
        return fileName
                .replaceAll("[\\\\/:*?\"<>|]", "_")
                .replaceAll("\\s+", "_")
                .substring(0, Math.min(fileName.length(), 100));
    }

    /**
     * 获取文件的 content URI (通过 FileProvider)
     */
    private String getFileUri(File file) {
        return Uri.fromFile(file).toString();
    }
}
