package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Replays an event stream recorded from the hub with the stubbed Meta API (android/app/src/test/resources). */
class HubStateTest {
    private val events = Repo.resource("hub-events.jsonl").lines().filter { it.isNotBlank() }.map(HubJson::event)
    private fun replay(list: List<HubEvent>, from: HubState = HubState()) = list.fold(from) { s, e -> s.reduce(e, 1_000) }

    @Test fun everyRecordedEventDecodes() {
        assertTrue(events.none { it is HubEvent.Other && it.kind !in setOf("address", "usage") })
        assertTrue(events.first() is HubEvent.StatusEvent)
        assertTrue(events[1] is HubEvent.History)
    }

    @Test fun theStreamBuildsTheDay() {
        val s = replay(events)
        val turns = s.entries.filter { it.kind == "turn" }
        assertEquals(1, turns.size)
        assertEquals("Rulo, can we ship the beta on Friday?", turns[0].text)
        assertEquals("B", turns[0].speaker)
        assertEquals("Pregunta", s.card?.label)
        assertTrue(s.entries.any { it.isDilo && it.text == "Yes, Friday works if QA signs off Thursday." })
        assertNotNull(s.summary)
        assertEquals(1, s.meetings.size)
        assertEquals("Sprint review", s.meetings[0].title)
        assertFalse(s.status.listening)
        assertEquals(listOf("Rulo"), s.status.names)
        assertTrue(s.recordedMs > 0)
        assertTrue(s.spend.tokens > 0)
        assertEquals("", s.partial)
        assertEquals(0, s.level)
    }

    @Test fun aReconnectChangesNothing() {
        val once = replay(events)
        val snapshot = listOf(HubEvent.StatusEvent(once.status), HubEvent.History(once.entries))
        val twice = replay(snapshot, once)
        assertEquals(once.entries, twice.entries)
    }

    @Test fun aLateSpeakerFindsItsTurn() {
        val s = HubState()
            .reduce(HubEvent.Speaker("4", "C"), 0)
            .reduce(HubEvent.Day(Entry("turn", 10, "hola", turnId = "4")), 0)
        assertEquals("C", s.entries.single().speaker)
        assertTrue(s.pendingSpeakers.isEmpty())
    }

    @Test fun aSpeakerNeverRelabelsACue() {
        val s = HubState()
            .reduce(HubEvent.Day(Entry("turn", 10, "q?", turnId = "0")), 0)
            .reduce(HubEvent.Day(Entry("cue", 20, "a", turnId = "0", label = "DILO")), 0)
            .reduce(HubEvent.Speaker("0", "B"), 0)
        assertEquals("B", s.entries.first { it.kind == "turn" }.speaker)
        assertNull(s.entries.first { it.kind == "cue" }.speaker)
    }

    @Test fun partialOnlyWhileListening() {
        val paused = HubState().reduce(HubEvent.Partial("hola"), 0)
        assertEquals("", paused.partial)
        val listening = HubState(status = Status(listening = true)).reduce(HubEvent.Partial("hola"), 0)
        assertEquals("hola", listening.partial)
        assertEquals("", listening.reduce(HubEvent.StatusEvent(Status(listening = false)), 0).partial)
    }

    @Test fun elapsedRunsOnThePhoneClock() {
        val s = HubState().reduce(HubEvent.StatusEvent(Status(listening = true, session = Session(0, 5_000, true))), 10_000)
        assertEquals(7_000, s.elapsedMs(12_000))
        val held = s.reduce(HubEvent.StatusEvent(Status(session = Session(0, 5_000, false))), 10_000)
        assertEquals(5_000, held.elapsedMs(99_000))
    }

    @Test fun stagesUpdateTheCard() {
        val s = HubState().reduce(HubEvent.Day(Entry("cue", 5, "x", label = "DILO", id = "s1")), 0).reduce(HubEvent.Stages("s1", mapOf("sent" to 1, "phone" to 9)), 0)
        assertEquals(9L, s.card?.stages?.get("phone"))
    }

    @Test fun effectsOfADilo() {
        val dilo = events.filterIsInstance<HubEvent.Day>().first { it.entry.isDilo }
        assertEquals(listOf(Effect.Ack("s1"), Effect.Vibrate, Effect.Speak("Yes, Friday works if QA signs off Thursday.", Voice.Priority.High)), effectsOf(dilo))
        assertEquals(emptyList<Effect>(), effectsOf(HubEvent.Level(3)))
        assertEquals(emptyList<Effect>(), effectsOf(HubEvent.Day(Entry("cue", 1, "3 KB from the clip", label = "PHOTO", photo = "data:"))))
    }

    @Test fun photoGoesToTheViewNotTheCard() {
        val s = HubState().reduce(HubEvent.Day(Entry("cue", 1, "Una pizarra", label = "ON SCREEN", photo = "data:x", id = "s3")), 0)
        assertNull(s.card)
        assertEquals("EN PANTALLA", s.view?.badge)
    }
}

class SpeakerAfterResumeTest {
    /** Turn ids restart when listening resumes; a label must not land on an older turn with the same id. */
    @Test fun aLabelAfterResumeWaitsForItsOwnTurn() {
        val s = HubState()
            .reduce(HubEvent.StatusEvent(Status(listening = true)), 0)
            .reduce(HubEvent.Day(Entry("turn", 10, "old", turnId = "0", speaker = "A")), 0)
            .reduce(HubEvent.StatusEvent(Status(listening = false)), 0)
            .reduce(HubEvent.StatusEvent(Status(listening = true)), 0)
            .reduce(HubEvent.Speaker("0", "B"), 0)
            .reduce(HubEvent.Day(Entry("turn", 20, "new", turnId = "0")), 0)
        org.junit.Assert.assertEquals("A", s.entries.first { it.text == "old" }.speaker)
        org.junit.Assert.assertEquals("B", s.entries.first { it.text == "new" }.speaker)
    }

    @Test fun liveViewKeepsTheSessionsReadsNewestFirst() {
        fun read(at: Long, text: String) = HubEvent.Day(Entry("live", at, text, photo = "data:image/jpeg;base64,AAAA"))
        val on = HubState().reduce(HubEvent.StatusEvent(Status(live = true, mode = "camera")), 5_000)
        assertEquals(5_000, on.liveSince)
        val s = listOf(read(6_000, "Una pizarra."), read(7_000, ""), read(8_000, "Una sala."))
            .fold(on) { st, e -> st.reduce(e, 0) }
        assertEquals(listOf("Una sala.", "Una pizarra."), s.liveReads.map { it.text })
        assertEquals(8_000, s.liveReads.first().at)
        // An unchanged scene (blank text) only refreshes the photo.
        assertEquals("", s.reduce(read(9_000, ""), 0).view?.text)
        assertEquals(2, s.reduce(read(9_000, ""), 0).liveReads.size)
        // A Mirar while live joins the reads; turning live off and on again starts a new list.
        val looked = s.reduce(HubEvent.Day(Entry("cue", 9_500, "Dice 14 de noviembre.", label = "ON SCREEN", photo = "data:image/jpeg;base64,AAAA")), 0)
        assertEquals("EN PANTALLA", looked.liveReads.first().badge)
        val again = looked.reduce(HubEvent.StatusEvent(Status(live = false)), 0).reduce(HubEvent.StatusEvent(Status(live = true)), 20_000)
        assertTrue(again.liveReads.isEmpty())
        assertEquals(20_000, again.liveSince)
        val many = (1..30).fold(on) { st, n -> st.reduce(read(6_000L + n, "lectura $n"), 0) }
        assertEquals(HubState.MAX_LIVE_READS, many.liveReads.size)
        assertEquals("lectura 30", many.liveReads.first().text)
    }
}
