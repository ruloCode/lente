package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteTrackerTest {
    private fun track(x: FloatArray): NoteTracker {
        val t = NoteTracker()
        for ((ms, f) in Tones.frames(x)) t.push(ms, f)
        return t
    }

    private fun frame(midi: Int?, rms: Double = 0.2, confidence: Double = 0.95) =
        PitchFrame(midi?.let { Pitch.hzOf(it) }, midi, midi?.let { 0 }, if (midi == null) 0.0 else confidence, rms)

    @Test fun aDecayingNoteIsOneEvent() {
        val t = track(Tones.concat(Tones.silence(200), Tones.struck(60, 1500, decayMs = 300.0), Tones.silence(300)))
        assertEquals(listOf(60), t.events.map { it.midi })
        val e = t.events.single()
        assertTrue("onset ${e.onsetMs} near 200 ms", e.onsetMs in 200L..330L)
        assertNotNull("the note ends once it has decayed into silence", e.offsetMs)
        assertNull(t.current)
    }

    @Test fun aRepeatedNoteWithDecayIsTwoEvents() {
        // Mi, then Mi again 500 ms later while the first still rings.
        val first = Tones.concat(Tones.silence(100), Tones.struck(64, 1200, decayMs = 250.0))
        val x = Tones.mix(first, Tones.struck(64, 800, decayMs = 400.0), atMs = 600)
        val t = track(x)
        assertEquals(listOf(64, 64), t.events.map { it.midi })
        val (a, b) = t.events
        assertTrue("first onset ${a.onsetMs}", a.onsetMs in 100L..230L)
        assertTrue("second onset ${b.onsetMs} near 600 ms", b.onsetMs in 600L..760L)
        assertEquals("the first ends where the second starts", b.onsetMs, a.offsetMs)
    }

    @Test fun aRepeatedNoteWithAGapIsTwoEvents() {
        val strike = Tones.struck(64, 400, decayMs = 60.0)
        val t = track(Tones.concat(Tones.silence(100), strike, Tones.silence(150), strike, Tones.silence(200)))
        assertEquals(listOf(64, 64), t.events.map { it.midi })
        assertTrue(t.events[1].onsetMs - t.events[0].onsetMs in 450L..650L)
    }

    @Test fun aRepeatedNoteCutByTheDamperIsTwoEvents() {
        // A slow piano decay; the key lifts at 400 ms and the damper takes the level down fast, but not to
        // silence, before the same key is struck again at 480 ms.
        val first = Tones.struck(64, 480, decayMs = 1500.0)
        val lift = Tones.SR * 400 / 1000
        for (i in lift until first.size) first[i] = (first[i] * kotlin.math.exp(-(i - lift) * 1000.0 / Tones.SR / 30.0)).toFloat()
        val t = track(Tones.concat(Tones.silence(100), first, Tones.struck(64, 800, decayMs = 1500.0), Tones.silence(100)))
        assertEquals(listOf(64, 64), t.events.map { it.midi })
    }

    @Test fun aHeldNoteIsNotReStruck() {
        val t = track(Tones.concat(Tones.tone(Pitch.hzOf(67), 1500, harmonics = 3)))
        assertEquals(listOf(67), t.events.map { it.midi })
    }

    @Test fun theScaleIsEightEvents() {
        val scale = listOf(60, 62, 64, 65, 67, 69, 71, 72)
        val t = track(Tones.concat(Tones.silence(100), *scale.map { Tones.struck(it, 450, decayMs = 500.0) }.toTypedArray(), Tones.silence(300)))
        assertEquals(scale, t.events.map { it.midi })
    }

    @Test fun aOneFrameOctaveGlitchIsNoExtraEvent() {
        val t = NoteTracker()
        var ms = 0L
        val seq = listOf(60, 60, 60, 60, 72, 60, 60, 48, 48, 60, 60, 60)
        val started = seq.mapNotNull { m -> t.push(ms, frame(m)).also { ms += Pitch.HOP_MS } }
        assertEquals(listOf(60), started.map { it.midi })
        assertEquals(60, t.current)
    }

    @Test fun aGlitchWhileANoteIsStartingStillCounts() {
        val t = NoteTracker()
        var ms = 0L
        val started = listOf(60, 72, 60).mapNotNull { m -> t.push(ms, frame(m)).also { ms += Pitch.HOP_MS } }
        assertEquals(listOf(60), started.map { it.midi })
    }

    @Test fun aRealOctaveJumpIsANewNote() {
        val t = NoteTracker()
        var ms = 0L
        val started = listOf(60, 60, 60, 60, 72, 72, 72, 72).mapNotNull { m -> t.push(ms, frame(m)).also { ms += Pitch.HOP_MS } }
        assertEquals(listOf(60, 72), started.map { it.midi })
        assertEquals("the new note starts at its first frame", 4L * Pitch.HOP_MS, started[1].onsetMs)
    }

    @Test fun unconfidentFramesAreNoNote() {
        val t = NoteTracker()
        var ms = 0L
        repeat(10) { t.push(ms, frame(60, confidence = 0.5)); ms += Pitch.HOP_MS }
        assertEquals(0, t.events.size)
        assertEquals(0, track(Tones.noise(600)).events.size)
        assertEquals(0, track(Tones.silence(600)).events.size)
    }

    @Test fun solfegeNames() {
        assertEquals(listOf("Do", "Re", "Mi", "Fa", "Sol", "La", "Si", "Do"), listOf(60, 62, 64, 65, 67, 69, 71, 72).map(Solfege::name))
        assertEquals("Fa♯", Solfege.name(66))
        assertEquals("Fa sostenido", Solfege.spoken(66))
        assertEquals(4, Solfege.octave(60))
        assertEquals(5, Solfege.octave(72))
        assertEquals(3, Solfege.octave(59))
        val e = NoteTracker().let { t -> listOf(67, 67, 67).mapNotNull { t.push(0, frame(it)) }.single() }
        assertEquals("Sol", e.name)
        assertEquals(4, e.octave)
    }
}
