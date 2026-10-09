package com.bahri.callvault

import android.content.Context
import org.json.JSONObject
import java.io.File

/** Each recording is an .m4a with a sidecar .json holding contact, transcript and AI notes. */
object Store {
    fun dir(c: Context): File = File(c.getExternalFilesDir(null), "recordings").apply { mkdirs() }

    fun audioFiles(c: Context): List<File> =
        dir(c).listFiles { f -> f.extension == "m4a" }?.sortedByDescending { it.lastModified() }
            ?: emptyList()

    private fun metaFile(a: File) = File(a.parentFile, a.nameWithoutExtension + ".json")

    fun readMeta(a: File): JSONObject =
        try { JSONObject(metaFile(a).readText()) } catch (e: Exception) { JSONObject() }

    fun writeMeta(a: File, m: JSONObject) = metaFile(a).writeText(m.toString())

    fun delete(a: File) {
        a.delete()
        metaFile(a).delete()
    }

    fun purgeOld(c: Context, days: Int) {
        if (days <= 0) return
        val cutoff = System.currentTimeMillis() - days * 86_400_000L
        audioFiles(c).filter { it.lastModified() < cutoff }.forEach { delete(it) }
    }
}
