package app.lente.core

/**
 * Who does each task, in the wearer's words (add-task-owners 1.5): Tareas groups open tasks into
 * "Te toca", "Lente puede hacerlo" and "Esperando a otros". Pure.
 */
object TaskOwners {
    val ORDER = listOf("me", "lente", "other")

    fun heading(who: String): String = when (who) {
        "lente" -> "Lente puede hacerlo"
        "other" -> "Esperando a otros"
        else -> "Te toca"
    }

    /** The short tag on a task, tapped to change who does it. */
    fun tag(t: Task): String = when (t.who) {
        "lente" -> "Lente"
        "other" -> t.otherName ?: "Otro"
        else -> "Tú"
    }

    /** The next owner when the tag is tapped: Tú → Lente → Otro → Tú. */
    fun next(who: String): String = ORDER[(ORDER.indexOf(who).coerceAtLeast(0) + 1) % ORDER.size]

    /** Open tasks by owner, in the order above, oldest first within each; empty groups left out. */
    fun groups(tasks: List<Task>): List<Pair<String, List<Task>>> =
        ORDER.map { who -> who to tasks.filter { !it.done && (it.who.takeIf { w -> w in ORDER } ?: "me") == who } }.filter { it.second.isNotEmpty() }

    /** "Ternium · Kickoff · Para viernes": the project, the meeting and the due date, as far as known. */
    fun context(t: Task): String = listOfNotNull(t.projectName.ifBlank { null }, t.meetingTitle.ifBlank { null }, t.due?.let { "Para $it" }).joinToString(" · ")

    /** The label for tasks with no project. */
    const val NO_PROJECT = "Sin proyecto"

    /** Only the tasks of one project ("" = without one) and of one owner; null keeps everything. */
    fun filter(tasks: List<Task>, project: String?, who: String?): List<Task> =
        tasks.filter { (project == null || it.projectName == project) && (who == null || (it.who.takeIf { w -> w in ORDER } ?: "me") == who) }

    /** Open tasks by project, alphabetical with "Sin proyecto" last; within each, the wearer's first, then Lente's, then others'. */
    fun byProject(tasks: List<Task>): List<Pair<String, List<Task>>> =
        tasks.filter { !it.done }
            .groupBy { it.projectName }
            .toList()
            .sortedWith(compareBy<Pair<String, List<Task>>> { it.first.isEmpty() }.thenBy { it.first.lowercase() })
            .map { (name, list) -> (name.ifEmpty { NO_PROJECT }) to list.sortedBy { ORDER.indexOf(it.who).let { i -> if (i < 0) 0 else i } } }

    /** The projects that have open tasks, for the filter, alphabetical; "" stands for "Sin proyecto". */
    fun projectsWithTasks(tasks: List<Task>): List<String> =
        tasks.filter { !it.done }.map { it.projectName }.distinct().sortedWith(compareBy<String> { it.isEmpty() }.thenBy { it.lowercase() })
}
