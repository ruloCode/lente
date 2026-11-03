package app.lente.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Where one of Lente's answers comes from: a meeting turn, something heard or seen, a kept fact. */
data class AskSource(val kind: String, val label: String, val meetingId: String?, val turnId: String?, val url: String? = null, val audio: String? = null, val frame: String? = null)

/** A source from the hub's JSON, with the media behind it when the hub kept some (add-media-archive 2.3). */
internal fun sourceOf(it: JSONObject): AskSource {
    val media = it.optJSONObject("media")
    return AskSource(it.optString("kind"), it.optString("label"), it.optString("meetingId").ifBlank { null }, it.optString("turnId").ifBlank { null }, it.optString("url").ifBlank { null }, media?.optString("audio")?.ifBlank { null }, media?.optString("frame")?.ifBlank { null })
}

/**
 * One message of the chat with Lente; `pending` while the hub thinks (`searching` once it said it looks
 * deeper), `streaming` while the answer is being written, `found` false when the memory had nothing.
 */
data class ChatLine(val id: Long, val fromWearer: Boolean, val text: String, val sources: List<AskSource> = emptyList(), val found: Boolean = true, val pending: Boolean = false, val streaming: Boolean = false, val searching: Boolean = false) {
    /** Waiting for the hub or still writing: no new question until it ends. */
    val busy get() = pending || streaming
}

object ChatJson {
    /** Earlier messages the hub sees with a question; it keeps the newest it needs. */
    const val HISTORY = 8

    /** `POST /ask`: the question and the conversation before it, oldest first, without the pending answer. */
    fun request(question: String, before: List<ChatLine>, threadId: String? = null): JSONObject = JSONObject()
        .put("question", question)
        .apply { threadId?.let { put("threadId", it) } }
        .put("history", JSONArray().apply {
            for (l in before.filterNot { it.pending }.takeLast(HISTORY)) put(JSONObject().put("role", if (l.fromWearer) "user" else "lente").put("text", l.text))
        })

    /** The hub's answer as Lente's line; a refusal or a failure keeps the hub's message. */
    fun answer(id: Long, text: String): ChatLine {
        val o = JSONObject(text)
        if (!o.optBoolean("ok")) return ChatLine(id, false, o.optString("message").ifBlank { "No pude responder ahora; prueba otra vez." }, found = false)
        val arr = o.optJSONArray("sources") ?: JSONArray()
        val sources = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.map(::sourceOf)
        return ChatLine(id, false, o.optString("answer"), sources, found = o.optBoolean("found"))
    }
}

/**
 * A streamed answer (add-memory-engine 4.1): the hub's `delta`, `source`, `searching`, `replace` and
 * `done` events applied to the pending line, in order. `done` carries the whole answer and wins. Pure.
 */
object AskStream {
    fun apply(line: ChatLine, event: String?, data: String): ChatLine {
        val o = runCatching { JSONObject(data) }.getOrNull() ?: return line
        return when (event) {
            "delta" -> line.copy(text = line.text + o.optString("text"), pending = false, streaming = true, searching = false)
            "source" -> {
                val s = sourceOf(o)
                if (line.sources.any { it.label == s.label }) line else line.copy(sources = line.sources + s)
            }
            "searching" -> line.copy(searching = true)
            // Made-up citations: the streamed text is not trusted.
            "replace" -> line.copy(text = o.optString("text"), sources = emptyList(), found = false)
            "done" -> ChatJson.answer(line.id, data)
            else -> line
        }
    }
}

/** One conversation in the chat's history (add-home-dock): typed or by voice, titled by its first question. */
data class ChatThreadView(val id: String, val voice: Boolean, val at: Long, val title: String, val lines: List<ChatLine>)

/** `GET /chat/threads` and the history's words. Pure. */
object ChatHistory {
    private val ES = Locale.forLanguageTag("es")

    /** The hub's threads, newest first; each line gets an id from `firstId` up, so it can join the open chat. */
    fun threads(text: String, firstId: Long = 1_000_000): List<ChatThreadView> {
        val arr = JSONObject(text).optJSONArray("threads") ?: JSONArray()
        var id = firstId
        return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.mapNotNull { t ->
            val threadId = t.optString("threadId").ifBlank { return@mapNotNull null }
            val ls = t.optJSONArray("lines") ?: JSONArray()
            val lines = (0 until ls.length()).mapNotNull { ls.optJSONObject(it) }.map { l ->
                val src = l.optJSONArray("sources") ?: JSONArray()
                val sources = (0 until src.length()).mapNotNull { src.optJSONObject(it) }.map {
                    AskSource(it.optString("kind"), it.optString("label"), it.optString("meetingId").ifBlank { null }, it.optString("turnId").ifBlank { null }, it.optString("url").ifBlank { null })
                }
                ChatLine(id++, l.optString("role") == "user", l.optString("text"), sources)
            }
            ChatThreadView(threadId, t.optString("via") == "voice", t.optLong("at"), t.optString("title").ifBlank { lines.firstOrNull()?.text.orEmpty() }, lines)
        }
    }

    /** When a conversation was: «Hoy · 21:40», «Ayer · 09:10», or «3 nov · 10:00». */
    fun whenLabel(at: Long, now: Long, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): String {
        val then = java.time.Instant.ofEpochMilli(at).atZone(zone)
        val today = java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val time = DateTimeFormatter.ofPattern("HH:mm", ES).format(then)
        return when (then.toLocalDate()) {
            today -> "Hoy · $time"
            today.minusDays(1) -> "Ayer · $time"
            else -> DateTimeFormatter.ofPattern("d MMM", ES).format(then).replace(".", "") + " · $time"
        }
    }
}

/** The chat's composer and answers (add-home-dock). */
object ChatSheet {
    enum class Button { Talk, Send }

    /** The composer's round button: Hablar con Lente while the field is empty, send once there is text. */
    fun button(text: String): Button = if (text.isBlank()) Button.Talk else Button.Send

    /** What sharing an answer hands to another app: the answer, then where it comes from. */
    fun shared(line: ChatLine): String {
        val from = line.sources.map { it.label }.filter { it.isNotBlank() }.distinct()
        return if (from.isEmpty()) line.text else line.text + "\n\nFuentes: " + from.joinToString(" · ")
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
