package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** add-media-archive 4.1: the media switches and state in the hub's status, and chips that can be heard. */
class MediaStateTest {
    @Test fun statusCarriesTheSwitchesTheRetentionAndWhatIsKeptNow() {
        val s = HubJson.status(JSONObject("""{"listening":true,"media":{"switches":{"audio":true,"photos":false},"retentionDays":7,"keepingAudio":true,"keepingPhotos":false,"offered":true}}"""))
        assertTrue(s.media.offered)
        assertFalse(s.media.photos)
        assertEquals(7, s.media.retentionDays)
        assertEquals("Guardando audio", s.media.keepingLabel)
        assertEquals(30, s.media.nextRetention)
    }

    @Test fun anOlderHubOffersNothingAndSaysNothing() {
        val s = HubJson.status(JSONObject("""{"listening":true}"""))
        assertFalse(s.media.offered)
        assertNull(s.media.keepingLabel)
        assertEquals("Guardando audio · fotos", MediaState(keepingAudio = true, keepingPhotos = true).keepingLabel)
        assertEquals(7, MediaState(retentionDays = 90).nextRetention)
    }

    @Test fun chipsCarryTheirMediaFromTheAnswerAndTheStream() {
        val line = ChatJson.answer(3, """{"ok":true,"answer":"PROBE","found":true,"sources":[{"kind":"meeting","label":"Beta · 10:26","meetingId":"m1","turnId":"t2","media":{"audio":"/media/audio/sm1%3A2"}},{"kind":"seen","label":"Lo viste · 09:00"}]}""")
        assertEquals("/media/audio/sm1%3A2", line.sources[0].audio)
        assertNull(line.sources[1].audio)
        val streamed = AskStream.apply(ChatLine(4, false, "", pending = true), "source", """{"kind":"seen","label":"Lo viste · 09:00","media":{"frame":"/media/frame/d2026-11-03%3A1"}}""")
        assertEquals("/media/frame/d2026-11-03%3A1", streamed.sources[0].frame)
    }
}
