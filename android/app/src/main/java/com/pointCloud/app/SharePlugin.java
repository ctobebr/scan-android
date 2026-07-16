package com.pointCloud.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 原生分享插件
 * 通过 Android 系统分享面板分享指定文件
 */
@CapacitorPlugin(name = "SharePlugin")
public class SharePlugin extends Plugin {

    private static final String TAG = "SharePlugin";
    private static final int SHARE_REQUEST_CODE = 1001;

    private PluginCall savedCall = null;

    /**
     * 分享文件
     * 参数:
     *   filePath: 文件相对路径 (如 "pointcloud/xxx/xxx.zip")
     *   title: 分享标题
     *   dialogTitle: 分享对话框标题
     *   mimeType: MIME 类型 (默认 "application/zip")
     * 返回:
     *   shared: 是否成功发起分享
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String filePath = call.getString("filePath", "");
        String title = call.getString("title", "分享文件");
        String dialogTitle = call.getString("dialogTitle", "选择应用分享");
        String mimeType = call.getString("mimeType", "application/zip");

        if (filePath.isEmpty()) {
            call.reject("filePath 是必填参数");
            return;
        }

        // 解析文件路径
        File externalDir = AppContextHolder.getExternalFilesDir();
        File file;

        if (filePath.startsWith("/")) {
            file = new File(filePath);
        } else {
            file = new File(externalDir, filePath);
        }

        if (!file.exists()) {
            call.reject("文件不存在: " + file.getAbsolutePath());
            return;
        }

        try {
            // 通过 FileProvider 获取 content URI
            String authority = getContext().getPackageName() + ".fileprovider";
            Uri contentUri = FileProvider.getUriForFile(getContext(), authority, file);

            // 构建分享 Intent
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // 启动分享选择器
            Intent chooserIntent = Intent.createChooser(shareIntent, dialogTitle);
            chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            savedCall = call;
            getActivity().startActivity(chooserIntent);

            JSObject result = new JSObject();
            result.put("shared", true);
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "分享失败", e);
            call.reject("分享失败: " + e.getMessage());
        }
    }
}
