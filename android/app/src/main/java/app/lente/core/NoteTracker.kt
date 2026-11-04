package app.lente.core

/** A played note (add-practice-mode, design decision 2): its MIDI number, solfège name, octave and times. */
data class NoteEvent(val midi: Int, val name: String, val octave: Int, val onsetMs: Long, val offsetMs: Long? = null)

/** Spanish solfège names. Pure. */
object Solfege {
    private val NAMES = listOf("Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si")
    private val SPOKEN = listOf("Do", "Do sostenido", "Re", "Re sostenido", "Mi", "Fa", "Fa sostenido", "Sol", "Sol sostenido", "La", "La sostenido", "Si")

    fun pitchClass(midi: Int): Int = ((midi % 12) + 12) % 12
    fun name(midi: Int): String = NAMES[pitchClass(midi)]
    /** For TalkBack: «Fa sostenido», not the ♯ sign. */
    fun spoken(midi: Int): String = SPOKEN[pitchClass(midi)]
    /** Scientific octave: middle C (60) is Do4. */
    fun octave(midi: Int): Int = Math.floorDiv(midi, 12) - 1
}

/**
 * Turns pitch frames into note events. A note starts when the same note holds for [STABLE_FRAMES] confident
 * frames; a repeated note (Mi Mi) starts again when the level jumps by [ONSET_RISE] over its decayed floor;
 * an octave jump for one or two frames is read as the note already sounding. Pure: feed it frames in order.
 */
class NoteTracker {
    companion object {
        const val STABLE_FRAMES = 3
        const val MIN_CONFIDENCE = 0.8
        /** A second strike shows as the level rising this many times over the lowest of the last [RISE_LOOKBACK] frames. */
        const val ONSET_RISE = 1.8
        /** The decayed floor is the lowest level of the last 4 hops (128 ms), so a slow decay is not a rise. */
        const val RISE_LOOKBACK = 4
        /** After a rise, a re-struck note has this many frames to show itself as stable, or the rise is ignored. */
        const val ARM_FRAMES = 6
        const val OCTAVE_GLITCH_FRAMES = 2
        /** Frames without a confident pitch (silence, noise) that end the sounding note: 3 × 32 ms. */
        const val RELEASE_FRAMES = 3
    }

    private val notes = mutableListOf<NoteEvent>()
    /** Every note so far, with the offset of those that ended. */
    val events: List<NoteEvent> get() = notes.toList()

    /** The note sounding now, or null. */
    var current: Int? = null
        private set

    private var candMidi: Int? = null
    private var candCount = 0
    private var candStartMs = 0L
    private var octaveRun = 0
    private var octaveStartMs = 0L
    private var quietRun = 0
    private var quietStartMs = 0L
    private var armedFor = 0
    private val recent = ArrayDeque<Double>()

    /** Feeds one frame taken at `atMs`; returns the note that started on it, if any. */
    fun push(atMs: Long, f: PitchFrame): NoteEvent? {
        val rising = recent.size >= RISE_LOOKBACK && f.rms >= Pitch.MIN_RMS &&
            f.rms >= ONSET_RISE * maxOf(recent.min(), Pitch.MIN_RMS / 2)
        recent.addLast(f.rms)
        while (recent.size > RISE_LOOKBACK) recent.removeFirst()
        if (rising && current != null && armedFor == 0) { armedFor = ARM_FRAMES; candMidi = null; candCount = 0 }

        val heard = f.midi?.takeIf { f.confidence >= MIN_CONFIDENCE }
        if (heard == null) {
            if (quietRun == 0) quietStartMs = atMs
            quietRun++
            if (quietRun >= RELEASE_FRAMES) { release(quietStartMs); candMidi = null; candCount = 0; armedFor = 0 }
            octaveRun = 0
            disarmTick()
            return null
        }
        quietRun = 0

        var m = heard
        val ref = current ?: candMidi
        if (ref != null && (m - ref == 12 || m - ref == -12)) {
            if (octaveRun == 0) octaveStartMs = atMs
            octaveRun++
            if (octaveRun <= OCTAVE_GLITCH_FRAMES) m = ref
            else { candMidi = m; candCount = octaveRun - 1; candStartMs = octaveStartMs; octaveRun = 0 }
        } else octaveRun = 0

        if (m == current && armedFor == 0) { candMidi = null; candCount = 0; return null }
        if (m == candMidi) candCount++ else { candMidi = m; candCount = 1; candStartMs = atMs }
        if (candCount >= STABLE_FRAMES) return start(m, candStartMs)
        disarmTick()
        return null
    }

    /** Ends the sounding note at `atMs` (the attempt ended). */
    fun finish(atMs: Long) = release(atMs)

    private fun start(midi: Int, onsetMs: Long): NoteEvent {
        release(onsetMs)
        val e = NoteEvent(midi, Solfege.name(midi), Solfege.octave(midi), onsetMs)
        notes += e
        current = midi
        candMidi = null; candCount = 0; armedFor = 0; octaveRun = 0
        recent.clear()
        return e
    }

    private fun release(atMs: Long) {
        if (current == null) return
        val last = notes.lastIndex
        if (last >= 0 && notes[last].offsetMs == null) notes[last] = notes[last].copy(offsetMs = maxOf(atMs, notes[last].onsetMs))
        current = null
    }

    private fun disarmTick() {
        if (armedFor > 0) { armedFor--; if (armedFor == 0) { candMidi = null; candCount = 0 } }
    }
}
