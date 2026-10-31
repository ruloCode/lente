package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CopyAndVoiceTest {
    @Test fun pillAndPause() {
        assertEquals("En pausa", Copy.pill(Status()))
        assertEquals("Esperando", Copy.pill(Status(listening = true)))
        assertEquals("Grabando", Copy.pill(Status(listening = true, clip = true, assistMode = "record")))
        assertEquals("Lente está en pausa: no envía nada hasta que empieces." to "Empezar a escuchar", Copy.pause(Status()))
        assertEquals("En pausa: 10 min sin que hablaras" to "Seguir escuchando", Copy.pause(Status(pause = Pause("idle", 10, "wearer"))))
        assertNull(Copy.pause(Status(listening = true, pause = null)))
    }

    @Test fun noteFirstMatchWins() {
        assertEquals("Esperando el clip. Revisa que tenga batería y esté en la misma red Wi-Fi.", Copy.note(Status()))
        assertEquals("Se cortó la transcripción. Reconectando…", Copy.note(Status(clip = true, listening = true, asr = "transcription closed (1006 )")))
        assertNull(Copy.note(Status(clip = true, listening = true, asr = "listening · nothing sent in silence")))
    }

    @Test fun speakerChips() {
        assertEquals("Tú", Copy.speaker(Entry("turn", 1, "x", speaker = "A"), "A"))
        assertEquals("B", Copy.speaker(Entry("turn", 1, "x", speaker = "B"), "A"))
        assertEquals("·", Copy.speaker(Entry("turn", 1, "x"), ""))
        assertEquals("→", Copy.speaker(Entry("cue", 1, "x"), ""))
    }

    @Test fun cardMeta() {
        assertEquals("dijeron tu nombre · en 14 ms · Meta · muse-spark-1.3", Copy.cardMeta(Entry("cue", 1, "x", ms = 14, why = "name", model = "muse-spark-1.3", provider = "Meta")))
    }

    @Test fun voicePriorities() {
        val v = Voice()
        assertEquals(Voice.Decision(true, true), v.decide(Voice.Priority.High, speaking = true, now = 0))
        assertFalse(v.decide(Voice.Priority.Normal, speaking = true, now = 0).speak)
        assertTrue(v.decide(Voice.Priority.Low, speaking = false, now = 0).speak)
        assertFalse(v.decide(Voice.Priority.Low, speaking = false, now = 6_000).speak)
        assertTrue(v.decide(Voice.Priority.Low, speaking = false, now = 7_000).speak)
    }

    @Test fun language() {
        assertTrue(Voice.looksSpanish("¿De qué hablan?"))
        assertTrue(Voice.looksSpanish("Creo que es para el viernes"))
        assertFalse(Voice.looksSpanish("Yes, Friday works if QA signs off Thursday."))
    }
}

class DeviceTest {
    /** Between the socket opening and the hello, the hub says `clip: true, device: ""`: that is not the clip taking over. */
    @Test fun aDeviceWithoutHelloIsNotTheClip() {
        org.junit.Assert.assertFalse(Status(clip = true, device = "").clipIsDevice)
        org.junit.Assert.assertTrue(Status(clip = true, device = "clip").clipIsDevice)
        org.junit.Assert.assertTrue(Status(clip = true, device = "phone").phoneIsDevice)
    }
}
