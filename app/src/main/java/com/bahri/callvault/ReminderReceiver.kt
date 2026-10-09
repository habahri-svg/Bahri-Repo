package com.bahri.callvault

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel("followup", "Follow-ups", NotificationManager.IMPORTANCE_HIGH))
        }
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, "followup") else Notification.Builder(ctx)
        val n = b.setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(i.getStringExtra("title"))
            .setContentText(i.getStringExtra("text"))
            .setStyle(Notification.BigTextStyle().bigText(i.getStringExtra("text")))
            .setAutoCancel(true).build()
        nm.notify(i.getIntExtra("id", 0), n)
    }

    companion object {
        /** Inexact alarms avoid the exact-alarm permission. Reminders are lost after a reboot. */
        fun schedule(ctx: Context, title: String, text: String, at: Long) {
            val id = (title + text + at).hashCode()
            val i = Intent(ctx, ReminderReceiver::class.java)
                .putExtra("title", title).putExtra("text", text).putExtra("id", id)
            val pi = PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }
}
