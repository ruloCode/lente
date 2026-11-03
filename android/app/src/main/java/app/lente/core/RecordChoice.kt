package app.lente.core

/**
 * The record sheet's words and defaults (add-record-sheet): which device will record, what it
 * captures, and the chat's scope. Pure.
 */
object RecordChoice {
    const val AUTO_PROJECT = "Que Lente decida"
    const val WHOLE_MEMORY = "Toda mi memoria"

    /** The phone records whenever the clip is not connected. */
    fun usePhone(clip: Boolean, clipIsPhone: Boolean): Boolean = !clip || clipIsPhone

    fun deviceLine(clip: Boolean, clipIsPhone: Boolean): String = when {
        clip && !clipIsPhone -> "Grabará el clip."
        clip -> "Grabará el teléfono."
        else -> "El clip no está conectado: grabará el teléfono."
    }

    fun captureLabel(camera: Boolean): String = if (camera) "Micrófono y cámara en vivo" else "Solo micrófono"

    fun captureHint(camera: Boolean): String = if (camera) "Lente también describe lo que ve mientras graba" else "Solo el audio, guardado como texto"

    /**
     * What Lente does while it records (add-home-dock): assist with the line to say; keep a memory with the
     * camera and the microphone to relive it later; only keep the day as text; or the teleprompter, planned
     * and shown as Pronto until it is built. `cues` is whether Lente suggests lines; `camera` whether the
     * mode always records with the camera.
     */
    enum class Mode(val key: String, val label: String, val hint: String, val ready: Boolean, val cues: Boolean, val camera: Boolean) {
        Assist("assist", "Asistir", "Te dice qué decir cuando te preguntan", true, cues = true, camera = false),
        Memory("memory", "Recuerdo", "Cámara y micrófono, para revivirlo después", true, cues = false, camera = true),
        Record("record", "Solo grabar", "Solo lo que se dice, como texto", true, cues = false, camera = false),
        Teleprompter("teleprompter", "Teleprompter", "Tu guion en el teléfono", false, cues = false, camera = false),
    }

    /** What records: the clip on the glasses, or the phone itself. */
    enum class Device(val key: String, val label: String) { Clip("clip", "Clip"), Phone("phone", "Celular") }

    /** The device the sheet opens on: the clip when it is connected, the phone otherwise. */
    fun deviceNow(clipConnected: Boolean): Device = if (clipConnected) Device.Clip else Device.Phone

    /** The line under a device's name. */
    fun deviceHint(d: Device, clipConnected: Boolean): String = when (d) {
        Device.Clip -> if (clipConnected) "Conectado, en tus lentes" else "Sin conectar"
        Device.Phone -> "Su micrófono y su cámara"
    }

    /** Whether the recording uses the camera: always for a memory, otherwise as chosen. */
    fun usesCamera(mode: Mode, chosen: Boolean): Boolean = mode.camera || chosen

    /** The line above the start button: «Recuerdo · Celular · micrófono y cámara». */
    fun summary(mode: Mode, device: Device, camera: Boolean): String =
        "${mode.label} · ${device.label} · " + if (usesCamera(mode, camera)) "micrófono y cámara" else "solo micrófono"

    /** The mode the sheet opens on: the hub's current one. */
    fun modeNow(recordOnly: Boolean): Mode = if (recordOnly) Mode.Record else Mode.Assist

    /** The hub's assist mode to set before recording, or null when it already matches (or the mode is not built). */
    fun assistToSet(chosen: Mode, recordOnly: Boolean): String? = when {
        !chosen.ready -> null
        chosen.cues == !recordOnly -> null
        chosen.cues -> "assist"
        else -> "record"
    }

    /** The chat chip: the whole memory, or the chosen project's name. */
    fun scopeLabel(projectId: String?, projects: List<Projects.Summary>): String =
        projectId?.let { id -> projects.firstOrNull { it.id == id }?.name } ?: WHOLE_MEMORY
}
