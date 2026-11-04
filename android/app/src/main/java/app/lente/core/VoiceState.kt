package app.lente.core

import org.json.JSONArray
import org.json.JSONObject

/**
 * Hablar con Lente (add-voice-mode): the hub's `/voice` events folded into what the screen shows,
 * and what the phone must do about each one (speak a sentence, stop speaking, open the record
 * sheet). Pure, so the JVM tests run the same reducer the screen does.
 */
enum class VoicePhase { Connecting, Listening, Thinking, Speaking, Paused, Ended }

/** A chip under the reply: a tool Lente used. */
data class VoiceTool(val name: String, val label: String)

/** One exchange: what the wearer said and what Lente answered, sentence by sentence. */
data class VoiceTurn(
    val turn: Int,
    val heard: String,
    val reply: List<String> = emptyList(),
    /** Sentences that were a preamble before a tool ("Lo anoto en tu lista."), not the answer. */
    val commentary: Set<Int> = emptySet(),
    val tools: List<VoiceTool> = emptyList(),
    val sources: List<AskSource> = emptyList(),
    val cancelled: Boolean = false,
) {
    /** The answer without its preambles, as the chat keeps it. */
    val answer get() = reply.filterIndexed { i, _ -> i !in commentary }.joinToString(" ")
}

data class RecordSheetRequest(val projectId: String?, val camera: Boolean)

data class VoiceView(
    val phase: VoicePhase = VoicePhase.Connecting,
    /** "phone" or "clip": whose microphone the hub listens to. */
    val source: String? = null,
    val partial: String = "",
    val turns: List<VoiceTurn> = emptyList(),
    val error: String? = null,
    /** Idiomas (add-language-coach): the session's target language, and the latest phrase to say. */
    val lang: String? = null,
    val pronounce: Pronounce? = null,
) {
    val current get() = turns.lastOrNull()
}

sealed interface VoiceEffect {
    /** One reply sentence; `lang` is its language when the hub tagged it (the coach), else Spanish. */
    data class Speak(val turn: Int, val text: String, val lang: String? = null) : VoiceEffect
    data object StopSpeaking : VoiceEffect
    data class OpenRecordSheet(val request: RecordSheetRequest) : VoiceEffect
    /** Ver's companion turned the live narration on or off (add-sight-mode). */
    data class Narration(val on: Boolean) : VoiceEffect
    /** «Grabar en silencio»: the session closes after this reply, the hub records, Ver keeps quiet (add-sight-mode). */
    data class Quiet(val on: Boolean) : VoiceEffect
    /** «¿Dónde estoy?»: answer `id` on this session with where the phone is (`Place.reply`). */
    data class Locate(val id: String) : VoiceEffect
}

object VoiceEvents {
    /** The words of each phase on the screen. */
    fun label(phase: VoicePhase): String = when (phase) {
        VoicePhase.Connecting -> "Conectando…"
        VoicePhase.Listening -> "Te escucho"
        VoicePhase.Thinking -> "Pensando…"
        VoicePhase.Speaking -> "Hablando"
        VoicePhase.Paused -> "En pausa"
        VoicePhase.Ended -> "Conversación terminada"
    }

    fun sourceLabel(source: String?): String = when (source) {
        "clip" -> "Escuchando con el clip"
        "phone" -> "Escuchando con el teléfono"
        else -> ""
    }

    private fun phaseOf(state: String): VoicePhase? = when (state) {
        "listening" -> VoicePhase.Listening
        "thinking" -> VoicePhase.Thinking
        "speaking" -> VoicePhase.Speaking
        "paused" -> VoicePhase.Paused
        else -> null
    }

    private fun sources(arr: JSONArray?): List<AskSource> = (0 until (arr?.length() ?: 0)).mapNotNull { arr!!.optJSONObject(it) }.map {
        AskSource(it.optString("kind"), it.optString("label"), it.optString("meetingId").ifBlank { null }, it.optString("turnId").ifBlank { null }, it.optString("url").ifBlank { null })
    }

    private fun VoiceView.withTurn(turn: Int, change: (VoiceTurn) -> VoiceTurn): VoiceView {
        val i = turns.indexOfFirst { it.turn == turn }
        if (i < 0) return this
        return copy(turns = turns.toMutableList().also { it[i] = change(it[i]) })
    }

    /** One event from the hub: the next view, and what the phone must do. Unknown events change nothing. */
    fun reduce(view: VoiceView, raw: String): Pair<VoiceView, List<VoiceEffect>> {
        val e = runCatching { JSONObject(raw) }.getOrNull() ?: return view to emptyList()
        val turn = e.optInt("turn", -1)
        // Late events of a turn that barge-in cancelled are dropped.
        if (turn >= 0 && view.turns.any { it.turn == turn && it.cancelled } && e.optString("type") != "bargeIn") return view to emptyList()
        return when (e.optString("type")) {
            "listening" -> view.copy(phase = VoicePhase.Listening, source = e.optString("source").ifBlank { null }, error = null) to emptyList()
            "state" -> (phaseOf(e.optString("state"))?.let { view.copy(phase = it) } ?: view) to emptyList()
            "partial" -> view.copy(partial = e.optString("text")) to emptyList()
            "heard" -> view.copy(partial = "", turns = view.turns + VoiceTurn(turn, e.optString("text"))) to emptyList()
            "thinking" -> view.copy(phase = VoicePhase.Thinking) to emptyList()
            "reply" -> {
                val text = e.optString("text")
                // Lente may speak first (Ver's welcome): a reply to a turn nobody started opens it, with nothing heard.
                val opened = if (turn >= 0 && view.turns.none { it.turn == turn }) view.copy(turns = view.turns + VoiceTurn(turn, "")) else view
                val next = opened.withTurn(turn) { t -> t.copy(reply = t.reply + text, commentary = if (e.optBoolean("commentary")) t.commentary + t.reply.size else t.commentary) }
                next.copy(phase = VoicePhase.Speaking) to listOf(VoiceEffect.Speak(turn, text, e.optString("lang").ifBlank { null }))
            }
            "pronounce" -> {
                val text = e.optString("text").trim()
                if (text.isEmpty()) return view to emptyList()
                val p = Pronounce(text, e.optString("meaning").trim(), e.optString("lang").ifBlank { view.lang ?: "" }, turn.takeIf { it >= 0 })
                // Only the card: the hub says the phrase in the `reply` sentence that follows (decision 13).
                view.copy(pronounce = p) to emptyList()
            }
            "tool" -> view.withTurn(turn) { t -> t.copy(tools = t.tools + VoiceTool(e.optString("name"), e.optString("label"))) } to emptyList()
            "sources" -> view.withTurn(turn) { t -> t.copy(sources = (t.sources + sources(e.optJSONArray("sources"))).distinct()) } to emptyList()
            "bargeIn" -> view.withTurn(turn) { it.copy(cancelled = true) }.copy(phase = VoicePhase.Listening) to listOf(VoiceEffect.StopSpeaking)
            "recordSheet" -> view to listOf(VoiceEffect.OpenRecordSheet(RecordSheetRequest(e.optString("projectId").ifBlank { null }, e.optBoolean("camera"))))
            "narration" -> view to listOf(VoiceEffect.Narration(e.optBoolean("on")))
            "quiet" -> view to listOf(VoiceEffect.Quiet(e.optBoolean("on")))
            "locate" -> (if (e.optString("id").isEmpty()) emptyList() else listOf(VoiceEffect.Locate(e.optString("id")))).let { view to it }
            "error" -> view.copy(error = e.optString("message").ifBlank { "Algo falló." }) to emptyList()
            "end" -> view.copy(phase = VoicePhase.Ended) to listOf(VoiceEffect.StopSpeaking)
            else -> view to emptyList()
        }
    }

    /** `{"type":"spoken"}`: the phone finished `count` sentences of `turn`. */
    fun spoken(turn: Int, count: Int): String = JSONObject().put("type", "spoken").put("turn", turn).put("count", count).toString()
    fun control(type: String): String = JSONObject().put("type", type).toString()

    /** The first message of a session: Ver's companion (`persona: "sight"`), and whether Lente speaks first to get to know the wearer. */
    fun start(persona: String, intro: Boolean): String = JSONObject().put("type", "start").put("persona", persona).put("intro", intro).toString()

    /** The session as chat lines for Inicio: the wearer's words and Lente's answers, cancelled replies left out. */
    fun chatLines(view: VoiceView, nextId: () -> Long): List<ChatLine> = view.turns.flatMap { t ->
        listOfNotNull(
            if (t.heard.isBlank()) null else ChatLine(nextId(), true, t.heard),
            if (t.cancelled || t.answer.isBlank()) null else ChatLine(nextId(), false, t.answer, t.sources),
        )
    }
}

/**
 * The phone's spoken queue for one session: how many sentences of each turn it has finished, so it
 * can tell the hub (`spoken`) when the last one is done. Pure; the TTS callbacks feed it.
 */
class SpokenCount {
    private val queued = mutableMapOf<Int, Int>()
    private val done = mutableMapOf<Int, Int>()

    fun queued(turn: Int) { queued[turn] = (queued[turn] ?: 0) + 1 }

    /** One sentence of `turn` finished; returns the count to report when nothing of that turn is left to say. */
    fun finished(turn: Int): Int? {
        val n = (done[turn] ?: 0) + 1
        done[turn] = n
        return if (n >= (queued[turn] ?: 0)) n else null
    }

    fun clear() { queued.clear(); done.clear() }
}
