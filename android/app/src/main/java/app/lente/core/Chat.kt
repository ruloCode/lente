package app.lente.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Where one of Lente's answers comes from: a meeting turn, something heard or seen, a kept fact. */
data class AskSource(val kind: String, val label: String, val meetingId: String?, val turnId: String?, val url: String? = null)

/** One message of the chat with Lente; `pending` while the hub thinks, `found` false when the memory had nothing. */
data class ChatLine(val id: Long, val fromWearer: Boolean, val text: String, val sources: List<AskSource> = emptyList(), val found: Boolean = true, val pending: Boolean = false)

object ChatJson {
    /** Earlier messages the hub sees with a question; it keeps the newest it needs. */
    const val HISTORY = 8

    /** `POST /ask`: the question and the conversation before it, oldest first, without the pending answer. */
    fun request(question: String, before: List<ChatLine>): JSONObject = JSONObject()
        .put("question", question)
        .put("history", JSONArray().apply {
            for (l in before.filterNot { it.pending }.takeLast(HISTORY)) put(JSONObject().put("role", if (l.fromWearer) "user" else "lente").put("text", l.text))
        })

    /** The hub's answer as Lente's line; a refusal or a failure keeps the hub's message. */
    fun answer(id: Long, text: String): ChatLine {
        val o = JSONObject(text)
        if (!o.optBoolean("ok")) return ChatLine(id, false, o.optString("message").ifBlank { "No pude responder ahora; prueba otra vez." }, found = false)
        val arr = o.optJSONArray("sources") ?: JSONArray()
        val sources = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.map {
            AskSource(it.optString("kind"), it.optString("label"), it.optString("meetingId").ifBlank { null }, it.optString("turnId").ifBlank { null })
        }
        return ChatLine(id, false, o.optString("answer"), sources, found = o.optBoolean("found"))
    }
}

/** The greeting at the top of Ahora: by the hour, with the wearer's first name, and today's date in Spanish. */
object Greeting {
    private val ES = Locale.forLanguageTag("es")

    fun hello(hour: Int, name: String?): String {
        val part = when (hour) { in 5..11 -> "Buenos días"; in 12..19 -> "Buenas tardes"; else -> "Buenas noches" }
        return if (name.isNullOrBlank()) part else "$part, ${name.trim()}"
    }

    fun date(now: LocalDateTime): String = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES).format(now).replaceFirstChar { it.uppercase(ES) }
}
