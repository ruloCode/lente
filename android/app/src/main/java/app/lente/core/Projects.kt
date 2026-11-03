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

    /** A project in brief, from its own meetings' notes: what it is about (the newest summary), recent decisions and open questions. */
    data class Brief(val about: String?, val decisions: List<String>, val questions: List<String>)

    /** Decisions and open questions a project's page shows. */
    const val BRIEF_DECISIONS = 3
    const val BRIEF_QUESTIONS = 2

    /**
     * The brief of a project (add-home-dock) from the meetings the phone already holds: the newest of its
     * meetings with a summary says what it is about; decisions and open questions come newest first, once each.
     */
    fun brief(detail: Detail, meetings: List<MeetingSummary>): Brief {
        val ids = detail.meetings.mapTo(HashSet()) { it.id }
        val own = meetings.filter { it.id in ids && it.notes != null }.sortedByDescending { it.startedAt }
        val about = own.firstNotNullOfOrNull { m -> m.notes?.summary?.replace(Regex("\\s+"), " ")?.trim()?.takeIf { it.isNotEmpty() } }
        val decisions = own.flatMap { m -> m.notes!!.decisions.map { it.text.trim() } }.filter { it.isNotEmpty() }.distinct().take(BRIEF_DECISIONS)
        val questions = own.flatMap { m -> m.notes!!.openQuestions.map { it.text.trim() } }.filter { it.isNotEmpty() }.distinct().take(BRIEF_QUESTIONS)
        return Brief(about, decisions, questions)
    }

    /** Small words a monogram skips, so «Asistente de chat» reads AC. */
    private val CONNECTORS = setOf("de", "del", "la", "las", "el", "los", "y", "e", "con", "en", "para", "por", "a", "al", "o")

    /** Two letters for a project's monogram: the first letters of its first two words (connectors skipped), or its first two letters. */
    fun monogram(name: String): String {
        val words = name.split(Regex("\\s+")).filter { w -> w.any { it.isLetterOrDigit() } && w.lowercase() !in CONNECTORS }
        val letters = if (words.size >= 2) words.take(2).map { w -> w.first { it.isLetterOrDigit() } } else name.filter { it.isLetterOrDigit() }.take(2).toList()
        return letters.joinToString("").uppercase()
    }

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
