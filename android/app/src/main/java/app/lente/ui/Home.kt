package app.lente.ui

import androidx.compose.ui.draw.alpha
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
fun Home(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit, onMenu: () -> Unit, talk: () -> Unit, record: (project: String?, camera: Boolean, title: String, phone: Boolean) -> Unit) {
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
    if (sheet || asked != null) RecordSheet(vm, hub, initialProject = asked?.projectId ?: vm.chatProject.value, initialCamera = asked?.camera ?: false, onDismiss = close) { mode, project, camera, title, device ->
        close(); tab = HomeTab.Inicio
        if (mode == RecordChoice.Mode.Sight) {
            // Ver (add-sight-mode): the hub turns the camera and its live reads on; the phone streams only when it is the eyes.
            val phone = device == RecordChoice.Device.Phone
            if (phone && !s.phoneIsDevice) usePhone()
            vm.openSight(phone)
        } else {
            RecordChoice.assistToSet(mode, s.assistMode)?.let(vm::setAssist)
            record(project, camera, title, device == RecordChoice.Device.Phone)
        }
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            DevicePill(hub) { if (hub.status.listening && hub.status.clip) vm.openLive() else vm.go(Screen.Dispositivos) }
            Spacer(Modifier.weight(1f))
            // The bell: the hub's unread count, or the phone's own for a hub without the feed (add-notifications).
            val localRead by vm.localReadAt.collectAsState()
            val facts by vm.facts.collectAsState()
            val unread = hub.notifyUnread ?: remember(hub.meetings, hub.actions, facts, localRead) { vm.localFeed(hub).unread }
            BellButton(unread) { vm.go(Screen.Actividad) }
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
                    HomeTab.Recuerdos -> Recuerdos(vm)
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
    var dismissed by rememberSaveable { mutableStateOf(emptySet<String>()) }
    val clock = ticker()
    val processing = remember(hub.meetings, dismissed, clock / 30_000) { app.lente.core.Processing.cards(hub.meetings, clock, dismissed) }
    // A finished meeting may have opened or moved a project.
    LaunchedEffect(hub.meetings.size, vm.hubAddress) { vm.loadProjects() }
    LazyColumn(Modifier.fillMaxSize().testTag("ahora"), state = list, contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // Without a clip the device pill already says so and opens Dispositivos, where "Usar el teléfono" lives.
        Copy.note(s)?.takeUnless { it == Copy.WAITING_FOR_CLIP }?.let { note -> item("note") { Notice(note, tag = "status-note") } }
        // «Sesión de invitado» (add-sight-mode): said plainly while the hub keeps nothing.
        if (s.guest) item("guest") { Notice(app.lente.core.Sight.GUEST, tag = "guest-note") }
        (capture as? Capture.State.Stopped)?.let { stopped -> item("phone-note") { Notice(stopped.why, action = if (stopped.resumable) "Reanudar" else null, tag = "phone-note", onAction = usePhone) } }
        val card = hub.card
        if (card != null && !s.recordOnly && !s.sight) item("cue") { DiloCard(card) }
        item("hello") { Welcome(s.names.firstOrNull()) }
        // A recording that just ended: its notes being written, then ready (add-home-dock), above the projects.
        items(processing, key = { "processing-${it.meetingId}" }) { card ->
            ProcessingRow(card, onOpen = { vm.go(Screen.Reunion(card.meetingId)) }, onDismiss = { dismissed = dismissed + card.meetingId })
        }
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
 * The recording options (add-record-sheet, add-home-dock), opened by the round button. Four decisions,
 * each one glance: what Lente does (Asistir, Recuerdo, Solo grabar, and the Teleprompter marked Pronto) as
 * tiles; with what (the clip or the phone) as two cards; whether the camera records (always in a Recuerdo);
 * and the start button with a line that says what will happen. Title and project wait under «Más opciones».
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun RecordSheet(vm: LenteViewModel, hub: HubState, initialProject: String?, initialCamera: Boolean, onDismiss: () -> Unit, onRecord: (mode: RecordChoice.Mode, project: String?, camera: Boolean, title: String, device: RecordChoice.Device) -> Unit) {
    val c = Lente.c
    val s = hub.status
    val projects by vm.projects.collectAsState()
    // The clip counts as available only when it is the device that is connected, not the phone.
    val clipOn = s.clipIsDevice
    var mode by rememberSaveable { mutableStateOf(RecordChoice.modeNow(s.assistMode)) }
    var device by rememberSaveable { mutableStateOf(RecordChoice.deviceNow(clipOn)) }
    var cameraChosen by rememberSaveable(initialCamera) { mutableStateOf(initialCamera) }
    var project by rememberSaveable(initialProject) { mutableStateOf(initialProject) }
    var title by rememberSaveable { mutableStateOf("") }
    var more by rememberSaveable { mutableStateOf(initialProject != null) }
    val camera = RecordChoice.usesCamera(mode, cameraChosen)
    val state = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = c.bg, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(horizontal = Lente.gutter).padding(bottom = 20.dp).testTag("record-sheet"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Grabar", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth())
            SheetLabel("Qué hace Lente")
            // The tiles in rows of two: the chosen one outlined in ink with an ink glyph tile.
            RecordChoice.Mode.entries.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { m -> ModeTile(m, selected = mode == m, Modifier.weight(1f)) { if (m.ready) mode = m } }
                }
            }
            SheetLabel("Con qué")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                RecordChoice.Device.entries.forEach { d ->
                    val available = d == RecordChoice.Device.Phone || clipOn
                    DeviceTile(
                        d, RecordChoice.deviceHint(d, clipOn), selected = device == d, available = available, modifier = Modifier.weight(1f),
                        onClick = { if (available) device = d else { onDismiss(); vm.go(Screen.Dispositivos) } },
                    )
                }
            }
            SheetLabel("Captura")
            SheetCard {
                Row(Modifier.fillMaxWidth().clickable(enabled = !mode.camera) { cameraChosen = !cameraChosen }.padding(horizontal = Lente.gutter, vertical = 12.dp).testTag("capture-cam"), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Glyph.Camera, c.ink, size = 20.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Cámara", style = Type.body, color = c.ink)
                        Text(if (mode == RecordChoice.Mode.Sight) "Ver siempre la usa" else if (mode.camera) "Un recuerdo siempre la usa" else if (camera) "Lente describe lo que ve mientras graba" else "Solo el micrófono", style = Type.caption, color = c.muted)
                    }
                    androidx.compose.material3.Switch(
                        checked = camera, onCheckedChange = { cameraChosen = it }, enabled = !mode.camera,
                        colors = androidx.compose.material3.SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.bg, checkedBorderColor = c.ink, uncheckedTrackColor = c.track, uncheckedThumbColor = c.thumb, uncheckedBorderColor = c.line, disabledCheckedTrackColor = c.ink.copy(alpha = 0.5f), disabledCheckedThumbColor = c.bg),
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            // What will happen, in one line, right above the button that does it.
            androidx.compose.animation.AnimatedContent(RecordChoice.summary(mode, device, cameraChosen), label = "record-summary") { line ->
                Text(line, style = Type.callout, color = c.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().testTag("record-summary"))
            }
            Row(
                Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(14.dp)).background(c.accentFill).clickable { onRecord(mode, project, camera, title, device) }.testTag("record-start"),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Dot(c.onAccent, 10.dp)
                Spacer(Modifier.width(10.dp))
                Text(RecordChoice.startLabel(mode), style = Type.headline, color = c.onAccent)
            }
            // Title and project, folded: most recordings need neither.
            SheetCard {
                ListRow(
                    "Más opciones", hint = listOfNotNull(title.trim().ifEmpty { null }, RecordChoice.scopeLabel(project, projects).takeIf { project != null }).joinToString(" · ").ifEmpty { "Título y proyecto" },
                    leading = { Icon(Glyph.Doc, c.ink, size = 20.dp) }, chevron = false, onClick = { more = !more },
                    trailing = { Icon(if (more) Glyph.ChevronDown else Glyph.ChevronRight, c.muted, size = 16.dp) },
                )
            }
            if (more) {
                Field(title, { title = it }, "Título (opcional)", tag = "record-title")
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
}

/** A mode as a tile: its glyph in a small tile (ink when chosen), the name and one line; Pronto when not built. */
@Composable
private fun ModeTile(m: RecordChoice.Mode, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier.height(118.dp).clip(shape).background(c.surface).border(if (selected) 2.dp else 0.dp, if (selected) c.ink else androidx.compose.ui.graphics.Color.Transparent, shape)
            .clickable(enabled = m.ready, onClick = onClick).padding(14.dp).alpha(if (m.ready) 1f else 0.55f).testTag("mode-${m.key}")
            .semantics { this.selected = selected },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(if (selected) c.ink else c.raised), contentAlignment = Alignment.Center) {
                Icon(modeGlyph(m), if (selected) c.bg else c.ink, size = 18.dp)
            }
            Spacer(Modifier.weight(1f))
            if (!m.ready) Text("Pronto", style = Type.caption, color = c.muted, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.raised).padding(horizontal = 6.dp, vertical = 1.dp))
        }
        Spacer(Modifier.weight(1f))
        Text(m.label, style = Type.body.copy(fontWeight = FontWeight.SemiBold), color = c.ink)
        Text(m.hint, style = Type.caption, color = c.muted, maxLines = 2)
    }
}

/** A device as a card: glyph, name and its state; the clip without connection leads to Dispositivos. */
@Composable
private fun DeviceTile(d: RecordChoice.Device, hint: String, selected: Boolean, available: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier.clip(shape).background(c.surface).border(if (selected) 2.dp else 0.dp, if (selected) c.ink else androidx.compose.ui.graphics.Color.Transparent, shape)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp).testTag("device-${d.key}").semantics { this.selected = selected },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(if (selected) c.ink else c.raised), contentAlignment = Alignment.Center) {
            Icon(if (d == RecordChoice.Device.Clip) Glyph.Device else Glyph.Phone, if (selected) c.bg else if (available) c.ink else c.muted, size = 18.dp)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(d.label, style = Type.body.copy(fontWeight = FontWeight.SemiBold), color = if (available) c.ink else c.muted)
            Text(if (available) hint else "Sin conectar · Conectar", style = Type.caption, color = c.muted, maxLines = 2)
        }
    }
}

private fun modeGlyph(m: RecordChoice.Mode): Glyph = when (m) { RecordChoice.Mode.Assist -> Glyph.Sparkle; RecordChoice.Mode.Memory -> Glyph.Camera; RecordChoice.Mode.Record -> Glyph.Wave; RecordChoice.Mode.Sight -> Glyph.Eye; RecordChoice.Mode.Teleprompter -> Glyph.Doc }

@Composable
private fun SheetLabel(text: String) = Text(text, style = Type.caption, color = Lente.c.muted, modifier = Modifier.padding(start = 4.dp, top = 6.dp))

@Composable
private fun SheetCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Lente.c.surface), content = content)


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
    val busy = lines.lastOrNull()?.busy == true
    val scopeLabel = RecordChoice.scopeLabel(scope, projects)
    val lastQuestion = lines.lastOrNull { it.fromWearer }?.text
    val lastAnswer = lines.lastOrNull { !it.fromWearer && !it.busy }?.id
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

/**
 * One recording that just ended, as a card above the projects: a spinner and a moving bar while Lente writes
 * its notes and files it in a project; a tick when they are ready (tap to open); a word when it failed or was
 * too short. Finished cards can be dismissed.
 */
@Composable
private fun ProcessingRow(card: app.lente.core.ProcessingCard, onOpen: () -> Unit, onDismiss: () -> Unit) {
    val c = Lente.c
    val working = card.stage == app.lente.core.ProcessingStage.Processing
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).clickable(enabled = !working, onClick = onOpen).testTag("processing-${card.meetingId}")) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) {
                when (card.stage) {
                    app.lente.core.ProcessingStage.Processing -> androidx.compose.material3.CircularProgressIndicator(Modifier.size(24.dp), color = c.ink, trackColor = c.raised, strokeWidth = 2.5.dp)
                    app.lente.core.ProcessingStage.Ready -> Box(Modifier.size(28.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) { Icon(Glyph.Check, c.bg, size = 16.dp) }
                    app.lente.core.ProcessingStage.Failed -> Icon(Glyph.Close, c.live, size = 22.dp)
                    app.lente.core.ProcessingStage.TooShort -> Icon(Glyph.Clock, c.muted, size = 22.dp)
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    when (card.stage) {
                        app.lente.core.ProcessingStage.Processing -> "Procesando tu grabación"
                        app.lente.core.ProcessingStage.Ready -> "Lista: ${card.title}"
                        app.lente.core.ProcessingStage.Failed -> "No pude escribir las notas"
                        app.lente.core.ProcessingStage.TooShort -> "Muy corta para notas"
                    },
                    style = Type.body.copy(fontWeight = FontWeight.SemiBold), color = c.ink, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                Text(
                    when (card.stage) {
                        app.lente.core.ProcessingStage.Processing -> "Lente escribe las notas y la ordena en tu proyecto"
                        app.lente.core.ProcessingStage.Ready -> "Notas, tareas y decisiones listas"
                        app.lente.core.ProcessingStage.Failed -> "${card.title} · la transcripción quedó guardada"
                        app.lente.core.ProcessingStage.TooShort -> "${card.title} · se guardó el texto"
                    },
                    style = Type.caption, color = c.muted, maxLines = 2,
                )
            }
            if (!working) PlainIcon(Glyph.Close, "Quitar", Modifier.size(40.dp), onDismiss)
        }
        // While it works, a thin moving bar along the card's foot says it has not stalled.
        if (working) androidx.compose.material3.LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = c.ink, trackColor = c.raised)
    }
}
