package app.lente.platform

import android.content.Context

/** What the app keeps on the phone: the hub, its pairing session and the wearer's local settings. Never content. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("lente", Context.MODE_PRIVATE)

    var hub: String?
        get() = sp.getString("hub", null)
        set(v) = sp.edit().putString("hub", v).apply()
    /** `lente_session=…` from a cloud hub's pairing. */
    var cookie: String?
        get() = sp.getString("cookie", null)
        set(v) = sp.edit().putString("cookie", v).apply()
    var welcomed: Boolean
        get() = sp.getBoolean("welcomed", false)
        set(v) = sp.edit().putBoolean("welcomed", v).apply()
    var readAloud: Boolean
        get() = sp.getBoolean("readAloud", false)
        set(v) = sp.edit().putBoolean("readAloud", v).apply()
    /** Read the camera's live descriptions aloud, apart from Voz (Dilo cards and summaries). */
    var narrateLive: Boolean
        get() = sp.getBoolean("narrateLive", false)
        set(v) = sp.edit().putBoolean("narrateLive", v).apply()
    /** Lente's own text-to-speech rate (add-sight-mode), 0.8–2.0; TalkBack keeps its own. */
    var speechRate: Float
        get() = app.lente.core.SpeechVoice.rate(sp.getFloat("speechRate", app.lente.core.SpeechVoice.DEFAULT_RATE))
        set(v) = sp.edit().putFloat("speechRate", app.lente.core.SpeechVoice.rate(v)).apply()
    /** "system", "light" or "dark": the app's appearance, chosen in Ajustes. */
    var theme: String
        get() = sp.getString("theme", "system") ?: "system"
        set(v) = sp.edit().putString("theme", v).apply()
    /** The listening session whose live view the wearer collapsed. */
    var collapsedSession: Long
        get() = sp.getLong("collapsedSession", 0)
        set(v) = sp.edit().putLong("collapsedSession", v).apply()

    /** add-notifications, for a hub without the feed: the read mark and the settings kept on the phone. */
    var notifyReadAt: Long
        get() = sp.getLong("notifyReadAt", 0)
        set(v) = sp.edit().putLong("notifyReadAt", v).apply()
    var notifyPrefs: String?
        get() = sp.getString("notifyPrefs", null)
        set(v) = sp.edit().putString("notifyPrefs", v).apply()

    /** Feed items this phone already alerted for, so nothing alerts twice; null until the first check seeds it. */
    var notifyAlerted: Set<String>?
        get() = if (sp.contains("notifyAlerted")) sp.getStringSet("notifyAlerted", emptySet())!!.toSet() else null
        set(v) = sp.edit().putStringSet("notifyAlerted", v?.toSet()).apply()
}
