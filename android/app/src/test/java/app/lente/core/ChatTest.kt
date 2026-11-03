package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.LocalDateTime

class ChatTest {
    @Test fun requestCarriesTheRecentConversationWithoutThePendingLine() {
        val lines = (1..12).map { ChatLine(it.toLong(), it % 2 == 1, "m$it") } + ChatLine(13, false, "", pending = true)
        val req = ChatJson.request("¿Y la pizarra?", lines)
        assertEquals("¿Y la pizarra?", req.getString("question"))
        val history = req.getJSONArray("history")
        assertEquals(ChatJson.HISTORY, history.length())
        assertEquals("m5", history.getJSONObject(0).getString("text"))
        assertEquals("user", history.getJSONObject(0).getString("role"))
        assertEquals("lente", history.getJSONObject(history.length() - 1).getString("role"))
    }

    @Test fun answerKeepsSourcesAndRefusalsKeepTheHubsMessage() {
        val ok = ChatJson.answer(7, """{"ok":true,"answer":"Tres columnas.","found":true,"ms":900,"sources":[{"id":"S1","kind":"seen","label":"Lo viste · 11:02","at":1},{"id":"M1.t2","kind":"meeting","label":"Beta · 10:26","at":2,"meetingId":"m1","turnId":"t2"}]}""")
        assertEquals("Tres columnas.", ok.text)
        assertEquals(listOf(AskSource("seen", "Lo viste · 11:02", null, null), AskSource("meeting", "Beta · 10:26", "m1", "t2")), ok.sources)
        val notFound = ChatJson.answer(8, """{"ok":true,"answer":"No lo encuentro en lo que viste y escuchaste.","found":false,"sources":[],"ms":500}""")
        assertFalse(notFound.found)
        assertEquals("Escribe una pregunta.", ChatJson.answer(9, """{"ok":false,"reason":"empty-question","message":"Escribe una pregunta."}""").text)
    }

    @Test fun greetingFollowsTheHourAndTheDateIsSpanish() {
        assertEquals("Buenos días, Rulo", Greeting.hello(8, "Rulo"))
        assertEquals("Buenas tardes", Greeting.hello(15, null))
        assertEquals("Buenas noches, Rulo", Greeting.hello(23, " Rulo "))
        assertEquals("Domingo 1 de noviembre", Greeting.date(LocalDateTime.of(2026, 11, 1, 14, 0)))
    }

    @Test fun composerTalksWhenEmptyAndSendsWithText() {
        assertEquals(ChatSheet.Button.Talk, ChatSheet.button(""))
        assertEquals(ChatSheet.Button.Talk, ChatSheet.button("   "))
        assertEquals(ChatSheet.Button.Send, ChatSheet.button("¿Qué"))
    }

    @Test fun sharedAnswerNamesItsSourcesOnce() {
        val plain = ChatLine(1, false, "El viernes, si QA aprueba.")
        assertEquals("El viernes, si QA aprueba.", ChatSheet.shared(plain))
        val sourced = plain.copy(sources = listOf(AskSource("turn", "Revisión de la beta", "m1", "t2"), AskSource("turn", "Revisión de la beta", "m1", "t3"), AskSource("fact", "Recuerdo", null, null)))
        assertEquals("El viernes, si QA aprueba.\n\nFuentes: Revisión de la beta · Recuerdo", ChatSheet.shared(sourced))
    }

    @Test fun requestNamesItsThreadWhenGiven() {
        assertEquals("t-1", ChatJson.request("¿Y?", emptyList(), "t-1").getString("threadId"))
        assertFalse(ChatJson.request("¿Y?", emptyList()).has("threadId"))
    }

    @Test fun historyParsesThreadsWithTheirLinesAndSources() {
        val json = """{"threads":[{"threadId":"a","via":"voice","at":2000,"title":"¿Qué dijo Ana?","lines":[{"role":"user","text":"¿Qué dijo Ana?"},{"role":"lente","text":"Que el viernes.","sources":[{"kind":"meeting","label":"Revisión","meetingId":"m1","turnId":"t2"}]}]},{"threadId":"","lines":[]}]}"""
        val threads = ChatHistory.threads(json, firstId = 10)
        assertEquals(1, threads.size)
        val t = threads[0]
        assertEquals(true, t.voice)
        assertEquals("¿Qué dijo Ana?", t.title)
        assertEquals(listOf(true, false), t.lines.map { it.fromWearer })
        assertEquals(listOf(10L, 11L), t.lines.map { it.id })
        assertEquals("m1", t.lines[1].sources.single().meetingId)
    }

    @Test fun historySaysTodayYesterdayOrTheDate() {
        val zone = java.time.ZoneId.of("America/Bogota")
        val now = java.time.ZonedDateTime.of(2026, 11, 2, 22, 0, 0, 0, zone).toInstant().toEpochMilli()
        val at = { d: Int, h: Int, m: Int -> java.time.ZonedDateTime.of(2026, 11, d, h, m, 0, 0, zone).toInstant().toEpochMilli() }
        assertEquals("Hoy · 21:40", ChatHistory.whenLabel(at(2, 21, 40), now, zone))
        assertEquals("Ayer · 09:05", ChatHistory.whenLabel(at(1, 9, 5), now, zone))
        assertEquals("30 oct · 10:00", ChatHistory.whenLabel(java.time.ZonedDateTime.of(2026, 10, 30, 10, 0, 0, 0, zone).toInstant().toEpochMilli(), now, zone))
    }
}
