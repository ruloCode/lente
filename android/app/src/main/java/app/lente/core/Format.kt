package app.lente.core

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/** Numbers and times as the page shows them, so both clients read the same. */
object Format {
    private val es = Locale.forLanguageTag("es")

    /** Elapsed listening time: `m:ss`, or `h:mm:ss` past an hour. */
    fun clock(ms: Long): String {
        val s = (ms.coerceAtLeast(0) / 1000)
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
    }

    /** Recorded today: `12 s`, `3 min 05 s`, `1 h 02 min`. */
    fun recorded(ms: Long): String {
        val s = ms.coerceAtLeast(0) / 1000
        val h = s / 3600
        val min = (s % 3600) / 60
        return when {
            h > 0 -> "$h h %02d min".format(min)
            min > 0 -> "$min min %02d s".format(s % 60)
            else -> "$s s"
        }
    }

    /** Minutes sent to transcription: one decimal under ten. */
    fun minutes(seconds: Double): String {
        val min = seconds / 60
        return if (min < 10) String.format(Locale.US, "%.1f min", min) else "${Math.round(min)} min"
    }

    fun tokens(n: Long): String = String.format(es, "%,d", n)

    fun usd(v: Double, unpriced: Boolean): String =
        (if (unpriced) "≈ " else "") + String.format(Locale.US, "US$ %.2f", v) + (if (unpriced) " + sin precio" else "")

    fun hhmm(at: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val t = Instant.ofEpochMilli(at).atZone(zone)
        return "%02d:%02d".format(t.hour, t.minute)
    }

    private val STAGE_ORDER = listOf("heard", "turn", "asked", "firstToken", "done", "sent", "phone")
    private val STAGE_NAME = mapOf("turn" to "transcribir", "asked" to "decidir", "firstToken" to "primer token", "done" to "respuesta", "sent" to "hub", "phone" to "wifi")

    /** Where a card's time went: `total 191 ms · transcribir 172 · decidir 5 · …`; empty with fewer than two stages. */
    fun stages(st: Map<String, Long>): String {
        val present = STAGE_ORDER.filter { st[it] != null }
        if (present.size < 2) return ""
        val gaps = present.drop(1).mapIndexed { i, s -> "${STAGE_NAME[s]} ${(st.getValue(s) - st.getValue(present[i])).coerceAtLeast(0)}" }
        return "total ${st.getValue(present.last()) - st.getValue(present.first())} ms · " + gaps.joinToString(" · ")
    }

    /** Why a cue got through, as the page says it. */
    fun why(why: String?): String? = when (why) {
        "name" -> "dijeron tu nombre"
        "reply" -> "te respondían a ti"
        "model" -> "parece dirigida a ti"
        "testing" -> "modo todas las preguntas"
        else -> null
    }
}
