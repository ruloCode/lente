package app.lente.platform

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import app.lente.core.NoteEvent
import app.lente.core.NoteTracker
import app.lente.core.Pitch

/**
 * Practice's ears (add-practice-mode 2.4): the phone's microphone at 16 kHz mono, unprocessed (`MIC`, not
 * `VOICE_COMMUNICATION`, whose noise suppression eats sustained notes), read hop by hop on a background
 * thread into YIN and the note tracker. The audio stays in this class: only note events leave it. Times are
 * `SystemClock.elapsedRealtime()`. Callbacks run on the main thread. Release it with [stop] when the Practice
 * screen closes or an attempt ends.
 */
class PitchListener(
    /** The note sounding now changed (null: none). */
    private val onHeard: (Int?) -> Unit,
    /** A note started. */
    private val onNote: (NoteEvent) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var running = false
    /** Bumped on every start, so a thread left from an earlier session never reads into the new one. */
    @Volatile private var session = 0
    private var recorder: AudioRecord? = null
    private var thread: Thread? = null

    val listening: Boolean get() = running

    /** Opens the microphone; false when it could not (no permission, or it is taken). */
    @SuppressLint("MissingPermission") // asked by the activity before the screen opens
    @Synchronized
    fun start(): Boolean {
        if (running) return true
        val min = AudioRecord.getMinBufferSize(Pitch.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(MediaRecorder.AudioSource.MIC, Pitch.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, Pitch.PITCH_WINDOW * 2 * 2))
        } catch (e: Exception) {
            Log.w(PracticeLog.TAG, "[practice] microphone failed to open")
            return false
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); Log.w(PracticeLog.TAG, "[practice] microphone not initialized"); return false }
        recorder = rec
        running = true
        val mine = ++session
        rec.startRecording()
        thread = Thread({ loop(rec, mine) }, "lente-practice-mic").also { it.start() }
        return true
    }

    private fun loop(rec: AudioRecord, mine: Int) {
        fun live() = running && session == mine
        val tracker = NoteTracker()
        val window = FloatArray(Pitch.PITCH_WINDOW)
        val hop = ShortArray(Pitch.PITCH_HOP)
        var filled = 0
        var shown: Int? = null
        while (live()) {
            var got = 0
            while (got < hop.size && live()) {
                val n = rec.read(hop, got, hop.size - got)
                if (n < 0) break
                got += n
            }
            if (got < hop.size || !live()) break
            // Slide the window one hop and append the newest samples.
            System.arraycopy(window, Pitch.PITCH_HOP, window, 0, Pitch.PITCH_WINDOW - Pitch.PITCH_HOP)
            for (i in hop.indices) window[Pitch.PITCH_WINDOW - Pitch.PITCH_HOP + i] = hop[i] / 32768f
            filled = minOf(Pitch.PITCH_WINDOW, filled + Pitch.PITCH_HOP)
            if (filled < Pitch.PITCH_WINDOW) continue
            val now = SystemClock.elapsedRealtime()
            val note = tracker.push(now, Pitch.detect(window))
            if (note != null) main.post {
                if (!live()) return@post
                onNote(note)
                PracticeLog.shown(SystemClock.elapsedRealtime() - note.onsetMs)
            }
            val current = tracker.current
            if (current != shown) {
                shown = current
                main.post { if (live()) onHeard(current) }
            }
        }
        main.post { if (session == mine) onHeard(null) }
    }

    @Synchronized
    fun stop() {
        running = false
        recorder?.let { runCatching { it.stop() }; it.release() }
        recorder = null
        thread = null
    }
}

/** Practice's logcat lines for `scripts/bench-practice.ts` (design decision 7): numbers and the lesson id only. */
object PracticeLog {
    const val TAG = "LentePractice"

    /** From the first frame that heard a note to the note on screen. */
    fun shown(ms: Long) { Log.i(TAG, "[practice] onset→shown $ms ms") }

    fun attempt(lessonId: String, right: Int, total: Int) { Log.i(TAG, "[practice] attempt lesson=$lessonId right=$right total=$total") }

    /** From posting the attempt to the coaching line back. */
    fun coach(ms: Long) { Log.i(TAG, "[practice] coach $ms ms") }
}
