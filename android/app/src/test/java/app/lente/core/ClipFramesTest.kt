package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Base64

class ClipFramesTest {
    private val frames = JSONObject(Repo.text("test/fixtures/frames.json")).getJSONArray("frames")
    private fun golden(name: String) = (0 until frames.length()).map { frames.getJSONObject(it) }.first { it.getString("name") == name }

    @Test fun helloMatchesTheGoldenFrame() {
        val g = golden("hello-v2")
        val h = g.getJSONObject("hello")
        val bytes = ClipFrames.hello(fw = h.getString("fw"), device = h.getString("device"), rssi = h.getInt("rssi"), camera = h.getBoolean("camera"))
        assertArrayEquals(Base64.getDecoder().decode(g.getString("base64")), bytes)
    }

    @Test fun audioFramesMatchTheGoldenFrames() {
        for (name in listOf("audio-seq7", "audio-seq8")) {
            val g = golden(name)
            val s = g.getJSONArray("samples")
            val samples = ShortArray(s.length()) { s.getInt(it).toShort() }
            assertArrayEquals(name, Base64.getDecoder().decode(g.getString("base64")), ClipFrames.audio(g.getLong("seq"), g.getLong("timeMs"), samples))
        }
    }

    @Test fun phoneHelloDeclaresThePhone() {
        val bytes = ClipFrames.hello(fw = "android-1")
        assertEquals('H'.code.toByte(), bytes[0])
        val json = JSONObject(String(bytes, 5, bytes.size - 5))
        assertEquals("lente-phone", json.getString("device"))
        assertEquals("pcm16", json.getString("codec"))
        assertEquals(16000, json.getInt("rate"))
        assertEquals("2.0", json.getString("proto"))
    }

    @Test fun anAudioFrameIs80ms() {
        val f = ClipFrames.audio(1, 80, ShortArray(ClipFrames.FRAME_SAMPLES))
        assertEquals(5 + 8 + 1280 * 2, f.size)
        assertEquals(ClipFrames.FRAME_MS, ClipFrames.FRAME_SAMPLES * 1000 / ClipFrames.SAMPLE_RATE)
    }

    @Test fun sequenceWrapsAtU32() {
        val f = ClipFrames.audio(0x1_0000_0002L, 0, ShortArray(0))
        assertEquals(2, f[5].toInt())
    }

    @Test fun commandsDecode() {
        assertEquals(HubCommand.Takeover, HubCommand.of('T'.code.toByte()))
        assertEquals(HubCommand.Pause, HubCommand.of('m'.code.toByte()))
        assertEquals(null, HubCommand.of('x'.code.toByte()))
    }
}
