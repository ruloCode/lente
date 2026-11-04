package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PitchTest {
    private fun window(x: FloatArray) = x.copyOfRange(0, Pitch.PITCH_WINDOW)

    private fun assertHeard(midi: Int, harmonics: Int) {
        val f = Pitch.detect(window(Tones.tone(Pitch.hzOf(midi), 200, harmonics)))
        assertEquals("midi for $midi with $harmonics harmonics", midi, f.midi)
        assertTrue("cents ${f.cents} for $midi with $harmonics harmonics", kotlin.math.abs(f.cents!!) <= 20)
        assertTrue("confidence ${f.confidence}", f.confidence >= 0.8)
    }

    @Test fun sineAtC3A4C6() {
        for (m in listOf(48, 69, 84)) assertHeard(m, harmonics = 1)
    }

    @Test fun threeHarmonicsAtC3A4C6() {
        for (m in listOf(48, 69, 84)) assertHeard(m, harmonics = 3)
    }

    @Test fun theEdgesOfTheRange() {
        assertHeard(36, harmonics = 3) // C2
        assertHeard(96, harmonics = 1) // C7
    }

    @Test fun a440IsA440() {
        val f = Pitch.detect(window(Tones.tone(440.0, 200)))
        assertEquals(440.0, f.hz!!, 1.0)
        assertEquals(0, f.cents)
    }

    @Test fun aQuarterToneSharpShowsInCents() {
        val f = Pitch.detect(window(Tones.tone(Pitch.hzOf(69) * Math.pow(2.0, 0.3 / 12), 200)))
        assertEquals(69, f.midi)
        assertEquals(30.0, f.cents!!.toDouble(), 5.0)
    }

    @Test fun silenceIsNoPitch() {
        val f = Pitch.detect(Tones.silence(200))
        assertNull(f.midi)
        assertFalse(f.heard)
        val quiet = Pitch.detect(window(Tones.tone(440.0, 200, amp = 0.004)))
        assertNull("a tone under MIN_RMS is silence", quiet.midi)
    }

    @Test fun whiteNoiseIsNoConfidentPitch() {
        for (seed in 1L..5L) {
            val f = Pitch.detect(window(Tones.noise(200, seed = seed)))
            assertTrue("noise seed $seed: midi ${f.midi} confidence ${f.confidence}", f.midi == null || f.confidence < 0.8)
        }
    }

    @Test fun midiAndHzAreInverse() {
        assertEquals(60.0, Pitch.midiOf(Pitch.hzOf(60)), 1e-9)
        assertEquals(261.63, Pitch.hzOf(60), 0.01)
    }
}
