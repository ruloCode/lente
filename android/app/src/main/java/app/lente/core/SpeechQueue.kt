package app.lente.core

/**
 * What Ver says next (add-sight-mode, conversational Ver). Three kinds of line share one voice: the
 * voice agent's reply sentences, a look's answer, and the camera's live narration. Replies and looks
 * are said in the order they came; narration is ambient: only the newest waits, it never plays over
 * the conversation, it is dropped when older than [NARRATION_STALE_MS], and a reply or a look arriving
 * while it plays cuts it short. Pure; the speaker on the phone plays what [next] hands it.
 */
enum class LineKind { Reply, Look, Narration }

data class SpokenLine(val id: Long, val text: String, val kind: LineKind, val at: Long)

class SpeechQueue(private val staleMs: Long = NARRATION_STALE_MS) {
    private val front = ArrayDeque<SpokenLine>()
    private var narration: SpokenLine? = null
    var playing: SpokenLine? = null
        private set

    val waiting: List<SpokenLine> get() = front.toList() + listOfNotNull(narration)

    /** A reply or a look is playing or waiting. */
    val conversing: Boolean get() = front.isNotEmpty() || (playing != null && playing?.kind != LineKind.Narration)

    /** Queues [line]; true when the line playing now must stop (narration under a reply or a look). */
    fun offer(line: SpokenLine): Boolean {
        if (line.text.isBlank()) return false
        if (line.kind == LineKind.Narration) {
            narration = line
            return false
        }
        front.addLast(line)
        // A look's answer is what the wearer asked for: the description it replaces need not be said.
        if (line.kind == LineKind.Look) narration = null
        return playing?.kind == LineKind.Narration
    }

    /**
     * The next line to play and marks it playing, or null. Replies and looks first; then the waiting
     * narration unless [holdNarration] (the wearer is talking or Lente is thinking) or it is stale.
     */
    fun next(now: Long, holdNarration: Boolean = false): SpokenLine? {
        val line = front.removeFirstOrNull() ?: narration?.let { n ->
            if (now - n.at > staleMs) { narration = null; null }
            else if (holdNarration) null
            else { narration = null; n }
        }
        playing = line
        return line
    }

    fun done() { playing = null }

    /** Narration paused: the waiting one goes; true when the one playing must stop. */
    fun dropNarration(): Boolean {
        narration = null
        return playing?.kind == LineKind.Narration
    }

    /** Barge-in, a pause or leaving Ver: nothing more is said; returns what was waiting. */
    fun clear(): List<SpokenLine> {
        val dropped = waiting
        front.clear()
        narration = null
        return dropped
    }

    companion object {
        /** A live description later than this is about a scene that has moved on (the hub's `SIGHT_STALE_MS`). */
        const val NARRATION_STALE_MS = 6_000L
        /** How long the hub's voice may take before the phone's own voice says the line instead. */
        const val TTS_WAIT_MS = 2_500L

        /** About how long a screen reader takes to say [text], so announcements follow each other instead of cutting in. */
        fun readMs(text: String): Long = (text.length * 65L).coerceIn(900L, 15_000L)
    }
}
