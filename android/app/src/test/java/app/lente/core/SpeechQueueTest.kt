package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Conversational Ver: what its one voice says next. Synthetic lines. */
class SpeechQueueTest {
    private var ids = 0L
    private fun line(text: String, kind: LineKind, at: Long = 0) = SpokenLine(++ids, text, kind, at)

    @Test fun repliesAndLooksPlayInOrderBeforeNarration() {
        val q = SpeechQueue()
        q.offer(line("Hay una puerta.", LineKind.Narration))
        q.offer(line("Hola, soy Lente.", LineKind.Reply))
        q.offer(line("¿Cómo te llamas?", LineKind.Reply))
        assertEquals("Hola, soy Lente.", q.next(100)!!.text)
        q.done()
        assertEquals("¿Cómo te llamas?", q.next(200)!!.text)
        q.done()
        assertEquals("Hay una puerta.", q.next(300)!!.text)
        q.done()
        assertNull(q.next(400))
    }

    @Test fun onlyTheNewestNarrationWaitsAndAStaleOneIsDropped() {
        val q = SpeechQueue()
        q.offer(line("Una mesa.", LineKind.Narration, at = 0))
        q.offer(line("Una silla.", LineKind.Narration, at = 1_000))
        assertEquals(listOf("Una silla."), q.waiting.map { it.text })
        assertNull(q.next(1_000 + SpeechQueue.NARRATION_STALE_MS + 1))
        assertTrue(q.waiting.isEmpty())
    }

    @Test fun narrationWaitsWhileTheConversationHoldsItThenPlaysIfStillFresh() {
        val q = SpeechQueue()
        q.offer(line("Una ventana.", LineKind.Narration, at = 0))
        assertNull(q.next(500, holdNarration = true))
        assertEquals("Una ventana.", q.next(2_000, holdNarration = false)!!.text)
    }

    @Test fun aReplyOrALookCutsAPlayingNarrationButNotAnotherReply() {
        val q = SpeechQueue()
        q.offer(line("Un pasillo.", LineKind.Narration))
        q.next(0)
        assertTrue(q.offer(line("Te escucho.", LineKind.Reply)))
        q.done()
        q.next(0)
        assertFalse(q.offer(line("Y otra cosa.", LineKind.Reply)))
        assertFalse(q.offer(line("Otra narración.", LineKind.Narration)))
        // A look's answer replaces the narration that was waiting.
        q.offer(line("Un billete de veinte mil pesos.", LineKind.Look))
        assertEquals(listOf("Y otra cosa.", "Un billete de veinte mil pesos."), q.waiting.map { it.text })
    }

    @Test fun pausingNarrationAndBargeInDropWhatWaits() {
        val q = SpeechQueue()
        q.offer(line("Una escalera.", LineKind.Narration))
        q.next(0)
        q.offer(line("Otra.", LineKind.Narration))
        assertTrue(q.dropNarration())
        assertTrue(q.waiting.isEmpty())
        q.done()
        q.offer(line("Uno.", LineKind.Reply))
        q.offer(line("Dos.", LineKind.Reply))
        assertEquals(2, q.clear().size)
        assertNull(q.next(0))
        assertFalse(q.offer(line("  ", LineKind.Reply)))
        assertTrue(q.waiting.isEmpty())
    }

    @Test fun aScreenReaderIsGivenTimeToFinishEachLine() {
        assertEquals(900L, SpeechQueue.readMs("Hola."))
        assertEquals(6_500L, SpeechQueue.readMs("x".repeat(100)))
        assertEquals(15_000L, SpeechQueue.readMs("x".repeat(1_000)))
    }

    @Test fun theFallbackVoiceIsAFemaleSpanishOneByName() {
        val voices = mapOf(
            "es-us-x-esd-local" to "es-US",
            "es-us-x-esf-local" to "es-US",
            "es-es-x-eea-local" to "es-ES",
            "es-CO-SMTf00" to "es-CO",
            "es-CO-SMTm00" to "es-CO",
        )
        assertEquals("es-CO-SMTf00", SpeechVoice.female(voices))
        assertEquals("es-us-x-esf-local", SpeechVoice.female(voices - "es-CO-SMTf00"))
        assertEquals("es-us-x-sfb#female_1-local", SpeechVoice.female(mapOf("es-us-x-sfb#female_1-local" to "es_US", "es-us-x-sfb#male_1-local" to "es_US")))
        assertEquals("es-MX-voice-female", SpeechVoice.female(mapOf("es-MX-voice-female" to "es-MX")))
        assertNull(SpeechVoice.female(mapOf("es-us-x-esd-local" to "es-US", "en-us-x-female" to "en-US")))
        assertFalse(SpeechVoice.isFemale("es-us-x-esd-local"))
        assertFalse(SpeechVoice.isFemale("es-CO-SMTm00"))
    }
}
