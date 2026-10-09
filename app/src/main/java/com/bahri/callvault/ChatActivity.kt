package com.bahri.callvault

import android.app.Activity
import android.os.Bundle
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView

/** Ask questions across every analysed call, e.g. "What did Ahmed promise me last week?" */
class ChatActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        title = "Ask about your calls"
        val col = column()
        val input = EditText(this).apply { hint = "Ask anything about your calls" }
        val out = TextView(this).apply { textSize = 15f; setPadding(0, dp(12), 0, 0) }
        col.addView(input)
        col.addView(button("Ask") {
            val q = input.text.toString().trim()
            if (q.isEmpty()) return@button
            out.text = "Thinking..."
            val ctx = applicationContext
            Thread {
                val r = Ai.ask(ctx, q)
                runOnUiThread { out.text = r.getOrElse { it.message ?: "Failed" } }
            }.start()
        })
        col.addView(out)
        setContentView(ScrollView(this).apply { addView(col) })
    }
}
