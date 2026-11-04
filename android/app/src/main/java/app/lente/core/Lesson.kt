package app.lente.core

import org.json.JSONArray
import org.json.JSONObject

/** A practice lesson (add-practice-mode, design decision 3): an id, a Spanish title and the MIDI notes to play. */
data class Lesson(val id: String, val title: String, val notes: List<Int>)

/** How one expected note went. */
sealed class Mark {
    object Right : Mark()
    data class Wrong(val played: Int) : Mark()
    object Missed : Mark()

    /** The word `POST /practice/attempt` takes. */
    val key: String get() = when (this) { Right -> "right"; is Wrong -> "wrong"; Missed -> "missed" }
}

/**
 * The alignment of an attempt: one mark per expected note (only those reached, while it runs), the played
 * note paired with each (null when missed), and the extra notes.
 */
data class Alignment(val marks: List<Mark>, val extra: Int, val matched: List<Int?> = marks.map { (it as? Mark.Wrong)?.played }) {
    val right: Int get() = marks.count { it == Mark.Right }
    /** The first expected note not played right, 0-based, or null. */
    val firstWrong: Int? get() = marks.indexOfFirst { it != Mark.Right }.takeIf { it >= 0 }
}

/**
 * Lessons and the matching of an attempt (design decision 4): Needleman–Wunsch of the expected pitch classes
 * against the played notes, match 0, substitution 1, insertion 1, deletion 1. Octave-insensitive, so a
 * beginner on a small keyboard may play an octave up. Pure.
 */
object Lessons {
    /** The fallback when the hub cannot be reached; the same three it serves at `GET /practice/lessons`. All public domain. */
    val BUILT_IN = listOf(
        Lesson("escala-do", "Escala de Do", listOf(60, 62, 64, 65, 67, 69, 71, 72)),
        Lesson("estrellita", "Estrellita", listOf(60, 60, 67, 67, 69, 69, 67)),
        Lesson("himno-alegria", "Himno de la alegría", listOf(64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62)),
    )

    /** The bounds the hub enforces on an attempt: notes per list, and times (10 min). */
    const val MAX_NOTES = 64
    const val MAX_MS = 600_000L
    /** An attempt ends when this long passes without a new note. */
    const val IDLE_END_MS = 4_000L

    /** `{ lessons: [{ id, title, notes }] }` or a bare array; lessons without notes are dropped. */
    fun parse(text: String): List<Lesson> {
        val trimmed = text.trim()
        val arr = if (trimmed.startsWith("[")) JSONArray(trimmed) else JSONObject(trimmed).optJSONArray("lessons") ?: JSONArray()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val n = o.optJSONArray("notes") ?: return@mapNotNull null
            val notes = (0 until n.length()).map { n.getInt(it) }.filter { it in 0..127 }
            val id = o.optString("id")
            if (id.isEmpty() || notes.isEmpty()) null else Lesson(id, o.optString("title").ifEmpty { id }, notes)
        }
    }

    /** The hub's answer to an attempt, `{ line, summary }`. `line` is empty when the coach failed (the attempt is still kept). */
    data class Coach(val line: String, val summary: String)

    fun coach(text: String): Coach? = runCatching { JSONObject(text).let { Coach(it.optString("line").trim(), it.optString("summary").trim()) } }.getOrNull()

    /** What the phone says itself when the hub cannot coach: «7 de 8 notas bien. La 4.ª fue Sol en vez de Fa.» */
    fun localLine(lesson: Lesson, a: Alignment): String {
        val total = lesson.notes.size
        if (a.right == total) return "¡Muy bien! $total de $total notas bien."
        val head = "${a.right} de $total notas bien."
        val i = a.firstWrong ?: return head
        val want = Solfege.name(lesson.notes[i])
        return when (val m = a.marks[i]) {
            is Mark.Wrong -> "$head La ${i + 1}.ª fue ${Solfege.name(m.played)} en vez de $want."
            else -> "$head Te faltó la ${i + 1}.ª, $want."
        }
    }

    private const val SUB = 1
    private const val GAP = 1

    /**
     * Aligns `played` to `expected`. With `open` (the attempt is still running) the expected notes after the
     * last one reached are not counted as missed, and `marks` covers only the notes reached so far.
     */
    fun align(expected: List<Int>, played: List<Int>, open: Boolean = false): Alignment {
        val n = expected.size
        val m = played.size
        val cost = Array(n + 1) { IntArray(m + 1) }
        for (i in 0..n) cost[i][0] = i * GAP
        for (j in 0..m) cost[0][j] = j * GAP
        for (i in 1..n) for (j in 1..m) {
            val same = Solfege.pitchClass(expected[i - 1]) == Solfege.pitchClass(played[j - 1])
            cost[i][j] = minOf(cost[i - 1][j - 1] + if (same) 0 else SUB, cost[i - 1][j] + GAP, cost[i][j - 1] + GAP)
        }
        // Where the alignment ends: every expected note, or (open) the prefix that costs least, the longest on a tie.
        var end = n
        if (open) for (i in n downTo 0) if (cost[i][m] < cost[end][m]) end = i

        val marks = ArrayList<Mark>()
        val matched = ArrayList<Int?>()
        var extra = 0
        var i = end
        var j = m
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0) {
                val same = Solfege.pitchClass(expected[i - 1]) == Solfege.pitchClass(played[j - 1])
                if (cost[i][j] == cost[i - 1][j - 1] + if (same) 0 else SUB) {
                    marks += if (same) Mark.Right else Mark.Wrong(played[j - 1]); matched += played[j - 1]; i--; j--; continue
                }
            }
            if (i > 0 && cost[i][j] == cost[i - 1][j] + GAP) { marks += Mark.Missed; matched += null; i--; continue }
            extra++; j--
        }
        marks.reverse()
        matched.reverse()
        return Alignment(marks, extra, matched)
    }
}

/** A played note in an attempt: when it started, in ms since the attempt began. */
data class Played(val midi: Int, val atMs: Long)

/** One attempt at a lesson, fed note by note. Pure: the caller passes the clock. */
class Attempt(val lesson: Lesson, val startedMs: Long) {
    private val notes = mutableListOf<Played>()
    val played: List<Played> get() = notes.toList()

    /** Adds a note that started at `nowMs` (the phone's clock); returns the live alignment. */
    fun add(midi: Int, nowMs: Long): Alignment {
        if (notes.size < Lessons.MAX_NOTES) notes += Played(midi, (nowMs - startedMs).coerceIn(0, Lessons.MAX_MS))
        return live()
    }

    /** The marks so far, with notes not yet reached left out. */
    fun live(): Alignment = Lessons.align(lesson.notes, notes.map { it.midi }, open = true)

    /** The index of the note to play next, for the highlight. */
    fun next(): Int = live().marks.size

    /** Done when the last note is reached, or [Lessons.IDLE_END_MS] passed since the last note (or the start). */
    fun done(nowMs: Long): Boolean {
        if (notes.isNotEmpty() && live().marks.size >= lesson.notes.size) return true
        if (notes.size >= Lessons.MAX_NOTES) return true
        val last = notes.lastOrNull()?.atMs?.plus(startedMs) ?: return false
        return nowMs - last >= Lessons.IDLE_END_MS
    }

    /** The final alignment: every expected note marked. */
    fun result(): Alignment = Lessons.align(lesson.notes, notes.map { it.midi })

    /** From the first note to the last, in ms. */
    fun durationMs(): Long = if (notes.size < 2) 0 else notes.last().atMs - notes.first().atMs

    /** The body of `POST /practice/attempt` (design decision 5), with `matched` so the hub can name a wrong note. */
    fun body(): JSONObject {
        val r = result()
        return JSONObject()
            .put("lessonId", lesson.id)
            .put("expected", JSONArray(lesson.notes))
            .put("played", JSONArray(notes.map { JSONObject().put("midi", it.midi).put("atMs", it.atMs) }))
            .put("marks", JSONArray(r.marks.map { it.key }))
            .put("matched", JSONArray(r.matched.map { it ?: JSONObject.NULL }))
            .put("extra", r.extra)
            .put("durationMs", durationMs())
    }
}
