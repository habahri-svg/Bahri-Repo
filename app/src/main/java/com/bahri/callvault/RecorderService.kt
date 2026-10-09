package com.bahri.callvault

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Armed when the WhatsApp call screen appears. It polls the system audio mode:
 * MODE_IN_COMMUNICATION means a VoIP call is live, so recording starts. When the mode
 * drops back to normal for a few seconds, the call is over and the file is saved.
 */
class RecorderService : Service() {

    companion object {
        const val ACTION_ARM = "arm"
        const val ACTION_STOP = "stop"
        const val EXTRA_CONTACT = "contact"
        private const val CHANNEL = "recording"
        private const val NOTIF_ID = 42
        private const val ARM_TIMEOUT_MS = 120_000L
        private const val QUIET_TICKS_TO_STOP = 3
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var audio: AudioManager
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var contact: String? = null
    private var armed = false
    private var armedAt = 0L
    private var startedAt = 0L
    private var quietTicks = 0
    private var prevSpeaker = false

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        when (i?.action) {
            ACTION_STOP -> { finish(); return START_NOT_STICKY }
            else -> {
                val name = i?.getStringExtra(EXTRA_CONTACT)
                if (contact == null) contact = name
                if (!armed) {
                    armed = true
                    armedAt = System.currentTimeMillis()
                    goForeground("Waiting for WhatsApp call")
                    handler.post(tick)
                }
            }
        }
        return START_NOT_STICKY
    }

    private val tick = object : Runnable {
        override fun run() {
            val inCall = audio.mode == AudioManager.MODE_IN_COMMUNICATION
            if (recorder == null) {
                if (inCall) startRecording()
                else if (System.currentTimeMillis() - armedAt > ARM_TIMEOUT_MS) { finish(); return }
            } else {
                quietTicks = if (inCall) 0 else quietTicks + 1
                if (quietTicks >= QUIET_TICKS_TO_STOP) { finish(); return }
            }
            handler.postDelayed(this, 1000)
        }
    }

    private fun startRecording() {
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val f = File(Store.dir(this), "call_$stamp.m4a")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else MediaRecorder()
        // Some devices refuse VOICE_RECOGNITION while another app holds the mic, so fall back to MIC.
        val ok = listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC, MediaRecorder.AudioSource.CAMCORDER, MediaRecorder.AudioSource.UNPROCESSED).any { src ->
            try {
                r.reset()
                r.setAudioSource(src)
                r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                r.setAudioChannels(1)
                r.setAudioSamplingRate(16000)
                r.setAudioEncodingBitRate(32000)
                r.setOutputFile(f.absolutePath)
                r.prepare()
                r.start()
                true
            } catch (e: Exception) { false }
        }
        if (!ok) { r.release(); finish(); return }

        recorder = r
        file = f
        startedAt = System.currentTimeMillis()
        if (AppSettings(this).speaker) {
            prevSpeaker = audio.isSpeakerphoneOn
            audio.isSpeakerphoneOn = true
        }
        goForeground("Recording WhatsApp call")
    }

    private fun finish() {
        handler.removeCallbacks(tick)
        val r = recorder
        val f = file
        recorder = null
        if (r != null) {
            try { r.stop() } catch (e: Exception) { /* too short */ }
            r.release()
            if (AppSettings(this).speaker) audio.isSpeakerphoneOn = prevSpeaker
        }
        if (f != null) {
            val dur = System.currentTimeMillis() - startedAt
            if (dur < 3000 || f.length() < 2000) {
                f.delete()
            } else {
                val meta = JSONObject().put("contact", contact ?: "").put("startedAt", startedAt).put("durationMs", dur)
                Store.writeMeta(f, meta)
                notifyDone(f)
                val s = AppSettings(this)
                if (s.autoAi && s.openAiKey.isNotBlank() && s.anthropicKey.isNotBlank()) {
                    val ctx = applicationContext
                    Thread { Ai.process(ctx, f) }.start()
                }
            }
        }
        Store.purgeOld(this, AppSettings(this).retentionDays)
        stopForeground(true)
        stopSelf()
    }

    private fun channel(): String {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Call recording", NotificationManager.IMPORTANCE_LOW))
        }
        return CHANNEL
    }

    private fun builder(text: String): Notification.Builder {
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel()) else Notification.Builder(this)
        return b.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("CallVault").setContentText(text)
    }

    private fun goForeground(text: String) {
        val n = builder(text).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else startForeground(NOTIF_ID, n)
    }

    private fun notifyDone(f: File) {
        val pi = android.app.PendingIntent.getActivity(
            this, 0, Intent(this, DetailActivity::class.java).putExtra("path", f.absolutePath),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        val n = builder("Recording saved").setContentIntent(pi).setAutoCancel(true).build()
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID + 1, n)
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }
}
