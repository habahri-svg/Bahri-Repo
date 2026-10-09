package com.bahri.callvault

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AppSettings(c: Context) {
    private val sp = c.getSharedPreferences("callvault", Context.MODE_PRIVATE)

    /** API keys and the PIN live in encrypted prefs, with a plain fallback if the keystore misbehaves. */
    private val secure: SharedPreferences = try {
        val mk = MasterKey.Builder(c).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(c, "callvault_secure", mk,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    } catch (e: Exception) { c.getSharedPreferences("callvault_secure_fallback", Context.MODE_PRIVATE) }

    var autoRecord: Boolean
        get() = sp.getBoolean("auto", true)
        set(v) = sp.edit().putBoolean("auto", v).apply()

    /** Forces speakerphone during recording so the mic can pick up the other person. */
    var speaker: Boolean
        get() = sp.getBoolean("speaker", true)
        set(v) = sp.edit().putBoolean("speaker", v).apply()

    var autoAi: Boolean
        get() = sp.getBoolean("autoAi", true)
        set(v) = sp.edit().putBoolean("autoAi", v).apply()

    var openAiKey: String
        get() = secure.getString("openai", "") ?: ""
        set(v) = secure.edit().putString("openai", v.trim()).apply()

    var anthropicKey: String
        get() = secure.getString("anthropic", "") ?: ""
        set(v) = secure.edit().putString("anthropic", v.trim()).apply()

    /** 0 = keep forever. */
    var retentionDays: Int
        get() = sp.getInt("retention", 0)
        set(v) = sp.edit().putInt("retention", v).apply()

    var consented: Boolean
        get() = sp.getBoolean("consented", false)
        set(v) = sp.edit().putBoolean("consented", v).apply()

    /** Empty = no app lock. */
    var pin: String
        get() = secure.getString("pin", "") ?: ""
        set(v) = secure.edit().putString("pin", v.trim()).apply()
}
