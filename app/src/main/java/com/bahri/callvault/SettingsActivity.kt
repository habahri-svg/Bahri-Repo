package com.bahri.callvault

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.ScrollView
import android.widget.Switch

class SettingsActivity : Activity() {
    private lateinit var s: AppSettings
    private lateinit var openAi: EditText
    private lateinit var claude: EditText
    private lateinit var retention: EditText

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        title = "Settings"
        s = AppSettings(this)
        val col = column()

        fun sw(text: String, init: Boolean, set: (Boolean) -> Unit) = Switch(this).apply {
            this.text = text; isChecked = init; setPadding(0, dp(10), 0, dp(10))
            setOnCheckedChangeListener { _, v -> set(v) }
        }
        fun field(hint: String, value: String, secret: Boolean = false) = EditText(this).apply {
            this.hint = hint; setText(value)
            inputType = if (secret) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_CLASS_NUMBER
        }

        openAi = field("OpenAI API key (transcription)", s.openAiKey, true)
        claude = field("Anthropic API key (summaries)", s.anthropicKey, true)
        retention = field("Delete recordings after N days (0 = never)", s.retentionDays.toString())

        col.addView(sw("Record WhatsApp calls automatically", s.autoRecord) { s.autoRecord = it })
        col.addView(sw("Use speakerphone while recording (needed to capture the other side)", s.speaker) { s.speaker = it })
        col.addView(sw("Run AI after every call", s.autoAi) { s.autoAi = it })
        col.addView(label("AI keys", 16f, true))
        col.addView(openAi)
        col.addView(claude)
        col.addView(label("Storage", 16f, true))
        col.addView(retention)
        col.addView(label("Keys stay on this phone and are sent only to OpenAI and Anthropic. Audio is uploaded to OpenAI for transcription, the text goes to Anthropic.", 12f))
        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onPause() {
        s.openAiKey = openAi.text.toString()
        s.anthropicKey = claude.text.toString()
        s.retentionDays = retention.text.toString().toIntOrNull() ?: 0
        super.onPause()
    }
}
