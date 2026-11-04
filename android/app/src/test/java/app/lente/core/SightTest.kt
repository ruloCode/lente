package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

/** add-sight-mode 4.1: what Ver shows and speaks. Synthetic descriptions, no real scene. */
class SightTest {
    private fun look(text: String) = Entry("cue", 1, text, label = "VER")
    private fun live(text: String) = Entry("live", 1, text)

    @Test fun aLookShowsMirandoUntilItsAnswerArrivesThenSpeaksItUrgently() {
        val v = Sight.looking(SightView())
        assertEquals("Mirando…", Sight.shown(v))
        assertEquals("Mirando…", Sight.stateLine(v))
        val (after, say) = Sight.reduce(v, look("Una taza blanca en tu mano derecha."))
        assertEquals("Una taza blanca en tu mano derecha.", Sight.shown(after))
        assertFalse(after.looking)
        assertEquals(SightSpeech(listOf("Una taza blanca en tu mano derecha."), urgent = true), say)
        assertEquals("Narrando", Sight.stateLine(after))
    }

    @Test fun liveReadsAreShownAlwaysAndSpokenOnlyWhileNarrating() {
        val (on, sayOn) = Sight.reduce(SightView(), live("Una puerta al frente."))
        assertEquals("Una puerta al frente.", on.text)
        assertEquals(SightSpeech(listOf("Una puerta al frente."), urgent = false), sayOn)
        val paused = Sight.narration(on, false)
        assertEquals("Narración en pausa", Sight.stateLine(paused))
        assertEquals("Seguir narrando", Sight.narrationAction(paused))
        assertEquals("Pausar narración", Sight.narrationAction(on))
        val (next, sayOff) = Sight.reduce(paused, live("Dos personas a tu izquierda."))
        assertEquals("Dos personas a tu izquierda.", next.text)
        assertNull(sayOff)
        // A look's answer is spoken even with narration paused.
        assertTrue(Sight.reduce(paused, look("Un billete.")).second!!.urgent)
    }

    @Test fun nothingChangedOtherCuesAndPhotosSayNothing() {
        val v = SightView(text = "Antes")
        assertEquals(v to null, Sight.reduce(v, live("=")))
        assertEquals(v to null, Sight.reduce(v, live("  ")))
        assertEquals(v to null, Sight.reduce(v, Entry("cue", 1, "Di: el jueves", label = "DILO")))
        assertEquals(v to null, Sight.reduce(v, Entry("cue", 1, "Una diapositiva", label = "ON SCREEN")))
        assertEquals(v to null, Sight.reduce(v, Entry("turn", 1, "hola")))
        assertEquals(Sight.HINT, Sight.shown(SightView()))
    }

    @Test fun longTextIsSplitAtSentenceEndsIntoPiecesOfAtMost200() {
        val sentence = "Este es un renglón de prueba con varias palabras para llenar espacio."
        val page = List(20) { sentence }.joinToString(" ")
        val parts = Sight.chunks(page)
        assertTrue(parts.size > 1)
        assertTrue(parts.all { it.length <= Sight.CHUNK_CHARS })
        assertTrue(parts.all { it.endsWith(".") })
        assertEquals(page, parts.joinToString(" "))
    }

    @Test fun aSentenceLongerThanTheLimitIsCutAtSpaces() {
        val long = List(60) { "palabra" }.joinToString(" ") + "."
        val parts = Sight.chunks("Hola. $long ¿Y esto?", max = 100)
        assertTrue(parts.all { it.length <= 100 })
        assertEquals("Hola. $long ¿Y esto?", parts.joinToString(" "))
        assertEquals(listOf("Corto."), Sight.chunks("  Corto.  "))
        assertEquals(listOf("Sin punto final"), Sight.chunks("Sin punto final"))
        assertEquals(emptyList<String>(), Sight.chunks(" "))
        assertEquals(listOf(List(30) { "x" }.joinToString("")), Sight.chunks(List(30) { "x" }.joinToString(""), max = 30))
        assertEquals(listOf("x".repeat(10), "x".repeat(5)), Sight.chunks("x".repeat(15), max = 10))
    }

    @Test fun theSpanishVoicePrefersColombiaThenTheUsThenSpain() {
        assertEquals("es-CO", SpeechVoice.spanish(listOf("en-US", "es-ES", "es-US", "es-CO")))
        assertEquals("es-US", SpeechVoice.spanish(listOf("es_US", "es-ES")))
        assertEquals("es-ES", SpeechVoice.spanish(listOf("es-ES", "en-US")))
        assertEquals("es-MX", SpeechVoice.spanish(listOf("en-US", "es-MX")))
        assertEquals("es-ES", SpeechVoice.spanish(listOf("en-US")))
        assertEquals(1.05f, SpeechVoice.rate(Float.NaN))
        assertEquals(0.8f, SpeechVoice.rate(0.1f))
        assertEquals(2.0f, SpeechVoice.rate(3f))
        assertEquals(1.25f, SpeechVoice.rate(1.2391f))
        assertEquals("1,05×", SpeechVoice.rateLabel(1.05f))
    }

    @Test fun theStatusCarriesSightAndGuest() {
        val s = HubJson.status(JSONObject("""{"assistMode":"sight","guest":true}"""))
        assertTrue(s.sight)
        assertTrue(s.guest)
        assertFalse(s.recordOnly)
        val old = HubJson.status(JSONObject("""{"assistMode":"assist"}"""))
        assertFalse(old.sight)
        assertFalse(old.guest)
    }
}
