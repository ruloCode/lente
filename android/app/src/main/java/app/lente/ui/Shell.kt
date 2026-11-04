package app.lente.ui

import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
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
import app.lente.core.RecordChoice
import app.lente.core.Copy
import app.lente.core.Opening
import app.lente.core.Gate
import app.lente.BuildConfig
import kotlinx.coroutines.launch

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun LenteRoot(vm: LenteViewModel, askMicrophone: ((Boolean) -> Unit) -> Unit, askSight: ((Boolean) -> Unit) -> Unit = askMicrophone) {
    val c = Lente.c
    var welcomed by remember { mutableStateOf(vm.prefs.welcomed && vm.prefs.hub != null) }
    /** «Usar Lente en mi computadora» on the sign-in screen: the intro with its pairing step instead. */
    var computer by remember { mutableStateOf(false) }
    val link by vm.link.collectAsState()
    val signedIn by vm.signedIn.collectAsState()
    val terms by vm.terms.collectAsState()
    // ship-hackathon 3.1: a build with sign-in opens on «Iniciar sesión con Google», never on pairing; then the terms.
    val gate = Opening.gate(
        configured = vm.account.configured && !computer, signedIn = signedIn, hub = vm.hubAddress, cloudHub = BuildConfig.CLOUD_HUB,
        // Signing in marks the intro done (prefs), which this screen's own flag learns on the next sign-in change.
        welcomed = welcomed || (signedIn && vm.prefs.welcomed && vm.prefs.hub != null), connected = link != Link.None, terms = terms.needed,
    )
    Box(Modifier.fillMaxSize().background(c.bg).semantics { testTagsAsResourceId = true }) {
        when (gate) {
            Gate.SignIn -> SignInScreen(vm, useComputer = { computer = true })
            Gate.Terms -> TermsScreen(vm)
            Gate.Intro -> Intro(vm, onDone = { vm.prefs.welcomed = true; welcomed = true })
            Gate.App -> Shell(vm, askMicrophone, askSight, replayIntro = { vm.prefs.welcomed = false; welcomed = false })
        }
    }
}

private val MENU_MEMORY = listOf(
    Triple(Screen.Proyectos, "Proyectos", Glyph.Doc),
    Triple(Screen.Reuniones, "Reuniones", Glyph.Calendar),
    Triple(Screen.Acciones, "Acciones", Glyph.Tasks),
    Triple(Screen.Memoria, "Memoria", Glyph.Brain),
)
private val MENU_GENERAL = listOf(
    Triple(Screen.Ahora, "Inicio", Glyph.Wave),
    Triple(Screen.Conexiones, "Conexiones", Glyph.Link),
    Triple(Screen.Dispositivos, "Dispositivos", Glyph.Device),
    Triple(Screen.Ajustes, "Ajustes", Glyph.Gear),
)
private val MENU_SOON = listOf(
    Triple(Screen.Pronto("equipo"), "Equipo", Glyph.Team),
)

fun title(s: Screen) = when (s) {
    Screen.Ahora -> "Lente"
    Screen.Reuniones -> "Reuniones"
    is Screen.Reunion -> "Reunión"
    Screen.Acciones -> "Acciones"
    Screen.Memoria -> "Memoria"
    Screen.Proyectos -> "Proyectos"
    Screen.Conexiones -> "Conexiones"
    Screen.Actividad -> "Actividad"
    is Screen.Proyecto -> "Proyecto"
    Screen.Dispositivos -> "Dispositivos"
    Screen.Ajustes -> "Ajustes"
    is Screen.Pronto -> SOON[s.what]?.first ?: "Pronto"
}

@Composable
private fun Shell(vm: LenteViewModel, askMicrophone: ((Boolean) -> Unit) -> Unit, askSight: ((Boolean) -> Unit) -> Unit, replayIntro: () -> Unit) {
    val c = Lente.c
    val hub by vm.hub.collectAsState()
    val stack by vm.stack.collectAsState()
    val link by vm.link.collectAsState()
    val live by vm.liveOpen.collectAsState()
    val camera by vm.cameraOpen.collectAsState()
    val voice by vm.voiceOpen.collectAsState()
    val sight by vm.sightOpen.collectAsState()
    val toast by vm.toast.collectAsState()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val screen = stack.last()
    val s = hub.status

    BackHandler(enabled = drawer.isOpen || live || camera || voice || sight || stack.size > 1 || screen != Screen.Ahora) {
        if (drawer.isOpen) scope.launch { drawer.close() } else if (voice) vm.closeVoice() else vm.back()
    }

    val usePhone: () -> Unit = { askMicrophone { ok -> if (ok) vm.startPhone() } }

    // The menu button sits top right, so the menu slides in from the right (add-home-dock): the drawer runs
    // right to left, and its sheet and the screen behind it go back to left to right.
    val ltr: @Composable (@Composable () -> Unit) -> Unit = { content -> CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr, content = content) }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
    ModalNavigationDrawer(
        drawerState = drawer,
        scrimColor = c.scrim,
        gesturesEnabled = !live && !camera && !voice && !sight,
        drawerContent = {
            ltr {
                ModalDrawerSheet(drawerContainerColor = c.bg, drawerShape = RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp), modifier = Modifier.width(312.dp)) {
                    Drawer(vm, screen, go = { target -> vm.go(target); scope.launch { drawer.close() } }, close = { scope.launch { drawer.close() } })
                }
            }
        },
    ) {
        ltr {
        Box(Modifier.fillMaxSize().background(c.bg)) {
            if (screen == Screen.Ahora) Column(Modifier.fillMaxSize()) {
                if (s.listening && s.clip) Box(Modifier.fillMaxWidth().height(3.dp).background(c.liveFill).testTag("live-strip"))
                if (link is Link.Reconnecting) Notice("Reconectando con la computadora…", Modifier.statusBarsPadding().padding(horizontal = Lente.gutter, vertical = 4.dp), tag = "reconnecting")
                Home(vm, hub, usePhone, onMenu = { scope.launch { drawer.open() } }, talk = {
                    // Hablar con Lente hears the phone when the clip is not connected, so it asks for the microphone first.
                    askMicrophone { ok -> if (ok) vm.openVoice() else vm.say("Lente necesita el micrófono para hablar contigo.") }
                }, record = { project, camera, title, phone ->
                    // The device comes from the sheet's «Con qué»; the phone needs the microphone (and the camera) first.
                    if (!phone) vm.record(project, camera, title, usePhone = false)
                    else askMicrophone { ok -> if (ok) vm.record(project, camera, title, usePhone = true) else vm.say("Lente necesita el micrófono para grabar con el teléfono.") }
                }, sight = { phone ->
                    // Ver is a conversation: without the clip Lente hears the phone, so it asks for the microphone (and the location) first.
                    askSight { vm.openSight(phone) }
                })
            } else Column(Modifier.fillMaxSize()) {
                if (s.listening && s.clip) Box(Modifier.fillMaxWidth().height(3.dp).background(c.liveFill).testTag("live-strip"))
                TopBar(title(screen), s, onMenu = { scope.launch { drawer.open() } }, onPill = vm::toggleListening, back = { vm.back() })
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
                            Screen.Proyectos -> ProyectosScreen(vm)
                            Screen.Conexiones -> Conexiones(vm)
                            Screen.Actividad -> Actividad(vm)
                            is Screen.Proyecto -> ProyectoScreen(vm)
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
            AnimatedVisibility(sight, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
                SightScreen(vm, hub)
            }
            AnimatedVisibility(voice, enter = slideInVertically(tween(320)) { it } + fadeIn(), exit = slideOutVertically(tween(260)) { it } + fadeOut()) {
                VoiceScreen(vm)
            }
        }
        }
    }
    }
}

@Composable
private fun TopBar(title: String, s: app.lente.core.Status, onMenu: () -> Unit, onPill: () -> Unit, back: (() -> Unit)?) {
    val c = Lente.c
    // As every screen of the app now: back on the left, a small centred title, the menu on the right (it opens from there).
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        PlainIcon(Glyph.Back, "Volver", Modifier.testTag("back")) { back?.invoke() }
        Text(title, style = Type.headline.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Normal), color = c.ink, maxLines = 1, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f).testTag("screen-title"))
        PlainIcon(Glyph.Menu, "Abrir menú", Modifier.testTag("menu"), onMenu)
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
private fun Drawer(vm: LenteViewModel, current: Screen, go: (Screen) -> Unit, close: () -> Unit) {
    val c = Lente.c
    val hub by vm.hub.collectAsState()
    val s = hub.status
    val chosen = { t: Screen -> current == t || (t == Screen.Reuniones && current is Screen.Reunion) || (t == Screen.Proyectos && current is Screen.Proyecto) }
    Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Mark(size = 22.dp)
            Spacer(Modifier.width(10.dp))
            Text("Lente", style = Type.headline, color = c.ink, modifier = Modifier.weight(1f))
            PlainIcon(Glyph.Close, "Cerrar el menú", Modifier.testTag("menu-close"), close)
        }
        // The device first: what hears now, and the way to its details.
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).clickable { go(Screen.Dispositivos) }.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Dot(if (s.clip) c.ok else c.muted, 10.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(Copy.device(s), style = Type.body, color = c.ink)
                Text(if (s.listening) "Escuchando" else "En pausa", style = Type.caption, color = c.muted)
            }
            Icon(Glyph.ChevronRight, c.muted, size = 18.dp)
        }
        MenuLabel("Tu memoria")
        MenuCard {
            MENU_MEMORY.forEachIndexed { i, (target, label, glyph) ->
                if (i > 0) Hairline()
                DrawerRow(label, glyph, chosen(target), badge = if (target == Screen.Acciones) hub.actions.pending.size else 0) { go(target) }
            }
        }
        MenuLabel("General")
        MenuCard {
            MENU_GENERAL.forEachIndexed { i, (target, label, glyph) ->
                if (i > 0) Hairline()
                val waiting = if (target == Screen.Conexiones) vm.jobs.value?.let(app.lente.core.Connections::waiting) ?: 0 else 0
                DrawerRow(label, glyph, chosen(target), badge = waiting, tag = if (target == Screen.Ahora) "Ahora" else label) { go(target) }
            }
        }
        MenuLabel("Pronto")
        MenuCard {
            MENU_SOON.forEachIndexed { i, (target, label, glyph) ->
                if (i > 0) Hairline()
                DrawerRow(label, glyph, chosen(target), soon = true) { go(target) }
            }
        }
        val recent = hub.meetings.take(3)
        if (recent.isNotEmpty()) {
            MenuLabel("Recientes")
            MenuCard {
                recent.forEachIndexed { i, m ->
                    if (i > 0) Hairline()
                    Row(Modifier.fillMaxWidth().clickable { go(Screen.Reunion(m.id)) }.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                        One(m.displayTitle, Type.body, c.ink, Modifier.weight(1f))
                        Text(app.lente.core.Format.hhmm(m.startedAt), style = Type.measured, color = c.muted, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
        Spacer(Modifier.windowInsetsPadding(WindowInsets.safeDrawing).navigationBarsPadding())
    }
}

@Composable
private fun MenuLabel(text: String) = Text(text, style = Type.caption, color = Lente.c.muted, modifier = Modifier.padding(start = 6.dp, top = 10.dp))

@Composable
private fun MenuCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Lente.c.surface), content = content)

/** One row of the menu: glyph, name, and at the end the pending count, Pronto, or a dot when it is the screen in view. */
@Composable
private fun DrawerRow(label: String, glyph: Glyph, selected: Boolean, badge: Int = 0, soon: Boolean = false, tag: String = label, onClick: () -> Unit) {
    val c = Lente.c
    Row(
        Modifier.fillMaxWidth().height(Lente.row).clickable(onClick = onClick).padding(horizontal = 16.dp).testTag("nav-$tag")
            .semantics { this.selected = selected },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(glyph, if (soon) c.muted else c.ink, size = 20.dp)
        Spacer(Modifier.width(14.dp))
        Text(label, style = Type.body.copy(fontWeight = if (selected) androidx.compose.ui.text.font.FontWeight.SemiBold else androidx.compose.ui.text.font.FontWeight.Normal), color = if (soon) c.muted else c.ink, modifier = Modifier.weight(1f))
        when {
            soon -> Text("Pronto", style = Type.caption, color = c.muted, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.raised).padding(horizontal = 8.dp, vertical = 2.dp))
            else -> {
                if (badge > 0) Text("$badge", style = Type.caption.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = c.bg, modifier = Modifier.padding(end = 8.dp).clip(CircleShape).background(c.ink).padding(horizontal = 8.dp, vertical = 2.dp))
                if (selected) Box(Modifier.padding(end = 8.dp).size(6.dp).clip(CircleShape).background(c.ink))
                Icon(Glyph.ChevronRight, c.muted, size = 16.dp)
            }
        }
    }
}

/** Planned features: what they will do, with the change that builds them. */
val SOON = mapOf(
    "conexiones" to Triple("Conexiones", "Lente como herramienta para otros agentes (MCP), y tus agentes con acceso a lo que Lente sabe.", "add-glasses-mcp"),
    "equipo" to Triple("Equipo", "Tus agentes en la nube, en la computadora y en el teléfono, con lo que hace cada uno y su conversación.", "add-agent-harness"),
    "computadora" to Triple("Modo computadora", "Lente en Meet, Teams o Zoom desde la computadora, sin el clip.", "add-desktop-mode"),
    "nube" to Triple("Hub en la nube", "Lente funciona fuera de casa, sin la computadora encendida.", "add-cloud-hub"),
)
