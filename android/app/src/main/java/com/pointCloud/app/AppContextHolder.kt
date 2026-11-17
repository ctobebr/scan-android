package com.pointCloud.app

import android.app.Application
import java.io.File

/**
 * Application 上下文持有者（供 ZipPlugin 获取外部存储目录）
 */
object AppContextHolder {
    lateinit var app: Application
        private set

    fun init(application: Application) {
        app = application
    }

    fun getExternalFilesDir(): File {
        return app.getExternalFilesDir(null)
            ?: throw IllegalStateException("ExternalFilesDir is null")
    }
}
