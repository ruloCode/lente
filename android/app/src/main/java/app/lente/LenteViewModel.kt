package app.lente

import android.app.Activity
import android.app.Application
import android.net.Uri
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.lente.capture.Capture
import app.lente.capture.CaptureService
import app.lente.core.Account
import app.lente.core.Terms
import app.lente.core.TermsGate
import app.lente.core.AskStream
import app.lente.core.Briefing
import app.lente.core.ChatJson
import app.lente.core.ChatHistory
import app.lente.core.ChatThreadView
import app.lente.core.ChatLine
import app.lente.core.Effect
import app.lente.core.Fact
import app.lente.core.HubAddress
import app.lente.core.HubEvent
import app.lente.core.HubJson
import app.lente.core.HubState
import app.lente.core.MeetingDetail
import app.lente.core.Projects
import app.lente.core.SearchResult
import app.lente.core.Sight
import app.lente.core.SightView
import app.lente.core.TraceStep
import app.lente.core.Voice
import app.lente.core.RecordSheetRequest
import app.lente.core.VoiceEffect
import app.lente.core.VoiceEvents
import app.lente.core.VoicePhase
import app.lente.core.VoiceView
import app.lente.platform.VoiceClient
import app.lente.ui.PracticeModel
import app.lente.core.effectsOf
import app.lente.platform.Answer
import app.lente.platform.GoogleAccount
import app.lente.platform.HubClient
import app.lente.platform.Prefs
import app.lente.platform.SignInFailed
import app.lente.platform.Speech
import app.lente.platform.SightSpeaker
import app.lente.platform.Locator
import app.lente.core.Place
import app.lente.core.LineKind
import app.lente.platform.Stream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/** Where the wearer is. Reunion carries the meeting and, optionally, the turn to show. */
/** How long the record sheet waits for the phone to connect as the device. */
private const val PHONE_READY_MS = 8_000L

sealed interface Screen {
    data object Ahora : Screen
    data object Reuniones : Screen
    data class Reunion(val id: String, val turnId: String? = null) : Screen
    data object Acciones : Screen
    data object Memoria : Screen
    data object Dispositivos : Screen
    data object Ajustes : Screen
    data object Proyectos : Screen
    /** The agents connected to Lente and their jobs (add-home-dock). */
    data object Conexiones : Screen
    /** Everything that happened and what waits for the wearer (add-notifications). */
    data object Actividad : Screen
    data class Proyecto(val id: String) : Screen
    data class Pronto(val what: String) : Screen
}

/** How the app is linked to the hub. */
sealed interface Link {
    data object None : Link
    data object Connecting : Link
    data object Live : Link
    data class Reconnecting(val why: String) : Link
    data object Unpaired : Link
}

class LenteViewModel(app: Application) : AndroidViewModel(app) {
    val prefs = Prefs(app)
    /** The signed-in Google account, when there is one (add-accounts 7.1); a laptop hub needs none. */
    val account = GoogleAccount.of(app)

    /** The preview terms (ship-hackathon 3.1): open while the hub answers 428 `needsTerms` for this account. */
    val terms = MutableStateFlow(TermsGate())

    /** A client for a hub: the pairing cookie, and the account's bearer with one refresh after a 401; a 428 opens the terms. */
    private fun hubClient(base: String) = HubClient(base, { prefs.cookie }, { account.accessToken() }, { account.refreshAfter401() }, { signedOutByHub() }, ::termsAnswer)
    private var client: HubClient? = null
    private var stream: Job? = null

    private val _hub = MutableStateFlow(HubState())
    val hub: StateFlow<HubState> = _hub
    private val _link = MutableStateFlow<Link>(Link.None)
    val link: StateFlow<Link> = _link
    private val _screen = MutableStateFlow<List<Screen>>(listOf(Screen.Ahora))
    val stack: StateFlow<List<Screen>> = _screen
    val readAloud = MutableStateFlow(prefs.readAloud)
    /** En vivo is open over everything. */
    val liveOpen = MutableStateFlow(false)
    /** The camera's live view is open over everything. */
    val cameraOpen = MutableStateFlow(false)
    val narrateLive = MutableStateFlow(prefs.narrateLive)
    /** The chat with Lente on Inicio: its messages for this run of the app. */
    val chat = MutableStateFlow<List<ChatLine>>(emptyList())
    private var chatIds = 0L
    /** "system", "light" or "dark". */
    val theme = MutableStateFlow(prefs.theme)
    val facts = MutableStateFlow<List<Fact>>(emptyList())
    val detail = MutableStateFlow<MeetingDetail?>(null)
    /** The wearer's projects for Inicio and the Proyectos screen, and the one open (add-projects). */
    val projects = MutableStateFlow<List<Projects.Summary>>(emptyList())
    val project = MutableStateFlow<Projects.Detail?>(null)
    val trace = MutableStateFlow<List<TraceStep>?>(null)
    val search = MutableStateFlow<List<SearchResult>?>(null)
    val briefing = MutableStateFlow<Briefing?>(null)
    /** One-line message for the wearer (a failed help request, a refused action…), cleared after a few seconds. */
    val toast = MutableStateFlow<String?>(null)
    val busy = MutableStateFlow<Set<String>>(emptySet())

    /** Lente's own voice rate, set in Ajustes (add-sight-mode). */
    val speechRate = MutableStateFlow(prefs.speechRate)
    private val speech = Speech(app, { speechRate.value }) { text -> post("/narrated", JSONObject().put("text", text)) }
    private val vibrator = app.getSystemService(Vibrator::class.java)

    val hubAddress get() = client?.base ?: prefs.hub

    init {
        // A signed-in phone with no hub yet follows the cloud hub it signed in to (ship-hackathon 3.1).
        (prefs.hub ?: BuildConfig.CLOUD_HUB.takeIf { account.signedIn && it.isNotEmpty() }?.also { prefs.hub = it })?.let { connect(it) }
    }

    // --- Connection -------------------------------------------------------------------------

    /** Checks an address, and on success remembers it and follows its events. Returns why it failed. */
    suspend fun tryHub(input: String): String? {
        val base = HubAddress.normalize(input) ?: return "Eso no parece una dirección: escribe la IP de la computadora, por ejemplo 192.168.1.20."
        if (base.startsWith("http://") && !HubAddress.isLocal(base)) return "Sin cifrar solo en tu red: para un hub en internet escribe https://."
        val test = hubClient(base)
        val health = test.health()
        if (health.code == 0) return "No pude llegar al hub en $base. Revisa que esté corriendo y en la misma red Wi-Fi."
        if (health.code !in 200..503) return "En $base responde algo que no es Lente (${health.code})."
        prefs.hub = base
        connect(base)
        return null
    }

    suspend fun pair(code: String): Boolean {
        val c = client ?: return false
        val cookie = c.pair(code.trim()) ?: return false
        prefs.cookie = cookie
        connect(c.base)
        return true
    }

    fun connect(base: String) {
        // The phone streams to one hub: moving to another stops it.
        if (client != null && client?.base != base) CaptureService.stop(getApplication())
        stream?.cancel()
        _hub.value = HubState()
        val c = hubClient(base)
        client = c
        _link.value = Link.Connecting
        stream = viewModelScope.launch {
            c.events().collect { item ->
                when (item) {
                    Stream.Open -> _link.value = Link.Live
                    is Stream.Down -> _link.value = Link.Reconnecting(item.why)
                    Stream.Unpaired -> _link.value = Link.Unpaired
                    is Stream.Event -> onEvent(item.event)
                }
            }
        }
    }

    fun forgetHub() {
        stream?.cancel()
        CaptureService.stop(getApplication())
        client = null
        prefs.hub = null
        prefs.cookie = null
        _hub.value = HubState()
        _link.value = Link.None
    }

    private fun onEvent(event: HubEvent) {
        val before = _hub.value
        val after = before.reduce(event, System.currentTimeMillis())
        _hub.value = after
        if (event is HubEvent.Meetings) loadFacts()
        // Something that the activity feed shows changed: look for what to alert (add-notifications).
        if (event is HubEvent.Meetings || event is HubEvent.ActionsEvent || event is HubEvent.NotificationsEvent) checkFeedSoon()
        // A new listening session opens En vivo, unless the wearer collapsed it for that session.
        val since = after.status.session?.startedAt
        if (event is HubEvent.StatusEvent && since != null && since != before.status.session?.startedAt && before.statusAt != 0L && after.status.session?.running == true && prefs.collapsedSession != since) liveOpen.value = true
        // The phone was the device and the hub now has the clip: release the microphone.
        if (event is HubEvent.StatusEvent && after.status.clipIsDevice && Capture.state.value is Capture.State.On) CaptureService.stop(getApplication())
        // Ver open (add-sight-mode): its own rules speak the look's answers and the live reads.
        val sightSpeaks = sightOpen.value && event is HubEvent.Day && (event.entry.kind == "live" || Sight.isLookAnswer(event.entry))
        if (sightSpeaks) onSight((event as HubEvent.Day).entry)
        for (effect in effectsOf(event)) when (effect) {
            is Effect.Ack -> post("/seen", JSONObject().put("id", effect.id))
            Effect.Vibrate -> if (!after.status.recordOnly && !sightSpeaks) vibrator?.vibrate(VibrationEffect.createOneShot(VIBRATE_MS, VibrationEffect.DEFAULT_AMPLITUDE))
            // Live descriptions (low priority) follow Narrar en voz alta; everything else follows Voz.
            is Effect.Speak -> if (!sightSpeaks && if (effect.priority == Voice.Priority.Low) narrateLive.value else readAloud.value) speech.say(effect.text, effect.priority)
        }
        if (event is HubEvent.Day && event.entry.kind == "cue" && !event.entry.isPhoto) _screen.value = listOf(Screen.Ahora)
    }

    // --- Navigation -------------------------------------------------------------------------

    fun go(screen: Screen) {
        _screen.value = if (screen is Screen.Reunion || screen is Screen.Proyecto) _screen.value + screen else listOf(screen)
        when (screen) {
            is Screen.Reunion -> openMeeting(screen.id)
            is Screen.Proyecto -> openProject(screen.id)
            Screen.Proyectos, Screen.Ahora -> loadProjects()
            Screen.Memoria -> loadFacts()
            Screen.Conexiones -> { loadAccount(); loadJobs() }
            Screen.Actividad -> loadFeed()
            else -> {}
        }
    }

    /** Back: closes En vivo, then a meeting, then returns to Ahora. False when there is nowhere to go. */
    fun back(): Boolean {
        if (sightOpen.value) { closeSight(); return true }
        if (cameraOpen.value) { cameraOpen.value = false; return true }
        if (liveOpen.value) { closeLive(); return true }
        val s = _screen.value
        return when {
            s.size > 1 -> {
                _screen.value = s.dropLast(1)
                (_screen.value.last() as? Screen.Reunion)?.let { openMeeting(it.id) }
                (_screen.value.last() as? Screen.Proyecto)?.let { openProject(it.id) }
                true
            }
            s.last() != Screen.Ahora -> { _screen.value = listOf(Screen.Ahora); true }
            else -> false
        }
    }

    fun openLive() { liveOpen.value = true }

    /** Opens the camera's live view, turning live reads on if they are off. */
    fun openCamera() {
        if (!_hub.value.status.live) setLive(true)
        cameraOpen.value = true
    }

    fun closeCamera() { cameraOpen.value = false }

    /** A question to Lente: shown at once, answered from the memory with its sources when the hub replies. */
    fun askLente(question: String) {
        val q = question.trim()
        if (q.isEmpty() || chat.value.lastOrNull()?.busy == true) return
        val before = chat.value
        val asked = ChatLine(++chatIds, true, q)
        val waiting = ChatLine(++chatIds, false, "", pending = true)
        if (client == null) {
            chat.value = before + asked + waiting.copy(text = "No hay hub conectado: revisa Ajustes.", pending = false, found = false)
            return
        }
        chat.value = before + asked + waiting
        val c = client ?: return
        viewModelScope.launch {
            // The answer streams in as the hub writes it (add-memory-engine 4.1); an older hub answers JSON at once.
            val a = c.postStream("/ask", ChatJson.request(q, before, chatThread.value).apply { chatProject.value?.let { put("project", it) } }) { event, data ->
                withContext(Dispatchers.Main) { chat.value = chat.value.map { if (it.id == waiting.id) AskStream.apply(it, event, data) else it } }
            }
            val reply = runCatching { ChatJson.answer(waiting.id, a.text) }.getOrNull()
                ?: ChatLine(waiting.id, false, when {
                    a.code == 404 -> "Este hub todavía no tiene el chat: actualízalo para preguntarle a Lente."
                    a.ok -> "No entendí la respuesta del hub."
                    else -> "No pude preguntarle al hub; revisa la conexión."
                }, found = false)
            chat.value = chat.value.map { if (it.id == waiting.id) reply else it }
        }
    }

    /** Reads one of Lente's answers aloud, whatever Voz says. */
    fun speak(text: String) = speech.say(text, Voice.Priority.Normal)

    /** The conversation in the chat, a new thread each time it starts over; the hub keeps it under this id (add-home-dock). */
    val chatThread = MutableStateFlow(java.util.UUID.randomUUID().toString())

    fun clearChat() { chat.value = emptyList(); chatThread.value = java.util.UUID.randomUUID().toString() }

    /** The chat's history: null while it loads, then the hub's threads; `historyNote` says why it is empty when it failed. */
    val history = MutableStateFlow<List<ChatThreadView>?>(null)
    val historyNote = MutableStateFlow<String?>(null)

    fun loadHistory() {
        val c = client ?: run { history.value = emptyList(); historyNote.value = "No hay hub conectado: revisa Ajustes."; return }
        history.value = null
        historyNote.value = null
        viewModelScope.launch {
            val a = c.get("/chat/threads")
            val parsed = if (a.ok) runCatching { ChatHistory.threads(a.text, firstId = chatIds + 1) }.getOrNull() else null
            history.value = parsed ?: emptyList()
            historyNote.value = when {
                parsed != null -> null
                a.code == 404 -> "Este hub todavía no guarda el historial: actualízalo."
                else -> "No pude traer el historial; revisa la conexión."
            }
        }
    }

    /** Opens a past conversation in the chat; the next question continues its thread. */
    fun openThread(t: ChatThreadView) {
        chatIds = maxOf(chatIds, t.lines.maxOfOrNull { it.id } ?: chatIds)
        chat.value = t.lines
        chatThread.value = t.id
    }

    /** Detener en vivo: live reads off, back to where the wearer was. */
    fun stopCamera() {
        setLive(false)
        cameraOpen.value = false
        speech.stop()
    }

    fun setTheme(mode: String) {
        theme.value = mode
        prefs.theme = mode
    }

    fun setNarrateLive(on: Boolean) {
        narrateLive.value = on
        prefs.narrateLive = on
        if (!on) speech.stop()
    }

    fun setSpeechRate(rate: Float) {
        prefs.speechRate = rate
        speechRate.value = prefs.speechRate
    }

    // --- Ver (add-sight-mode) -----------------------------------------------------------------

    /** The Ver screen is open over everything but the voice screen. */
    val sightOpen = MutableStateFlow(false)
    val sight = MutableStateFlow(SightView())
    /** The hub's assist mode before Ver (assist or record), set again on leaving. */
    private var modeBeforeSight = "assist"
    private var lookTimeout: Job? = null

    /** Ver's voice: the hub's Colombian voice, the phone's as fallback; made the first time Ver opens. */
    private var sightSpeaker: SightSpeaker? = null
    /** Ver's latest spoken lines, so the microphone hearing them is not shown as the wearer's words. */
    private var sightSaid: List<String> = emptyList()
    /** Ver is saying a look's answer or a narration now (the phone's microphone hears silence). */
    private var sightAmbient = false
    /** This Ver session started with the welcome, so the live reads wait for Lente to turn them on. */
    private var sightIntro = false
    /** Ver turned the live reads off for the welcome and the agent has not turned them back on. */
    private var liveOffForIntro = false

    private fun speaker(): SightSpeaker = sightSpeaker ?: SightSpeaker(
        getApplication(), viewModelScope,
        fetch = { text -> client?.postAudio("/tts", JSONObject().put("text", text).put("voice", Sight.PERSONA), TTS_CALL_MS) ?: (0 to null) },
        rate = { speechRate.value },
        narrated = { text -> sightSaid = Sight.remember(sightSaid, text); post("/narrated", JSONObject().put("text", text)) },
        screenReader = { speech.screenReader },
        announce = speech::announce,
        holdNarration = { voice.value.let { v -> (v.partial.isNotBlank() && !Sight.isEcho(v.partial, sightSaid)) || Sight.replying(v.phase) } },
        ambient = { kind ->
            val on = kind != null
            sightAmbient = on
            sight.value = sight.value.copy(saying = kind)
            if (on) voiceClient?.deaf = true
            else viewModelScope.launch { delay(Voice.MUTE_TAIL_MS); if (!sightAmbient) voiceClient?.deaf = false }
        },
    ).also { sightSpeaker = it }

    /**
     * Opens Ver: the hub's sight mode (camera and live reads on, no Dilo cues), then a hands-free
     * conversation with Ver's companion. The first time, Lente introduces itself and asks before it
     * narrates, so the live reads stay off until it turns them on.
     */
    fun openSight(phone: Boolean = false) {
        val c = client ?: return say("No hay hub conectado: revisa Ajustes.")
        _hub.value.status.assistMode.takeIf { it == "assist" || it == "record" }?.let { modeBeforeSight = it }
        val intro = !prefs.sightMet
        sightIntro = intro
        liveOffForIntro = false
        speech.stop()
        speaker()
        // Ver narrates on its own switch, so Narrar outside it stays as the wearer left it.
        sight.value = SightView(narrating = !intro)
        sightOpen.value = true
        post(if (phone) "/device/prefer/phone" else "/device/prefer/any")
        viewModelScope.launch {
            failed(c.post("/assist-mode/sight"), "abrir Ver")
            if (intro && sightOpen.value) { c.post("/live/off"); liveOffForIntro = true }
            if (sightOpen.value) startSightVoice(intro)
        }
    }

    /** Ver's conversation: the `/voice` session with the sight persona, spoken through Ver's voice. */
    private suspend fun startSightVoice(intro: Boolean) {
        val c = client ?: return
        voiceClient?.shutdown()
        voice.value = VoiceView()
        val token = account.accessToken()
        if (!sightOpen.value) return
        voiceClient = VoiceClient(getApplication(), c.base, prefs.cookie, token, ::onVoiceEvent, start = VoiceEvents.start(Sight.PERSONA, intro), voice = speaker()) { why ->
            voice.value = voice.value.copy(phase = VoicePhase.Ended, error = why ?: voice.value.error)
        }.also { it.handsFree = true }
    }

    /** Salir: the conversation ends, and the hub goes back to the mode Ver started from (Asistir or Solo grabar). */
    fun closeSight() {
        // Recording in the quiet belongs to Ver: it ends with it.
        if (sight.value.quiet) post("/listen/off")
        sightOpen.value = false
        lookTimeout?.cancel()
        voiceClient?.shutdown()
        voiceClient = null
        voice.value = VoiceView()
        sightSpeaker?.stop()
        speech.stop()
        post("/assist-mode/$modeBeforeSight") { failed(it, "salir de Ver") }
    }

    /** One tap: a fresh look, answered with a VER cue. */
    fun sightLook() {
        sight.value = Sight.looking(sight.value)
        lookTimeout?.cancel()
        lookTimeout = viewModelScope.launch { delay(Sight.LOOK_TIMEOUT_MS); sight.value = Sight.lookEnded(sight.value) }
        post("/look") { if (!it.ok) { lookTimeout?.cancel(); sight.value = Sight.lookEnded(sight.value); failed(it, "mirar") } }
    }

    /** Long press: pause or resume the listening; after the conversation dropped, start it again. */
    fun sightListen() {
        // In the quiet a long press is the way back to the conversation.
        if (sight.value.quiet) return sightTalkAgain()
        val phase = voice.value.phase
        if (voiceClient == null || phase == VoicePhase.Ended) {
            viewModelScope.launch { startSightVoice(intro = false) }
            return
        }
        voicePause()
    }

    /** Two-finger tap: pause or resume the live reads' narration (a look is still answered out loud). */
    fun sightNarration() = setSightNarration(!sight.value.narrating)

    private fun setSightNarration(on: Boolean, byAgent: Boolean = false) {
        // In the quiet the agent's switch waits for the way back; the wearer's own tap counts at once.
        if (byAgent && sight.value.quiet) { sight.value = sight.value.copy(narratingBeforeQuiet = on); return }
        sight.value = Sight.narration(sight.value, on)
        if (!on) sightSpeaker?.stopNarration()
        // The welcome turned the live reads off; the agent turns them on itself, the wearer through here.
        if (on && liveOffForIntro) { liveOffForIntro = false; if (!byAgent) post("/live/on") }
    }

    /**
     * «Grabar en silencio»: once Lente has finished what it is saying, the conversation closes and the
     * hub records (audio and Recuerdos; its live reads go on, unspoken). A long press talks again.
     */
    fun sightQuiet() {
        if (!sightOpen.value) return
        sight.value = Sight.quiet(sight.value)
        sightSpeaker?.stopNarration()
        val session = voiceClient
        viewModelScope.launch {
            delay(QUIET_SETTLE_MS)
            val until = System.currentTimeMillis() + QUIET_MAX_WAIT_MS
            // The reply that turned the quiet on may still be on its way: wait for the hub to listen again and for Ver's voice to finish.
            while ((Sight.replying(voice.value.phase) || sightSpeaker?.conversing == true) && System.currentTimeMillis() < until) delay(QUIET_SETTLE_MS)
            if (!sightOpen.value || !sight.value.quiet) return@launch
            if (session != null && voiceClient === session) {
                session.shutdown()
                voiceClient = null
                voice.value = VoiceView(phase = VoicePhase.Ended)
            }
            post("/listen/on") { failed(it, "grabar en silencio") }
        }
    }

    /** «Volver a conversar»: out of the quiet, narration as it was; from the wearer, recording stops and the conversation opens again. */
    fun sightTalkAgain(byAgent: Boolean = false) {
        if (!sight.value.quiet) return
        sight.value = Sight.talkAgain(sight.value)
        if (byAgent) return
        post("/listen/off")
        if (voiceClient == null || voice.value.phase == VoicePhase.Ended) viewModelScope.launch { startSightVoice(intro = false) }
    }

    /** «¿Dónde estoy?»: the phone's position and address, sent only in the answer to the session that asked. */
    private fun answerLocate(id: String) {
        val session = voiceClient ?: return
        viewModelScope.launch {
            val (fix, why) = withTimeoutOrNull(Place.REPLY_WITHIN_MS - LOCATE_MARGIN_MS) { Locator.locate(getApplication()) } ?: (null to Place.NO_FIX)
            session.send(if (fix != null) Place.reply(id, fix) else Place.failure(id, why ?: Place.NO_FIX))
        }
    }

    /** Says the latest description again, in full. */
    fun sightRepeat() {
        val text = sight.value.text
        if (text.isNotBlank()) Sight.chunks(text).forEach { speaker().say(it, LineKind.Look) }
    }

    /** «Volver a conocernos»: the next time Ver opens, Lente introduces itself again. */
    fun meetAgain() {
        prefs.sightMet = false
        say("La próxima vez que abras Ver, Lente se presentará otra vez.")
    }

    private fun onSight(e: app.lente.core.Entry) {
        val (next, say) = Sight.reduce(sight.value, e)
        if (Sight.isLookAnswer(e)) lookTimeout?.cancel()
        sight.value = next
        say?.let { s -> s.parts.forEach { speaker().say(it, if (s.urgent) LineKind.Look else LineKind.Narration) } }
    }

    /** «Sesión de invitado» (add-sight-mode): the hub keeps no media, day entries or memory while on. */
    fun setGuest(on: Boolean) = post(if (on) "/guest/on" else "/guest/off") { failed(it, "cambiar la sesión de invitado") }

    fun closeLive() {
        liveOpen.value = false
        _hub.value.status.session?.startedAt?.let { prefs.collapsedSession = it }
    }

    // --- Practicar (add-practice-mode) ---------------------------------------------------------
    // The phone on the piano hears each note (PracticeModel, PitchListener); the hub keeps and coaches the
    // attempt; the line is said in Ver's Colombian voice (/tts voice sight), the phone's voice as the fallback.

    val practiceOpen = MutableStateFlow(false)
    val practice = PracticeModel(
        viewModelScope,
        fetchLessons = { client?.get("/practice/lessons")?.takeIf { it.ok }?.text },
        postAttempt = { body -> client?.post("/practice/attempt", body)?.takeIf { it.ok }?.text },
        speak = { line -> speaker().say(line, LineKind.Reply) },
        stopSpeaking = { sightSpeaker?.stop() },
    )

    /** Opens Practicar on a lesson (the first, or `lessonId`), closing Ver first: both speak and listen. */
    fun openPractice(lessonId: String? = null) {
        if (sightOpen.value) closeSight()
        practiceOpen.value = true
        practice.open(lessonId)
    }

    fun closePractice() {
        practice.close()
        practiceOpen.value = false
    }

    // --- Hub calls ----------------------------------------------------------------------------

    private fun post(path: String, body: JSONObject? = null, then: (Answer) -> Unit = {}) {
        val c = client ?: return
        viewModelScope.launch { then(c.post(path, body)) }
    }

    /** A one-line notice that goes away by itself. */
    fun say(text: String) {
        toast.value = text
        viewModelScope.launch { delay(TOAST_MS); if (toast.value == text) toast.value = null }
    }

    private fun failed(a: Answer, what: String) { if (!a.ok) say("No se pudo $what (${if (a.code == 0) "sin conexión" else a.code}).") }

    fun setListening(on: Boolean) = post(if (on) "/listen/on" else "/listen/off") {
        // A hub at its cap of people listening answers 503 with a message for the wearer.
        val busy = if (it.code == 503) runCatching { JSONObject(it.text).optString("message") }.getOrNull() else null
        if (!busy.isNullOrEmpty()) say(busy) else failed(it, if (on) "empezar a escuchar" else "pausar")
    }
    fun toggleListening() = setListening(!_hub.value.status.listening)
    fun stopSession() = post("/session/stop") { failed(it, "terminar") }
    fun setAssist(mode: String) = post("/assist-mode/$mode")
    /** «Guardar audio» / «Guardar fotos» (add-media-archive 4.1): off stops keeping at once. */
    fun setMedia(kind: String, on: Boolean) = post("/media/$kind/${if (on) "on" else "off"}") { failed(it, "cambiar lo que se guarda") }
    fun setMediaRetention(days: Int) = post("/media/retention/$days") { failed(it, "cambiar cuánto se guarda") }

    private var player: android.media.MediaPlayer? = null

    /** «Escuchar»: the segment's kept audio, streamed from the hub with this phone's sign-in; never stored here. */
    fun playMedia(path: String) {
        val c = client ?: return
        viewModelScope.launch {
            val headers = c.authHeaders()
            runCatching {
                player?.release()
                player = android.media.MediaPlayer().apply {
                    setDataSource(getApplication(), Uri.parse(c.base + path), headers)
                    setOnPreparedListener { it.start() }
                    setOnCompletionListener { it.release(); if (player === it) player = null }
                    setOnErrorListener { mp, _, _ -> mp.release(); if (player === mp) player = null; say("No pude reproducir ese audio."); true }
                    prepareAsync()
                }
            }.onFailure { say("No pude reproducir ese audio.") }
        }
    }
    // --- Recuerdos: the wearer's moments with their photos and speech audio (GET /memories) ---------

    val memories = MutableStateFlow<List<app.lente.core.Memory>?>(null)
    fun loadMemories() {
        val c = client ?: return
        viewModelScope.launch {
            c.get("/memories").takeIf { it.ok }?.let { a -> runCatching { app.lente.core.Memories.fromJson(a.text, System.currentTimeMillis()) }.getOrNull()?.let { memories.value = it } }
        }
    }

    /** Decoded photos by hub path, halved (512 px wide): enough for the visor and Revivir. */
    private val frames = android.util.LruCache<String, androidx.compose.ui.graphics.ImageBitmap>(80)
    suspend fun frame(path: String): androidx.compose.ui.graphics.ImageBitmap? {
        frames.get(path)?.let { return it }
        val bytes = client?.bytes(path) ?: return null
        val bmp = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
            android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, android.graphics.BitmapFactory.Options().apply { inSampleSize = 2 })
        } ?: return null
        return bmp.asImageBitmap().also { frames.put(path, it) }
    }

    /** Revivir's sound: the scene's kept speech from `offsetMs`, one at a time. */
    private var scenePlayer: android.media.MediaPlayer? = null
    private var scenePath: String? = null
    fun playScene(path: String, offsetMs: Int) {
        val c = client ?: return
        stopScene()
        scenePath = path
        viewModelScope.launch {
            val headers = c.authHeaders()
            if (scenePath != path) return@launch
            runCatching {
                scenePlayer = android.media.MediaPlayer().apply {
                    setDataSource(getApplication(), Uri.parse(c.base + path), headers)
                    setOnPreparedListener { if (scenePlayer === it) { if (offsetMs > 0) it.seekTo(offsetMs); it.start() } }
                    setOnErrorListener { mp, _, _ -> mp.release(); if (scenePlayer === mp) scenePlayer = null; true }
                    prepareAsync()
                }
            }
        }
    }
    fun stopScene() {
        scenePath = null
        scenePlayer?.runCatching { stop(); release() }
        scenePlayer = null
    }

    fun setMode(mode: String) = post("/mode/$mode")
    fun look() = post("/look") { failed(it, "mirar") }
    fun setLive(on: Boolean) = post(if (on) "/live/on" else "/live/off")
    fun summary() = post("/summary") { failed(it, "pedir el resumen") }
    fun everyQuestion(on: Boolean) = post(if (on) "/cues/all" else "/cues/addressed")
    fun startMeeting(title: String) = post("/meeting/start", JSONObject().put("title", title.trim())) { failed(it, "iniciar la reunión") }
    fun endMeeting() = post("/meeting/end") { failed(it, "terminar la reunión") }
    fun saveNames(names: String) = post("/profile", JSONObject().put("names", names)) { failed(it, "guardar tu nombre") }

    fun setReadAloud(on: Boolean) {
        readAloud.value = on
        prefs.readAloud = on
        if (on) speech.say("Voz activada.", app.lente.core.Voice.Priority.High) else speech.stop()
    }

    fun help(kind: String) {
        busy.update { it + "help-$kind" }
        post("/help", JSONObject().put("kind", kind)) { a ->
            busy.update { it - "help-$kind" }
            if (!a.ok) say(runCatching { HubJson.help(a.text).message }.getOrNull()?.ifBlank { null } ?: "No se pudo pedir la ayuda; prueba otra vez.")
        }
    }

    // --- The account (add-accounts 7.3) -----------------------------------------------------------

    val signedIn = MutableStateFlow(account.signedIn)
    val accountInfo = MutableStateFlow<Account.Info?>(null)
    val devices = MutableStateFlow<List<Account.Device>>(emptyList())
    /** A clip token just made: shown once, then gone when the wearer leaves the screen. */
    val newClipToken = MutableStateFlow<String?>(null)

    fun signIn(activity: Activity) = viewModelScope.launch {
        try {
            account.signIn(activity)
            // A fresh install signs in to the cloud hub: no address to type, no pairing, no intro.
            val base = client?.base ?: BuildConfig.CLOUD_HUB.also { prefs.hub = it }
            prefs.welcomed = true
            connect(base)
            signedIn.value = true
            loadAccount()
        } catch (e: SignInFailed) {
            say(e.message ?: "No se pudo iniciar sesión.")
        }
    }

    fun loadAccount() {
        val c = client ?: return
        if (!account.signedIn) return
        viewModelScope.launch {
            c.get("/account").let { if (it.ok) accountInfo.value = runCatching { Account.info(it.text) }.getOrNull() }
            c.get("/devices").let { if (it.ok) devices.value = runCatching { Account.devices(it.text) }.getOrDefault(emptyList()) }
        }
    }

    fun newClip(label: String) = post("/devices", JSONObject().put("kind", "clip").put("label", label.ifBlank { "Clip" })) {
        if (it.ok) { newClipToken.value = Account.createdToken(it.text); loadAccount() } else failed(it, "crear el token del clip")
    }

    /** An agent token (add-agent-bridge) with the access the wearer picked; shown once like a clip's. */
    fun newAgent(label: String, access: String) {
        val body = JSONObject().put("kind", "mcp").put("label", label.ifBlank { if (access == "bridge") "Puente" else "Agente" }).put("scopes", JSONArray(Account.scopesFor(access)))
        post("/devices", body) { if (it.ok) { newClipToken.value = Account.createdToken(it.text); loadAccount() } else failed(it, "crear el token del agente") }
    }

    fun forgetClipToken() { newClipToken.value = null }

    // --- The activity feed (add-notifications) ---------------------------------------------------

    /** The feed Actividad shows: the hub's, or derived on the phone for a hub without it (`fromHub` false). */
    val feed = MutableStateFlow<app.lente.core.Feed?>(null)
    /** The read mark kept on the phone for an old hub, as a flow so the bell follows it. */
    val localReadAt = MutableStateFlow(prefs.notifyReadAt)
    private var feedCheck: kotlinx.coroutines.Job? = null

    private fun localPrefs(): app.lente.core.NotificationPrefs =
        prefs.notifyPrefs?.let { runCatching { app.lente.core.Notifications.parsePrefs(JSONObject(it)) }.getOrNull() } ?: app.lente.core.NotificationPrefs()

    /** The feed derived from what the phone holds, for a hub that does not serve one yet. */
    fun localFeed(state: HubState = _hub.value): app.lente.core.Feed = app.lente.core.Feed(
        app.lente.core.Notifications.local(state.meetings, state.actions.pending, facts.value, System.currentTimeMillis()),
        localReadAt.value, localPrefs(), fromHub = false,
    )

    /** Loads the feed (the hub's, or the phone's when the hub has none) and, with `alert`, posts what is new. */
    fun loadFeed(alert: Boolean = false) {
        val c = client ?: return
        viewModelScope.launch {
            val a = c.get("/notifications")
            val parsed = if (a.ok) runCatching { app.lente.core.Notifications.parse(a.text) }.getOrNull() else null
            val result = parsed ?: localFeed()
            feed.value = result
            if (alert) app.lente.platform.Alerts.deliver(getApplication(), prefs, result, inMeeting = _hub.value.status.meeting != null)
        }
    }

    /** Ajustes asks MainActivity for the notifications permission through this flag. */
    val askNotifyPermission = MutableStateFlow(false)

    /** A short wait so a burst of events makes one check. */
    private fun checkFeedSoon() {
        feedCheck?.cancel()
        feedCheck = viewModelScope.launch { kotlinx.coroutines.delay(FEED_CHECK_MS); loadFeed(alert = true) }
    }

    /** Opening Actividad reads everything up to now, on the hub (and so on every device) or on the phone. */
    fun markFeedRead() {
        val now = System.currentTimeMillis()
        val f = feed.value
        if (f?.fromHub == true) post("/notifications/read", JSONObject().put("at", now)) else { prefs.notifyReadAt = now; localReadAt.value = now }
        feed.value = f?.copy(readAt = now)
    }

    /** Saves the notification settings where the feed lives, and starts or stops the background check to match. */
    fun saveNotifyPrefs(p: app.lente.core.NotificationPrefs) {
        val f = feed.value
        val json = app.lente.core.Notifications.prefsJson(p)
        if (f?.fromHub == true) post("/notifications/prefs", JSONObject().put("prefs", json)) else prefs.notifyPrefs = json.toString()
        feed.value = (f ?: localFeed()).copy(prefs = p)
        if (p.phone) app.lente.platform.ActivityJob.schedule(getApplication()) else app.lente.platform.ActivityJob.cancel(getApplication())
    }

    /** Agent jobs for Conexiones: null while loading; `jobsNote` says why the list is empty when it failed. */
    val jobs = MutableStateFlow<List<app.lente.core.JobItem>?>(null)
    val jobsNote = MutableStateFlow<String?>(null)

    fun loadJobs() {
        val c = client ?: run { jobs.value = emptyList(); jobsNote.value = "No hay hub conectado: revisa Ajustes."; return }
        viewModelScope.launch {
            val a = c.get("/agent/jobs")
            val parsed = if (a.ok) runCatching { app.lente.core.Connections.jobs(a.text) }.getOrNull() else null
            jobs.value = parsed ?: emptyList()
            jobsNote.value = when {
                parsed != null -> null
                a.code == 404 -> "Este hub todavía no lista los trabajos: actualízalo."
                else -> "No pude traer los trabajos; revisa la conexión."
            }
        }
    }

    fun revokeDevice(id: String) = post("/devices/revoke", JSONObject().put("id", id)) { if (it.ok) loadAccount() else failed(it, "revocar el dispositivo") }

    /** Downloads everything Lente keeps about the wearer into the file they picked. */
    fun exportTo(uri: Uri) {
        val c = client ?: return
        viewModelScope.launch {
            val a = c.get("/account/export")
            if (!a.ok) return@launch failed(a, "exportar tus datos")
            val wrote = withContext(Dispatchers.IO) { runCatching { getApplication<Application>().contentResolver.openOutputStream(uri)?.use { it.write(a.text.toByteArray()) } != null }.getOrDefault(false) }
            say(if (wrote) "Tus datos se guardaron." else "No se pudo guardar el archivo.")
        }
    }

    fun deleteAccount() = post("/account/delete", JSONObject().put("confirm", true)) {
        if (it.ok) { signOut(); say("Tu cuenta y tu memoria se borraron.") } else failed(it, "borrar tu cuenta")
    }

    /** The hub refused the session and its refresh: the account is gone from the phone. */
    private fun signedOutByHub() {
        account.signOut()
        signedIn.value = false
        terms.value = Terms.signedOut(terms.value)
    }

    /** Any hub answer: a 428 `needsTerms` opens the terms screen, and its summary is fetched once. */
    private fun termsAnswer(code: Int, body: String) {
        val before = terms.value
        val after = Terms.answered(before, code, body)
        if (after == before) return
        terms.value = after
        if (!before.needed) viewModelScope.launch { client?.get("/terms")?.takeIf { it.ok }?.let { a -> terms.value = Terms.view(terms.value, a.text) } }
    }

    /** «Acepto»: the version the hub asked for; accepted, the stream and the screens load again. */
    fun acceptTerms() {
        val c = client ?: return
        if (terms.value.accepting) return
        terms.value = Terms.accepting(terms.value)
        viewModelScope.launch {
            val a = c.post("/terms/accept", Terms.acceptBody(terms.value))
            terms.value = Terms.accepted(terms.value, a.code, a.text)
            if (!terms.value.needed) { connect(c.base); loadAccount() }
        }
    }

    /** «Borrar ejemplo»: the sample project the hub wrote on the first sign-in; the wearer's own data stays. */
    fun deleteSample() = post("/sample/delete") { if (it.ok) say("Ejemplo borrado") else failed(it, "borrar el ejemplo") }

    fun signOut() {
        account.signOut()
        terms.value = Terms.signedOut(terms.value)
        signedIn.value = false
        accountInfo.value = null
        devices.value = emptyList()
        newClipToken.value = null
        client?.base?.let(::connect)
    }

    fun deleteAll() = post("/meetings/delete-all") { failed(it, "borrar la memoria"); if (it.ok) { facts.value = emptyList(); say("Memoria borrada.") } }

    fun deleteMeeting(id: String) = post("/meetings/delete", JSONObject().put("id", id)) {
        if (it.ok) { _screen.value = listOf(Screen.Reuniones); say("Reunión borrada.") } else failed(it, "borrar la reunión")
    }

    fun loadFacts() {
        val c = client ?: return
        viewModelScope.launch { c.get("/facts").takeIf { it.ok }?.let { facts.value = HubJson.facts(it.text) } }
    }

    fun fact(id: String, keep: Boolean) = post(if (keep) "/facts/keep" else "/facts/discard", JSONObject().put("id", id)) { loadFacts() }

    // --- Projects (add-projects) ------------------------------------------------------------------

    fun loadProjects() {
        val c = client ?: return
        viewModelScope.launch { c.get("/projects").takeIf { it.ok }?.let { a -> runCatching { Projects.list(a.text) }.getOrNull()?.let { projects.value = it } } }
    }

    private fun openProject(id: String) {
        val c = client ?: return
        project.value = null
        viewModelScope.launch { c.get("/projects/get?id=${enc(id)}").takeIf { it.ok }?.let { a -> project.value = runCatching { Projects.detail(a.text) }.getOrNull() } }
    }

    private fun afterProjectChange(id: String?) { loadProjects(); id?.let(::openProject) }

    fun renameProject(id: String, name: String) = post("/projects/rename", JSONObject().put("id", id).put("name", name)) { failed(it, "renombrar el proyecto"); afterProjectChange(id) }

    fun archiveProject(id: String, archived: Boolean) = post(if (archived) "/projects/archive" else "/projects/restore", JSONObject().put("id", id)) { failed(it, "archivar el proyecto"); afterProjectChange(id) }

    fun mergeProject(id: String, into: String) = post("/projects/merge", JSONObject().put("id", id).put("into", into)) {
        failed(it, "juntar los proyectos")
        if (it.ok) { _screen.value = listOf(Screen.Proyectos); go(Screen.Proyecto(into)) } else afterProjectChange(id)
    }

    private fun openMeeting(id: String) {
        val c = client ?: return
        detail.value = null
        trace.value = null
        viewModelScope.launch { c.get("/meetings/get?id=${enc(id)}").takeIf { it.ok }?.let { detail.value = HubJson.meetingDetail(it.text) } }
    }

    fun loadTrace(id: String) {
        val c = client ?: return
        viewModelScope.launch { val a = c.get("/traces/get?id=${enc(id)}"); trace.value = if (a.ok) HubJson.trace(a.text) else emptyList() }
    }

    private var searchJob: Job? = null
    fun search(q: String) {
        searchJob?.cancel()
        if (q.isBlank()) { search.value = null; return }
        val c = client ?: return
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            c.get("/meetings/search?q=${enc(q.take(200))}").takeIf { it.ok }?.let { search.value = HubJson.search(it.text) }
        }
    }

    fun prepareBriefing(title: String, names: String) {
        busy.update { it + "briefing" }
        briefing.value = null
        post("/briefing", JSONObject().put("title", title).put("names", names)) { a ->
            busy.update { it - "briefing" }
            if (a.ok) briefing.value = HubJson.briefing(a.text) else say("No pude preparar el briefing. Intenta de nuevo.")
        }
    }

    /** Approve (with the wearer's edits) or reject a proposed action. A drafted email opens in the mail app. */
    fun decide(id: String, approve: Boolean, args: Map<String, String> = emptyMap(), openMail: (String) -> Unit = {}) {
        val body = JSONObject().put("id", id).put("decision", if (approve) "approve" else "reject")
        if (approve && args.isNotEmpty()) {
            val a = JSONObject()
            for ((k, v) in args) if (v.isNotBlank()) a.put(k, if (k == "to") JSONArray(v.split(',').map { it.trim() }.filter { it.isNotEmpty() }) else v.trim())
            body.put("args", a)
        }
        post("/actions/decide", body) { r ->
            if (!r.ok) return@post say(runCatching { JSONObject(r.text).optString("error") }.getOrNull()?.ifBlank { null }?.let { "No se pudo: $it." } ?: "No se pudo decidir (${r.code}).")
            val outcome = runCatching { JSONObject(r.text).optJSONObject("outcome") }.getOrNull()
            outcome?.optString("mailto")?.takeIf { it.isNotBlank() }?.let(openMail)
            val queued = outcome?.optString("state") == "queued"
            say(if (!approve) "Descartada." else if (queued) "Aprobado: el puente de tu computadora lo hará." else "Hecho.")
        }
    }

    fun taskDone(id: String, done: Boolean) = post("/tasks/done", JSONObject().put("id", id).put("done", done))

    /** "Que lo haga un agente" on a task Lente can do: a job that waits in Por aprobar (add-agent-bridge). */
    fun agentJob(taskId: String) = post("/agent/jobs", JSONObject().put("taskId", taskId).put("agent", "claude")) {
        if (it.ok) say("Quedó en «Por aprobar». Nada corre hasta que lo apruebes.") else failed(it, "pedirle la tarea a un agente")
    }

    /** A task by hand, the wearer's unless they say otherwise (add-task-owners). */
    fun addTask(title: String, who: String) = post("/tasks/add", JSONObject().put("title", title).put("who", who)) { failed(it, "agregar la tarea") }

    fun setTaskOwner(id: String, who: String) = post("/tasks/update", JSONObject().put("id", id).put("who", who)) { failed(it, "cambiar quién hace la tarea"); loadProjects() }

    fun deleteTask(id: String) = post("/tasks/delete", JSONObject().put("id", id)) { failed(it, "borrar la tarea"); loadProjects() }

    // --- The phone as the device ------------------------------------------------------------

    fun startPhone(camera: Boolean = true) {
        val base = client?.base ?: return
        viewModelScope.launch { CaptureService.start(getApplication(), base, prefs.cookie, account.accessToken(), camera) }
    }

    /** The project the chat asks within; null is the whole memory (add-record-sheet). */
    val chatProject = MutableStateFlow<String?>(null)

    /**
     * Starts a recording from the sheet: the phone first when the clip is absent (and waits for the hub
     * to see it), then a meeting in the chosen project, then listening.
     */
    fun record(project: String?, camera: Boolean, title: String, usePhone: Boolean) = viewModelScope.launch {
        val c = client ?: return@launch say("No hay hub conectado: revisa Ajustes.")
        // The device the wearer chose (add-home-dock): with the phone, a connected clip waits instead of taking over.
        c.post(if (usePhone) "/device/prefer/phone" else "/device/prefer/any", null)
        if (usePhone && !_hub.value.status.phoneIsDevice) {
            startPhone(camera)
            if (withTimeoutOrNull(PHONE_READY_MS) { _hub.first { it.status.phoneIsDevice } } == null) return@launch say("El teléfono no pudo empezar a grabar. Revisa los permisos.")
        } else if (!usePhone) {
            // The clip's own camera follows the choice: on for a memory or «con cámara», off otherwise to save battery.
            c.post(if (camera) "/mode/camera" else "/mode/mic", null)
        }
        val body = JSONObject().put("title", title.trim())
        project?.let { body.put("project", it) }
        val a = c.post("/meeting/start", body)
        if (!a.ok) return@launch failed(a, "empezar a grabar")
        setListening(true)
        // "Micrófono y cámara en vivo": the camera's live reads come on with the recording.
        if (camera) setLive(true)
        // Recording always lands on the live transcript and summary (add-home-dock).
        openLive()
    }

    fun stopPhone() = CaptureService.stop(getApplication())

    // --- Hablar con Lente (add-voice-mode) -------------------------------------------------------

    val voiceOpen = MutableStateFlow(false)
    val voice = MutableStateFlow(VoiceView())
    /** Hands-free by default; off means hold the button to talk. */
    val voiceHandsFree = MutableStateFlow(true)
    /** The voice agent asked to open the record sheet with these choices; Inicio shows it. */
    val recordRequest = MutableStateFlow<RecordSheetRequest?>(null)
    /** Something asked Inicio to open the chat (a project's «Preguntar», add-home-dock); Inicio opens it and clears this. */
    val chatRequest = MutableStateFlow(false)

    /** From a project: back to Inicio with the chat open and asking within that project. */
    fun askInProject(id: String) { chatProject.value = id; chatRequest.value = true; go(Screen.Ahora) }

    /** From a project: back to Inicio with the recording options open and the project chosen. */
    fun recordInProject(id: String) { recordRequest.value = RecordSheetRequest(id, camera = false); go(Screen.Ahora) }
    private var voiceClient: VoiceClient? = null

    fun openVoice() {
        val c = client ?: return say("No hay hub conectado: revisa Ajustes.")
        voiceClient?.shutdown()
        speech.stop()
        voice.value = VoiceView()
        voiceOpen.value = true
        viewModelScope.launch {
            val token = account.accessToken()
            if (!voiceOpen.value) return@launch
            voiceClient = VoiceClient(getApplication(), c.base, prefs.cookie, token, ::onVoiceEvent) { why ->
                voice.value = voice.value.copy(phase = VoicePhase.Ended, error = why ?: voice.value.error)
            }.also { it.handsFree = voiceHandsFree.value }
        }
    }

    private fun onVoiceEvent(raw: String) {
        val before = voice.value
        val (next, effects) = VoiceEvents.reduce(before, raw)
        if (next.source != before.source) voiceClient?.useMicrophone(next.source == "phone")
        voice.value = next
        val inSight = sightOpen.value && !voiceOpen.value
        if (inSight) sight.value = Sight.talk(sight.value, next, sightSaid)
        for (e in effects) when (e) {
            is VoiceEffect.Speak -> {
                voiceClient?.speak(e.turn, e.text)
                // Ver's welcome counts as done once Lente has said something in it.
                if (inSight && sightIntro && !prefs.sightMet) prefs.sightMet = true
            }
            VoiceEffect.StopSpeaking -> voiceClient?.stopSpeaking()
            is VoiceEffect.OpenRecordSheet -> if (!inSight) {
                closeVoice()
                recordRequest.value = e.request
            }
            is VoiceEffect.Narration -> if (sightOpen.value) setSightNarration(e.on, byAgent = true)
            is VoiceEffect.Quiet -> if (inSight) { if (e.on) sightQuiet() else sightTalkAgain(byAgent = true) }
            is VoiceEffect.Locate -> answerLocate(e.id)
        }
    }

    /** Terminar: ends the session and leaves what was said and answered in Inicio's chat. */
    fun closeVoice() {
        val view = voice.value
        voiceClient?.shutdown()
        voiceClient = null
        voiceOpen.value = false
        val lines = VoiceEvents.chatLines(view) { ++chatIds }
        if (lines.isNotEmpty()) chat.value = chat.value.filterNot { it.pending } + lines
    }

    fun voicePause() {
        val pause = voice.value.phase != VoicePhase.Paused
        voiceClient?.pause(pause)
    }

    fun setVoiceHandsFree(on: Boolean) {
        voiceHandsFree.value = on
        voiceClient?.handsFree = on
    }

    /** Hold-to-talk: pressing while Lente thinks or speaks interrupts it. */
    fun voiceHold(down: Boolean) {
        val c = voiceClient ?: return
        if (down) {
            if (voice.value.phase == VoicePhase.Speaking || voice.value.phase == VoicePhase.Thinking) c.bargeIn()
            c.holding = true
        } else c.release()
    }

    override fun onCleared() {
        practice.close()
        stopScene()
        voiceClient?.shutdown()
        sightSpeaker?.shutdown()
        speech.shutdown()
        super.onCleared()
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    companion object {
        /** How long the feed waits after an event before it checks, so a burst makes one check. */
        private const val FEED_CHECK_MS = 1_500L
        const val VIBRATE_MS = 120L
        const val TOAST_MS = 4_000L
        const val SEARCH_DEBOUNCE_MS = 250L
        /** Longest a `/tts` call may take at all; Ver stops waiting for it much sooner (`SpeechQueue.TTS_WAIT_MS`). */
        const val TTS_CALL_MS = 8_000L
        /** «Grabar en silencio» checks this often whether Lente finished speaking, for at most [QUIET_MAX_WAIT_MS]. */
        const val QUIET_SETTLE_MS = 300L
        const val QUIET_MAX_WAIT_MS = 20_000L
        /** The location answer leaves before the hub's 8 s wait ends. */
        const val LOCATE_MARGIN_MS = 500L
    }
}
