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
    /** The listening session whose live view the wearer collapsed. */
    var collapsedSession: Long
        get() = sp.getLong("collapsedSession", 0)
        set(v) = sp.edit().putLong("collapsedSession", v).apply()
}
