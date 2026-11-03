package app.lente.core

import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MemoriesJsonTest {
    private val zone = ZoneId.of("America/Bogota")
    // 2026-11-03 10:00:05 in Bogotá, and the day before.
    private val today = 1793718005000L
    private val yesterday = today - 86_400_000L
    private val json = """
        {"moments":[
          {"id":"m2","title":"PROBE-Revisión del tablero","startedAt":$today,"endedAt":${today + 600_000},"summary":"Se revisó PROBE-K7.","durationS":9.5,"turns":3,
           "lines":[{"atS":0,"who":"Tú","text":"Abramos PROBE-K7."},{"atS":7,"who":"Persona B","text":"¿Mañana?"}],
           "scenes":[{"startS":0,"lengthS":7,"audio":"/media/audio/sm2%3A1"},{"startS":7,"lengthS":2.5}],
           "frames":[{"atS":0,"path":"/media/frame/v1"},{"atS":6.5,"path":"/media/frame/v2"}]},
          {"id":"m1","title":"","startedAt":$yesterday,"endedAt":$yesterday,"summary":"","durationS":2,"turns":1,"lines":[],"scenes":[],"frames":[]}
        ]}
    """.trimIndent()

    @Test fun theHubsMomentsComeOldestFirstWithTheirDaysAndMedia() {
        val list = Memories.fromJson(json, today + 3_600_000, zone)
        assertEquals(listOf("m1", "m2"), list.map { it.id })
        val m = list.last()
        assertEquals("HOY", m.rel)
        assertEquals("Hoy · martes 3 nov", m.day)
        assertEquals("10:00:05", m.time)
        assertEquals("10 min", m.place)
        assertEquals(9.5f, m.durationS)
        assertEquals("/media/audio/sm2%3A1", m.scenes[0].audio)
        assertNull(m.scenes[1].audio)
        assertEquals("AYER", list.first().rel)
        assertEquals("Momento", list.first().title)
        assertEquals("1 min", list.first().place)
    }

    @Test fun thePhotoAndTheSceneFollowTheClock() {
        val m = Memories.fromJson(json, today, zone).last()
        assertEquals("/media/frame/v1", Memories.frameAt(m, 3f)?.path)
        assertEquals("/media/frame/v2", Memories.frameAt(m, 8f)?.path)
        val (scene, into) = Memories.sceneAt(m, 8f)!!
        assertEquals(7f, scene.startS)
        assertEquals(1f, into)
        assertEquals("Persona B", Memories.lineAt(m, 8f)?.who)
    }
}
