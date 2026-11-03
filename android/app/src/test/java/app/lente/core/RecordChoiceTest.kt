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
        assertEquals("Micrófono y cámara en vivo", RecordChoice.captureLabel(true))
        val p = listOf(Projects.Summary("a", "Ternium", true, null, 0, 0, 0, null))
        assertEquals("Ternium", RecordChoice.scopeLabel("a", p))
        assertEquals("Toda mi memoria", RecordChoice.scopeLabel(null, p))
        assertEquals("Toda mi memoria", RecordChoice.scopeLabel("gone", p))
    }

    @Test fun modesOpenOnTheHubsAndOnlyChangeItWhenNeeded() {
        assertEquals(listOf("Asistir", "Solo grabar", "Teleprompter"), RecordChoice.Mode.entries.map { it.label })
        assertEquals(false, RecordChoice.Mode.Teleprompter.ready)
        assertEquals(RecordChoice.Mode.Record, RecordChoice.modeNow(recordOnly = true))
        assertEquals(RecordChoice.Mode.Assist, RecordChoice.modeNow(recordOnly = false))
        assertEquals("record", RecordChoice.assistToSet(RecordChoice.Mode.Record, recordOnly = false))
        assertEquals("assist", RecordChoice.assistToSet(RecordChoice.Mode.Assist, recordOnly = true))
        assertEquals(null, RecordChoice.assistToSet(RecordChoice.Mode.Assist, recordOnly = false))
        assertEquals(null, RecordChoice.assistToSet(RecordChoice.Mode.Teleprompter, recordOnly = true))
    }
}
