package app.lente.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import app.lente.core.RecordChoice
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.capture.Capture
import app.lente.core.Copy
import app.lente.core.Format
import app.lente.core.Greeting
import app.lente.core.HubState
import app.lente.core.Projects
import kotlinx.coroutines.launch

/** Hoy gave way to Recuerdos (add-home-dock); the live loop lives in the live view the round button opens. */
private enum class HomeTab(val title: String) { Inicio("Inicio"), Tareas("Tareas"), Recuerdos("Recuerdos") }

/**
 * The first screen: the device in the top-left corner, Ajustes and the menu on the right; Inicio (the
 * wearer's projects, with the DILO line pinned on top), Tareas and Hoy as large titles to switch
 * between; at the bottom only two buttons (add-home-dock): the ask bar, which opens the chat in full,
 * and the round button, which records and opens the live transcript and summary.
 */
@Composable
fun Home(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit, onMenu: () -> Unit, talk: () -> Unit, record: (project: String?, camera: Boolean, title: String) -> Unit) {
    val c = Lente.c
    val s = hub.status
    var tab by rememberSaveable { mutableStateOf(HomeTab.Inicio) }
    var sheet by rememberSaveable { mutableStateOf(false) }
    var chatOpen by rememberSaveable { mutableStateOf(false) }
    val chatAsked by vm.chatRequest.collectAsState()
    LaunchedEffect(chatAsked) { if (chatAsked) { chatOpen = true; vm.chatRequest.value = false } }
    // The voice agent's start_recording opens the sheet with its choices; nothing records until "Empezar a grabar".
    val asked by vm.recordRequest.collectAsState()
    val close = { sheet = false; vm.recordRequest.value = null }
    if (chatOpen) ChatSheet(vm, hub.status.clip, talk) { chatOpen = false }
    if (sheet || asked != null) RecordSheet(vm, hub, initialProject = asked?.projectId ?: vm.chatProject.value, initialCamera = asked?.camera ?: false, onDismiss = close) { mode, project, camera, title ->
        close(); tab = HomeTab.Inicio
        RecordChoice.assistToSet(mode, s.recordOnly)?.let(vm::setAssist)
        record(project, camera, title)
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            DevicePill(hub) { if (hub.status.listening && hub.status.clip) vm.openLive() else vm.go(Screen.Dispositivos) }
            Spacer(Modifier.weight(1f))
            PlainIcon(Glyph.Gear, "Ajustes") { vm.go(Screen.Ajustes) }
            PlainIcon(Glyph.Menu, "Abrir menú", Modifier.testTag("menu"), onMenu)
        }
        val pending = hub.actions.pending.size
        Tabs(
            HomeTab.entries.map { t -> t.name.lowercase() to if (t == HomeTab.Tareas && pending > 0) "${t.title} · $pending" else t.title },
            tab.name.lowercase(), { key -> tab = HomeTab.entries.first { it.name.lowercase() == key } },
            Modifier.padding(start = Lente.gutter, end = Lente.gutter, top = 8.dp, bottom = 10.dp), label = "Secciones",
        )
        Box(Modifier.weight(1f)) {
            Crossfade(tab, animationSpec = tween(160), label = "home-tab") { t ->
                when (t) {
                    HomeTab.Inicio -> Inicio(vm, hub, usePhone)
                    HomeTab.Tareas -> Acciones(vm, hub)
                    HomeTab.Recuerdos -> Recuerdos()
                }
            }
        }
        // Recuerdos is the wheel alone: no ask bar and no round button there (add-home-dock).
        if (tab != HomeTab.Recuerdos) Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            AskBar(Modifier.weight(1f)) { chatOpen = true }
            Spacer(Modifier.width(12.dp))
            // A tap opens the recording options (mode, capture, project); while it listens, it reopens the live view.
            ListenButton(s.listening) { if (s.listening) vm.openLive() else sheet = true }
        }
    }
}

/** Inicio: what needs the wearer now (notes, the DILO line), then a greeting and their projects. The chat lives in its own sheet. */
@Composable
private fun Inicio(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit) {
    val s = hub.status
    val capture by Capture.state.collectAsState()
    val list = rememberLazyListState()
    val projects by vm.projects.collectAsState()
    // A finished meeting may have opened or moved a project.
    LaunchedEffect(hub.meetings.size, vm.hubAddress) { vm.loadProjects() }
    LazyColumn(Modifier.fillMaxSize().testTag("ahora"), state = list, contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // Without a clip the device pill already says so and opens Dispositivos, where "Usar el teléfono" lives.
        Copy.note(s)?.takeUnless { it == Copy.WAITING_FOR_CLIP }?.let { note -> item("note") { Notice(note, tag = "status-note") } }
        (capture as? Capture.State.Stopped)?.let { stopped -> item("phone-note") { Notice(stopped.why, action = if (stopped.resumable) "Reanudar" else null, tag = "phone-note", onAction = usePhone) } }
        val card = hub.card
        if (card != null && !s.recordOnly) item("cue") { DiloCard(card) }
        item("hello") { Welcome(s.names.firstOrNull()) }
        projectsOnHome(vm, projects.filter { it.active })
    }
}

@Composable
private fun Welcome(name: String?) {
    val c = Lente.c
    val now = remember { java.time.LocalDateTime.now() }
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp)) {
        Text(Greeting.hello(now.hour, name), style = Type.title, color = c.ink, modifier = Modifier.testTag("greeting"))
    }
}

/** Up to three active projects, newest activity first, and the way to all of them. */
private fun androidx.compose.foundation.lazy.LazyListScope.projectsOnHome(vm: LenteViewModel, active: List<Projects.Summary>) {
    if (active.isEmpty()) {
        item("projects-empty") { Text("Cuando termines una reunión, Lente la ordena en tus proyectos y aparecen aquí.", style = Type.callout, color = Lente.c.muted) }
        return
    }
    item("projects-title") { SectionTitle("Tus proyectos") }
    val now = System.currentTimeMillis()
    items(active.take(Projects.ON_HOME), key = { "project-${it.id}" }) { p -> ProjectCard(p, now) { vm.go(Screen.Proyecto(p.id)) } }
    Projects.seeAll(active.size)?.let { label ->
        item("projects-all") {
            Text(label, style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = Lente.c.ink, modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { vm.go(Screen.Proyectos) }.padding(vertical = 6.dp, horizontal = 4.dp).testTag("projects-all"))
        }
    }
}

/**
 * The recording options (add-record-sheet, add-home-dock), opened by the round button: what Lente does
 * (Asistir, Solo grabar, or the teleprompter marked Pronto), what it captures (the microphone, or with
 * the camera's live reads), then the start button; the title and the project below it are optional.
 * The device is the clip when it is connected, the phone otherwise.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun RecordSheet(vm: LenteViewModel, hub: HubState, initialProject: String?, initialCamera: Boolean, onDismiss: () -> Unit, onRecord: (mode: RecordChoice.Mode, project: String?, camera: Boolean, title: String) -> Unit) {
    val c = Lente.c
    val s = hub.status
    val projects by vm.projects.collectAsState()
    var mode by rememberSaveable { mutableStateOf(RecordChoice.modeNow(s.recordOnly)) }
    var project by rememberSaveable(initialProject) { mutableStateOf(initialProject) }
    var camera by rememberSaveable(initialCamera) { mutableStateOf(initialCamera) }
    var title by rememberSaveable { mutableStateOf("") }
    // Opens fully, so the start button is in view without dragging.
    val state = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = c.bg, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = Lente.gutter).padding(bottom = 24.dp).testTag("record-sheet"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Grabar", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Icon(if (s.clip && s.clipIsDevice) Glyph.Device else Glyph.Phone, c.muted, size = 16.dp)
                Spacer(Modifier.width(6.dp))
                Text(RecordChoice.deviceLine(s.clip, s.clip && !s.clipIsDevice), style = Type.caption, color = c.muted, modifier = Modifier.testTag("record-device"))
            }
            SheetLabel("Modo")
            SheetCard {
                RecordChoice.Mode.entries.forEachIndexed { i, m ->
                    if (i > 0) Hairline()
                    OptionRow(modeGlyph(m), m.label, m.hint, selected = mode == m, soon = !m.ready, tag = "mode-${m.key}") { mode = m }
                }
            }
            SheetLabel("Captura")
            SheetCard {
                OptionRow(Glyph.Mic, RecordChoice.captureLabel(false), RecordChoice.captureHint(false), selected = !camera, tag = "capture-mic") { camera = false }
                Hairline()
                OptionRow(Glyph.Camera, RecordChoice.captureLabel(true), RecordChoice.captureHint(true), selected = camera, tag = "capture-cam") { camera = true }
            }
            Spacer(Modifier.height(4.dp))
            // The button before the optional fields, so it stays in reach however many projects there are.
            Row(
                Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(12.dp)).background(c.accentFill).clickable { onRecord(mode, project, camera, title) }.testTag("record-start"),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Dot(c.onAccent, 10.dp)
                Spacer(Modifier.width(10.dp))
                Text("Empezar a grabar", style = Type.headline, color = c.onAccent)
            }
            SheetLabel("Título (opcional)")
            Field(title, { title = it }, "Reunión con…", tag = "record-title")
            SheetLabel("Proyecto")
            SheetCard {
                val options = listOf<Pair<String?, String>>(null to RecordChoice.AUTO_PROJECT) + projects.filter { it.active }.map { it.id to it.name }
                options.forEachIndexed { i, (id, name) ->
                    if (i > 0) Hairline()
                    ListRow(name, onClick = { project = id }, chevron = false, trailing = { if (project == id) Icon(Glyph.Check, c.ink, size = 20.dp) })
                }
            }
        }
    }
}

private fun modeGlyph(m: RecordChoice.Mode): Glyph = when (m) { RecordChoice.Mode.Assist -> Glyph.Sparkle; RecordChoice.Mode.Record -> Glyph.Wave; RecordChoice.Mode.Teleprompter -> Glyph.Doc }

@Composable
private fun SheetLabel(text: String) = Text(text, style = Type.caption, color = Lente.c.muted, modifier = Modifier.padding(start = 4.dp, top = 6.dp))

@Composable
private fun SheetCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Lente.c.surface), content = content)

/** One choice in a sheet: glyph, label and hint, and a check when chosen; a planned one is greyed with Pronto. */
@Composable
private fun OptionRow(glyph: Glyph, label: String, hint: String, selected: Boolean, soon: Boolean = false, tag: String, onClick: () -> Unit) {
    val c = Lente.c
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !soon, onClick = onClick).padding(horizontal = Lente.gutter, vertical = 12.dp).testTag(tag)
            .semantics { this.selected = selected },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(glyph, if (soon) c.muted else c.ink, size = 20.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = Type.body, color = if (soon) c.muted else c.ink)
            Text(hint, style = Type.caption, color = c.muted)
        }
        when {
            soon -> Text("Pronto", style = Type.caption, color = c.muted, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.raised).padding(horizontal = 8.dp, vertical = 2.dp))
            selected -> Box(Modifier.size(22.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) { Icon(Glyph.Check, c.bg, size = 14.dp) }
            else -> Box(Modifier.size(22.dp).clip(CircleShape).border(1.5.dp, c.line, CircleShape))
        }
    }
}

/**
 * The device in the top-left corner: which one listens, and while it listens the pill turns red with
 * the elapsed time and opens the live transcript; otherwise it opens Dispositivos.
 */
@Composable
private fun DevicePill(hub: HubState, onClick: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    val on = s.listening && s.clip
    val now = ticker()
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier.height(40.dp).clip(shape).background(if (on) c.liveFill else c.surface)
            .clickable(onClick = onClick).padding(horizontal = 14.dp).testTag("status-row"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(when { on -> c.onLive; s.clip -> c.ok; else -> c.muted }, 9.dp)
        Spacer(Modifier.width(8.dp))
        Text(Copy.device(s), style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.onLive else c.ink, maxLines = 1, modifier = Modifier.testTag("device"))
        if (on) Text(" · ${Format.clock(hub.elapsedMs(now))}", style = Type.measured.copy(fontWeight = FontWeight.SemiBold), color = c.onLive, maxLines = 1)
    }
}

/** The ask bar: a button shaped like a field, with no icon of its own, that opens the chat. */
@Composable
private fun AskBar(modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier.height(56.dp).clip(shape).background(c.surface).clickable(onClick = onClick).padding(horizontal = 18.dp).testTag("ask-bar").semantics { contentDescription = ASK_LABEL },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyph.Sparkle, c.ink, size = 18.dp)
        Spacer(Modifier.width(10.dp))
        Text(ASK_LABEL, style = Type.body, color = c.ink, maxLines = 1)
    }
}

private const val ASK_LABEL = "Pregúntale a Lente"

/** The round button beside the ask bar: a tap opens the recording options, or the live view while it listens (ink then). */
@Composable
private fun ListenButton(listening: Boolean, onClick: () -> Unit) {
    val c = Lente.c
    Box(
        Modifier.size(56.dp).clip(CircleShape).background(if (listening) c.ink else c.accentFill)
            .clickable(onClick = onClick).testTag("pill").semantics { contentDescription = if (listening) "Abrir la transcripción en vivo" else "Opciones para grabar" },
        contentAlignment = Alignment.Center,
    ) {
        // A record dot to start, as on any recorder; while it listens, the wave of the live view it opens.
        // The kit's accent to record (onAccent on accentFill, its contrast-checked pair); ink while it listens, since
        // the device pill already shows the live colour and the time.
        if (listening) Icon(Glyph.Wave, c.bg, size = 24.dp) else Dot(c.onAccent, 18.dp)
    }
}

/**
 * The chat in full (add-home-dock): ✕, where Lente looks and a new conversation on top; the conversation,
 * newest last, or before it a greeting and a few questions to start from; at the bottom the composer card.
 * It closes with ✕, a swipe down or back, and Inicio behind it stays as it was.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ChatSheet(vm: LenteViewModel, clip: Boolean, talk: () -> Unit, onDismiss: () -> Unit) {
    val c = Lente.c
    val lines by vm.chat.collectAsState()
    val projects by vm.projects.collectAsState()
    val scope by vm.chatProject.collectAsState()
    var picking by rememberSaveable { mutableStateOf(false) }
    var browsing by rememberSaveable { mutableStateOf(false) }
    val state = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutines = androidx.compose.runtime.rememberCoroutineScope()
    val close: () -> Unit = { coroutines.launch { state.hide() }.invokeOnCompletion { onDismiss() } }
    val list = rememberLazyListState()
    val busy = lines.lastOrNull()?.pending == true
    val scopeLabel = RecordChoice.scopeLabel(scope, projects)
    val lastQuestion = lines.lastOrNull { it.fromWearer }?.text
    val lastAnswer = lines.lastOrNull { !it.fromWearer && !it.pending }?.id
    LaunchedEffect(lines.size, busy) { if (lines.isNotEmpty()) list.animateScrollToItem(lines.size) }
    if (picking) ScopeSheet(vm, scope, onDismiss = { picking = false })
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = c.bg, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)) {
        Column(Modifier.fillMaxWidth().fillMaxHeight().imePadding().testTag("chat-sheet")) {
            // Close on the left (or back from the history), the history and a new conversation on the right; an empty
            // slot on each side keeps the title centred.
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (browsing) PlainIcon(Glyph.Back, "Volver al chat", Modifier.testTag("chat-history-back")) { browsing = false }
                else PlainIcon(Glyph.Close, "Cerrar el chat", Modifier.testTag("chat-close"), close)
                Spacer(Modifier.size(44.dp))
                Text(if (browsing) "Historial" else "Preguntar", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, maxLines = 1, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
                if (browsing) Spacer(Modifier.size(44.dp))
                else PlainIcon(Glyph.Clock, "Historial de conversaciones", Modifier.testTag("chat-history")) { browsing = true; vm.loadHistory() }
                if (browsing || lines.isEmpty()) Spacer(Modifier.size(44.dp)) else PlainIcon(Glyph.Compose, "Nueva conversación", Modifier.testTag("chat-new"), vm::clearChat)
            }
            if (browsing) {
                ChatHistoryList(vm, Modifier.weight(1f).fillMaxWidth()) { browsing = false }
                return@Column
            }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                if (lines.isEmpty()) item("chat-empty") {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp)) {
                            Text("¿Qué quieres recordar?", style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink, modifier = Modifier.testTag("chat-hello"))
                            Spacer(Modifier.height(4.dp))
                            Text("Lente responde con lo que viste y escuchaste: $scopeLabel.", style = Type.callout, color = c.muted)
                        }
                        Text("Para empezar", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp, top = 8.dp))
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface)) {
                            val starters = STARTERS.map { (glyph, q) -> Triple(glyph, q) { vm.askLente(q) } } + (if (clip) listOf(Triple(Glyph.Eye, "Mirar lo que tengo enfrente") { vm.look() }) else emptyList())
                            starters.forEachIndexed { i, (glyph, label, action) ->
                                if (i > 0) Hairline()
                                ListRow(label, onClick = action, leading = { Icon(glyph, c.ink, size = 20.dp) }, modifier = Modifier.testTag("chip-${label.lowercase().filter { it.isLetter() }.take(16)}"))
                            }
                        }
                    }
                }
                items(lines, key = { it.id }) { line ->
                    if (line.fromWearer) Asked(line)
                    else Answer(vm, line, onRetry = if (line.id == lastAnswer && !busy && lastQuestion != null) ({ vm.askLente(lastQuestion) }) else null)
                }
                if (lines.isNotEmpty() && !busy) item("chat-note") {
                    Text("Lente responde solo con tu memoria: si no lo vio ni lo escuchó, te lo dice.", style = Type.caption, color = c.muted)
                }
            }
            Composer(
                enabled = !busy,
                placeholder = if (scope == null) "Pregúntale a Lente…" else "Pregúntale a Lente en $scopeLabel…",
                scope = scopeLabel,
                scoped = scope != null,
                onScope = { picking = true },
                talk = talk,
                modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 10.dp),
            ) { q -> vm.askLente(q) }
        }
    }
}

/** Questions to start from, shown while the chat is empty, each with its glyph; the row asks it. */
private val STARTERS = listOf(Glyph.Summary to "Resumen de hoy", Glyph.Tasks to "¿Qué me falta por hacer?", Glyph.Check to "¿Qué prometí esta semana?")

/** Where Lente looks when it answers: the whole memory or one active project. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun ScopeSheet(vm: LenteViewModel, current: String?, onDismiss: () -> Unit) {
    val c = Lente.c
    val projects by vm.projects.collectAsState()
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.bg) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Lente.gutter).padding(bottom = 24.dp).testTag("chat-scope-sheet"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Dónde busca Lente", style = Type.title, color = c.ink)
            Group {
                val options = listOf<Pair<String?, String>>(null to RecordChoice.WHOLE_MEMORY) + projects.filter { it.active }.map { it.id to it.name }
                options.forEachIndexed { i, (id, name) ->
                    if (i > 0) Hairline()
                    ListRow(name, onClick = { vm.chatProject.value = id; onDismiss() }, chevron = false, trailing = { if (current == id) Icon(Glyph.Check, c.ink, size = 20.dp) })
                }
            }
        }
    }
}

/**
 * The chat's history (add-home-dock): the conversations the hub keeps, typed or by voice, newest first,
 * each with its first question and when it was. Tapping one opens it in the chat to go on.
 */
@Composable
private fun ChatHistoryList(vm: LenteViewModel, modifier: Modifier, onOpen: () -> Unit) {
    val c = Lente.c
    val threads by vm.history.collectAsState()
    val note by vm.historyNote.collectAsState()
    val current by vm.chatThread.collectAsState()
    val now = remember { System.currentTimeMillis() }
    LazyColumn(modifier.testTag("chat-history-list"), contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val list = threads
        when {
            list == null -> item("loading") { Text("Buscando tus conversaciones…", style = Type.callout, color = c.muted, modifier = Modifier.padding(4.dp)) }
            list.isEmpty() -> item("empty") {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp)) {
                    Text(note ?: "Aún no hay conversaciones.", style = Type.body, color = c.ink)
                    if (note == null) Text("Lo que le preguntes a Lente, escrito o hablado, queda aquí.", style = Type.callout, color = c.muted)
                }
            }
            else -> item("threads") {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface)) {
                    list.forEachIndexed { i, t ->
                        if (i > 0) Hairline()
                        Row(
                            Modifier.fillMaxWidth().clickable { vm.openThread(t); onOpen() }.padding(horizontal = Lente.gutter, vertical = 12.dp).testTag("thread-${t.id}"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(if (t.voice) Glyph.Wave else Glyph.Doc, c.ink, size = 20.dp)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(t.title, style = Type.body.copy(fontWeight = if (t.id == current) FontWeight.SemiBold else FontWeight.Normal), color = c.ink, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                Text(app.lente.core.ChatHistory.whenLabel(t.at, now) + if (t.voice) " · por voz" else "", style = Type.caption, color = c.muted)
                            }
                            Icon(Glyph.ChevronRight, c.muted, Modifier.padding(start = 6.dp), size = 18.dp)
                        }
                    }
                }
            }
        }
    }
}
