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

    fun captureLabel(camera: Boolean): String = if (camera) "Micrófono y cámara" else "Solo micrófono"

    /** The chat chip: the whole memory, or the chosen project's name. */
    fun scopeLabel(projectId: String?, projects: List<Projects.Summary>): String =
        projectId?.let { id -> projects.firstOrNull { it.id == id }?.name } ?: WHOLE_MEMORY
}
