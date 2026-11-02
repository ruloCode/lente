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

private enum class HomeTab(val title: String) { Inicio("Inicio"), Tareas("Tareas"), Hoy("Hoy") }

/**
 * The first screen: the device in the top-left corner, Ajustes and the menu on the right; Inicio (the
 * wearer's projects, or the conversation with Lente once it starts, with the DILO line pinned on
 * top), Tareas and Hoy as large titles to switch between; at the bottom, a few suggestions, a field
 * to ask Lente and the button that listens (add-projects 2.2).
 */
@Composable
fun Home(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit, onMenu: () -> Unit, record: (project: String?, camera: Boolean, title: String) -> Unit) {
    val c = Lente.c
    val s = hub.status
    var tab by rememberSaveable { mutableStateOf(HomeTab.Inicio) }
    var sheet by rememberSaveable { mutableStateOf(false) }
    val lines by vm.chat.collectAsState()
    if (sheet) RecordSheet(vm, hub, onDismiss = { sheet = false }) { project, camera, title -> sheet = false; tab = HomeTab.Inicio; record(project, camera, title) }
    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            DevicePill(hub) { if (hub.status.listening && hub.status.clip) vm.openLive() else vm.go(Screen.Dispositivos) }
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RoundIcon(Glyph.Gear, "Ajustes") { vm.go(Screen.Ajustes) }
                RoundIcon(Glyph.Menu, "Abrir menú", Modifier.testTag("menu"), onMenu)
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
            for (t in HomeTab.entries) {
                val pending = if (t == HomeTab.Tareas) hub.actions.pending.size else 0
                Row(Modifier.clip(RoundedCornerShape(10.dp)).clickable { tab = t }.padding(end = 16.dp).testTag("tab-${t.name.lowercase()}"), verticalAlignment = Alignment.Top) {
                    Text(t.title, style = Type.large.copy(fontSize = Type.large.fontSize * 1.05f), color = if (t == tab) c.ink else c.muted.copy(alpha = 0.55f))
                    if (pending > 0) Text("$pending", style = Type.label, color = c.onAccent, modifier = Modifier.padding(start = 2.dp, top = 2.dp).clip(CircleShape).background(c.accentFill).padding(horizontal = 6.dp, vertical = 1.dp))
                }
            }
        }
        Box(Modifier.weight(1f)) {
            Crossfade(tab, animationSpec = tween(160), label = "home-tab") { t ->
                when (t) {
                    HomeTab.Inicio -> Inicio(vm, hub, usePhone, lines) { tab = it }
                    HomeTab.Tareas -> Acciones(vm, hub)
                    HomeTab.Hoy -> Ahora(vm, hub, usePhone)
                }
            }
        }
        if (tab == HomeTab.Inicio) Suggestions(vm, s.clip, showStarters = lines.isEmpty()) { tab = HomeTab.Inicio }
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Composer(enabled = lines.lastOrNull()?.pending != true, modifier = Modifier.weight(1f), placeholder = "Pregúntale a Lente…") { q ->
                tab = HomeTab.Inicio
                vm.askLente(q)
            }
            Spacer(Modifier.width(10.dp))
            ListenButton(s.listening) { if (s.listening) vm.toggleListening() else sheet = true }
        }
    }
}

/** Inicio: what needs the wearer now (notes, the DILO line), then the conversation or, before it starts, a greeting and their projects. */
@Composable
private fun Inicio(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit, lines: List<app.lente.core.ChatLine>, goTab: (HomeTab) -> Unit) {
    val s = hub.status
    val capture by Capture.state.collectAsState()
    val list = rememberLazyListState()
    val projects by vm.projects.collectAsState()
    LaunchedEffect(lines.size, lines.lastOrNull()?.pending) { if (lines.isNotEmpty()) list.animateScrollToItem(list.layoutInfo.totalItemsCount.coerceAtLeast(1) - 1) }
    // A finished meeting may have opened or moved a project.
    LaunchedEffect(hub.meetings.size, vm.hubAddress) { vm.loadProjects() }
    LazyColumn(Modifier.fillMaxSize().testTag("ahora"), state = list, contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (s.listening && s.clip) item("live-bar") { LiveBarRow(vm, hub) }
        // Without a clip the device pill already says so and opens Dispositivos, where "Usar el teléfono" lives.
        Copy.note(s)?.takeUnless { it == Copy.WAITING_FOR_CLIP }?.let { note -> item("note") { Notice(note, tag = "status-note") } }
        (capture as? Capture.State.Stopped)?.let { stopped -> item("phone-note") { Notice(stopped.why, action = if (stopped.resumable) "Reanudar" else null, tag = "phone-note", onAction = usePhone) } }
        val card = hub.card
        if (card != null && !s.recordOnly) item("cue") { DiloCard(card) }
        if (lines.isEmpty()) {
            item("hello") { Welcome(s.names.firstOrNull()) }
            projectsOnHome(vm, projects.filter { it.active })
        } else {
            items(lines, key = { it.id }) { line -> if (line.fromWearer) Asked(line) else Answer(vm, line) }
            item("more") { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { Text("Nueva conversación", style = Type.callout, color = Lente.c.accent, modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = vm::clearChat).padding(8.dp).testTag("chat-new")) } }
        }
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
            Text(label, style = Type.callout, color = Lente.c.accent, modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { vm.go(Screen.Proyectos) }.padding(vertical = 6.dp, horizontal = 4.dp).testTag("projects-all"))
        }
    }
}

/**
 * Above the field: the chat's scope (the whole memory or one project) and, before a conversation,
 * a few suggestions in place of the option cards.
 */
@Composable
private fun Suggestions(vm: LenteViewModel, clip: Boolean, showStarters: Boolean, onAsk: () -> Unit) {
    val c = Lente.c
    val projects by vm.projects.collectAsState()
    val scope by vm.chatProject.collectAsState()
    var picking by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(18.dp)
    val chip = Modifier.clip(shape).border(0.5.dp, c.line, shape)
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Row(chip.background(if (scope != null) c.tag else c.surface).clickable { picking = true }.padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp).testTag("chat-scope"), verticalAlignment = Alignment.CenterVertically) {
                Text(RecordChoice.scopeLabel(scope, projects), style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = if (scope != null) c.accent else c.ink, maxLines = 1)
                Icon(Glyph.ChevronDown, c.muted, Modifier.padding(start = 2.dp), size = 16.dp)
            }
            DropdownMenu(picking, { picking = false }) {
                DropdownMenuItem(text = { Text(RecordChoice.WHOLE_MEMORY) }, onClick = { vm.chatProject.value = null; picking = false })
                projects.filter { it.active }.forEach { p -> DropdownMenuItem(text = { Text(p.name) }, onClick = { vm.chatProject.value = p.id; picking = false }) }
            }
        }
        if (showStarters) {
            val starters = buildList {
                add("Resumen de hoy" to { onAsk(); vm.askLente("Resumen de hoy") })
                add("¿Qué me falta?" to { onAsk(); vm.askLente("¿Qué me falta por hacer?") })
                if (clip) add("Mirar" to { vm.look() })
            }
            for ((label, action) in starters) {
                Text(label, style = Type.callout, color = c.ink, modifier = chip.background(c.surface).clickable(onClick = action).padding(horizontal = 14.dp, vertical = 8.dp).testTag("chip-${label.lowercase().filter { it.isLetter() }}"))
            }
        }
    }
}

/**
 * Before recording (add-record-sheet): the project, microphone only or with the camera, and an
 * optional title. The device is the clip when it is connected, the phone otherwise.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun RecordSheet(vm: LenteViewModel, hub: HubState, onDismiss: () -> Unit, onRecord: (project: String?, camera: Boolean, title: String) -> Unit) {
    val c = Lente.c
    val s = hub.status
    val projects by vm.projects.collectAsState()
    var project by rememberSaveable { mutableStateOf<String?>(vm.chatProject.value) }
    var camera by rememberSaveable { mutableStateOf(false) }
    var title by rememberSaveable { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.bg) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Lente.gutter).padding(bottom = 24.dp).testTag("record-sheet"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Grabar", style = Type.title, color = c.ink)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(if (s.clip && s.clipIsDevice) Glyph.Device else Glyph.Phone, c.accent, size = 20.dp)
                Spacer(Modifier.width(8.dp))
                Text(RecordChoice.deviceLine(s.clip, s.clip && !s.clipIsDevice), style = Type.callout, color = c.muted, modifier = Modifier.testTag("record-device"))
            }
            Segmented(listOf("mic" to RecordChoice.captureLabel(false), "cam" to RecordChoice.captureLabel(true)), if (camera) "cam" else "mic", { camera = it == "cam" }, label = "Qué capturar")
            Field(title, { title = it }, "Título (opcional)", tag = "record-title")
            // The button before the list, so it stays in reach however many projects there are.
            Button("Empezar a grabar", { onRecord(project, camera, title) }, Modifier.fillMaxWidth().testTag("record-start"), glyph = Glyph.Mic)
            SectionTitle("Proyecto", trailing = RecordChoice.scopeLabel(project, projects).takeIf { project != null })
            Group {
                val options = listOf<Pair<String?, String>>(null to RecordChoice.AUTO_PROJECT) + projects.filter { it.active }.map { it.id to it.name }
                options.forEachIndexed { i, (id, name) ->
                    if (i > 0) Hairline()
                    ListRow(name, onClick = { project = id }, chevron = false, trailing = { if (project == id) Icon(Glyph.Check, c.accent, size = 20.dp) })
                }
            }
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
    val shape = RoundedCornerShape(24.dp)
    Row(
        Modifier.height(44.dp).shadow(if (c.dark || on) 0.dp else 4.dp, shape).clip(shape).background(if (on) c.liveFill else c.glass).border(0.5.dp, if (on) c.liveFill else c.line, shape)
            .clickable(onClick = onClick).padding(horizontal = 14.dp).testTag("status-row"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(when { on -> c.onLive; s.clip -> c.ok; else -> c.muted }, 9.dp)
        Spacer(Modifier.width(8.dp))
        Text(Copy.device(s), style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.onLive else c.ink, maxLines = 1, modifier = Modifier.testTag("device"))
        if (on) Text(" · ${Format.clock(hub.elapsedMs(now))}", style = Type.measured.copy(fontWeight = FontWeight.SemiBold), color = c.onLive, maxLines = 1)
    }
}

@Composable
private fun LiveBarRow(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.liveFill).clickable { vm.openLive() }.padding(horizontal = 16.dp, vertical = 10.dp).testTag("live-bar"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Transcripción en vivo", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.onLive, modifier = Modifier.weight(1f))
        Text("Abrir", style = Type.headline, color = c.onLive)
    }
}

/** The round button beside the field: starts listening, or pauses (red) while it listens. */
@Composable
private fun ListenButton(listening: Boolean, onClick: () -> Unit) {
    val c = Lente.c
    Box(
        Modifier.size(58.dp).shadow(if (c.dark) 0.dp else 12.dp, CircleShape).clip(CircleShape).background(if (listening) c.liveFill else c.accentFill)
            .clickable(onClick = onClick).testTag("pill").semantics { contentDescription = if (listening) "Pausar" else "Grabar" },
        contentAlignment = Alignment.Center,
    ) {
        // A record dot to start, as on any recorder; two bars to pause. The field's own mic is for dictation.
        if (listening) Icon(Glyph.Pause, c.onAccent, size = 26.dp) else Dot(c.onAccent, 20.dp)
    }
}
