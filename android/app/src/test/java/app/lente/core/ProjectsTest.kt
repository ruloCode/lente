package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId

class ProjectsTest {
    private val utc = ZoneId.of("UTC")
    private val day = 24 * 3600_000L
    private val now = 1_793_620_800_000L // 2026-11-02 12:00 UTC

    @Test fun listFromTheHub() {
        val list = Projects.list("""{"projects":[{"id":"a","name":"Lente","status":"active","lastActivityAt":5,"meetings":4,"meetingsThisWeek":2,"openTasks":3,"next":"Grabar el demo"},{"id":"b","name":"Viejo","status":"archived","lastActivityAt":null,"meetings":0,"meetingsThisWeek":0,"openTasks":0,"next":null}]}""")
        assertEquals(Projects.Summary("a", "Lente", true, 5, 4, 2, 3, "Grabar el demo"), list[0])
        assertEquals(false, list[1].active)
        assertNull(list[1].lastActivityAt)
        assertNull(list[1].next)
        assertEquals(emptyList<Projects.Summary>(), Projects.list("{}"))
    }

    @Test fun detailFromTheHub() {
        val d = Projects.detail("""{"project":{"id":"a","name":"Lente","status":"active","lastActivityAt":5,"meetings":1,"meetingsThisWeek":1,"openTasks":1,"next":"x"},"meetings":[{"id":"m1","title":"Demo","startedAt":5,"endedAt":null}],"tasks":[{"id":"t1","title":"x","due":null,"meetingId":"m1"}]}""")
        assertEquals("Lente", d.project.name)
        assertEquals(listOf(Projects.MeetingRef("m1", "Demo", 5)), d.meetings)
        assertEquals(listOf(Projects.TaskRef("t1", "x", null, "m1")), d.tasks)
    }

    @Test fun activityInWords() {
        assertEquals("Hoy", Projects.activity(now - 3600_000, now, utc))
        assertEquals("Ayer", Projects.activity(now - day, now, utc))
        assertEquals("Hace 3 días", Projects.activity(now - 3 * day, now, utc))
        assertEquals("Hace 1 semana", Projects.activity(now - 8 * day, now, utc))
        assertEquals("Hace 3 semanas", Projects.activity(now - 22 * day, now, utc))
        assertEquals("12 ago", Projects.activity(now - 82 * day, now, utc))
        assertEquals("Sin actividad", Projects.activity(null, now, utc))
    }

    @Test fun countsInWords() {
        val s = Projects.Summary("a", "Lente", true, 1, 4, 2, 3, null)
        assertEquals("3 pendientes · 2 reuniones esta semana", Projects.counts(s))
        assertEquals("1 pendiente", Projects.counts(s.copy(openTasks = 1, meetingsThisWeek = 0)))
        assertEquals("1 reunión esta semana", Projects.counts(s.copy(openTasks = 0, meetingsThisWeek = 1)))
        assertEquals("4 reuniones", Projects.counts(s.copy(openTasks = 0, meetingsThisWeek = 0)))
        assertEquals("Sin reuniones todavía", Projects.counts(s.copy(openTasks = 0, meetingsThisWeek = 0, meetings = 0)))
    }

    @Test fun seeAllLink() {
        assertEquals("Ver los 6 proyectos", Projects.seeAll(6))
        assertEquals("Ver proyectos", Projects.seeAll(2))
        assertNull(Projects.seeAll(0))
    }

    private fun meeting(id: String, at: Long, summary: String, decisions: List<String> = emptyList(), questions: List<String> = emptyList()) =
        MeetingSummary(id, "M $id", "", false, at, at + 1, "done", 3, Notes(summary, decisions.map { Evidence(it, emptyList()) }, emptyList(), questions.map { Evidence(it, emptyList()) }, emptyList()), 0, 0)

    @Test fun briefComesFromTheProjectsOwnMeetingsNewestFirst() {
        val p = Projects.Summary("p1", "Lanzamiento", true, now, 3, 1, 2, null)
        val detail = Projects.Detail(p, listOf(Projects.MeetingRef("a", "A", now - 2 * day), Projects.MeetingRef("b", "B", now - day)), emptyList())
        val meetings = listOf(
            meeting("a", now - 2 * day, "Antes:  se habló\n de precios.", decisions = listOf("Precio en 40 mil", "Beta el viernes"), questions = listOf("¿Quién avisa a soporte?")),
            meeting("b", now - day, "", decisions = listOf("Beta el viernes", "QA el jueves")),
            meeting("x", now, "De otro proyecto", decisions = listOf("Nada que ver")),
        )
        val brief = Projects.brief(detail, meetings)
        assertEquals("Antes: se habló de precios.", brief.about)
        assertEquals(listOf("Beta el viernes", "QA el jueves", "Precio en 40 mil"), brief.decisions)
        assertEquals(listOf("¿Quién avisa a soporte?"), brief.questions)
        assertNull(Projects.brief(detail.copy(meetings = emptyList()), meetings).about)
    }

    @Test fun monogramTakesTwoLetters() {
        assertEquals("AC", Projects.monogram("Asistente de chat industrial"))
        assertEquals("TE", Projects.monogram("Teker"))
        assertEquals("PD", Projects.monogram("Pilotos con dron"))
    }
}
