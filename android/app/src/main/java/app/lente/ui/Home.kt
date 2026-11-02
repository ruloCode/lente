package app.lente.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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

private enum class HomeTab(val title: String) { Inicio("Inicio"), Tareas("Tareas"), Hoy("Hoy") }

/**
 * The first screen, chat first: the device in the top-left corner and round shortcuts on the right;
 * Inicio (the conversation with Lente, with the DILO line pinned on top), Tareas and Hoy as large
 * titles to switch between; at the bottom, a field to ask Lente and the button that listens.
 */
@Composable
fun Home(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit, onMenu: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    var tab by rememberSaveable { mutableStateOf(HomeTab.Inicio) }
    val lines by vm.chat.collectAsState()
    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            DevicePill(hub) { if (hub.status.listening && hub.status.clip) vm.openLive() else vm.go(Screen.Dispositivos) }
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RoundIcon(Glyph.Calendar, "Reuniones") { vm.go(Screen.Reuniones) }
                RoundIcon(Glyph.Brain, "Memoria") { vm.go(Screen.Memoria) }
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
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Composer(enabled = lines.lastOrNull()?.pending != true, modifier = Modifier.weight(1f), placeholder = "Pregúntale a Lente…") { q ->
                tab = HomeTab.Inicio
                vm.askLente(q)
            }
            Spacer(Modifier.width(10.dp))
            ListenButton(vm, s.listening)
        }
    }
}

/** Inicio: what needs the wearer now (notes, the DILO line), then the conversation or, before it starts, a greeting and a few things to do. */
@Composable
private fun Inicio(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit, lines: List<app.lente.core.ChatLine>, goTab: (HomeTab) -> Unit) {
    val s = hub.status
    val capture by Capture.state.collectAsState()
    val list = rememberLazyListState()
    LaunchedEffect(lines.size, lines.lastOrNull()?.pending) { if (lines.isNotEmpty()) list.animateScrollToItem(list.layoutInfo.totalItemsCount.coerceAtLeast(1) - 1) }
    LazyColumn(Modifier.fillMaxSize().testTag("ahora"), state = list, contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (s.listening && s.clip) item("live-bar") { LiveBarRow(vm, hub) }
        Copy.note(s)?.let { note -> item("note") { Notice(note, tag = "status-note") } }
        if (!s.clip && capture !is Capture.State.On && capture != Capture.State.Starting) item("use-phone") {
            Button("Usar el teléfono", usePhone, Modifier.fillMaxWidth().testTag("use-phone"), tone = Tone.Plain, glyph = Glyph.Phone)
        }
        (capture as? Capture.State.Stopped)?.let { stopped -> item("phone-note") { Notice(stopped.why, action = if (stopped.resumable) "Reanudar" else null, tag = "phone-note", onAction = usePhone) } }
        val card = hub.card
        if (card != null && !s.recordOnly) item("cue") { DiloCard(card) }
        if (lines.isEmpty()) {
            item("hello") { Welcome(s.names.firstOrNull()) }
            item("options") { Options(vm, hub, goTab) }
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
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        GlassMark(88.dp)
        Spacer(Modifier.height(16.dp))
        Text(Greeting.hello(now.hour, name), style = Type.title, color = c.ink, modifier = Modifier.testTag("greeting"))
        Text("Pregúntame por lo que viste y escuchaste.", style = Type.callout, color = c.muted, modifier = Modifier.padding(top = 4.dp))
    }
}

/** A few ways to start: two questions to Lente and two things the clip can do. */
@Composable
private fun Options(vm: LenteViewModel, hub: HubState, goTab: (HomeTab) -> Unit) {
    val s = hub.status
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Option(Glyph.Summary, "Resumen de hoy", "Lo que pasó y lo que quedó pendiente", Modifier.weight(1f)) { vm.askLente("Resumen de hoy") }
            Option(Glyph.Tasks, "¿Qué me falta?", "Lo que prometiste y lo que te toca", Modifier.weight(1f)) { vm.askLente("¿Qué me falta por hacer?") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Option(Glyph.Eye, "Mirar", if (s.clip) "Una foto y lo que hay en ella" else "Conecta el clip o el teléfono", Modifier.weight(1f), enabled = s.clip) { vm.look() }
            Option(Glyph.Camera, "En vivo", if (s.clip) "Lente describe lo que ves" else "Conecta el clip o el teléfono", Modifier.weight(1f), enabled = s.clip) { vm.openCamera() }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Option(Glyph.Calendar, "Reuniones", "Notas y transcripciones", Modifier.weight(1f)) { vm.go(Screen.Reuniones) }
            Option(Glyph.Wave, "Hoy", "${Format.minutes(hub.spend.audioSeconds)} escuchados", Modifier.weight(1f)) { goTab(HomeTab.Hoy) }
        }
    }
}

@Composable
private fun Option(glyph: Glyph, title: String, hint: String, modifier: Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier.clip(shape).background(c.surface).border(0.5.dp, c.line, shape).clickable(enabled = enabled, onClick = onClick).padding(14.dp)
            .testTag("option-${title.lowercase().filter { it.isLetter() }}"),
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(c.tag), contentAlignment = Alignment.Center) { Icon(glyph, if (enabled) c.accent else c.muted, size = 20.dp) }
        Text(title, style = Type.headline, color = if (enabled) c.ink else c.muted, modifier = Modifier.padding(top = 10.dp), maxLines = 1)
        Text(hint, style = Type.caption, color = c.muted, maxLines = 2)
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
private fun ListenButton(vm: LenteViewModel, listening: Boolean) {
    val c = Lente.c
    Box(
        Modifier.size(58.dp).shadow(if (c.dark) 0.dp else 12.dp, CircleShape).clip(CircleShape).background(if (listening) c.liveFill else c.accentFill)
            .clickable(onClick = vm::toggleListening).testTag("pill").semantics { contentDescription = if (listening) "Pausar" else "Empezar a escuchar" },
        contentAlignment = Alignment.Center,
    ) {
        // A record dot to start, as on any recorder; two bars to pause. The field's own mic is for dictation.
        if (listening) Icon(Glyph.Pause, c.onAccent, size = 26.dp) else Dot(c.onAccent, 20.dp)
    }
}
