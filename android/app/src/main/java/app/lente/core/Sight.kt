package app.lente.core

/**
 * Ver (add-sight-mode): what the full-screen surface shows and what it speaks. A look is answered with
 * a `cue` labelled `VER`, spoken in full whenever Ver is open, a few sentences at a time; the camera's
 * `live` reads keep describing and are spoken only while narration is on. Pure.
 */
data class SightView(
    /** The latest description, shown very large; empty until the first one arrives. */
    val text: String = "",
    /** A look was asked for and its answer has not arrived yet. */
    val looking: Boolean = false,
    val narrating: Boolean = true,
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

    /** The surface's one description for TalkBack: what it is and what each gesture does. */
    const val SURFACE =
        "Ver. Toca para mirar qué hay frente a ti. Mantén presionado para hablar con Lente. " +
            "Toca con dos dedos para pausar o seguir la narración. También en el menú de acciones."

    const val LOOK = "Mirar"
    const val TALK = "Hablar con Lente"
    const val REPEAT = "Repetir"
    const val EXIT = "Salir"

    fun narrationAction(v: SightView) = if (v.narrating) "Pausar narración" else "Seguir narrando"

    /** The small state line, in a polite live region. */
    fun stateLine(v: SightView) = when {
        v.looking -> "Mirando…"
        v.narrating -> "Narrando"
        else -> "Narración en pausa"
    }

    /** The large text: the description, «Mirando…» while a look is pending and nothing is shown yet, else the hint. */
    fun shown(v: SightView) = when {
        v.text.isNotBlank() -> v.text
        v.looking -> "Mirando…"
        else -> HINT
    }

    fun looking(v: SightView) = v.copy(looking = true)

    fun lookEnded(v: SightView) = v.copy(looking = false)

    fun narration(v: SightView, on: Boolean) = v.copy(narrating = on)

    /** One entry of the day while Ver is open: the new view and what to say, or null when it says nothing. */
    fun reduce(v: SightView, e: Entry): Pair<SightView, SightSpeech?> {
        val text = e.text.trim()
        if (text.isEmpty() || text == UNCHANGED || e.isPhoto) return v to null
        return when {
            isLookAnswer(e) -> v.copy(text = text, looking = false) to SightSpeech(chunks(text), urgent = true)
            e.kind == "live" -> v.copy(text = text) to (if (v.narrating) SightSpeech(listOf(text), urgent = false) else null)
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
