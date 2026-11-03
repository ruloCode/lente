package app.lente.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * The wearer's projects (add-projects 2.1), read from the hub: `GET /projects` (each with its last
 * activity, meetings and open tasks) and `GET /projects/get?id=` (its meetings and open tasks).
 * Pure, with its words in Spanish for the wearer.
 */
object Projects {
    data class Summary(
        val id: String,
        val name: String,
        val active: Boolean,
        val lastActivityAt: Long?,
        val meetings: Int,
        val meetingsThisWeek: Int,
        val openTasks: Int,
        val next: String?,
    )

    data class MeetingRef(val id: String, val title: String, val startedAt: Long)
    data class TaskRef(val id: String, val title: String, val due: String?, val meetingId: String)
    data class Detail(val project: Summary, val meetings: List<MeetingRef>, val tasks: List<TaskRef>)

    /** How many projects Inicio shows before "Ver los N proyectos". */
    const val ON_HOME = 3

    private fun JSONObject.str(key: String): String? = if (isNull(key) || !has(key)) null else optString(key).takeIf { it.isNotEmpty() }

    private fun summary(o: JSONObject) = Summary(
        id = o.optString("id"),
        name = o.optString("name"),
        active = o.optString("status") != "archived",
        lastActivityAt = if (o.isNull("lastActivityAt") || !o.has("lastActivityAt")) null else o.optLong("lastActivityAt"),
        meetings = o.optInt("meetings"),
        meetingsThisWeek = o.optInt("meetingsThisWeek"),
        openTasks = o.optInt("openTasks"),
        next = o.str("next"),
    )

    private fun <T> JSONArray?.each(read: (JSONObject) -> T): List<T> = if (this == null) emptyList() else (0 until length()).map { read(getJSONObject(it)) }

    fun list(text: String): List<Summary> = JSONObject(text).optJSONArray("projects").each(::summary)

    fun detail(text: String): Detail {
        val o = JSONObject(text)
        return Detail(
            summary(o.getJSONObject("project")),
            o.optJSONArray("meetings").each { MeetingRef(it.optString("id"), it.optString("title"), it.optLong("startedAt")) },
            o.optJSONArray("tasks").each { TaskRef(it.optString("id"), it.optString("title"), it.str("due"), it.optString("meetingId")) },
        )
    }

    /** "Hoy", "Ayer", "Hace 3 días", "Hace 2 semanas", or the date ("12 ago"). */
    fun activity(at: Long?, now: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        if (at == null) return "Sin actividad"
        val days = ChronoUnit.DAYS.between(Instant.ofEpochMilli(at).atZone(zone).toLocalDate(), Instant.ofEpochMilli(now).atZone(zone).toLocalDate())
        return when {
            days <= 0 -> "Hoy"
            days == 1L -> "Ayer"
            days < 7 -> "Hace $days días"
            days < 28 -> "Hace ${days / 7} ${if (days / 7 == 1L) "semana" else "semanas"}"
            else -> DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("es")).format(Instant.ofEpochMilli(at).atZone(zone)).replace(".", "")
        }
    }

    private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"

    /** "3 pendientes · 2 reuniones esta semana"; without either, how many meetings in all. */
    fun counts(s: Summary): String {
        val parts = buildList {
            if (s.openTasks > 0) add(plural(s.openTasks, "pendiente", "pendientes"))
            if (s.meetingsThisWeek > 0) add("${plural(s.meetingsThisWeek, "reunión", "reuniones")} esta semana")
        }
        return parts.joinToString(" · ").ifEmpty { if (s.meetings == 0) "Sin reuniones todavía" else plural(s.meetings, "reunión", "reuniones") }
    }

    /** "Ver los 6 proyectos" when there are more than Inicio shows; null otherwise. */
    fun seeAll(active: Int): String? = if (active > ON_HOME) "Ver los $active proyectos" else if (active > 0) "Ver proyectos" else null
}
