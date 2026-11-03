package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Test

class ProcessingTest {
    private val now = 10_000_000L
    private fun m(id: String, status: String, endedAt: Long?, title: String = "M $id") =
        MeetingSummary(id, title, "", false, (endedAt ?: now) - 60_000, endedAt, status, 3, null, 0, 0)

    @Test fun beingWrittenFirstThenRecentNewestFirst() {
        val cards = Processing.cards(
            listOf(
                m("old", "done", now - Processing.RECENT_MS - 1),
                m("ready", "done", now - 60_000),
                m("live", "running", null),
                m("writing", "extracting", now - 5_000),
                m("short", "too-short", now - 1_000),
            ),
            now, emptySet(),
        )
        assertEquals(listOf("writing" to ProcessingStage.Processing, "short" to ProcessingStage.TooShort, "ready" to ProcessingStage.Ready), cards.map { it.meetingId to it.stage })
    }

    @Test fun dismissedCardsAndOldOnesGoAwayButWritingNeverExpires() {
        val list = listOf(m("a", "failed", now - 1_000), m("b", "extracting", now - 10 * Processing.RECENT_MS))
        assertEquals(listOf("b"), Processing.cards(list, now, setOf("a")).map { it.meetingId })
        assertEquals(Processing.MAX_CARDS, Processing.cards((1..5).map { m("x$it", "done", now - it) }, now, emptySet()).size)
    }
}
