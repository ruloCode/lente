package app.lente.core

/**
 * What Ver says next (add-sight-mode, conversational Ver). Three kinds of line share one voice: the
 * voice agent's reply sentences, a look's answer, and the camera's live narration. Replies and looks
 * are said in the order they came; narration is ambient: only the newest waits, it never plays over
 * the conversation, it is dropped when older than [NARRATION_STALE_MS], and a reply or a look arriving
 * while it plays cuts it short. Pure; the speaker on the phone plays what [next] hands it.
 */
enum class LineKind { Reply, Look, Narration }

/** `lang` is a coach sentence's language (add-language-coach), null for Spanish; `slow` is «Más despacio». */
data class SpokenLine(val id: Long, val text: String, val kind: LineKind, val at: Long, val lang: String? = null, val slow: Boolean = false)

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
        /** A phone voice still starting when its first line is due gets this long before the line is skipped. */
        const val TTS_INIT_WAIT_MS = 1_500L
        /** A line whose audio was asked for long ago (while the lines before it played) still gets this long. */
        const val TTS_GRACE_MS = 400L

        /**
         * How long to wait now for a line's hub audio asked for at [askedAt]: what is left of [TTS_WAIT_MS],
         * and at least [TTS_GRACE_MS], so audio that is already here (or nearly) is used, not skipped.
         */
        fun ttsWaitMs(askedAt: Long, now: Long): Long = (askedAt + TTS_WAIT_MS - now).coerceIn(TTS_GRACE_MS, TTS_WAIT_MS)

        /**
         * A line handed over whole (a look's answer, Practicar's coach line) in the sentences it is said in:
         * the first one's audio is short and quick to make, the rest are fetched while it plays. A sentence
         * longer than [Sight.CHUNK_CHARS] is cut at spaces.
         */
        fun sentences(text: String): List<String> {
            val clean = text.replace(Regex("\\s+"), " ").trim()
            if (clean.isEmpty()) return emptyList()
            return Regex("[^.!?…]+(?:[.!?…]+[»\"”)]?|$)").findAll(clean).map { it.value.trim() }.filter { it.isNotEmpty() }
                .flatMap { s -> if (s.length <= Sight.CHUNK_CHARS) listOf(s) else Sight.chunks(s) }.toList()
        }

        /** About how long a screen reader takes to say [text], so announcements follow each other instead of cutting in. */
        fun readMs(text: String): Long = (text.length * 65L).coerceIn(900L, 15_000L)
    }
}
