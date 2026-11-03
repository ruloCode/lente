package app.lente.core

/** The card in the Dilo slot, or the photo and caption under it. */
data class View(val badge: String, val text: String, val ms: Long?, val photo: String?, val id: String?, val stages: Map<String, Long>, val at: Long = 0)

/**
 * Everything the screens show, rebuilt from the hub's events by `reduce`. Immutable: each event
 * returns a new state. The hub decides; this only keeps what it said, without duplicates, so a
 * reconnect (which replays the status and the day's history) changes nothing on screen.
 */
data class HubState(
    val status: Status = Status(),
    /** When `status` arrived on this phone's clock, for the elapsed timer. */
    val statusAt: Long = 0,
    /** Today's entries, oldest first, unique by `kind|at|text`. */
    val entries: List<Entry> = emptyList(),
    /** Text of the turn in progress. */
    val partial: String = "",
    /** The last Dilo or help card. */
    val card: Entry? = null,
    /** The last photo or live read. */
    val view: View? = null,
    val summary: Entry? = null,
    val meetings: List<MeetingSummary> = emptyList(),
    val language: Language = Language(emptyList(), emptyList(), 0, 0),
    val actions: Actions = Actions(),
    val recordedMs: Long = 0,
    val spend: Spend = Spend(),
    val level: Int = 0,
    /** Speaker labels that arrived before their turn. */
    val pendingSpeakers: Map<String, String> = emptyMap(),
    /**
     * The newest entry time when listening last resumed. The hub restarts transcription on every
     * resume and turn ids restart with it, so a speaker label only matches turns after this.
     */
    val labelsSince: Long = 0,
    /** The camera's described reads since live view last turned on, newest first. */
    val liveReads: List<View> = emptyList(),
    /** When live view last turned on, on this phone's clock, for the reads' elapsed times. */
    val liveSince: Long = 0,
) {
    /** Turns of this listening session, for En vivo. */
    /** The summaries the hub wrote during this session, newest first (the live view's Resumen tab). */
    val sessionSummaries: List<Entry> get() = entries.filter { it.kind == "summary" && it.at >= (status.session?.startedAt ?: Long.MAX_VALUE) }.sortedByDescending { it.at }
    val sessionTurns: List<Entry> get() = entries.filter { it.kind == "turn" && it.at >= (status.session?.startedAt ?: 0) }
    val turnCount: Int get() = entries.count { it.kind == "turn" }

    /** The card for En vivo's slot: only one from this session. */
    val sessionCard: Entry? get() = card?.takeIf { it.at >= (status.session?.startedAt ?: Long.MAX_VALUE) }

    /** Listening time on this phone's clock, from the hub's session view. */
    fun elapsedMs(now: Long): Long {
        val s = status.session ?: return 0
        return s.listenedMs + if (s.running) (now - statusAt).coerceAtLeast(0) else 0
    }

    fun reduce(event: HubEvent, now: Long): HubState = when (event) {
        is HubEvent.StatusEvent -> {
            val since = event.status.session?.startedAt
            val newSession = since != null && since != status.session?.startedAt
            val resumed = event.status.listening && !status.listening
            val liveStarted = event.status.live && !status.live
            copy(
                liveReads = if (liveStarted) emptyList() else liveReads,
                liveSince = if (liveStarted) now else liveSince,
                status = event.status,
                statusAt = now,
                partial = if (event.status.listening) partial else "",
                level = if (event.status.listening) level else 0,
                pendingSpeakers = if (newSession || resumed) emptyMap() else pendingSpeakers,
                labelsSince = if (resumed) entries.lastOrNull()?.at ?: labelsSince else labelsSince,
            )
        }
        is HubEvent.History -> {
            val merged = addAll(event.items)
            val lastCard = event.items.lastOrNull { it.kind == "cue" && !it.isPhoto }
            val lastSummary = event.items.lastOrNull { it.kind == "summary" }
            merged.copy(partial = "", card = lastCard ?: card, summary = lastSummary ?: summary)
        }
        is HubEvent.Partial -> if (!status.listening) this else copy(partial = event.text)
        is HubEvent.Speaker -> {
            val i = entries.indexOfLast { it.kind == "turn" && it.turnId == event.turnId && it.at > labelsSince }
            if (i < 0) copy(pendingSpeakers = pendingSpeakers + (event.turnId to event.speaker))
            else copy(entries = entries.toMutableList().also { it[i] = it[i].copy(speaker = event.speaker) })
        }
        is HubEvent.Stages -> copy(
            card = card?.let { if (it.id == event.id) it.copy(stages = event.stages) else it },
            view = view?.let { if (it.id == event.id) it.copy(stages = event.stages) else it },
            entries = entries.map { if (it.id == event.id) it.copy(stages = event.stages) else it },
        )
        is HubEvent.Level -> copy(level = if (status.listening) event.rms else 0)
        is HubEvent.Recorded -> copy(recordedMs = event.ms)
        is HubEvent.SpendEvent -> copy(spend = event.spend)
        is HubEvent.Meetings -> copy(meetings = event.items, language = event.language)
        is HubEvent.ActionsEvent -> copy(actions = event.actions)
        is HubEvent.Day -> day(event.entry)
        is HubEvent.Other -> this
    }

    private fun day(e: Entry): HubState = when {
        e.kind == "turn" -> addAll(listOf(e)).copy(partial = "")
        e.kind == "summary" -> addAll(listOf(e)).copy(summary = e)
        // A live frame: the picture moves on, what Lente last said about it stays.
        e.kind == "frame" -> copy(view = (view?.takeIf { it.badge == "EN VIVO" } ?: View("EN VIVO", "", null, null, null, emptyMap(), e.at)).copy(photo = e.photo))
        e.kind == "live" -> {
            val v = View("EN VIVO", e.text, e.ms, e.photo, e.id, e.stages, e.at)
            if (e.text.isBlank()) copy(view = v)
            // The description is of a frame a moment old: the list keeps that frame, the view the newest one.
            else addAll(listOf(e)).copy(view = v.copy(photo = view?.takeIf { it.badge == "EN VIVO" }?.photo ?: e.photo), liveReads = (listOf(v) + liveReads).take(MAX_LIVE_READS))
        }
        e.isPhoto -> {
            val v = View(if (e.label == "ON SCREEN") "EN PANTALLA" else "FOTO", e.text, e.ms, e.photo, e.id, e.stages, e.at)
            // A Mirar during live view joins the session's reads.
            val reads = if (status.live && e.text.isNotBlank()) (listOf(v) + liveReads).take(MAX_LIVE_READS) else liveReads
            (if (e.label == "ON SCREEN") addAll(listOf(e)) else this).copy(view = v, liveReads = reads)
        }
        e.kind == "cue" -> addAll(listOf(e)).copy(card = e)
        else -> this
    }

    private fun addAll(items: List<Entry>): HubState {
        val seen = entries.mapTo(HashSet()) { it.key }
        val pending = pendingSpeakers.toMutableMap()
        val fresh = items.filter { it.at > 0 && it.text.isNotBlank() && seen.add(it.key) }.map { e ->
            val late = e.turnId?.let { if (e.kind == "turn") pending.remove(it) else null }
            if (late != null && e.speaker == null) e.copy(speaker = late) else e
        }
        if (fresh.isEmpty()) return this
        val all = (entries + fresh).sortedBy { it.at }
        return copy(entries = if (all.size > MAX_ENTRIES) all.takeLast(MAX_ENTRIES) else all, pendingSpeakers = pending)
    }

    companion object {
        const val MAX_ENTRIES = 300
        /** Each read keeps its photo (about 30 KB of base64), so the list stays short. */
        const val MAX_LIVE_READS = 20
    }
}

/** What the app does because of an event, beyond showing it. */
sealed interface Effect {
    /** `POST /seen`: the hub times delivery from it. */
    data class Ack(val id: String) : Effect
    data object Vibrate : Effect
    data class Speak(val text: String, val priority: Voice.Priority) : Effect
}

/** Side effects of one live event, as the page has them: ack staged cards, buzz and speak a Dilo, speak reads and summaries. */
fun effectsOf(event: HubEvent): List<Effect> {
    if (event !is HubEvent.Day) return emptyList()
    val e = event.entry
    val out = mutableListOf<Effect>()
    if (e.id != null) out += Effect.Ack(e.id)
    when {
        e.kind == "cue" && e.isPhoto -> if (e.label == "ON SCREEN") out += Effect.Speak(e.text, Voice.Priority.Normal)
        e.kind == "cue" -> {
            out += Effect.Vibrate
            out += Effect.Speak(e.text, Voice.Priority.High)
        }
        e.kind == "live" && e.text.isNotBlank() -> out += Effect.Speak(e.text, Voice.Priority.Low)
        e.kind == "summary" -> out += Effect.Speak(e.text, Voice.Priority.Normal)
    }
    return out
}

/** The page's rules for reading aloud: a Dilo interrupts, a summary waits its turn, a live read is dropped when busy or within 7 s of the last. */
class Voice {
    enum class Priority { High, Normal, Low }

    private var lastLowAt = Long.MIN_VALUE / 2

    /** Whether to speak now; `interrupt` means stop what is being said first. */
    data class Decision(val speak: Boolean, val interrupt: Boolean)

    fun decide(priority: Priority, speaking: Boolean, now: Long): Decision = when (priority) {
        Priority.High -> Decision(true, speaking)
        Priority.Normal -> Decision(!speaking, false)
        Priority.Low -> if (speaking || now - lastLowAt < LOW_GAP_MS) Decision(false, false) else {
            lastLowAt = now
            Decision(true, false)
        }
    }

    companion object {
        const val LOW_GAP_MS = 7_000L
        /** The microphone stays muted this long after Lente stops speaking. */
        const val MUTE_TAIL_MS = 600L

        /** es-ES when the text looks Spanish, else en-US. */
        fun looksSpanish(text: String): Boolean {
            if (text.any { it in "áéíóúñ¿¡" }) return true
            val words = text.lowercase().split(Regex("[^a-záéíóúñü]+")).toSet()
            return listOf("que", "de", "el", "la", "los", "las", "es", "en", "un", "una", "por", "para", "con", "no", "sí").count { it in words } >= 2
        }
    }
}

/** The lines the page shows for the hub's state, in Spanish for the wearer. */
object Copy {
    /** The note while no clip is connected; Inicio leaves it to the device pill. */
    const val WAITING_FOR_CLIP = "Esperando el clip. Revisa que tenga batería y esté en la misma red Wi-Fi."

    fun pill(s: Status) = when {
        !s.listening -> "En pausa"
        !s.clip -> "Esperando"
        s.recordOnly -> "Grabando"
        else -> "Escuchando"
    }

    fun stateWord(s: Status) = when {
        !s.listening -> "En pausa"
        !s.clip -> "Sin clip"
        s.recordOnly -> "Grabando"
        else -> "Escuchando"
    }

    fun device(s: Status) = when {
        s.phoneIsDevice -> "Teléfono conectado"
        s.clip -> "Clip conectado"
        else -> "Sin clip"
    }

    fun mode(s: Status) = if (s.mode == "camera") "Audio y cámara" else "Solo audio"

    /** The pause note and its button, or null while listening. */
    fun pause(s: Status): Pair<String, String>? {
        if (s.listening) return null
        val p = s.pause ?: return null
        val text = when (p.reason) {
            "idle" -> "En pausa: ${p.min} min sin que " + if (p.basis == "wearer") "hablaras" else "nadie hablara"
            "start" -> "Lente está en pausa: no envía nada hasta que empieces."
            else -> "En pausa."
        }
        return text to if (p.reason == "start") "Empezar a escuchar" else "Seguir escuchando"
    }

    /** The one-line status note; first match wins. */
    fun note(s: Status): String? = when {
        s.clipError.isNotEmpty() && !s.clip -> "El hub rechazó el clip: ${s.clipError}."
        s.asr.contains("MODEL_API_KEY") -> "Falta la clave de Meta: solo se ven la cámara y el nivel de audio."
        s.modelDown.isNotEmpty() -> "Meta no responde (${s.modelDown}): revisa la clave en el hub."
        s.databaseDown.isNotEmpty() -> when (s.databaseDown) {
            "paused" -> "La memoria en la nube está pausada: reactiva el proyecto en Supabase. Lo nuevo no se guarda hasta entonces."
            "refused" -> "El hub no puede entrar a la memoria en la nube: revisa la clave de Supabase."
            "unreachable" -> "La memoria en la nube no responde. Lo nuevo no se guarda hasta que vuelva."
            else -> "La memoria en la nube falla."
        }
        !s.clip -> WAITING_FOR_CLIP
        s.listening && s.asr != "listening" && !s.asr.startsWith("listening ·") -> when {
            s.asr.startsWith("connecting") -> "Conectando la transcripción…"
            s.asr.startsWith("transcription closed") -> "Se cortó la transcripción. Reconectando…"
            s.asr.startsWith("transcription connection error") -> "No se pudo conectar la transcripción. Reintentando…"
            s.asr.startsWith("transcription error") -> "Error de transcripción: " + s.asr.removePrefix("transcription error:").trim()
            s.asr.isBlank() -> null
            else -> s.asr
        }
        else -> null
    }

    /** Speaker chip on the timeline: "Tú" for the wearer, else the label. */
    fun speaker(e: Entry, wearer: String): String = when (e.kind) {
        "summary" -> "✳"
        "cue" -> "→"
        "live" -> "◉"
        else -> when {
            e.speaker != null && e.speaker == wearer && wearer.isNotEmpty() -> "Tú"
            !e.speaker.isNullOrEmpty() -> e.speaker
            else -> "·"
        }
    }

    /** The muted line under a card: why, time and model. */
    fun cardMeta(e: Entry): String = listOfNotNull(
        Format.why(e.why),
        e.ms?.let { "en $it ms" },
        if (e.model != null) listOfNotNull(e.provider, e.model).joinToString(" · ") else null,
    ).joinToString(" · ")

    val MEETING_STATE = mapOf("running" to "en curso", "extracting" to "sacando notas…", "too-short" to "muy corta, sin notas", "failed" to "no se pudieron sacar notas")

    val TOOL = mapOf("create_task" to "Crear una tarea", "create_reminder" to "Crear un recordatorio", "draft_email" to "Redactar un correo", "run_agent" to "Que lo haga un agente")

    val BRIEFING = mapOf("owed" to "Le debes", "open" to "Quedó abierto", "term" to "Palabras que pueden salir", "phrase" to "Frases a la mano")
}
