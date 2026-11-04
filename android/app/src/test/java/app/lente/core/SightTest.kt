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

    private fun voice(vararg events: String) = events.fold(VoiceView()) { v, e -> VoiceEvents.reduce(v, e).first }

    @Test fun theConversationsLatestLineTakesTheLargeTextOnlyWhenItChanges() {
        var v = SightView()
        val welcome = voice("""{"type":"reply","turn":0,"text":"Hola, soy Lente."}""")
        v = Sight.talk(v, welcome)
        assertEquals("Lente: Hola, soy Lente.", Sight.shown(v))
        // A description arrives: it is shown, and an unrelated voice event does not bring the old line back.
        v = Sight.reduce(v, live("Una puerta al frente.")).first
        assertEquals("Una puerta al frente.", Sight.shown(v))
        v = Sight.talk(v, VoiceEvents.reduce(welcome, """{"type":"state","state":"listening"}""").first)
        assertEquals("Una puerta al frente.", Sight.shown(v))
        val saying = VoiceEvents.reduce(welcome, """{"type":"partial","text":"me llamo"}""").first
        v = Sight.talk(v, saying)
        assertEquals("Tú: me llamo", Sight.shown(v))
        v = Sight.talk(v, VoiceEvents.reduce(saying, """{"type":"heard","turn":1,"text":"Me llamo Ana."}""").first)
        assertEquals("Tú: Me llamo Ana.", Sight.shown(v))
        assertEquals("Una puerta al frente.", v.text)
    }

    @Test fun theStateLineSaysTheConversationThenTheNarration() {
        val on = SightView()
        val off = Sight.narration(on, false)
        assertEquals("Escuchando · Narrando", Sight.stateLine(on, VoicePhase.Listening))
        assertEquals("Escuchando · Narración en pausa", Sight.stateLine(off, VoicePhase.Listening))
        assertEquals("Pensando…", Sight.stateLine(on, VoicePhase.Thinking))
        assertEquals("Hablando", Sight.stateLine(on, VoicePhase.Speaking))
        assertEquals("Escucha en pausa · Narrando", Sight.stateLine(on, VoicePhase.Paused))
        assertEquals("Conectando…", Sight.stateLine(on, VoicePhase.Connecting))
        assertEquals("Narración en pausa", Sight.stateLine(off, VoicePhase.Ended))
        assertEquals("Mirando…", Sight.stateLine(Sight.looking(on), VoicePhase.Speaking))
        assertEquals("Pausar escucha", Sight.listenAction(VoicePhase.Listening))
        assertEquals("Seguir escuchando", Sight.listenAction(VoicePhase.Paused))
        assertEquals("Volver a hablar con Lente", Sight.listenAction(VoicePhase.Ended))
    }

    @Test fun theQuietMutesNarrationShowsItsLineAndComesBackAsItWas() {
        val paused = Sight.narration(SightView(), false)
        val q = Sight.quiet(SightView())
        assertTrue(q.quiet)
        assertFalse(q.narrating)
        assertEquals(Sight.QUIET_LINE, Sight.stateLine(q, VoicePhase.Ended))
        assertEquals(Sight.QUIET_LINE, Sight.stateLine(q))
        // A conversation opened from the quiet shows its own state.
        assertEquals("Escuchando · Narración en pausa", Sight.stateLine(q, VoicePhase.Listening))
        // A long press in the quiet is the way back.
        assertEquals(Sight.TALK_AGAIN, Sight.listenAction(VoicePhase.Ended, quiet = true))
        assertEquals(Sight.TALK_AGAIN, Sight.listenAction(null, quiet = true))
        assertTrue(Sight.talkAgain(q).narrating)
        assertFalse(Sight.talkAgain(Sight.quiet(paused)).narrating)
        assertEquals(q, Sight.quiet(q))
        assertEquals(paused, Sight.talkAgain(paused))
    }

    @Test fun whileVerSaysALookOrANarrationTheStateLineSaysSo() {
        val on = SightView()
        assertEquals("Narrando", Sight.stateLine(on.copy(saying = LineKind.Narration), VoicePhase.Listening))
        assertEquals("Hablando", Sight.stateLine(on.copy(saying = LineKind.Look), VoicePhase.Listening))
        // Lente thinking about a reply is said over the narration it holds back.
        assertEquals("Pensando…", Sight.stateLine(on.copy(saying = LineKind.Narration), VoicePhase.Thinking))
        assertEquals(Sight.QUIET_LINE, Sight.stateLine(Sight.quiet(on), VoicePhase.Ended))
        assertTrue(Sight.replying(VoicePhase.Thinking))
        assertTrue(Sight.replying(VoicePhase.Speaking))
        assertFalse(Sight.replying(VoicePhase.Listening))
        assertFalse(Sight.replying(null))
    }

    @Test fun theMicrophoneHearingVersOwnVoiceIsNotShownAsTheWearer() {
        val said = Sight.remember(emptyList(), "Tienes un teclado justo al frente.")
        val echo = voice("""{"type":"partial","text":"tienes un teclado justo al"}""")
        assertTrue(Sight.isEcho("tienes un teclado justo al", said))
        assertEquals("", Sight.talkLine(echo, said))
        val v = Sight.talk(SightView(text = "Un teclado.", line = "Un teclado."), echo, said)
        assertEquals("Un teclado.", Sight.shown(v))
        // The wearer's own words still show, accents and case aside.
        assertFalse(Sight.isEcho("¿qué tengo en la mano?", said))
        assertEquals("Tú: ¿qué tengo en la mano?", Sight.talkLine(voice("""{"type":"partial","text":"¿qué tengo en la mano?"}"""), said))
        assertTrue(Sight.isEcho("TIENES UN TECLADO", Sight.remember(said, "Otra cosa.")))
        assertFalse(Sight.isEcho("tienes", emptyList()))
        assertEquals(Sight.ECHO_LINES, (1..10).fold(emptyList<String>()) { l, i -> Sight.remember(l, "$i") }.size)
    }

    @Test fun aDroppedConnectionReconnectsByItselfButARefusalOrTheQuietDoesNot() {
        assertTrue(Sight.reconnects(Sight.LOST, open = true, quiet = false, tries = 0))
        assertTrue(Sight.reconnects(Sight.LOST, open = true, quiet = false, tries = Sight.RECONNECTS - 1))
        assertFalse(Sight.reconnects(Sight.LOST, open = true, quiet = false, tries = Sight.RECONNECTS))
        assertFalse(Sight.reconnects(Sight.LOST, open = false, quiet = false, tries = 0))
        assertFalse(Sight.reconnects(Sight.LOST, open = true, quiet = true, tries = 0))
        assertFalse(Sight.reconnects("Inicia sesión otra vez para hablar con Lente.", open = true, quiet = false, tries = 0))
        assertFalse(Sight.reconnects(null, open = true, quiet = false, tries = 0))
    }

    @Test fun anEchoRunningAcrossTwoSentencesIsStillVersOwnVoice() {
        val said = listOf("Hola, soy Lente, tu compañera para mirar contigo.", "¿Cómo te llamas?").fold(emptyList<String>(), Sight::remember)
        assertTrue(Sight.isEcho("Hola, soy Lente. Tu compañera para mirar ¿Cómo te llamas?", said))
        assertFalse(Sight.isEcho("Me llamo Ana y tengo treinta años", said))
    }
}
