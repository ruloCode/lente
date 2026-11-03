package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** add-memory-engine 4.1: the streamed answer's events applied to the pending line, as the hub sends them. */
class AskStreamTest {
    private val waiting = ChatLine(2, false, "", pending = true)
    private fun run(vararg events: Pair<String?, String>): List<ChatLine> = events.runningFold(waiting) { line, (e, d) -> AskStream.apply(line, e, d) }.drop(1)

    @Test fun textGrowsAsItStreamsChipsJoinAndDoneWins() {
        val steps = run(
            "delta" to """{"text":"Ana dijo 18,000"}""",
            "delta" to """{"text":" dólares."}""",
            "source" to """{"id":"s1:4","kind":"meeting","label":"Marketing · 10:03","at":1,"meetingId":"m1","turnId":"t7"}""",
            "source" to """{"id":"s1:5","kind":"meeting","label":"Marketing · 10:03","at":2,"meetingId":"m1","turnId":"t8"}""",
            "done" to """{"ok":true,"answer":"Ana dijo 18,000 dólares.","found":true,"sources":[{"kind":"meeting","label":"Marketing · 10:03","meetingId":"m1","turnId":"t7"}]}""",
        )
        assertEquals("Ana dijo 18,000", steps[0].text)
        assertFalse(steps[0].pending)
        assertTrue(steps[0].streaming)
        assertTrue(steps[0].busy)
        assertEquals("Ana dijo 18,000 dólares.", steps[1].text)
        assertEquals(listOf(AskSource("meeting", "Marketing · 10:03", "m1", "t7")), steps[3].sources)
        val done = steps.last()
        assertFalse(done.streaming)
        assertFalse(done.busy)
        assertEquals("Ana dijo 18,000 dólares.", done.text)
        assertEquals(1, done.sources.size)
    }

    @Test fun searchingShowsBuscandoMasThenTheDeepAnswerArrives() {
        val steps = run("searching" to "{}", "delta" to """{"text":"Hablaste con Ana tres veces."}""", "done" to """{"ok":true,"answer":"Hablaste con Ana tres veces.","found":true,"sources":[]}""")
        assertTrue(steps[0].pending)
        assertTrue(steps[0].searching)
        assertFalse(steps[1].searching)
        assertEquals("Hablaste con Ana tres veces.", steps.last().text)
    }

    @Test fun replaceDropsTheStreamedTextAndItsChips() {
        val steps = run(
            "delta" to """{"text":"El lanzamiento es el 3."}""",
            "source" to """{"kind":"seen","label":"Lo viste · 09:00","at":1}""",
            "replace" to """{"text":"No lo encuentro en lo que viste y escuchaste."}""",
        )
        val replaced = steps.last()
        assertEquals("No lo encuentro en lo que viste y escuchaste.", replaced.text)
        assertTrue(replaced.sources.isEmpty())
        assertFalse(replaced.found)
    }

    @Test fun unknownEventsAndBadDataLeaveTheLineAlone() {
        assertEquals(waiting, AskStream.apply(waiting, "job", """{"id":"a1"}"""))
        assertEquals(waiting, AskStream.apply(waiting, "delta", "not json"))
    }

    @Test fun sseParserKeepsEventNames() {
        val p = SseParser()
        assertEquals(emptyList<Pair<String?, String>>(), p.pushNamed("event: delta\ndata: {\"text\":\"Ho"))
        assertEquals(listOf("delta" to """{"text":"Hola"}""", null to "x"), p.pushNamed("la\"}\n\ndata: x\n\n"))
    }
}
