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
        assertEquals(listOf("Asistir", "Recuerdo", "Solo grabar", "Ver", "Teleprompter"), RecordChoice.Mode.entries.map { it.label })
        assertEquals("record", RecordChoice.assistToSet(RecordChoice.Mode.Memory, assistMode = "assist"))
        assertEquals(null, RecordChoice.assistToSet(RecordChoice.Mode.Memory, assistMode = "record"))
        assertEquals(false, RecordChoice.Mode.Teleprompter.ready)
        assertEquals(RecordChoice.Mode.Record, RecordChoice.modeNow(assistMode = "record"))
        assertEquals(RecordChoice.Mode.Assist, RecordChoice.modeNow(assistMode = "assist"))
        assertEquals("record", RecordChoice.assistToSet(RecordChoice.Mode.Record, assistMode = "assist"))
        assertEquals("assist", RecordChoice.assistToSet(RecordChoice.Mode.Assist, assistMode = "record"))
        assertEquals(null, RecordChoice.assistToSet(RecordChoice.Mode.Assist, assistMode = "assist"))
        assertEquals(null, RecordChoice.assistToSet(RecordChoice.Mode.Teleprompter, assistMode = "record"))
        // Ver (add-sight-mode): its own mode, and leaving it for Asistir sets assist again.
        assertEquals("sight", RecordChoice.assistToSet(RecordChoice.Mode.Sight, assistMode = "assist"))
        assertEquals("assist", RecordChoice.assistToSet(RecordChoice.Mode.Assist, assistMode = "sight"))
        assertEquals("record", RecordChoice.assistToSet(RecordChoice.Mode.Record, assistMode = "sight"))
        assertEquals(RecordChoice.Mode.Sight, RecordChoice.modeNow("sight"))
        assertEquals("Empezar a ver", RecordChoice.startLabel(RecordChoice.Mode.Sight))
        assertEquals(true, RecordChoice.usesCamera(RecordChoice.Mode.Sight, chosen = false))
    }

    @Test fun aMemoryAlwaysRecordsTheCameraAndTheSheetSaysWhatItWillDo() {
        assertEquals(true, RecordChoice.usesCamera(RecordChoice.Mode.Memory, chosen = false))
        assertEquals(false, RecordChoice.usesCamera(RecordChoice.Mode.Assist, chosen = false))
        assertEquals("Recuerdo · Celular · micrófono y cámara", RecordChoice.summary(RecordChoice.Mode.Memory, RecordChoice.Device.Phone, camera = false))
        assertEquals("Asistir · Clip · solo micrófono", RecordChoice.summary(RecordChoice.Mode.Assist, RecordChoice.Device.Clip, camera = false))
        assertEquals(RecordChoice.Device.Clip, RecordChoice.deviceNow(clipConnected = true))
        assertEquals(RecordChoice.Device.Phone, RecordChoice.deviceNow(clipConnected = false))
        assertEquals("Sin conectar", RecordChoice.deviceHint(RecordChoice.Device.Clip, clipConnected = false))
    }
}
