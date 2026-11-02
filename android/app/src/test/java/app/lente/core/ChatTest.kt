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
}
