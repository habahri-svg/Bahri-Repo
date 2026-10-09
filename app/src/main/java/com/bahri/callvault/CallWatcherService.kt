package com.bahri.callvault

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Watches for the WhatsApp call screen. When it opens, RecorderService is armed.
 * The recorder itself decides when the call really connects.
 */
class CallWatcherService : AccessibilityService() {

    private var lastArm = 0L

    override fun onAccessibilityEvent(e: AccessibilityEvent) {
        if (!AppSettings(this).autoRecord) return
        val pkg = e.packageName?.toString() ?: return
        if (pkg != "com.whatsapp" && pkg != "com.whatsapp.w4b") return

        val cls = e.className?.toString().orEmpty()
        val voipScreen = e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            cls.contains("voip", ignoreCase = true)
        // Fallback that survives WhatsApp renaming its screens: any WhatsApp window or
        // notification event while the system is in a VoIP call.
        val audio = getSystemService(AUDIO_SERVICE) as android.media.AudioManager
        val liveCall = audio.mode == android.media.AudioManager.MODE_IN_COMMUNICATION
        if (!voipScreen && !liveCall) return

        val now = System.currentTimeMillis()
        if (now - lastArm < 5000) return
        lastArm = now

        val name = findContactName(rootInActiveWindow)
            ?: e.text?.firstOrNull()?.toString()?.takeIf { e.eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED && it.length < 60 }
        val i = Intent(this, RecorderService::class.java)
            .setAction(RecorderService.ACTION_ARM)
            .putExtra(RecorderService.EXTRA_CONTACT, name)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
    }

    /** Best effort. WhatsApp view ids change between versions, so this may return null. */
    private fun findContactName(root: AccessibilityNodeInfo?): String? {
        if (root == null) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 200) {
            val n = queue.removeFirst()
            visited++
            val id = n.viewIdResourceName.orEmpty()
            val text = n.text?.toString()
            if (!text.isNullOrBlank() && (id.contains("contact_name") || id.endsWith("/name") || id.contains("call_name"))) {
                return text
            }
            for (k in 0 until n.childCount) n.getChild(k)?.let { queue.add(it) }
        }
        return null
    }

    override fun onInterrupt() {}
}
