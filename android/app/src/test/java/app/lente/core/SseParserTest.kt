package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Test

class SseParserTest {
    @Test fun splitsEventsAcrossChunks() {
        val p = SseParser()
        assertEquals(emptyList<String>(), p.push("data: {\"a\""))
        assertEquals(listOf("{\"a\":1}"), p.push(":1}\n\n: keep-alive\n\ndata: x"))
        assertEquals(listOf("x"), p.push("\n\n"))
    }

    @Test fun joinsMultiLineDataAndHandlesCrlf() {
        assertEquals(listOf("a\nb"), SseParser().push("event: e\r\ndata: a\r\ndata: b\r\n\r\n"))
    }
}
