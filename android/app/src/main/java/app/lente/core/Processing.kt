package app.lente.core

/** Where a just-ended recording is on its way to notes: being written, ready, failed, or too short for notes. */
enum class ProcessingStage { Processing, Ready, Failed, TooShort }

/** One card on Inicio about a recording that just ended. */
data class ProcessingCard(val meetingId: String, val title: String, val stage: ProcessingStage)

/**
 * The cards Inicio shows above the projects (add-home-dock), from the meetings the hub sends: every meeting
 * whose notes are being written, and those that finished in the last RECENT_MS until the wearer dismisses
 * them. Being written first, then newest first. Pure.
 */
object Processing {
    /** How long a finished recording keeps its card. */
    const val RECENT_MS = 15 * 60_000L
    /** Cards Inicio shows at most. */
    const val MAX_CARDS = 3

    fun cards(meetings: List<MeetingSummary>, now: Long, dismissed: Set<String>): List<ProcessingCard> =
        meetings.asSequence()
            .filter { it.id !in dismissed }
            .mapNotNull { m ->
                val stage = when (m.status) {
                    "extracting" -> ProcessingStage.Processing
                    "done" -> ProcessingStage.Ready
                    "failed" -> ProcessingStage.Failed
                    "too-short" -> ProcessingStage.TooShort
                    else -> return@mapNotNull null
                }
                val ended = m.endedAt ?: m.startedAt
                if (stage != ProcessingStage.Processing && now - ended > RECENT_MS) return@mapNotNull null
                Triple(m, stage, ended)
            }
            .sortedWith(compareBy<Triple<MeetingSummary, ProcessingStage, Long>> { if (it.second == ProcessingStage.Processing) 0 else 1 }.thenByDescending { it.third })
            .take(MAX_CARDS)
            .map { (m, stage, _) -> ProcessingCard(m.id, m.displayTitle, stage) }
            .toList()
}
