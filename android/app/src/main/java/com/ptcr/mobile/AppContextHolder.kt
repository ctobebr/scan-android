package com.ptcr.mobile

import android.app.Application
import java.io.File

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

    fun getPtcrRoot(): File {
        return File(getExternalFilesDir(), "ptcrMobile")
    }

    fun getOnnxModel(): File {
        return File(getPtcrRoot(), "dap_depth_only.onnx")
    }
}