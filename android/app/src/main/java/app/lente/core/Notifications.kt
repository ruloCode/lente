package app.lente.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One item of the activity feed (add-notifications), as `GET /notifications` sends it. */
data class NotificationItem(
    val id: String,
    val kind: String,
    val group: String,
    val at: Long,
    val title: String,
    val body: String,
    val urgent: Boolean,
    val meetingId: String? = null,
    val actionId: String? = null,
)

/** The wearer's notification settings; quiet hours in minutes from midnight (`from > to` crosses midnight). */
data class NotificationPrefs(
    val phone: Boolean = true,
    val groups: Map<String, Boolean> = Notifications.GROUPS.associateWith { true },
    val quietOn: Boolean = false,
    val quietFrom: Int = 22 * 60,
    val quietTo: Int = 7 * 60,
    val meetingsUrgentOnly: Boolean = true,
    val hideContent: Boolean = false,
    val clipBuzz: Boolean = false,
) {
    fun group(key: String): Boolean = groups[key] ?: true
}

/** The feed with its read mark and settings; `fromHub` is false when the phone derived it for an old hub. */
data class Feed(val items: List<NotificationItem>, val readAt: Long, val prefs: NotificationPrefs, val fromHub: Boolean) {
    val unread: Int get() = items.count { it.at > readAt }
}

/**
 * The activity feed on the phone (add-notifications): parsing the hub's, deriving the same feed from the
 * stream state for a hub that does not serve it yet, grouping by day, and the rule for alerts. Pure.
 */
object Notifications {
    val GROUPS = listOf("recordings", "approvals", "memories", "agents")
    val GROUP_LABELS = mapOf("recordings" to "Grabaciones", "approvals" to "Aprobaciones", "memories" to "Recuerdos", "agents" to "Agentes")
    const val QUOTE_CHARS = 90
    private val ES = Locale.forLanguageTag("es")

    fun parse(text: String): Feed {
        val o = JSONObject(text)
        val arr = o.optJSONArray("items") ?: JSONArray()
        val items = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.mapNotNull { i ->
            val id = i.optString("id").ifBlank { return@mapNotNull null }
            NotificationItem(
                id, i.optString("kind"), i.optString("group"), i.optLong("at"), i.optString("title"), i.optString("body"), i.optBoolean("urgent"),
                i.optString("meetingId").ifBlank { null }, i.optString("actionId").ifBlank { null },
            )
        }
        return Feed(items, o.optLong("readAt"), parsePrefs(o.optJSONObject("prefs")), fromHub = true)
    }

    fun parsePrefs(o: JSONObject?): NotificationPrefs {
        if (o == null) return NotificationPrefs()
        val d = NotificationPrefs()
        val g = o.optJSONObject("groups")
        val q = o.optJSONObject("quiet")
        return NotificationPrefs(
            phone = o.optBoolean("phone", d.phone),
            groups = GROUPS.associateWith { g?.optBoolean(it, true) ?: true },
            quietOn = q?.optBoolean("on", d.quietOn) ?: d.quietOn,
            quietFrom = q?.optInt("from", d.quietFrom)?.takeIf { it in 0 until 24 * 60 } ?: d.quietFrom,
            quietTo = q?.optInt("to", d.quietTo)?.takeIf { it in 0 until 24 * 60 } ?: d.quietTo,
            meetingsUrgentOnly = o.optBoolean("meetingsUrgentOnly", d.meetingsUrgentOnly),
            hideContent = o.optBoolean("hideContent", d.hideContent),
            clipBuzz = o.optBoolean("clipBuzz", d.clipBuzz),
        )
    }

    fun prefsJson(p: NotificationPrefs): JSONObject = JSONObject()
        .put("phone", p.phone)
        .put("groups", JSONObject().apply { GROUPS.forEach { put(it, p.group(it)) } })
        .put("quiet", JSONObject().put("on", p.quietOn).put("from", p.quietFrom).put("to", p.quietTo))
        .put("meetingsUrgentOnly", p.meetingsUrgentOnly)
        .put("hideContent", p.hideContent)
        .put("clipBuzz", p.clipBuzz)

    private fun quote(s: String): String {
        val t = s.replace(Regex("\\s+"), " ").trim()
        return if (t.length > QUOTE_CHARS) t.take(QUOTE_CHARS - 1).trimEnd() + "…" else t
    }

    /**
     * The same feed the hub builds, from what the phone holds, for a hub that does not serve it yet: notes
     * being written, ready, failed or too short; actions waiting; memories to review as one item. Actions and
     * memories take their meeting's end as their time, since the stream carries no creation time.
     */
    fun local(meetings: List<MeetingSummary>, pending: List<PendingAction>, facts: List<Fact>, now: Long): List<NotificationItem> {
        val ended = meetings.associate { it.id to (it.endedAt ?: it.startedAt) }
        val items = mutableListOf<NotificationItem>()
        for (m in meetings) {
            val at = m.endedAt ?: m.startedAt
            val title = quote(m.displayTitle)
            when (m.status) {
                "extracting" -> items += NotificationItem("notes-writing:${m.id}", "notes-writing", "recordings", at, "Procesando tu grabación", "$title · Lente escribe las notas", false, m.id)
                "done" -> items += NotificationItem("notes-ready:${m.id}", "notes-ready", "recordings", at, "Notas listas: $title", "Notas, tareas y decisiones", false, m.id)
                "failed" -> items += NotificationItem("notes-failed:${m.id}", "notes-failed", "recordings", at, "No pude escribir las notas", "$title · la transcripción quedó guardada", false, m.id)
                "too-short" -> items += NotificationItem("notes-short:${m.id}", "notes-short", "recordings", at, "Grabación muy corta para notas", "$title · se guardó el texto", false, m.id)
            }
        }
        for (a in pending) {
            val agent = a.tool == "run_agent"
            val (title, body) = when (a.tool) {
                "run_agent" -> (if (a.args.optString("agent") == "codex") "Codex" else "Claude Code") + " espera tu aprobación" to a.args.optString("instruction")
                "draft_email" -> "Un correo por aprobar" to a.args.optString("subject")
                "create_reminder" -> "Un recordatorio por aprobar" to a.args.optString("text")
                else -> "Una tarea por aprobar" to a.args.optString("title")
            }
            items += NotificationItem("approval:${a.id}", "approval", if (agent) "agents" else "approvals", ended[a.meetingId] ?: now, title, quote(body), true, a.meetingId.ifBlank { null }, a.id)
        }
        val review = facts.filter { it.status == "proposed" }
        if (review.isNotEmpty()) {
            // Memories from meetings the phone does not hold take the oldest meeting's time, never «now».
            val oldest = ended.values.minOrNull() ?: now
            val newest = review.maxByOrNull { ended[it.meetingId] ?: 0L }!!
            items += NotificationItem(
                "memory-review:${newest.id}", "memory-review", "memories", ended[newest.meetingId] ?: oldest,
                if (review.size == 1) "Un recuerdo por revisar" else "${review.size} recuerdos por revisar", quote(newest.text), false,
            )
        }
        return items.sortedWith(compareByDescending<NotificationItem> { it.at }.thenBy { it.id })
    }

    /** The feed by day, newest first: «Hoy», «Ayer», then «3 nov». */
    fun byDay(items: List<NotificationItem>, now: Long, zone: ZoneId = ZoneId.systemDefault()): List<Pair<String, List<NotificationItem>>> {
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        return items.groupBy { Instant.ofEpochMilli(it.at).atZone(zone).toLocalDate() }.toSortedMap(compareByDescending { it }).map { (day, list) ->
            when (day) {
                today -> "Hoy"
                today.minusDays(1) -> "Ayer"
                else -> DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES).format(day).replaceFirstChar { it.uppercase(ES) }
            } to list
        }
    }

    /** When an item happened, short: «Ahora», «Hace 5 min», then the time. */
    fun whenLabel(at: Long, now: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val min = (now - at).coerceAtLeast(0) / 60_000
        return when {
            min < 1 -> "Ahora"
            min < 60 -> "Hace $min min"
            else -> DateTimeFormatter.ofPattern("HH:mm", ES).format(Instant.ofEpochMilli(at).atZone(zone))
        }
    }

    /** Whether a minute of the day falls in quiet hours (which may cross midnight). */
    fun isQuiet(p: NotificationPrefs, minuteOfDay: Int): Boolean {
        if (!p.quietOn || p.quietFrom == p.quietTo) return false
        return if (p.quietFrom < p.quietTo) minuteOfDay >= p.quietFrom && minuteOfDay < p.quietTo else minuteOfDay >= p.quietFrom || minuteOfDay < p.quietTo
    }

    /** Whether an item may alert on the phone: alerts on, its kind on, outside quiet hours, urgent-only during a meeting if so set. */
    fun mayAlert(item: NotificationItem, p: NotificationPrefs, minuteOfDay: Int, inMeeting: Boolean): Boolean =
        p.phone && p.group(item.group) && !isQuiet(p, minuteOfDay) && !(inMeeting && p.meetingsUrgentOnly && !item.urgent)

    /** New items to alert: not alerted before, after the read mark, and allowed now; oldest first, as they happened. */
    fun toAlert(feed: Feed, alerted: Set<String>, minuteOfDay: Int, inMeeting: Boolean): List<NotificationItem> =
        feed.items.filter { it.id !in alerted && it.at > feed.readAt && mayAlert(it, feed.prefs, minuteOfDay, inMeeting) }.sortedBy { it.at }

    /** What a system notification shows: the item, or a plain line when the wearer hides content on the lock screen. */
    fun lockText(item: NotificationItem, hide: Boolean): Pair<String, String> = if (hide) "Lente" to "Algo nuevo en tu actividad" else item.title to item.body

    /** «22:00» from minutes after midnight. */
    fun clock(minutes: Int): String = "%02d:%02d".format(minutes / 60, minutes % 60)
}
