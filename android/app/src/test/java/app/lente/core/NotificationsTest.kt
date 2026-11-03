package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class NotificationsTest {
    private val zone = ZoneId.of("America/Bogota")
    private val now = ZonedDateTime.of(2026, 11, 3, 12, 0, 0, 0, zone).toInstant().toEpochMilli()
    private val min = 60_000L

    private fun item(id: String, at: Long, group: String = "recordings", urgent: Boolean = false) = NotificationItem(id, "notes-ready", group, at, "T $id", "B", urgent)

    @Test fun parsesTheHubsFeedAndSettings() {
        val json = """{"items":[{"id":"approval:a1","kind":"approval","group":"agents","at":5,"title":"Codex espera tu aprobación","body":"PROBE","urgent":true,"actionId":"a1"},{"id":""}],"readAt":3,"unread":1,"prefs":{"phone":true,"groups":{"agents":false},"quiet":{"on":true,"from":1320,"to":420},"clipBuzz":true}}"""
        val feed = Notifications.parse(json)
        assertEquals(1, feed.items.size)
        assertEquals("a1", feed.items[0].actionId)
        assertEquals(1, feed.unread)
        assertFalse(feed.prefs.group("agents"))
        assertTrue(feed.prefs.group("memories"))
        assertEquals(1320, feed.prefs.quietFrom)
        assertTrue(feed.prefs.clipBuzz)
        val back = Notifications.parsePrefs(JSONObject(Notifications.prefsJson(feed.prefs).toString()))
        assertEquals(feed.prefs, back)
    }

    @Test fun derivesTheSameFeedFromTheStreamForAnOldHub() {
        val meetings = listOf(
            MeetingSummary("m1", "PROBE-Revisión", "", false, now - 90 * min, now - 60 * min, "done", 3, null, 0, 0),
            MeetingSummary("m2", "", "PROBE-tema", false, now - 20 * min, now - 2 * min, "extracting", 3, null, 0, 0),
            MeetingSummary("m3", "PROBE-viva", "", false, now - min, null, "running", 3, null, 0, 0),
        )
        val pending = listOf(PendingAction("a1", "m1", "PROBE-Revisión", "run_agent", JSONObject().put("agent", "codex").put("instruction", "PROBE-tests"), emptyList()))
        val facts = listOf(Fact("f1", "PROBE-uno", "proposed", "m1", emptyList()), Fact("f2", "PROBE-dos", "proposed", "m1", emptyList()), Fact("f3", "PROBE-ya", "kept", "m1", emptyList()))
        val feed = Notifications.local(meetings, pending, facts, now)
        assertEquals(listOf("notes-writing:m2", "approval:a1", "memory-review:f1", "notes-ready:m1"), feed.map { it.id })
        assertEquals("Codex espera tu aprobación", feed[1].title)
        assertEquals("agents", feed[1].group)
        assertEquals("2 recuerdos por revisar", feed[2].title)
        assertEquals("PROBE-tema · Lente escribe las notas", feed[0].body)
    }

    @Test fun groupsByDayAndSaysWhen() {
        val days = Notifications.byDay(listOf(item("a", now - min), item("b", now - 25 * 60 * min), item("c", now - 3 * 24 * 60 * min)), now, zone)
        assertEquals(listOf("Hoy", "Ayer", "Sábado 31 de octubre"), days.map { it.first })
        assertEquals("Ahora", Notifications.whenLabel(now, now, zone))
        assertEquals("Hace 5 min", Notifications.whenLabel(now - 5 * min, now, zone))
        assertEquals("10:00", Notifications.whenLabel(now - 120 * min, now, zone))
        assertEquals("07:05", Notifications.clock(425))
    }

    @Test fun alertsFollowTheSettingsOncePerItem() {
        val prefs = NotificationPrefs(quietOn = true, quietFrom = 22 * 60, quietTo = 7 * 60)
        assertTrue(Notifications.isQuiet(prefs, 23 * 60))
        assertTrue(Notifications.isQuiet(prefs, 6 * 60 + 59))
        assertFalse(Notifications.isQuiet(prefs, 12 * 60))
        val feed = Feed(listOf(item("new", now), item("seen", now - min), item("old", now - 10 * min), item("urgent", now - 2 * min, "approvals", urgent = true)), readAt = now - 5 * min, prefs = prefs, fromHub = true)
        assertEquals(listOf("urgent", "new"), Notifications.toAlert(feed, setOf("seen"), 12 * 60, inMeeting = false).map { it.id })
        assertEquals(listOf("urgent"), Notifications.toAlert(feed, setOf("seen"), 12 * 60, inMeeting = true).map { it.id })
        assertEquals(emptyList<String>(), Notifications.toAlert(feed, emptySet(), 23 * 60, inMeeting = false).map { it.id })
        assertEquals(emptyList<String>(), Notifications.toAlert(feed.copy(prefs = prefs.copy(phone = false)), emptySet(), 12 * 60, false).map { it.id })
        assertEquals("Lente" to "Algo nuevo en tu actividad", Notifications.lockText(feed.items[0], hide = true))
    }
}
