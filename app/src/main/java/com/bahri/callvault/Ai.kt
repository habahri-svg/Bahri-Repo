package com.bahri.callvault

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Whisper turns audio into text, Claude turns text into summary, tasks and follow-ups. */
object Ai {
    private const val CLAUDE_MODEL = "claude-sonnet-5-5"

    private const val SYSTEM = """You analyse phone call transcripts for the person who recorded them.
Reply in the same language as the transcript. Return ONLY a JSON object with these keys:
"title": short title (max 8 words),
"summary": 2-4 sentence summary,
"action_items": array of strings, things anyone agreed to do,
"follow_ups": array of {"task": string, "due_in_days": integer} for things the recorder should follow up on,
"key_facts": array of strings (names, numbers, dates, amounts, decisions),
"sentiment": one of "positive","neutral","negative","tense".
Never invent details that are not in the transcript."""

    fun process(ctx: Context, audio: File): Result<Unit> = runCatching {
        val s = AppSettings(ctx)
        require(s.openAiKey.isNotBlank()) { "Add your OpenAI key in Settings" }
        require(s.anthropicKey.isNotBlank()) { "Add your Anthropic key in Settings" }

        val meta = Store.readMeta(audio)
        var transcript = meta.optString("transcript")
        if (transcript.isBlank()) {
            transcript = transcribe(audio, s.openAiKey)
            meta.put("transcript", transcript)
            Store.writeMeta(audio, meta)
        }
        if (transcript.isBlank()) error("No speech detected")

        val ai = analyse(transcript, meta.optString("contact"), s.anthropicKey)
        meta.put("ai", ai)
        Store.writeMeta(audio, meta)

        val ups = ai.optJSONArray("follow_ups") ?: JSONArray()
        for (i in 0 until ups.length()) {
            val u = ups.getJSONObject(i)
            val days = u.optInt("due_in_days", 1).coerceAtLeast(0)
            val label = meta.optString("contact").ifBlank { "WhatsApp call" }
            ReminderReceiver.schedule(ctx, "Follow up: $label", u.optString("task"), System.currentTimeMillis() + days * 86_400_000L)
        }
    }

    private fun transcribe(f: File, key: String): String {
        val b = "----callvault${System.currentTimeMillis()}"
        val c = URL("https://api.openai.com/v1/audio/transcriptions").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.doOutput = true
        c.connectTimeout = 30_000
        c.readTimeout = 300_000
        c.setChunkedStreamingMode(0)
        c.setRequestProperty("Authorization", "Bearer $key")
        c.setRequestProperty("Content-Type", "multipart/form-data; boundary=$b")
        DataOutputStream(c.outputStream).use { o ->
            fun field(n: String, v: String) =
                o.writeBytes("--$b\r\nContent-Disposition: form-data; name=\"$n\"\r\n\r\n$v\r\n")
            field("model", "whisper-1")
            field("response_format", "json")
            o.writeBytes("--$b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${f.name}\"\r\nContent-Type: audio/mp4\r\n\r\n")
            f.inputStream().use { it.copyTo(o) }
            o.writeBytes("\r\n--$b--\r\n")
        }
        return JSONObject(readBody(c)).getString("text")
    }

    private fun analyse(transcript: String, contact: String, key: String): JSONObject {
        val body = JSONObject()
            .put("model", CLAUDE_MODEL)
            .put("max_tokens", 1500)
            .put("system", SYSTEM)
            .put("messages", JSONArray().put(JSONObject()
                .put("role", "user")
                .put("content", "Contact: ${contact.ifBlank { "unknown" }}\n\nTranscript:\n$transcript")))
        val c = URL("https://api.anthropic.com/v1/messages").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.doOutput = true
        c.connectTimeout = 30_000
        c.readTimeout = 120_000
        c.setRequestProperty("x-api-key", key)
        c.setRequestProperty("anthropic-version", "2023-06-01")
        c.setRequestProperty("content-type", "application/json")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        val text = JSONObject(readBody(c)).getJSONArray("content").getJSONObject(0).getString("text")
        return JSONObject(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1))
    }

    private fun readBody(c: HttpURLConnection): String {
        val code = c.responseCode
        val stream = if (code in 200..299) c.inputStream else c.errorStream
        val body = stream.bufferedReader().readText()
        if (code !in 200..299) error("HTTP $code: ${body.take(300)}")
        return body
    }
}
