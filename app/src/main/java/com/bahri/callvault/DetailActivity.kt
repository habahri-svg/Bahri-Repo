package com.bahri.callvault

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.media.MediaPlayer
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

class DetailActivity : Activity() {
    private lateinit var file: File
    private lateinit var body: TextView
    private var player: MediaPlayer? = null

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        file = File(intent.getStringExtra("path") ?: return finish())
        title = "Call"

        val col = column()
        body = label("")
        val play = button("Play") {}
        play.setOnClickListener {
            val p = player ?: MediaPlayer().apply {
                setDataSource(file.absolutePath); prepare(); player = this
                setOnCompletionListener { play.text = "Play" }
            }
            if (p.isPlaying) { p.pause(); play.text = "Play" } else { p.start(); play.text = "Pause" }
        }
        val ai = button("Transcribe and analyse with AI") { runAi() }
        val share = button("Share audio") {
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            startActivity(Intent.createChooser(
                Intent(Intent.ACTION_SEND).setType("audio/mp4").putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share"))
        }
        val del = button("Delete") {
            AlertDialog.Builder(this).setMessage("Delete this recording?")
                .setPositiveButton("Delete") { _, _ -> Store.delete(file); finish() }
                .setNegativeButton("Cancel", null).show()
        }
        listOf(play, ai, share, del, body).forEach { col.addView(it) }
        setContentView(ScrollView(this).apply { addView(col) })
        render()
    }

    private fun render() {
        val m = Store.readMeta(file)
        val a = m.optJSONObject("ai")
        val sb = StringBuilder()
        sb.append(m.optString("contact").ifBlank { "Unknown contact" })
            .append("\n").append(fmtDate(file.lastModified())).append(" · ").append(fmtDur(m.optLong("durationMs"))).append("\n\n")
        if (a != null) {
            sb.append(a.optString("title")).append("  (").append(a.optString("sentiment")).append(")\n\n")
            sb.append("SUMMARY\n").append(a.optString("summary")).append("\n\n")
            listOf("action_items" to "ACTION ITEMS", "key_facts" to "KEY FACTS").forEach { (k, h) ->
                val arr = a.optJSONArray(k)
                if (arr != null && arr.length() > 0) {
                    sb.append(h).append("\n")
                    for (i in 0 until arr.length()) sb.append("• ").append(arr.getString(i)).append("\n")
                    sb.append("\n")
                }
            }
            val f = a.optJSONArray("follow_ups")
            if (f != null && f.length() > 0) {
                sb.append("FOLLOW-UP REMINDERS (scheduled)\n")
                for (i in 0 until f.length()) {
                    val o = f.getJSONObject(i)
                    sb.append("• ").append(o.optString("task")).append(" (in ").append(o.optInt("due_in_days")).append(" days)\n")
                }
                sb.append("\n")
            }
        }
        val t = m.optString("transcript")
        if (t.isNotBlank()) sb.append("TRANSCRIPT\n").append(t)
        body.text = sb.toString()
    }

    private fun runAi() {
        Toast.makeText(this, "Working, this can take a minute", Toast.LENGTH_SHORT).show()
        val ctx = applicationContext
        Thread {
            val r = Ai.process(ctx, file)
            runOnUiThread {
                r.exceptionOrNull()?.let { Toast.makeText(this, it.message ?: "Failed", Toast.LENGTH_LONG).show() }
                render()
            }
        }.start()
    }

    override fun onDestroy() {
        player?.release()
        super.onDestroy()
    }
}
