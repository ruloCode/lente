package app.lente.core

/** One line of a relived moment: when it is said (seconds from the start), who says it, and what. */
data class MemoryLine(val atS: Float, val who: String, val text: String) {
    /** What the camera described rather than something said. */
    val camera: Boolean get() = who == Memories.CAMERA
}

/** A stretch of a relived moment that plays one kept speech recording (`audio`, a hub path), when there is one. */
data class MemoryScene(val startS: Float, val lengthS: Float, val audio: String?)

/** A photo of the moment, shown from `atS` until the next one: together they play as its video. */
data class MemoryFrame(val atS: Float, val path: String)

/** A moment to relive (add-memory-timeline): when, where, its lines as timed text, and a one-line summary. */
data class Memory(
    val id: String,
    val day: String,
    val rel: String,
    val time: String,
    val title: String,
    val place: String,
    val lines: List<MemoryLine>,
    val summary: String,
    val tint: Long,
    val tint2: Long,
    /** How long it plays, in seconds: what was said, back to back. */
    val durationS: Float = Memories.DURATION_S,
    val scenes: List<MemoryScene> = emptyList(),
    val frames: List<MemoryFrame> = emptyList(),
)

/**
 * Recuerdos on the phone (add-home-dock): the wearer's moments as the hub gives them (`GET /memories`),
 * each a meeting or a Solo grabar episode with its lines, its kept speech audio and its photos. Pure.
 */
object Memories {
    const val CAMERA = "cam"
    /** How long a moment with no timings plays, in seconds. */
    const val DURATION_S = 14f
    /** Colours for a moment with no photo yet, picked by its id so it keeps them. */
    private val TINTS = listOf(0xFF8A6A4A to 0xFF2A1C10, 0xFF8A4A6E to 0xFF1A1428, 0xFF9A6A3A to 0xFF160E09, 0xFF6A5040 to 0xFF171211, 0xFF6C6B66 to 0xFF2E2D2A, 0xFF2C3E66 to 0xFF07080C)
    private val ES = java.util.Locale.forLanguageTag("es")

    /**
     * The hub's moments (newest first there) as the visor lists them, oldest first so later moments come
     * below; days and times in `zone`, «Hoy» and «Ayer» against `now`.
     */
    fun fromJson(text: String, now: Long, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): List<Memory> {
        val arr = org.json.JSONObject(text).optJSONArray("moments") ?: return emptyList()
        val today = java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            val start = java.time.Instant.ofEpochMilli(o.getLong("startedAt")).atZone(zone)
            val date = start.toLocalDate()
            val weekday = start.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, ES)
            val month = start.month.getDisplayName(java.time.format.TextStyle.SHORT, ES).trimEnd('.')
            val (day, rel) = when (date) {
                today -> "Hoy · $weekday ${date.dayOfMonth} $month" to "HOY"
                today.minusDays(1) -> "Ayer · $weekday ${date.dayOfMonth} $month" to "AYER"
                else -> "${weekday.replaceFirstChar { it.uppercase() }} ${date.dayOfMonth} $month" to "${weekday.take(3).uppercase()} ${date.dayOfMonth}"
            }
            val minutes = ((o.optLong("endedAt", o.getLong("startedAt")) - o.getLong("startedAt")) / 60_000).coerceAtLeast(1)
            val lines = o.optJSONArray("lines")?.let { a -> (0 until a.length()).map { k -> a.getJSONObject(k).let { l -> MemoryLine(l.getDouble("atS").toFloat(), l.getString("who"), l.getString("text")) } } } ?: emptyList()
            val scenes = o.optJSONArray("scenes")?.let { a -> (0 until a.length()).map { k -> a.getJSONObject(k).let { c -> MemoryScene(c.getDouble("startS").toFloat(), c.getDouble("lengthS").toFloat(), c.optString("audio").ifEmpty { null }) } } } ?: emptyList()
            val frames = o.optJSONArray("frames")?.let { a -> (0 until a.length()).map { k -> a.getJSONObject(k).let { f -> MemoryFrame(f.getDouble("atS").toFloat(), f.getString("path")) } } } ?: emptyList()
            val id = o.getString("id")
            val (tint, tint2) = TINTS[Math.floorMod(id.hashCode(), TINTS.size)]
            Memory(
                id, day, rel, "%02d:%02d:%02d".format(start.hour, start.minute, start.second), o.optString("title").ifEmpty { "Momento" },
                "$minutes min", lines, o.optString("summary"), tint, tint2,
                durationS = o.optDouble("durationS", DURATION_S.toDouble()).toFloat().coerceAtLeast(1f), scenes = scenes, frames = frames,
            )
        }.reversed()
    }

    /** The photo on screen at `t`: the last one already taken, or the first before it. */
    fun frameAt(m: Memory, t: Float): MemoryFrame? = m.frames.lastOrNull { it.atS <= t } ?: m.frames.firstOrNull()

    /** The scene playing at `t`, and how far into it. */
    fun sceneAt(m: Memory, t: Float): Pair<MemoryScene, Float>? =
        m.scenes.lastOrNull { it.startS <= t }?.let { it to (t - it.startS).coerceIn(0f, it.lengthS) }
    /** From this relive of the same moment on, Lente offers the summary to move on. */
    const val NUDGE_AT = 3


    /** The line on screen at `t` seconds: the last one already said, or none before the first. */
    fun lineAt(m: Memory, t: Float): MemoryLine? = m.lines.lastOrNull { it.atS <= t }

    /** The clock of the moment `seconds` after it started: «10:41:12» plus the seconds, past midnight too. */
    fun clockAt(base: String, seconds: Float): String {
        val (h, mi, s) = base.split(":").map { it.toInt() }
        val total = h * 3600 + mi * 60 + s + seconds.toInt()
        return "%02d:%02d:%02d".format((total / 3600) % 24, (total / 60) % 60, total % 60)
    }

    /** Lines someone said, not counting what the camera described. */
    fun spoken(m: Memory): Int = m.lines.count { !it.camera }

    /** The line under the title: «10:41 · Sala grande · 34 min · 4 frases». */
    fun meta(m: Memory): String = "${m.time.take(5)} · ${m.place} · ${spoken(m)} frases"

    /** Whether Lente offers the summary to move on, after reliving the same moment this many times. */
    fun nudge(count: Int): Boolean = count >= NUDGE_AT

    /** The moments by day, in their order, each with its index in the list. */
    fun byDay(list: List<Memory>): List<Pair<String, List<IndexedValue<Memory>>>> =
        list.withIndex().groupBy { it.value.day }.map { (day, items) -> day to items }
}
