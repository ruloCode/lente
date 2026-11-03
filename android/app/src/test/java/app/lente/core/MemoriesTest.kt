package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoriesTest {
    private val beta = Memories.MOCK.first { it.title == "Planeación de la beta" }

    @Test fun theLineOnScreenIsTheLastOneAlreadySaid() {
        assertNull(Memories.lineAt(beta, 0.5f))
        assertEquals("Ana", Memories.lineAt(beta, 0.8f)?.who)
        assertEquals("Unos cuarenta mil; te mando la cotización el viernes.", Memories.lineAt(beta, 7.7f)?.text)
        assertEquals("Listo, lo anoto.", Memories.lineAt(beta, Memories.DURATION_S)?.text)
    }

    @Test fun theClockRunsFromTheMomentAndPastMidnight() {
        assertEquals("10:41:26", Memories.clockAt("10:41:12", 14f))
        assertEquals("00:00:03", Memories.clockAt("23:59:58", 5.9f))
    }

    @Test fun metaCountsOnlyWhatWasSaid() {
        val sprint = Memories.MOCK.first { it.title == "Pizarra del sprint" }
        assertEquals(3, Memories.spoken(sprint))
        assertEquals("11:30 · Pasillo · 9 min · 3 frases", Memories.meta(sprint))
        assertTrue(sprint.lines.last().camera)
    }

    @Test fun theNudgeComesOnTheThirdRelive() {
        assertFalse(Memories.nudge(2))
        assertTrue(Memories.nudge(3))
    }

    @Test fun momentsGroupByDayInOrderWithTheirIndex() {
        val days = Memories.byDay(Memories.MOCK)
        assertEquals(listOf("Viernes 31 oct", "Ayer · sábado 1 nov", "Hoy · domingo 2 nov"), days.map { it.first })
        assertEquals(listOf(2, 3, 4, 5), days.last().second.map { it.index })
    }
}
