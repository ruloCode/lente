package app.lente.core

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * One analysis window's pitch (add-practice-mode, design decision 2). `hz`, `midi` and `cents` are null when
 * the window is silent or has no clear period; `confidence` is 1 minus YIN's normalized difference at the
 * chosen period (1 = a perfect period), and `rms` is the level of the window's newest hop in full scale (0–1):
 * the newest 32 ms, so a strike or a damper shows at once instead of spread over the whole window.
 */
data class PitchFrame(val hz: Double?, val midi: Int?, val cents: Int?, val confidence: Double, val rms: Double) {
    val heard: Boolean get() = midi != null
}

/**
 * YIN pitch detection (de Cheveigné and Kawahara, 2002) on the phone's microphone, written for Lente. Pure,
 * so the JVM tests feed it synthetic tones.
 */
object Pitch {
    const val SAMPLE_RATE = 16_000
    /** 2048 samples at 16 kHz = 128 ms: two periods of the lowest note in range, C2. */
    const val PITCH_WINDOW = 2048
    /** 512 samples = 32 ms between windows. */
    const val PITCH_HOP = 512
    const val HOP_MS = PITCH_HOP * 1000 / SAMPLE_RATE
    const val YIN_THRESHOLD = 0.12
    /** C2 to C7. */
    const val MIN_HZ = 65.0
    const val MAX_HZ = 2100.0
    /** About −44 dBFS: quieter than this is silence. */
    const val MIN_RMS = 0.006

    private val TAU_MIN = (SAMPLE_RATE / MAX_HZ).toInt()
    private val TAU_MAX = (SAMPLE_RATE / MIN_HZ).toInt() + 1
    /** The difference function integrates over the part of the window every lag can reach. */
    private val SPAN = PITCH_WINDOW - TAU_MAX - 1

    fun rms(x: FloatArray): Double {
        var s = 0.0
        for (v in x) s += v.toDouble() * v
        return sqrt(s / x.size.coerceAtLeast(1))
    }

    /** PCM16 samples to full-scale floats. */
    fun toFloats(pcm: ShortArray, size: Int = pcm.size): FloatArray = FloatArray(size) { pcm[it] / 32768f }

    /** The pitch of one window of [PITCH_WINDOW] samples (a longer array is read from its start). */
    fun detect(window: FloatArray): PitchFrame {
        require(window.size >= PITCH_WINDOW) { "pitch window has ${window.size} samples, needs $PITCH_WINDOW" }
        val level = rms(window.copyOfRange(PITCH_WINDOW - PITCH_HOP, PITCH_WINDOW))
        if (level < MIN_RMS) return PitchFrame(null, null, null, 0.0, level)

        // Difference function d(τ) and its cumulative mean normalized form d'(τ).
        val d = DoubleArray(TAU_MAX + 2)
        for (tau in 1..TAU_MAX + 1) {
            var s = 0.0
            for (j in 0 until SPAN) {
                val diff = window[j] - window[j + tau]
                s += diff * diff
            }
            d[tau] = s
        }
        val cmnd = DoubleArray(TAU_MAX + 2)
        cmnd[0] = 1.0
        var running = 0.0
        for (tau in 1..TAU_MAX + 1) {
            running += d[tau]
            cmnd[tau] = if (running == 0.0) 1.0 else d[tau] * tau / running
        }

        // The first dip under the threshold, followed down to its local minimum.
        var tau = TAU_MIN
        var found = -1
        while (tau <= TAU_MAX) {
            if (cmnd[tau] < YIN_THRESHOLD) {
                while (tau + 1 <= TAU_MAX && cmnd[tau + 1] < cmnd[tau]) tau++
                found = tau
                break
            }
            tau++
        }
        if (found < 0) {
            var best = 1.0
            for (t in TAU_MIN..TAU_MAX) if (cmnd[t] < best) best = cmnd[t]
            return PitchFrame(null, null, null, (1 - best).coerceIn(0.0, 1.0), level)
        }

        // Parabolic interpolation around the minimum for a period finer than one sample.
        val a = cmnd[found - 1]; val b = cmnd[found]; val c = cmnd[found + 1]
        val denom = a - 2 * b + c
        val shift = if (abs(denom) < 1e-12) 0.0 else (0.5 * (a - c) / denom).coerceIn(-1.0, 1.0)
        val hz = SAMPLE_RATE / (found + shift)
        if (hz < MIN_HZ * 0.97 || hz > MAX_HZ * 1.03) return PitchFrame(null, null, null, (1 - b).coerceIn(0.0, 1.0), level)
        val exact = midiOf(hz)
        val midi = exact.roundToInt()
        return PitchFrame(hz, midi, ((exact - midi) * 100).roundToInt(), (1 - b).coerceIn(0.0, 1.0), level)
    }

    /** MIDI note number (A4 = 69 = 440 Hz), fractional. */
    fun midiOf(hz: Double): Double = 69 + 12 * ln(hz / 440.0) / ln(2.0)

    fun hzOf(midi: Int): Double = 440.0 * 2.0.pow((midi - 69) / 12.0)
}
