package app.lente.core

/**
 * Ver (add-sight-mode): what the full-screen surface shows and what it speaks. A look is answered with
 * a `cue` labelled `VER`, spoken in full whenever Ver is open, a few sentences at a time; the camera's
 * `live` reads keep describing and are spoken only while narration is on. Ver is also a conversation:
 * a hands-free voice session runs while it is open, and its latest line («Lente: …», «Tú: …») takes
 * the large text whenever it changes. Pure.
 */
data class SightView(
    /** The latest description (what Repetir says again); empty until the first one arrives. */
    val text: String = "",
    /** A look was asked for and its answer has not arrived yet. */
    val looking: Boolean = false,
    val narrating: Boolean = true,
    /** What the large text shows: the newest of the latest description and the conversation's latest line. */
    val line: String = "",
    /** The conversation's latest line as last seen, so an unrelated voice event does not bring it back over a newer description. */
    val talk: String = "",
    /** «Grabar en silencio»: the hub records, nothing is narrated, the conversation is closed until a long press. */
    val quiet: Boolean = false,
    /** Narration as it was before the quiet, to come back to. */
    val narratingBeforeQuiet: Boolean = true,
)

/** What to say for one event: the parts in order, and whether it interrupts (a look's answer) or waits (a live read). */
data class SightSpeech(val parts: List<String>, val urgent: Boolean)

object Sight {
    /** The hub's label on a look's answer in sight mode. */
    const val LABEL = "VER"
    /** The model's "nothing changed": nothing is shown or spoken. */
    const val UNCHANGED = "="
    /** Longest piece handed to text-to-speech at once, cut at a sentence end when there is one. */
    const val CHUNK_CHARS = 200
    /** A look with no answer by then stops showing «Mirando…». */
    const val LOOK_TIMEOUT_MS = 15_000L

    const val HINT = "Toca la pantalla para saber qué hay frente a ti."
    const val GUEST = "Invitado: no se guarda nada"

    /** Ver's companion on the hub's voice session. */
    const val PERSONA = "sight"

    /** The surface's one description for TalkBack: what it is and what each gesture does. */
    const val SURFACE =
        "Ver. Habla cuando quieras: Lente te escucha. Toca para mirar qué hay frente a ti. " +
            "Mantén presionado para pausar o seguir la escucha. Toca con dos dedos para pausar o seguir la narración. " +
            "También en el menú de acciones."

    const val QUIET_LINE = "Grabando en silencio · mantén presionado para hablarme"
    const val QUIET = "Grabar en silencio"
    const val TALK_AGAIN = "Volver a conversar"

    const val LOOK = "Mirar"
    const val REPEAT = "Repetir"
    const val EXIT = "Salir"

    fun narrationAction(v: SightView) = if (v.narrating) "Pausar narración" else "Seguir narrando"

    /** Long press: pause the listening, resume it, or start the conversation again after it dropped. */
    fun listenAction(phase: VoicePhase?, quiet: Boolean = false) = when (phase) {
        VoicePhase.Paused -> "Seguir escuchando"
        null, VoicePhase.Ended -> if (quiet) "Hablar con Lente" else "Volver a hablar con Lente"
        else -> "Pausar escucha"
    }

    private fun narrationWord(v: SightView) = if (v.narrating) "Narrando" else "Narración en pausa"

    /** The small state line, in a polite live region: the conversation's phase first, then the narration. */
    fun stateLine(v: SightView, phase: VoicePhase? = null) = when {
        v.looking -> "Mirando…"
        v.quiet && (phase == null || phase == VoicePhase.Ended) -> QUIET_LINE
        phase == VoicePhase.Connecting -> "Conectando…"
        phase == VoicePhase.Thinking -> "Pensando…"
        phase == VoicePhase.Speaking -> "Hablando"
        phase == VoicePhase.Paused -> "Escucha en pausa · ${narrationWord(v)}"
        phase == VoicePhase.Listening -> "Escuchando · ${narrationWord(v)}"
        else -> narrationWord(v)
    }

    /** The large text: the latest line, «Mirando…» while a look is pending and nothing is shown yet, else the hint. */
    fun shown(v: SightView) = when {
        v.line.isNotBlank() -> v.line
        v.text.isNotBlank() -> v.text
        v.looking -> "Mirando…"
        else -> HINT
    }

    /** The conversation's latest line: what the wearer is saying, else Lente's reply, else what the wearer said. */
    fun talkLine(voice: VoiceView): String {
        if (voice.partial.isNotBlank()) return "Tú: ${voice.partial.trim()}"
        val t = voice.current ?: return ""
        if (t.reply.isNotEmpty() && !t.cancelled) return "Lente: ${t.reply.joinToString(" ")}"
        return if (t.heard.isNotBlank()) "Tú: ${t.heard.trim()}" else ""
    }

    /** A voice event arrived: the large text follows the conversation only when its line changed. */
    fun talk(v: SightView, voice: VoiceView): SightView {
        val line = talkLine(voice)
        return if (line.isNotBlank() && line != v.talk) v.copy(line = line, talk = line) else v.copy(talk = line)
    }

    fun looking(v: SightView) = v.copy(looking = true)

    fun lookEnded(v: SightView) = v.copy(looking = false)

    fun narration(v: SightView, on: Boolean) = v.copy(narrating = on)

    /** Into the quiet: narration muted, its state kept for the way back. */
    fun quiet(v: SightView) = if (v.quiet) v else v.copy(quiet = true, narratingBeforeQuiet = v.narrating, narrating = false)

    /** Back to the conversation, narration as it was. */
    fun talkAgain(v: SightView) = if (!v.quiet) v else v.copy(quiet = false, narrating = v.narratingBeforeQuiet)

    /** One entry of the day while Ver is open: the new view and what to say, or null when it says nothing. */
    fun reduce(v: SightView, e: Entry): Pair<SightView, SightSpeech?> {
        val text = e.text.trim()
        if (text.isEmpty() || text == UNCHANGED || e.isPhoto) return v to null
        return when {
            isLookAnswer(e) -> v.copy(text = text, line = text, looking = false) to SightSpeech(chunks(text), urgent = true)
            e.kind == "live" -> v.copy(text = text, line = text) to (if (v.narrating) SightSpeech(listOf(text), urgent = false) else null)
            else -> v to null
        }
    }

    fun isLookAnswer(e: Entry) = e.kind == "cue" && e.label == LABEL

    /**
     * Long text in pieces of at most [max] characters for text-to-speech: whole sentences together while
     * they fit, a sentence longer than [max] cut at its last space (or at [max] when it has none).
     */
    fun chunks(text: String, max: Int = CHUNK_CHARS): List<String> {
        val clean = text.replace(Regex("\\s+"), " ").trim()
        if (clean.isEmpty()) return emptyList()
        val sentences = Regex("[^.!?…]+(?:[.!?…]+[»\"”)]?|$)").findAll(clean).map { it.value.trim() }.filter { it.isNotEmpty() }
        val out = mutableListOf<String>()
        var piece = ""
        for (s in sentences.flatMap { words(it, max) }) {
            piece = if (piece.isEmpty()) s else if (piece.length + 1 + s.length <= max) "$piece $s" else { out += piece; s }
        }
        if (piece.isNotEmpty()) out += piece
        return out
    }

    /** A sentence longer than [max], cut at spaces. */
    private fun words(sentence: String, max: Int): List<String> {
        val out = mutableListOf<String>()
        var rest = sentence
        while (rest.length > max) {
            val cut = rest.lastIndexOf(' ', max).takeIf { it > 0 } ?: max
            out += rest.substring(0, cut).trim()
            rest = rest.substring(cut).trim()
        }
        if (rest.isNotEmpty()) out += rest
        return out
    }
}
