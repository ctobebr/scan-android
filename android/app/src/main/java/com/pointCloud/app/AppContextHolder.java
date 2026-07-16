package com.pointCloud.app;

import android.app.Application;
import android.content.Context;

/**
 * 全局 Application 上下文持有者
 * 供原生插件获取应用上下文和外部存储目录
 */
public class AppContextHolder {

    private static Application application;

    public static void init(Application app) {
        application = app;
    }

    public static Context getContext() {
        if (application == null) {
            throw new IllegalStateException("AppContextHolder not initialized. Call init() in MainActivity.onCreate()");
        }
        return application.getApplicationContext();
    }

    /**
     * 获取外部文件目录 (context.getExternalFilesDir(null))
     * 对应 Capacitor Filesystem 的根目录
     */
    public static java.io.File getExternalFilesDir() {
        Context ctx = getContext();
        java.io.File dir = ctx.getExternalFilesDir(null);
        if (dir == null) {
            throw new RuntimeException("External files dir is null");
        }
        return dir;
    }
}
