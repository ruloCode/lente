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
     * What Lente does while it records (add-home-dock): assist with the line to say, only keep the day as
     * text, or the teleprompter, planned and shown as Pronto until it is built.
     */
    enum class Mode(val key: String, val label: String, val hint: String, val ready: Boolean) {
        Assist("assist", "Asistir", "Te dice qué decir cuando te preguntan algo", true),
        Record("record", "Solo grabar", "Guarda la reunión como texto, sin sugerencias", true),
        Teleprompter("teleprompter", "Teleprompter", "Tu guion en el teléfono mientras hablas", false),
    }

    /** The mode the sheet opens on: the hub's current one. */
    fun modeNow(recordOnly: Boolean): Mode = if (recordOnly) Mode.Record else Mode.Assist

    /** The hub's assist mode to set before recording, or null when it already matches (or the mode is not built). */
    fun assistToSet(chosen: Mode, recordOnly: Boolean): String? = when {
        !chosen.ready -> null
        (chosen == Mode.Record) == recordOnly -> null
        else -> chosen.key
    }

    /** The chat chip: the whole memory, or the chosen project's name. */
    fun scopeLabel(projectId: String?, projects: List<Projects.Summary>): String =
        projectId?.let { id -> projects.firstOrNull { it.id == id }?.name } ?: WHOLE_MEMORY
}
