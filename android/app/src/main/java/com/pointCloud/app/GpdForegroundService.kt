package com.pointCloud.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * gpd 拼接前台服务
 *
 * 作用：gpd 长任务为同步阻塞调用且无进度回调（低配档也可能持续数十分钟），
 * 运行期间启动前台服务提升进程优先级，防止应用切后台时进程被系统回收导致拼接中断。
 */
class GpdForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "点云拼接",
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("点云拼接计算中")
            .setContentText("全景与多站拼接计算进行中，请保持应用在前台")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "gpd_stitch_channel"
        private const val NOTIFICATION_ID = 1001

        /** 启动前台服务（拼接任务开始时调用） */
        fun start(context: Context) {
            val intent = Intent(context, GpdForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /** 停止前台服务（拼接任务结束时调用） */
        fun stop(context: Context) {
            context.stopService(Intent(context, GpdForegroundService::class.java))
        }
    }
}
