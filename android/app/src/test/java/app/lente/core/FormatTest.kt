package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneOffset

class FormatTest {
    @Test fun clock() {
        assertEquals("0:00", Format.clock(0))
        assertEquals("1:05", Format.clock(65_400))
        assertEquals("1:02:03", Format.clock(3_723_000))
    }

    @Test fun recordedAsThePageShowsIt() {
        assertEquals("12 s", Format.recorded(12_000))
        assertEquals("3 min 05 s", Format.recorded(185_000))
        assertEquals("1 h 02 min", Format.recorded(3_720_000))
    }

    @Test fun spend() {
        assertEquals("1.5 min", Format.minutes(90.0))
        assertEquals("12 min", Format.minutes(720.0))
        assertEquals("US$ 0.04", Format.usd(0.041, false))
        assertEquals("≈ US$ 1.20 + sin precio", Format.usd(1.2, true))
        assertEquals("12.345", Format.tokens(12345))
    }

    @Test fun stagesLineMatchesThePage() {
        val st = mapOf("heard" to 1000L, "turn" to 1172L, "asked" to 1177L, "firstToken" to 1189L, "done" to 1191L, "sent" to 1191L, "phone" to 1230L)
        assertEquals("total 230 ms · transcribir 172 · decidir 5 · primer token 12 · respuesta 2 · hub 0 · wifi 39", Format.stages(st))
        assertEquals("", Format.stages(mapOf("sent" to 1L)))
    }

    @Test fun hhmm() = assertEquals("09:05", Format.hhmm(9 * 3_600_000L + 5 * 60_000L, ZoneOffset.UTC))
}
