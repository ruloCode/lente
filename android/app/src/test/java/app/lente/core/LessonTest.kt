package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LessonTest {
    private val scale = Lessons.BUILT_IN.first { it.id == "escala-do" }

    @Test fun theThreeBuiltInLessons() {
        assertEquals(listOf("escala-do", "estrellita", "himno-alegria"), Lessons.BUILT_IN.map { it.id })
        assertEquals(listOf(60, 62, 64, 65, 67, 69, 71, 72), scale.notes)
        assertEquals(listOf(60, 60, 67, 67, 69, 69, 67), Lessons.BUILT_IN[1].notes)
        assertEquals(15, Lessons.BUILT_IN[2].notes.size)
    }

    @Test fun aPerfectScale() {
        val a = Lessons.align(scale.notes, scale.notes)
        assertEquals(List(8) { Mark.Right }, a.marks)
        assertEquals(0, a.extra)
        assertNull(a.firstWrong)
    }

    @Test fun faPlayedAsSolIsTheFourthWrong() {
        val a = Lessons.align(scale.notes, listOf(60, 62, 64, 67, 67, 69, 71, 72))
        assertEquals(7, a.right)
        assertEquals(Mark.Wrong(67), a.marks[3])
        assertEquals(3, a.firstWrong)
        assertEquals("Sol", Solfege.name((a.marks[3] as Mark.Wrong).played))
        assertEquals(0, a.extra)
    }

    @Test fun aMissedNote() {
        val a = Lessons.align(scale.notes, listOf(60, 62, 64, 67, 69, 71, 72))
        assertEquals(7, a.right)
        assertEquals(Mark.Missed, a.marks[3])
        assertEquals(0, a.extra)
    }

    @Test fun anExtraNote() {
        val a = Lessons.align(scale.notes, listOf(60, 62, 62, 64, 65, 67, 69, 71, 72))
        assertEquals(List(8) { Mark.Right }, a.marks)
        assertEquals(1, a.extra)
    }

    @Test fun anOctaveUpCountsRight() {
        val a = Lessons.align(scale.notes, scale.notes.map { it + 12 })
        assertEquals(8, a.right)
        assertEquals(8, Lessons.align(scale.notes, listOf(72, 74, 76, 77, 79, 81, 83, 72)).right)
    }

    @Test fun repeatedNotesInEstrellita() {
        val star = Lessons.BUILT_IN[1]
        val a = Lessons.align(star.notes, listOf(60, 67, 67, 69, 69, 67))
        assertEquals(6, a.right)
        assertEquals(1, a.marks.count { it == Mark.Missed })
    }

    @Test fun whileOpenTheNotesNotReachedAreNotMissed() {
        assertEquals(0, Lessons.align(scale.notes, emptyList(), open = true).marks.size)
        val a = Lessons.align(scale.notes, listOf(60, 62, 64), open = true)
        assertEquals(List(3) { Mark.Right }, a.marks)
        val wrong = Lessons.align(scale.notes, listOf(60, 62, 66), open = true)
        assertEquals(listOf(Mark.Right, Mark.Right, Mark.Wrong(66)), wrong.marks)
    }

    @Test fun anAttemptEndsOnTheLastNote() {
        val at = Attempt(scale, startedMs = 1_000)
        var now = 1_000L
        for (m in scale.notes.dropLast(1)) { now += 400; at.add(m, now) }
        assertEquals(7, at.next())
        assertFalse(at.done(now + 100))
        now += 400
        at.add(72, now)
        assertTrue(at.done(now))
        assertEquals(8, at.result().right)
        assertEquals(2_800L, at.durationMs())
    }

    @Test fun anAttemptEndsAfterFourQuietSeconds() {
        val at = Attempt(scale, startedMs = 0)
        assertFalse("nothing played yet: it waits", at.done(10_000))
        at.add(60, 500)
        at.add(62, 900)
        assertFalse(at.done(900 + Lessons.IDLE_END_MS - 1))
        assertTrue(at.done(900 + Lessons.IDLE_END_MS))
        val r = at.result()
        assertEquals(2, r.right)
        assertEquals(6, r.marks.count { it == Mark.Missed })
    }

    @Test fun theAttemptBody() {
        val at = Attempt(scale, startedMs = 100)
        listOf(60, 62, 64, 67, 67, 69, 71, 72).forEachIndexed { i, m -> at.add(m, 100L + 500 + i * 300) }
        val b = JSONObject(at.body().toString())
        assertEquals("escala-do", b.getString("lessonId"))
        assertEquals(8, b.getJSONArray("expected").length())
        assertEquals(500L, b.getJSONArray("played").getJSONObject(0).getLong("atMs"))
        assertEquals(67, b.getJSONArray("played").getJSONObject(3).getInt("midi"))
        assertEquals("wrong", b.getJSONArray("marks").getString(3))
        assertEquals("right", b.getJSONArray("marks").getString(0))
        assertEquals(0, b.getInt("extra"))
        assertEquals(2_100L, b.getLong("durationMs"))
    }

    @Test fun lessonsFromTheHub() {
        val l = Lessons.parse("""{"lessons":[{"id":"escala-do","title":"Escala de Do","notes":[60,62]},{"id":"x","title":"Vacía","notes":[]}]}""")
        assertEquals(listOf(Lesson("escala-do", "Escala de Do", listOf(60, 62))), l)
        assertEquals(1, Lessons.parse("""[{"id":"a","title":"A","notes":[60]}]""").size)
    }
}
