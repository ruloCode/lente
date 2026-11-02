package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** add-voice-mode 3.1: the hub's /voice events as the screen sees them. Event shapes from src/voice-session.ts; synthetic text. */
class VoiceStateTest {
    private fun run(vararg events: String): Pair<VoiceView, List<VoiceEffect>> {
        var view = VoiceView()
        val effects = mutableListOf<VoiceEffect>()
        for (e in events) {
            val (next, fx) = VoiceEvents.reduce(view, e)
            view = next
            effects += fx
        }
        return view to effects
    }

    @Test fun aTurnGoesFromListeningToThinkingToSpeakingAndEachSentenceIsSpoken() {
        val (view, fx) = run(
            """{"type":"listening","source":"phone"}""",
            """{"type":"partial","text":"Agrega que"}""",
            """{"type":"heard","turn":1,"text":"Agrega que llame a Ana el viernes"}""",
            """{"type":"thinking","turn":1}""",
            """{"type":"reply","turn":1,"text":"Lo anoto en tu lista.","commentary":true}""",
            """{"type":"tool","turn":1,"name":"add_task","label":"Tarea agregada: Llamar a Ana"}""",
            """{"type":"reply","turn":1,"text":"Listo, agregué «Llamar a Ana».","commentary":false}""",
            """{"type":"done","turn":1,"stopped":"answered"}""",
        )
        assertEquals(VoicePhase.Speaking, view.phase)
        assertEquals("phone", view.source)
        assertEquals("", view.partial)
        val t = view.current!!
        assertEquals("Agrega que llame a Ana el viernes", t.heard)
        assertEquals("Listo, agregué «Llamar a Ana».", t.answer)
        assertEquals(listOf(VoiceTool("add_task", "Tarea agregada: Llamar a Ana")), t.tools)
        assertEquals(listOf(VoiceEffect.Speak(1, "Lo anoto en tu lista."), VoiceEffect.Speak(1, "Listo, agregué «Llamar a Ana».")), fx)
        assertEquals(VoicePhase.Listening, VoiceEvents.reduce(view, """{"type":"state","state":"listening","turn":1}""").first.phase)
    }

    @Test fun bargeInStopsTheVoiceAndLateSentencesOfThatTurnAreDropped() {
        val (view, fx) = run(
            """{"type":"heard","turn":2,"text":"Cuéntame algo largo"}""",
            """{"type":"reply","turn":2,"text":"Primera frase."}""",
            """{"type":"bargeIn","turn":2}""",
            """{"type":"reply","turn":2,"text":"Esta no debe sonar."}""",
            """{"type":"heard","turn":3,"text":"Espera otra cosa"}""",
        )
        assertEquals(listOf(VoiceEffect.Speak(2, "Primera frase."), VoiceEffect.StopSpeaking), fx)
        assertTrue(view.turns.first().cancelled)
        assertEquals(listOf("Primera frase."), view.turns.first().reply)
        assertEquals(VoicePhase.Listening, view.phase)
        val lines = VoiceEvents.chatLines(view, generateSequence(1L) { it + 1 }.iterator()::next)
        assertEquals(listOf("Cuéntame algo largo", "Espera otra cosa"), lines.map { it.text }, )
    }

    @Test fun webSourcesKeepTheirUrlAndTheRecordSheetOpensWithTheChoice() {
        val (view, fx) = run(
            """{"type":"heard","turn":1,"text":"Busca la capital"}""",
            """{"type":"sources","turn":1,"sources":[{"kind":"web","label":"example.org","url":"https://example.org/a"},{"kind":"meeting","label":"PROBE · 10:00","meetingId":"m1","turnId":"t2"}]}""",
            """{"type":"recordSheet","projectId":"proj-b","projectName":"PROBE Beta","camera":true}""",
        )
        assertEquals(listOf(AskSource("web", "example.org", null, null, "https://example.org/a"), AskSource("meeting", "PROBE · 10:00", "m1", "t2")), view.current!!.sources)
        assertEquals(listOf(VoiceEffect.OpenRecordSheet(RecordSheetRequest("proj-b", true))), fx)
    }

    @Test fun errorsEndAndGarbageAreHandled() {
        val (view, fx) = run("""not json""", """{"type":"error","message":"Lente no tiene un modelo configurado."}""", """{"type":"end"}""")
        assertEquals("Lente no tiene un modelo configurado.", view.error)
        assertEquals(VoicePhase.Ended, view.phase)
        assertEquals(listOf(VoiceEffect.StopSpeaking), fx)
        val spoken = org.json.JSONObject(VoiceEvents.spoken(3, 2))
        assertEquals(listOf("spoken", 3, 2), listOf(spoken.getString("type"), spoken.getInt("turn"), spoken.getInt("count")))
        assertEquals("Te escucho", VoiceEvents.label(VoicePhase.Listening))
    }

    @Test fun theSpokenCountReportsOnlyWhenATurnsLastQueuedSentenceIsDone() {
        val c = SpokenCount()
        c.queued(1); c.queued(1)
        assertNull(c.finished(1))
        c.queued(1)
        assertNull(c.finished(1))
        assertEquals(3, c.finished(1))
    }
}
