package app.lente.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.core.Account
import app.lente.core.AgentKind
import app.lente.core.Connections
import app.lente.core.JobItem
import kotlinx.coroutines.delay

/**
 * Conexiones (add-home-dock): the agents that use what Lente knows (Claude Code, Codex, Cursor, Muse Code,
 * any MCP client) and the bridge that runs approved work on the user's computer, with the jobs they were
 * given. Connecting is a sheet in three steps: which agent, what it may do, and the exact line to paste.
 */
@Composable
fun Conexiones(vm: LenteViewModel) {
    val c = Lente.c
    val devices by vm.devices.collectAsState()
    val jobs by vm.jobs.collectAsState()
    val note by vm.jobsNote.collectAsState()
    // Revoked tokens are gone for good, so the list keeps only the live ones.
    val agents = devices.filter { it.kind == "mcp" && !it.revoked }
    var connecting by rememberSaveable { mutableStateOf(false) }
    var agentOpen by rememberSaveable { mutableStateOf<String?>(null) }
    var jobOpen by rememberSaveable { mutableStateOf<String?>(null) }
    val now = remember { System.currentTimeMillis() }
    LaunchedEffect(Unit) { vm.loadAccount(); vm.loadJobs() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = Lente.gutter).padding(top = 4.dp, bottom = 24.dp).testTag("conexiones")) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // The marks of the agents Lente speaks to, as a quiet row of monograms.
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (a in Connections.AGENTS.take(4)) AgentTile(a.key)
            }
            Text("Tus agentes, con tu memoria", style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink)
            Text("Claude Code, Codex, Cursor o Muse Code pueden preguntarle a Lente, leer tus tareas y, si lo apruebas, hacer trabajo en tu computadora.", style = Type.callout, color = c.muted)
            Button("Conectar un agente", { connecting = true }, Modifier.fillMaxWidth().testTag("conn-add"), glyph = Glyph.Plus)
        }
        SectionTitle("Conectados", trailing = if (agents.isEmpty()) null else "${agents.size}")
        Group {
            if (agents.isEmpty()) ListRow("Ninguno todavía", hint = "Conecta uno y aparece aquí", leading = { Icon(Glyph.Link, c.muted, size = 20.dp) })
            agents.forEachIndexed { i, d ->
                if (i > 0) Hairline()
                // When the token was made tells two tokens of the same agent apart.
                ListRow(
                    d.label, hint = Account.kindLine(d).removePrefix("Agente · ") + " · creado " + Connections.madeOn(d.createdAt, now),
                    value = if (d.lastSeenAt == null) "Sin usar" else Account.lastSeen(d.lastSeenAt, now),
                    leading = { AgentTile(keyFor(d.label), small = true) },
                    onClick = { agentOpen = d.id },
                    modifier = Modifier.testTag("conn-agent-${d.id}"),
                )
            }
        }
        SectionTitle("Trabajos", trailing = jobs?.size?.takeIf { it > 0 }?.toString())
        Group {
            val list = jobs
            when {
                list == null -> ListRow("Cargando…", leading = { Icon(Glyph.Clock, c.muted, size = 20.dp) })
                list.isEmpty() -> ListRow(note ?: "Nada todavía", hint = if (note == null) "Pídele algo a un agente desde una tarea o el chat" else null, leading = { Icon(Glyph.Tasks, c.muted, size = 20.dp) })
                else -> list.forEachIndexed { i, j ->
                    if (i > 0) Hairline()
                    ListRow(
                        j.instruction.ifBlank { "Sin instrucción" }, hint = "${j.agentName} · ${Connections.stageLabel(j.stage)}",
                        leading = { StageMark(j.stage) }, onClick = { jobOpen = j.id }, modifier = Modifier.testTag("conn-job-${j.id}"),
                    )
                }
            }
        }
        Text("Nada se ejecuta sin tu aprobación. Lente anota en tu día qué agente consultó qué, sin el contenido.", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
    }

    if (connecting) ConnectSheet(vm) { connecting = false; vm.loadAccount() }
    agentOpen?.let { id -> devices.firstOrNull { it.id == id }?.let { d -> AgentSheet(vm, d) { agentOpen = null } } ?: run { agentOpen = null } }
    jobOpen?.let { id -> jobs?.firstOrNull { it.id == id }?.let { j -> JobSheet(vm, j) { jobOpen = null } } ?: run { jobOpen = null } }
}

/**
 * Each kind of agent drawn with Lente's own glyphs, never a brand's logo (their marks need the owner's
 * permission): a terminal for the command-line agents, braces for Codex, a text cursor for the editor,
 * a spark for Muse Code, a plug for any MCP client, a paper plane for the bridge that sends work.
 */
private fun glyphFor(key: String): Glyph = when (key) {
    "claude" -> Glyph.Terminal
    "codex" -> Glyph.Braces
    "cursor" -> Glyph.IBeam
    "muse" -> Glyph.Sparkle
    Connections.BRIDGE -> Glyph.Send
    else -> Glyph.Plug
}

/** The catalog's key for a connected agent's label; any other name is a plain MCP client. */
private fun keyFor(label: String): String = Connections.AGENTS.firstOrNull { it.name == label }?.key ?: "mcp"

/** An agent's glyph in an ink tile. */
@Composable
private fun AgentTile(key: String, modifier: Modifier = Modifier, small: Boolean = false) {
    val c = Lente.c
    Box(modifier.size(if (small) 34.dp else 42.dp).clip(RoundedCornerShape(10.dp)).background(c.ink), contentAlignment = Alignment.Center) {
        Icon(glyphFor(key), c.bg, size = if (small) 18.dp else 22.dp)
    }
}

/** Where a job is, as a small mark: a ring waiting, a clock queued, a wave working, a tick done, a cross failed or rejected. */
@Composable
private fun StageMark(stage: String) {
    val c = Lente.c
    when (stage) {
        "pending" -> Box(Modifier.size(20.dp).clip(CircleShape).border(1.5.dp, c.ink, CircleShape), contentAlignment = Alignment.Center) { Box(Modifier.size(6.dp).clip(CircleShape).background(c.ink)) }
        "queued" -> Icon(Glyph.Clock, c.muted, size = 20.dp)
        "running" -> Icon(Glyph.Wave, c.ink, size = 20.dp)
        "done" -> Box(Modifier.size(20.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) { Icon(Glyph.Check, c.bg, size = 12.dp) }
        "failed" -> Icon(Glyph.Close, c.live, size = 20.dp)
        else -> Icon(Glyph.Close, c.muted, size = 20.dp)
    }
}

/** A sheet like the app's others: centred small title, the grey ground, fully open. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun ConnSheet(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val c = Lente.c
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.bg, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(horizontal = Lente.gutter).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
            content()
        }
    }
}

/**
 * Connecting, in three steps in one sheet: which agent, what it may do (the bridge always runs approved
 * jobs), then the line to paste with the hub and the token filled in, a copy button, and «Conectado» once
 * the agent's first call reaches the hub.
 */
@Composable
private fun ConnectSheet(vm: LenteViewModel, close: () -> Unit) {
    val c = Lente.c
    val token by vm.newClipToken.collectAsState()
    val devices by vm.devices.collectAsState()
    val clipboard = LocalClipboardManager.current
    var kind by rememberSaveable { mutableStateOf<String?>(null) }
    var choice by rememberSaveable { mutableStateOf("tasks") }
    var madeAt by rememberSaveable { mutableStateOf(0L) }
    var copied by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    val agent: AgentKind? = Connections.AGENTS.firstOrNull { it.key == kind }
    val done = { vm.forgetClipToken(); close() }
    val connected = agent != null && token != null && Connections.connected(devices, agent.name, madeAt)
    // A new token replaces the ones of the same agent that were never used: they would only be clutter.
    LaunchedEffect(token) {
        if (token == null || agent == null) return@LaunchedEffect
        creating = false
        vm.loadAccount()
        delay(1_500)
        Connections.unusedToReplace(vm.devices.value, agent.name).forEach { vm.revokeDevice(it.id) }
    }
    // While the line waits to be pasted, look every few seconds for the agent's first call.
    LaunchedEffect(token, connected) { while (token != null && !connected) { delay(CONNECT_POLL_MS); vm.loadAccount() } }

    ConnSheet(
        when { agent == null -> "Conectar un agente"; token == null -> agent.name; else -> "Pégalo en ${agent.name}" },
        done,
    ) {
        when {
            agent == null -> {
                Text("¿Cuál quieres conectar?", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp))
                Group {
                    Connections.AGENTS.forEachIndexed { i, a ->
                        if (i > 0) Hairline()
                        ListRow(
                            a.name, hint = a.where, leading = { AgentTile(a.key, small = true) }, onClick = { kind = a.key },
                            trailing = { if (a.tested) Text("Probado", style = Type.caption, color = c.muted, modifier = Modifier.padding(end = 6.dp).clip(RoundedCornerShape(6.dp)).background(c.raised).padding(horizontal = 8.dp, vertical = 2.dp)) },
                            modifier = Modifier.testTag("conn-kind-${a.key}"),
                        )
                    }
                }
            }
            token == null -> {
                if (agent.key == Connections.BRIDGE) {
                    Text("El puente corre en tu computadora y hace los trabajos que apruebes, con Claude Code o Codex, solo en las carpetas que le permitas.", style = Type.callout, color = c.ink)
                } else {
                    Text("Qué puede hacer", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp))
                    Group {
                        for ((i, opt) in listOf("read" to ("Solo leer" to "Preguntar a tu memoria y buscar reuniones"), "tasks" to ("Leer y crear tareas" to "Además, agregar y completar tus tareas")).withIndex()) {
                            if (i > 0) Hairline()
                            ListRow(opt.second.first, hint = opt.second.second, chevron = false, onClick = { choice = opt.first }, trailing = { if (choice == opt.first) Icon(Glyph.Check, c.ink, size = 20.dp) })
                        }
                    }
                }
                Button(if (creating) "Creando…" else "Crear token", { if (!creating) { creating = true; madeAt = System.currentTimeMillis(); vm.newAgent(agent.name, Connections.access(agent.key, choice)) } }, Modifier.fillMaxWidth().testTag("conn-create"), enabled = !creating)
                Button("Elegir otro", { kind = null }, Modifier.fillMaxWidth(), tone = Tone.Plain)
            }
            else -> {
                val hub = vm.hubAddress ?: ""
                val line = Connections.setup(agent.key, hub, token!!)
                Text(agent.where + ". El token se muestra una sola vez.", style = Type.callout, color = c.muted)
                Text(line, style = Type.caption.copy(fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 17.sp), color = c.ink, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(14.dp).testTag("conn-setup"))
                Button(if (copied) "Copiado" else "Copiar", { clipboard.setText(AnnotatedString(line)); copied = true }, Modifier.fillMaxWidth().testTag("conn-copy"), glyph = if (copied) Glyph.Check else Glyph.Copy)
                if (!agent.tested) Text("Esta configuración sale de la documentación de ${agent.name}; todavía no la probamos contra un hub.", style = Type.caption, color = c.muted)
                // The state of the connection: waiting for the agent's first call, then connected.
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (connected) Box(Modifier.size(20.dp).clip(CircleShape).background(c.ok), contentAlignment = Alignment.Center) { Icon(Glyph.Check, c.bg, size = 12.dp) }
                    else Box(Modifier.size(20.dp).clip(CircleShape).border(1.5.dp, c.line, CircleShape))
                    Spacer(Modifier.width(12.dp))
                    Text(if (connected) "Conectado: ${agent.name} ya habló con Lente." else "Esperando que ${agent.name} se conecte…", style = Type.callout, color = c.ink, modifier = Modifier.testTag("conn-state"))
                }
                Button("Listo", done, Modifier.fillMaxWidth(), tone = Tone.Plain)
            }
        }
    }
}

/** How often the connect sheet looks for the agent's first call. */
private const val CONNECT_POLL_MS = 3_000L

/** One connected agent: what it is, what it may do, when it last spoke, and revoking it. */
@Composable
private fun AgentSheet(vm: LenteViewModel, d: Account.Device, close: () -> Unit) {
    ConnSheet(d.label, close) {
        Group {
            ListRow("Acceso", value = Account.kindLine(d).removePrefix("Agente · "))
            Hairline(); ListRow("Último uso", value = if (d.revoked) "Revocado" else Account.lastSeen(d.lastSeenAt, System.currentTimeMillis()))
        }
        if (!d.revoked) Button("Revocar acceso", { vm.revokeDevice(d.id); close() }, Modifier.fillMaxWidth().testTag("revoke-${d.id}"), tone = Tone.Live)
    }
}

/** One job: what was asked, who does it, where it is, and its summary when finished; one waiting for approval leads to «Por aprobar». */
@Composable
private fun JobSheet(vm: LenteViewModel, j: JobItem, close: () -> Unit) {
    val c = Lente.c
    ConnSheet(j.agentName, close) {
        Text(j.instruction, style = Type.body, color = c.ink, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp))
        Group {
            ListRow("Estado", value = Connections.stageLabel(j.stage), leading = { StageMark(j.stage) })
            j.summary?.let { Hairline(); ListRow("Resultado", hint = it) }
        }
        if (j.stage == "pending") Button("Revisar en Por aprobar", { close(); vm.go(Screen.Acciones) }, Modifier.fillMaxWidth())
    }
}
