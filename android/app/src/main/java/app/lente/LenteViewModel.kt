package app.lente

import android.app.Activity
import android.app.Application
import android.net.Uri
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.lente.capture.Capture
import app.lente.capture.CaptureService
import app.lente.core.Account
import app.lente.core.Briefing
import app.lente.core.ChatJson
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
import app.lente.core.TraceStep
import app.lente.core.Voice
import app.lente.core.RecordSheetRequest
import app.lente.core.VoiceEffect
import app.lente.core.VoiceEvents
import app.lente.core.VoicePhase
import app.lente.core.VoiceView
import app.lente.platform.VoiceClient
import app.lente.core.effectsOf
import app.lente.platform.Answer
import app.lente.platform.GoogleAccount
import app.lente.platform.HubClient
import app.lente.platform.Prefs
import app.lente.platform.SignInFailed
import app.lente.platform.Speech
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

    /** A client for a hub: the pairing cookie, and the account's bearer with one refresh after a 401. */
    private fun hubClient(base: String) = HubClient(base, { prefs.cookie }, { account.accessToken() }, { account.refreshAfter401() }, { account.signOut() })
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

    private val speech = Speech(app) { text -> post("/narrated", JSONObject().put("text", text)) }
    private val vibrator = app.getSystemService(Vibrator::class.java)

    val hubAddress get() = client?.base ?: prefs.hub

    init {
        prefs.hub?.let { connect(it) }
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
        // A new listening session opens En vivo, unless the wearer collapsed it for that session.
        val since = after.status.session?.startedAt
        if (event is HubEvent.StatusEvent && since != null && since != before.status.session?.startedAt && before.statusAt != 0L && after.status.session?.running == true && prefs.collapsedSession != since) liveOpen.value = true
        // The phone was the device and the hub now has the clip: release the microphone.
        if (event is HubEvent.StatusEvent && after.status.clipIsDevice && Capture.state.value is Capture.State.On) CaptureService.stop(getApplication())
        for (effect in effectsOf(event)) when (effect) {
            is Effect.Ack -> post("/seen", JSONObject().put("id", effect.id))
            Effect.Vibrate -> if (!after.status.recordOnly) vibrator?.vibrate(VibrationEffect.createOneShot(VIBRATE_MS, VibrationEffect.DEFAULT_AMPLITUDE))
            // Live descriptions (low priority) follow Narrar en voz alta; everything else follows Voz.
            is Effect.Speak -> if (if (effect.priority == Voice.Priority.Low) narrateLive.value else readAloud.value) speech.say(effect.text, effect.priority)
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
            else -> {}
        }
    }

    /** Back: closes En vivo, then a meeting, then returns to Ahora. False when there is nowhere to go. */
    fun back(): Boolean {
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
        if (q.isEmpty() || chat.value.lastOrNull()?.pending == true) return
        val before = chat.value
        val asked = ChatLine(++chatIds, true, q)
        val waiting = ChatLine(++chatIds, false, "", pending = true)
        if (client == null) {
            chat.value = before + asked + waiting.copy(text = "No hay hub conectado: revisa Ajustes.", pending = false, found = false)
            return
        }
        chat.value = before + asked + waiting
        post("/ask", ChatJson.request(q, before).apply { chatProject.value?.let { put("project", it) } }) { a ->
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

    fun clearChat() { chat.value = emptyList() }

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

    fun closeLive() {
        liveOpen.value = false
        _hub.value.status.session?.startedAt?.let { prefs.collapsedSession = it }
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
            signedIn.value = true
            client?.base?.let(::connect)
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

    fun forgetClipToken() { newClipToken.value = null }

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

    fun signOut() {
        account.signOut()
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
            say(if (approve) "Hecho." else "Descartada.")
        }
    }

    fun taskDone(id: String, done: Boolean) = post("/tasks/done", JSONObject().put("id", id).put("done", done))

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
        if (usePhone) {
            startPhone(camera)
            if (withTimeoutOrNull(PHONE_READY_MS) { _hub.first { it.status.clip } } == null) return@launch say("El teléfono no pudo empezar a grabar. Revisa los permisos.")
        }
        val body = JSONObject().put("title", title.trim())
        project?.let { body.put("project", it) }
        val a = c.post("/meeting/start", body)
        if (!a.ok) return@launch failed(a, "empezar a grabar")
        setListening(true)
    }

    fun stopPhone() = CaptureService.stop(getApplication())

    // --- Hablar con Lente (add-voice-mode) -------------------------------------------------------

    val voiceOpen = MutableStateFlow(false)
    val voice = MutableStateFlow(VoiceView())
    /** Hands-free by default; off means hold the button to talk. */
    val voiceHandsFree = MutableStateFlow(true)
    /** The voice agent asked to open the record sheet with these choices; Inicio shows it. */
    val recordRequest = MutableStateFlow<RecordSheetRequest?>(null)
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
        for (e in effects) when (e) {
            is VoiceEffect.Speak -> voiceClient?.speak(e.turn, e.text)
            VoiceEffect.StopSpeaking -> voiceClient?.stopSpeaking()
            is VoiceEffect.OpenRecordSheet -> {
                closeVoice()
                recordRequest.value = e.request
            }
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
        voiceClient?.shutdown()
        speech.shutdown()
        super.onCleared()
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    companion object {
        const val VIBRATE_MS = 120L
        const val TOAST_MS = 4_000L
        const val SEARCH_DEBOUNCE_MS = 250L
    }
}
