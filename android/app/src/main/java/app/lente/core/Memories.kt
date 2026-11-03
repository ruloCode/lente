package app.lente.core

/** One line of a relived moment: when it is said (seconds from the start), who says it, and what. */
data class MemoryLine(val atS: Float, val who: String, val text: String) {
    /** What the camera described rather than something said. */
    val camera: Boolean get() = who == Memories.CAMERA
}

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
)

/**
 * Recuerdos on the phone (add-home-dock), on sample moments until add-memory-timeline brings the real
 * ones from the hub. The people and meetings are made up. Pure.
 */
object Memories {
    const val CAMERA = "cam"
    /** How long a relived moment plays, in seconds. */
    const val DURATION_S = 14f
    /** From this relive of the same moment on, Lente offers the summary to move on. */
    const val NUDGE_AT = 3

    val MOCK: List<Memory> = listOf(
        Memory(
            "r1", "Viernes 31 oct", "VIE 31", "09:30:04", "Revisión de diseño", "Estudio · 22 min",
            listOf(MemoryLine(0.8f, "Tú", "¿Probamos los anillos en el teléfono?"), MemoryLine(4.2f, "Luis", "Sí, pero que el texto se lea con sol."), MemoryLine(7.8f, "Tú", "Subo el contraste y lo vemos el lunes."), MemoryLine(11f, CAMERA, "Una pantalla de Recuerdos en un teléfono, sobre la mesa.")),
            "Probaron los anillos en el teléfono; tú subes el contraste para el lunes.", 0xFF8A6A4A, 0xFF2A1C10,
        ),
        Memory(
            "r2", "Ayer · sábado 1 nov", "AYER", "18:40:15", "Camino a casa", "Fuera de reuniones",
            listOf(MemoryLine(0.8f, CAMERA, "Tráfico y una canción en la radio."), MemoryLine(4.4f, "Tú", "Lente, recuérdame comprar pan."), MemoryLine(7.8f, "Lente", "Listo, te lo recuerdo al llegar."), MemoryLine(11f, CAMERA, "Calle al atardecer, luces de los carros.")),
            "Pediste un recordatorio para comprar pan al llegar.", 0xFF8A4A6E, 0xFF1A1428,
        ),
        Memory(
            "r3", "Hoy · domingo 2 nov", "HOY", "08:12:33", "Café con Ana", "Café · 15 min",
            listOf(MemoryLine(0.8f, "Ana", "¿Al final cuánto cuesta la fase dos?"), MemoryLine(4.2f, "Tú", "Lo reviso hoy y te digo en la reunión."), MemoryLine(7.6f, "Ana", "Perfecto, la necesito antes del viernes."), MemoryLine(10.8f, "Tú", "Te la mando el jueves.")),
            "Ana necesita el costo de la fase dos antes del viernes; prometiste enviarlo el jueves.", 0xFF9A6A3A, 0xFF160E09,
        ),
        Memory(
            "r4", "Hoy · domingo 2 nov", "HOY", "10:41:12", "Planeación de la beta", "Sala grande · 34 min",
            listOf(MemoryLine(0.8f, "Ana", "¿Cuánto nos cuesta si entra la fase dos?"), MemoryLine(4.2f, "Tú", "Unos cuarenta mil; te mando la cotización el viernes."), MemoryLine(7.8f, "Ana", "Perfecto, con eso cerramos el presupuesto."), MemoryLine(11f, "Tú", "Listo, lo anoto.")),
            "La fase dos cuesta unos cuarenta mil; tú envías la cotización el viernes y con eso se cierra el presupuesto.", 0xFF6A5040, 0xFF171211,
        ),
        Memory(
            "r5", "Hoy · domingo 2 nov", "HOY", "11:30:51", "Pizarra del sprint", "Pasillo · 9 min",
            listOf(MemoryLine(0.8f, "Luis", "«Fase 2» va en por hacer, ¿no?"), MemoryLine(4.2f, "Tú", "Sí, hasta que Ana apruebe el presupuesto."), MemoryLine(7.6f, "Luis", "Entonces la marco en rojo."), MemoryLine(10.8f, CAMERA, "Una pizarra con tres columnas y «Fase 2» en rojo.")),
            "«Fase 2» queda en por hacer, marcada en rojo, hasta que Ana apruebe el presupuesto.", 0xFF6C6B66, 0xFF2E2D2A,
        ),
        Memory(
            "r6", "Hoy · domingo 2 nov", "HOY", "15:05:09", "Llamada con el cliente", "Videollamada · 27 min",
            listOf(MemoryLine(0.8f, "Cliente", "¿La beta sale el viernes?"), MemoryLine(4.2f, "Tú", "Sí, si QA aprueba el jueves."), MemoryLine(7.6f, "Cliente", "¿Y el reporte semanal?"), MemoryLine(10.8f, "Tú", "Lo recibe cada lunes a las nueve.")),
            "La beta sale el viernes si QA aprueba el jueves; el reporte llega cada lunes a las nueve.", 0xFF2C3E66, 0xFF07080C,
        ),
    )

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
