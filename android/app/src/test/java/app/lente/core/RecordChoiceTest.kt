package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Test

class RecordChoiceTest {
    @Test fun thePhoneRecordsWhenTheClipIsAbsent() {
        assertEquals(true, RecordChoice.usePhone(clip = false, clipIsPhone = false))
        assertEquals(false, RecordChoice.usePhone(clip = true, clipIsPhone = false))
        assertEquals("El clip no está conectado: grabará el teléfono.", RecordChoice.deviceLine(clip = false, clipIsPhone = false))
        assertEquals("Grabará el clip.", RecordChoice.deviceLine(clip = true, clipIsPhone = false))
        assertEquals("Grabará el teléfono.", RecordChoice.deviceLine(clip = true, clipIsPhone = true))
    }

    @Test fun labels() {
        assertEquals("Solo micrófono", RecordChoice.captureLabel(false))
        assertEquals("Micrófono y cámara", RecordChoice.captureLabel(true))
        val p = listOf(Projects.Summary("a", "Ternium", true, null, 0, 0, 0, null))
        assertEquals("Ternium", RecordChoice.scopeLabel("a", p))
        assertEquals("Toda mi memoria", RecordChoice.scopeLabel(null, p))
        assertEquals("Toda mi memoria", RecordChoice.scopeLabel("gone", p))
    }
}
