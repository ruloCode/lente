package app.lente.core

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/** Synthetic test audio at 16 kHz for the pitch tests: tones, struck notes that decay, and noise. */
object Tones {
    const val SR = Pitch.SAMPLE_RATE

    /** A steady tone of `harmonics` partials, the k-th at amplitude 1/k, peaking at `amp`. */
    fun tone(hz: Double, ms: Int, harmonics: Int = 1, amp: Double = 0.5): FloatArray {
        val n = SR * ms / 1000
        val norm = (1..harmonics).sumOf { 1.0 / it }
        return FloatArray(n) { i ->
            var s = 0.0
            for (k in 1..harmonics) s += sin(2 * PI * hz * k * i / SR) / k
            (amp * s / norm).toFloat()
        }
    }

    /** A struck note: a 5 ms attack, then an exponential decay with time constant `decayMs`. */
    fun struck(midi: Int, ms: Int, decayMs: Double = 400.0, amp: Double = 0.5): FloatArray {
        val t = tone(Pitch.hzOf(midi), ms, harmonics = 3, amp = amp)
        val attack = SR * 5 / 1000
        for (i in t.indices) {
            val env = if (i < attack) i.toDouble() / attack else exp(-(i - attack) * 1000.0 / SR / decayMs)
            t[i] = (t[i] * env).toFloat()
        }
        return t
    }

    fun silence(ms: Int): FloatArray = FloatArray(SR * ms / 1000)

    /** Uniform white noise from a fixed seed. */
    fun noise(ms: Int, amp: Double = 0.3, seed: Long = 7): FloatArray {
        val r = java.util.Random(seed)
        return FloatArray(SR * ms / 1000) { ((r.nextDouble() * 2 - 1) * amp).toFloat() }
    }

    /** `b` added onto `a` starting at `atMs` (the tail of a still sounds under b). */
    fun mix(a: FloatArray, b: FloatArray, atMs: Int): FloatArray {
        val at = SR * atMs / 1000
        val out = a.copyOf(maxOf(a.size, at + b.size))
        for (i in b.indices) out[at + i] += b[i]
        return out
    }

    fun concat(vararg parts: FloatArray): FloatArray {
        val out = FloatArray(parts.sumOf { it.size })
        var at = 0
        for (p in parts) { p.copyInto(out, at); at += p.size }
        return out
    }

    /** Every window of the stream, one hop apart, with its time in ms (the window's end). */
    fun frames(x: FloatArray): List<Pair<Long, PitchFrame>> {
        val out = mutableListOf<Pair<Long, PitchFrame>>()
        var start = 0
        while (start + Pitch.PITCH_WINDOW <= x.size) {
            val w = x.copyOfRange(start, start + Pitch.PITCH_WINDOW)
            out += ((start + Pitch.PITCH_WINDOW) * 1000L / SR) to Pitch.detect(w)
            start += Pitch.PITCH_HOP
        }
        return out
    }
}
