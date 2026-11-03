package app.lente.core

/** The sample moments the phone showed before Recuerdos read the hub: made-up people and meetings, for the tests. */
object SampleMemories {
    val LIST: List<Memory> = listOf(
        Memory(
            "r1", "Viernes 31 oct", "VIE 31", "09:30:04", "Revisión de diseño", "Estudio · 22 min",
            listOf(MemoryLine(0.8f, "Tú", "¿Probamos los anillos en el teléfono?"), MemoryLine(4.2f, "Luis", "Sí, pero que el texto se lea con sol."), MemoryLine(7.8f, "Tú", "Subo el contraste y lo vemos el lunes."), MemoryLine(11f, Memories.CAMERA, "Una pantalla de Recuerdos en un teléfono, sobre la mesa.")),
            "Probaron los anillos en el teléfono; tú subes el contraste para el lunes.", 0xFF8A6A4A, 0xFF2A1C10,
        ),
        Memory(
            "r2", "Ayer · sábado 1 nov", "AYER", "18:40:15", "Camino a casa", "Fuera de reuniones",
            listOf(MemoryLine(0.8f, Memories.CAMERA, "Tráfico y una canción en la radio."), MemoryLine(4.4f, "Tú", "Lente, recuérdame comprar pan."), MemoryLine(7.8f, "Lente", "Listo, te lo recuerdo al llegar."), MemoryLine(11f, Memories.CAMERA, "Calle al atardecer, luces de los carros.")),
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
            listOf(MemoryLine(0.8f, "Luis", "«Fase 2» va en por hacer, ¿no?"), MemoryLine(4.2f, "Tú", "Sí, hasta que Ana apruebe el presupuesto."), MemoryLine(7.6f, "Luis", "Entonces la marco en rojo."), MemoryLine(10.8f, Memories.CAMERA, "Una pizarra con tres columnas y «Fase 2» en rojo.")),
            "«Fase 2» queda en por hacer, marcada en rojo, hasta que Ana apruebe el presupuesto.", 0xFF6C6B66, 0xFF2E2D2A,
        ),
        Memory(
            "r6", "Hoy · domingo 2 nov", "HOY", "15:05:09", "Llamada con el cliente", "Videollamada · 27 min",
            listOf(MemoryLine(0.8f, "Cliente", "¿La beta sale el viernes?"), MemoryLine(4.2f, "Tú", "Sí, si QA aprueba el jueves."), MemoryLine(7.6f, "Cliente", "¿Y el reporte semanal?"), MemoryLine(10.8f, "Tú", "Lo recibe cada lunes a las nueve.")),
            "La beta sale el viernes si QA aprueba el jueves; el reporte llega cada lunes a las nueve.", 0xFF2C3E66, 0xFF07080C,
        ),
    )
}
