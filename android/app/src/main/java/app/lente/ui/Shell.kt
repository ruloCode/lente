package app.lente.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Link
import app.lente.Screen
import app.lente.capture.Capture
import app.lente.core.Copy
import kotlinx.coroutines.launch

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun LenteRoot(vm: LenteViewModel, askMicrophone: ((Boolean) -> Unit) -> Unit) {
    val c = Lente.c
    var welcomed by remember { mutableStateOf(vm.prefs.welcomed && vm.prefs.hub != null) }
    val link by vm.link.collectAsState()
    Box(Modifier.fillMaxSize().background(c.bg).semantics { testTagsAsResourceId = true }) {
        if (!welcomed || link == Link.None) {
            Intro(vm, onDone = { vm.prefs.welcomed = true; welcomed = true })
        } else {
            Shell(vm, askMicrophone, replayIntro = { vm.prefs.welcomed = false; welcomed = false })
        }
    }
}

private val MENU_MAIN = listOf(
    Triple(Screen.Ahora, "Ahora", Glyph.Wave),
    Triple(Screen.Reuniones, "Reuniones", Glyph.Calendar),
    Triple(Screen.Acciones, "Acciones", Glyph.Tasks),
    Triple(Screen.Memoria, "Memoria", Glyph.Brain),
    Triple(Screen.Dispositivos, "Dispositivos", Glyph.Device),
    Triple(Screen.Ajustes, "Ajustes", Glyph.Gear),
)
private val MENU_SOON = listOf(
    Triple(Screen.Pronto("conexiones"), "Conexiones", Glyph.Link),
    Triple(Screen.Pronto("equipo"), "Equipo", Glyph.Team),
)

fun title(s: Screen) = when (s) {
    Screen.Ahora -> "Lente"
    Screen.Reuniones -> "Reuniones"
    is Screen.Reunion -> "Reunión"
    Screen.Acciones -> "Acciones"
    Screen.Memoria -> "Memoria"
    Screen.Dispositivos -> "Dispositivos"
    Screen.Ajustes -> "Ajustes"
    is Screen.Pronto -> SOON[s.what]?.first ?: "Pronto"
}

@Composable
private fun Shell(vm: LenteViewModel, askMicrophone: ((Boolean) -> Unit) -> Unit, replayIntro: () -> Unit) {
    val c = Lente.c
    val hub by vm.hub.collectAsState()
    val stack by vm.stack.collectAsState()
    val link by vm.link.collectAsState()
    val live by vm.liveOpen.collectAsState()
    val camera by vm.cameraOpen.collectAsState()
    val toast by vm.toast.collectAsState()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val screen = stack.last()
    val s = hub.status

    BackHandler(enabled = drawer.isOpen || live || camera || stack.size > 1 || screen != Screen.Ahora) {
        if (drawer.isOpen) scope.launch { drawer.close() } else vm.back()
    }

    val usePhone: () -> Unit = { askMicrophone { ok -> if (ok) vm.startPhone() } }

    ModalNavigationDrawer(
        drawerState = drawer,
        scrimColor = c.scrim,
        gesturesEnabled = !live && !camera,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = c.surface, drawerShape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp), modifier = Modifier.width(304.dp)) {
                Drawer(vm, screen) { target -> vm.go(target); scope.launch { drawer.close() } }
            }
        },
    ) {
        Box(Modifier.fillMaxSize().background(c.bg)) {
            if (screen == Screen.Ahora) Column(Modifier.fillMaxSize()) {
                if (s.listening && s.clip) Box(Modifier.fillMaxWidth().height(3.dp).background(c.liveFill).testTag("live-strip"))
                if (link is Link.Reconnecting) Notice("Reconectando con la computadora…", Modifier.statusBarsPadding().padding(horizontal = Lente.gutter, vertical = 4.dp), tag = "reconnecting")
                Home(vm, hub, usePhone, onMenu = { scope.launch { drawer.open() } })
            } else Column(Modifier.fillMaxSize()) {
                if (s.listening && s.clip) Box(Modifier.fillMaxWidth().height(3.dp).background(c.liveFill).testTag("live-strip"))
                TopBar(title(screen), s, onMenu = { scope.launch { drawer.open() } }, onPill = vm::toggleListening, back = if (screen is Screen.Reunion) ({ vm.back() }) else null)
                if (link is Link.Reconnecting) Notice("Reconectando con la computadora…", Modifier.padding(horizontal = Lente.gutter, vertical = 4.dp), tag = "reconnecting")
                if (link == Link.Unpaired) Notice("Este hub pide emparejar el teléfono. Abre Ajustes para escribir el código.", Modifier.padding(horizontal = Lente.gutter, vertical = 4.dp))
                Box(Modifier.weight(1f)) {
                    Crossfade(screen, animationSpec = tween(180), label = "screen") { sc ->
                        when (sc) {
                            Screen.Ahora -> {}
                            Screen.Reuniones -> Reuniones(vm, hub)
                            is Screen.Reunion -> Reunion(vm, sc)
                            Screen.Acciones -> Acciones(vm, hub)
                            Screen.Memoria -> Memoria(vm, hub)
                            Screen.Dispositivos -> Dispositivos(vm, hub, usePhone)
                            Screen.Ajustes -> Ajustes(vm, hub, replayIntro)
                            is Screen.Pronto -> Pronto(sc.what)
                        }
                    }
                }
            }
            AnimatedVisibility(toast != null, Modifier.align(Alignment.BottomCenter).padding(bottom = 104.dp, start = 24.dp, end = 24.dp), enter = fadeIn() + slideInVertically { it / 2 }, exit = fadeOut()) {
                Text(toast ?: "", style = Type.callout, color = c.surface, modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(c.ink).padding(horizontal = 16.dp, vertical = 12.dp).testTag("toast"))
            }
            AnimatedVisibility(live, enter = slideInVertically(tween(320)) { it } + fadeIn(), exit = slideOutVertically(tween(260)) { it } + fadeOut()) {
                Live(vm, hub)
            }
            AnimatedVisibility(camera, enter = slideInVertically(tween(320)) { it } + fadeIn(), exit = slideOutVertically(tween(260)) { it } + fadeOut()) {
                Camera(vm, hub)
            }
        }
    }
}

@Composable
private fun TopBar(title: String, s: app.lente.core.Status, onMenu: () -> Unit, onPill: () -> Unit, back: (() -> Unit)?) {
    val c = Lente.c
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(44.dp).shadow(if (c.dark) 0.dp else 4.dp, CircleShape).clip(CircleShape).background(c.glass).border(0.5.dp, c.line, CircleShape)
                .clickable(onClick = back ?: onMenu).semantics { contentDescription = if (back != null) "Volver" else "Abrir menú" }.testTag(if (back != null) "back" else "menu"),
            contentAlignment = Alignment.Center,
        ) { Icon(if (back != null) Glyph.Back else Glyph.Menu, c.ink) }
        Spacer(Modifier.width(12.dp))
        if (title == "Lente") Mark(size = 26.dp)
        if (title == "Lente") Spacer(Modifier.width(8.dp))
        One(title, Type.title, c.ink, Modifier.weight(1f).testTag("screen-title"))
        Pill(s, onPill)
    }
}

/** The listening pill: red while listening or recording, outlined when paused. A tap pauses or resumes. */
@Composable
fun Pill(s: app.lente.core.Status, onClick: () -> Unit) {
    val c = Lente.c
    val on = s.listening && s.clip
    val text = Copy.pill(s)
    val shape = RoundedCornerShape(50)
    Row(
        Modifier.height(36.dp).clip(shape)
            .background(if (on) c.liveFill else if (s.listening) c.raised else c.surface)
            .then(if (!s.listening) Modifier.border(1.dp, c.line, shape) else Modifier)
            .clickable(onClick = onClick).padding(horizontal = 14.dp)
            .semantics { contentDescription = "$text. Toca para ${if (s.listening) "pausar" else "escuchar"}" }.testTag("pill"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(if (on) c.onLive else c.muted)
        Spacer(Modifier.width(8.dp))
        Text(text, style = Type.callout.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = if (on) c.onLive else c.ink)
    }
}

@Composable
private fun Drawer(vm: LenteViewModel, current: Screen, go: (Screen) -> Unit) {
    val c = Lente.c
    val hub by vm.hub.collectAsState()
    val s = hub.status
    Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).statusBarsPadding().padding(vertical = 16.dp)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Mark(size = 30.dp)
            Spacer(Modifier.width(10.dp))
            Text("Lente", style = Type.title, color = c.ink)
        }
        Row(Modifier.padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Dot(if (s.clip) c.ok else c.muted)
            Spacer(Modifier.width(8.dp))
            Text(Copy.device(s), style = Type.callout, color = c.muted)
        }
        Spacer(Modifier.height(12.dp))
        for ((target, label, glyph) in MENU_MAIN) {
            val badge = if (target == Screen.Acciones) hub.actions.pending.size else 0
            DrawerRow(label, glyph, current == target || (target == Screen.Reuniones && current is Screen.Reunion), badge) { go(target) }
        }
        Text("PRONTO", style = Type.label, color = c.muted, modifier = Modifier.padding(start = 28.dp, top = 20.dp, bottom = 6.dp))
        for ((target, label, glyph) in MENU_SOON) DrawerRow(label, glyph, current == target, soon = true) { go(target) }
        val recent = hub.meetings.take(3)
        if (recent.isNotEmpty()) {
            Text("RECIENTES", style = Type.label, color = c.muted, modifier = Modifier.padding(start = 28.dp, top = 20.dp, bottom = 6.dp))
            for (m in recent) {
                Row(Modifier.fillMaxWidth().clickable { go(Screen.Reunion(m.id)) }.padding(horizontal = 28.dp, vertical = 10.dp)) {
                    One(m.displayTitle, Type.callout, c.ink, Modifier.weight(1f))
                    Text(app.lente.core.Format.hhmm(m.startedAt), style = Type.measured, color = c.muted)
                }
            }
        }
        Spacer(Modifier.windowInsetsPadding(WindowInsets.safeDrawing).navigationBarsPadding())
    }
}

@Composable
private fun DrawerRow(label: String, glyph: Glyph, selected: Boolean, badge: Int = 0, soon: Boolean = false, onClick: () -> Unit) {
    val c = Lente.c
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp).height(Lente.row).clip(RoundedCornerShape(14.dp))
            .background(if (selected) c.tag else c.surface).clickable(onClick = onClick).padding(horizontal = 16.dp).testTag("nav-$label"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(glyph, if (selected) c.accent else c.ink)
        Spacer(Modifier.width(14.dp))
        Text(label, style = Type.body.copy(fontWeight = if (selected) androidx.compose.ui.text.font.FontWeight.SemiBold else androidx.compose.ui.text.font.FontWeight.Normal), color = if (selected) c.accent else c.ink, modifier = Modifier.weight(1f))
        if (badge > 0) Text("$badge", style = Type.label, color = c.onAccent, modifier = Modifier.clip(CircleShape).background(c.accentFill).padding(horizontal = 8.dp, vertical = 3.dp))
        if (soon) Text("Pronto", style = Type.caption, color = c.muted, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(c.raised).padding(horizontal = 8.dp, vertical = 2.dp))
    }
}

/** Planned features: what they will do, with the change that builds them. */
val SOON = mapOf(
    "conexiones" to Triple("Conexiones", "Lente como herramienta para otros agentes (MCP), y tus agentes con acceso a lo que Lente sabe.", "add-glasses-mcp"),
    "equipo" to Triple("Equipo", "Tus agentes en la nube, en la computadora y en el teléfono, con lo que hace cada uno y su conversación.", "add-agent-harness"),
    "computadora" to Triple("Modo computadora", "Lente en Meet, Teams o Zoom desde la computadora, sin el clip.", "add-desktop-mode"),
    "nube" to Triple("Hub en la nube", "Lente funciona fuera de casa, sin la computadora encendida.", "add-cloud-hub"),
)
