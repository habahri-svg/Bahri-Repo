package com.bahri.callvault

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import java.io.File

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var list: ListView
    private lateinit var search: EditText
    private var shown = listOf<File>()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        title = "CallVault"
        val root = column()
        status = label("", 14f)
        val row1 = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(button("1. Permissions") { askPermissions() })
            addView(button("2. Accessibility") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) })
        }
        val row2 = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(button("3. Battery") { batterySettings() })
            addView(button("Ask AI") { startActivity(Intent(this@MainActivity, ChatActivity::class.java)) })
            addView(button("Settings") { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) })
        }
        search = EditText(this).apply {
            hint = "Search calls, names, transcripts"
            addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) = refresh()
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            })
        }
        list = ListView(this)
        list.setOnItemClickListener { _, _, pos, _ ->
            startActivity(Intent(this, DetailActivity::class.java).putExtra("path", shown[pos].absolutePath))
        }
        listOf(status, row1, row2, search, list).forEach { root.addView(it) }
        setContentView(root)

        lockIfNeeded()
        if (!AppSettings(this).consented) {
            AlertDialog.Builder(this)
                .setTitle("Before you record")
                .setMessage("Recording calls without the other person's knowledge is illegal in many countries. Use CallVault only where the law allows it, and tell people they are being recorded when required.")
                .setCancelable(false)
                .setPositiveButton("I understand") { _, _ -> AppSettings(this).consented = true }
                .setNegativeButton("Exit") { _, _ -> finish() }
                .show()
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
        retryPendingAi()
    }

    private var unlocked = false

    private fun lockIfNeeded() {
        val pin = AppSettings(this).pin
        if (pin.isEmpty() || unlocked) return
        val box = EditText(this).apply {
            hint = "PIN"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this).setTitle("CallVault is locked").setView(box).setCancelable(false)
            .setPositiveButton("Unlock") { _, _ ->
                if (box.text.toString() == pin) unlocked = true else { lockIfNeeded(); finish() }
            }
            .setNegativeButton("Exit") { _, _ -> finish() }.show()
    }

    /** Calls recorded while offline (or before keys were added) get analysed when the app opens. */
    private fun retryPendingAi() {
        val s = AppSettings(this)
        if (!s.autoAi || s.openAiKey.isBlank() || s.anthropicKey.isBlank()) return
        val pending = Store.audioFiles(this).filter { !Ai.hasAi(it) }.take(3)
        if (pending.isEmpty()) return
        val ctx = applicationContext
        Thread {
            pending.forEach { Ai.process(ctx, it) }
            runOnUiThread { refresh() }
        }.start()
    }

    private fun accessibilityOn(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        return enabled.contains(packageName)
    }

    private fun refresh() {
        val micOk = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED
        status.text = "Microphone: ${if (micOk) "OK" else "needed"}   Call detection: ${if (accessibilityOn()) "ON" else "off"}"
        val q = search.text.toString().trim().lowercase()
        shown = Store.audioFiles(this).filter { f ->
            q.isEmpty() || Store.readMeta(f).toString().lowercase().contains(q)
        }
        list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, shown.map { f ->
            val m = Store.readMeta(f)
            val ai = m.optJSONObject("ai")
            val name = m.optString("contact").ifBlank { "Unknown contact" }
            val head = ai?.optString("title").orEmpty()
            "$name  ${if (ai != null) "[AI]" else ""}\n${fmtDate(f.lastModified())} · ${fmtDur(m.optLong("durationMs"))}" +
                if (head.isNotBlank()) "\n$head" else ""
        })
    }

    private fun askPermissions() {
        val p = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
        requestPermissions(p.toTypedArray(), 1)
    }

    private fun batterySettings() {
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    override fun onRequestPermissionsResult(c: Int, p: Array<out String>, r: IntArray) = refresh()
}
