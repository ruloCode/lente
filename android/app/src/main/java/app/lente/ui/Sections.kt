package app.lente.ui

import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.CircleShape

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.lente.BuildConfig
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.capture.Capture
import app.lente.core.Account
import app.lente.core.Copy
import app.lente.core.TaskOwners
import app.lente.core.Format
import app.lente.core.HubState
import app.lente.core.PendingAction
import kotlinx.coroutines.launch

// --- Acciones ---------------------------------------------------------------------------------

private val FIELDS = mapOf(
    "create_task" to listOf("title" to "Título", "due" to "Para cuándo"),
    "create_reminder" to listOf("title" to "Título", "date" to "Fecha (AAAA-MM-DD)", "note" to "Nota"),
    "draft_email" to listOf("to" to "Para (separa con comas)", "subject" to "Asunto", "body" to "Texto"),
    "run_agent" to listOf("agent" to "Agente (claude o codex)", "instruction" to "Instrucción", "workdir" to "Carpeta (vacía: la del puente)"),
)

/** Acciones: what the agent proposes after a meeting (nothing runs until approved) and the task list. */
@Composable
fun Acciones(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val ctx = LocalContext.current
    val a = hub.actions
    val done = a.tasks.filter { it.done }
    var newTask by rememberSaveable { mutableStateOf("") }
    var newWho by rememberSaveable { mutableStateOf("me") }
    var byProject by rememberSaveable { mutableStateOf(false) }
    var projectFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var whoFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var showDone by rememberSaveable { mutableStateOf(false) }
    var adding by rememberSaveable { mutableStateOf(false) }
    val add = { if (newTask.isNotBlank()) { vm.addTask(newTask.trim(), newWho); newTask = ""; adding = false } }
    // A new task is written in a sheet, opened from the small + beside the view controls.
    if (adding) SettingsSheet("Nueva tarea", { adding = false }) {
        val focus = remember { androidx.compose.ui.focus.FocusRequester() }
        LaunchedEffect(Unit) { kotlinx.coroutines.delay(150); runCatching { focus.requestFocus() } }
        Field(newTask, { newTask = it }, "Qué hay que hacer", Modifier.focusRequester(focus), tag = "task-new", onDone = add)
        Text("Quién la hace", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp))
        Segmented(TaskOwners.ORDER.map { it to when (it) { "lente" -> "Lente"; "other" -> "Otro"; else -> "Tú" } }, newWho, { newWho = it }, label = "Quién la hace")
        Button("Agregar", add, Modifier.fillMaxWidth().testTag("task-add"), enabled = newTask.isNotBlank())
    }
    LazyColumn(Modifier.fillMaxSize().testTag("acciones"), contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // At a glance: what is yours, what waits for approval, what is done.
        item("summary") {
            val mine = a.tasks.count { !it.done && it.who == "me" }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TaskStat("$mine", "Te tocan", Modifier.weight(1f), on = whoFilter == "me") { whoFilter = if (whoFilter == "me") null else "me" }
                TaskStat("${a.pending.size}", "Por aprobar", Modifier.weight(1f))
                TaskStat("${done.size}", "Hechas", Modifier.weight(1f)) { showDone = !showDone }
            }
        }
        if (a.pending.isNotEmpty()) {
            item { SectionTitle("Por aprobar", trailing = "${a.pending.size}") }
            items(a.pending, key = { it.id }) { p -> ActionCard(p) { approve, args -> vm.decide(p.id, approve, args) { mailto -> runCatching { ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse(mailto))) } } } }
        }
        if (a.tasks.none { !it.done }) item("add-first") {
            Button("Nueva tarea", { adding = true }, Modifier.fillMaxWidth().testTag("task-open"), tone = Tone.Plain, glyph = Glyph.Plus)
        }
        if (a.tasks.any { !it.done }) item("view") {
            TaskViewControls(a.tasks, byProject, { byProject = it }, projectFilter, { projectFilter = it }, whoFilter, { whoFilter = it }, onAdd = { adding = true })
        }
        val shown = TaskOwners.filter(a.tasks, projectFilter, whoFilter)
        val groups = if (byProject) TaskOwners.byProject(shown) else TaskOwners.groups(shown).map { (who, list) -> TaskOwners.heading(who) to list }
        if (groups.isEmpty() && a.pending.isEmpty()) item("empty") {
            Empty(if (a.tasks.any { !it.done }) "Ninguna tarea con estos filtros." else "Nada pendiente. Las tareas salen solas de tus reuniones, o agrégalas aquí.", art = app.lente.R.drawable.art_empty_actions)
        }
        for ((heading, list) in groups) {
            item("h-$heading") { SectionTitle(heading, trailing = "${list.size}") }
            item("g-$heading") {
                Group {
                    list.forEachIndexed { i, t ->
                        if (i > 0) Hairline()
                        TaskRow(t, onToggle = { vm.taskDone(t.id, true) }, onOwner = { vm.setTaskOwner(t.id, TaskOwners.next(t.who)) }, onDelete = { vm.deleteTask(t.id) }, onAgent = if (t.who == "lente") ({ vm.agentJob(t.id) }) else null)
                    }
                }
            }
        }
        if (done.isNotEmpty()) {
            item("done-toggle") {
                Group(Modifier.padding(top = 6.dp)) {
                    ListRow("Hechas", value = "${done.size}", leading = { Icon(Glyph.Check, c.ink, size = 20.dp) }, chevron = false, onClick = { showDone = !showDone }, trailing = { Icon(if (showDone) Glyph.ChevronDown else Glyph.ChevronRight, c.muted, Modifier.padding(start = 6.dp), size = 16.dp) })
                    if (showDone) done.forEach { t -> Hairline(); TaskRow(t, onToggle = { vm.taskDone(t.id, false) }, onOwner = null, onDelete = { vm.deleteTask(t.id) }) }
                }
            }
        }
    }
}

/** One count at the top of Tareas; tappable when it filters or opens something, outlined in ink while it filters. */
@Composable
private fun TaskStat(value: String, label: String, modifier: Modifier = Modifier, on: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = Lente.c
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(c.surface).then(if (on) Modifier.border(1.5.dp, c.ink, RoundedCornerShape(12.dp)) else Modifier)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(value, style = Type.title.copy(fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum"), color = c.ink)
        Text(label, style = Type.caption, color = c.muted, maxLines = 1)
    }
}

/** How Tareas is laid out: by who does each task or by project, and filters by project and by owner. */
@Composable
private fun TaskViewControls(
    tasks: List<app.lente.core.Task>,
    byProject: Boolean,
    setByProject: (Boolean) -> Unit,
    project: String?,
    setProject: (String?) -> Unit,
    who: String?,
    setWho: (String?) -> Unit,
    onAdd: () -> Unit,
) {
    val c = Lente.c
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Segmented(listOf("who" to "Por quién", "project" to "Por proyecto"), if (byProject) "project" else "who", { setByProject(it == "project") }, Modifier.weight(1f), label = "Ordenar tareas")
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(38.dp).clip(CircleShape).background(c.ink).clickable(onClick = onAdd).semantics { contentDescription = "Nueva tarea" }.testTag("task-open"),
                contentAlignment = Alignment.Center,
            ) { Icon(Glyph.Plus, c.bg, size = 20.dp) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                label = project?.let { it.ifEmpty { TaskOwners.NO_PROJECT } } ?: "Todos los proyectos",
                active = project != null,
                options = listOf<Pair<String?, String>>(null to "Todos los proyectos") + TaskOwners.projectsWithTasks(tasks).map { it to it.ifEmpty { TaskOwners.NO_PROJECT } },
                tag = "filter-project",
                onPick = setProject,
            )
            FilterChip(
                label = who?.let { TaskOwners.heading(it) } ?: "Todos",
                active = who != null,
                options = listOf<Pair<String?, String>>(null to "Todos") + TaskOwners.ORDER.map { it to TaskOwners.heading(it) },
                tag = "filter-who",
                onPick = setWho,
            )
        }
    }
}

@Composable
private fun FilterChip(label: String, active: Boolean, options: List<Pair<String?, String>>, tag: String, onPick: (String?) -> Unit) {
    val c = Lente.c
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    Box {
        Row(
            Modifier.clip(shape).background(if (active) c.ink else c.surface).clickable { open = true }.padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp).testTag(tag),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = Type.callout, color = if (active) c.bg else c.ink, maxLines = 1)
            Icon(Glyph.ChevronDown, c.muted, Modifier.padding(start = 2.dp), size = 16.dp)
        }
        DropdownMenu(open, { open = false }) {
            options.forEach { (value, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { onPick(value); open = false }) }
        }
    }
}

@Composable
private fun TaskRow(t: app.lente.core.Task, onToggle: () -> Unit, onOwner: (() -> Unit)?, onDelete: () -> Unit, onAgent: (() -> Unit)? = null) {
    val c = Lente.c
    Row(Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(start = 14.dp, end = 8.dp, top = 12.dp, bottom = 12.dp).testTag("task-${t.id}"), verticalAlignment = Alignment.Top) {
        // A round check: an ink disc with a tick when done, an empty ring otherwise.
        Box(
            Modifier.padding(top = 1.dp).size(22.dp).clip(CircleShape).then(if (t.done) Modifier.background(c.ink) else Modifier.border(1.5.dp, c.line, CircleShape)).clickable(onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) { if (t.done) Icon(Glyph.Check, c.bg, size = 14.dp) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title, style = Type.body.copy(textDecoration = if (t.done) androidx.compose.ui.text.style.TextDecoration.LineThrough else null), color = if (t.done) c.muted else c.ink)
            // The project, the meeting and the due date, as TaskOwners already words them.
            val context = TaskOwners.context(t)
            if (context.isNotEmpty()) Text(context, style = Type.caption, color = c.muted, modifier = Modifier.padding(top = 2.dp))
            // add-agent-bridge: hands the task to the wearer's coding agent, after approval in Por aprobar.
            if (onAgent != null) Text("Que lo haga un agente", style = Type.caption.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = c.ink, modifier = Modifier.padding(top = 4.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onAgent).padding(vertical = 4.dp).testTag("task-agent-${t.id}"))
        }
        if (onOwner != null) Tag(TaskOwners.tag(t), Modifier.padding(start = 8.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onOwner).testTag("task-owner-${t.id}"))
        Box(Modifier.padding(start = 2.dp).clip(CircleShape).clickable(onClick = onDelete).padding(6.dp).testTag("task-delete-${t.id}").semantics { contentDescription = "Borrar la tarea" }) { Icon(Glyph.Trash, c.muted.copy(alpha = 0.7f), size = 16.dp) }
    }
}

@Composable
private fun ActionCard(p: PendingAction, decide: (Boolean, Map<String, String>) -> Unit) {
    val c = Lente.c
    var editing by remember(p.id) { mutableStateOf(false) }
    val values = remember(p.id) {
        mutableStateMapOf<String, String>().apply {
            for ((k, _) in FIELDS[p.tool] ?: emptyList()) put(k, p.args.opt(k)?.let { v -> if (v is org.json.JSONArray) (0 until v.length()).joinToString(", ") { v.optString(it) } else v.toString() } ?: "")
        }
    }
    Card(Modifier.testTag("action-${p.id}")) {
        Text(Copy.TOOL[p.tool] ?: p.tool, style = Type.headline, color = c.ink)
        if (p.meetingTitle.isNotBlank()) Text(p.meetingTitle, style = Type.caption, color = c.muted)
        for ((k, label) in FIELDS[p.tool] ?: emptyList()) {
            Text(label, style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp, top = 10.dp, bottom = 4.dp))
            if (editing) Field(values[k] ?: "", { values[k] = it }, label, singleLine = k != "body" && k != "instruction")
            else Text((values[k] ?: "").ifBlank { "—" }, style = Type.callout, color = c.ink)
        }
        for (q in p.quotes.filter { it.text.isNotBlank() }) Text(
            "“${q.text}”" + listOfNotNull(q.speaker, q.at?.let { Format.hhmm(it) }).joinToString(" · ", prefix = " · "),
            style = Type.caption, color = c.muted, modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button("Aprobar", { decide(true, values.toMap()) }, Modifier.testTag("approve-${p.id}"))
            if (!editing) Button("Editar", { editing = true }, tone = Tone.Plain)
            Button("Rechazar", { decide(false, emptyMap()) }, tone = Tone.Quiet, modifier = Modifier.testTag("reject-${p.id}"))
        }
    }
}

// --- Memoria ----------------------------------------------------------------------------------

/** Memoria: facts to review, what Lente remembers, the wearer's phrases and vocabulary. */
@Composable
fun Memoria(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val facts by vm.facts.collectAsState()
    var q by rememberSaveable { mutableStateOf("") }
    val lang = hub.language
    val review = facts.filter { it.status == "proposed" }
    val kept = facts.filter { it.status == "kept" && (q.isBlank() || it.text.contains(q, ignoreCase = true)) }
    val empty = facts.isEmpty() && lang.phrases.isEmpty() && lang.glossary.isEmpty() && lang.asked == 0
    LazyColumn(Modifier.fillMaxSize().testTag("memoria"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (empty) {
            item { Spacer(Modifier.height(8.dp)) }
            item { Empty("Cuando termines una reunión, aquí verás cuántas veces te preguntaron, las frases que repites y las palabras nuevas.", art = app.lente.R.drawable.art_empty_memory) }
            return@LazyColumn
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile("${lang.asked}", "veces te preguntaron", Modifier.weight(1f))
                Tile("${lang.answered}", "veces contestaste", Modifier.weight(1f))
            }
        }
        if (review.isNotEmpty()) {
            item { SectionTitle("Por revisar", trailing = "${review.size}") }
            items(review, key = { it.id }) { f ->
                Card {
                    Text(f.text, style = Type.body, color = c.ink)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button("Guardar", { vm.fact(f.id, true) }, Modifier.testTag("keep-${f.id}"))
                        Button("Descartar", { vm.fact(f.id, false) }, tone = Tone.Plain)
                        if (f.evidence.isNotEmpty()) Button("Ver el turno", { vm.go(Screen.Reunion(f.meetingId, f.evidence.first())) }, tone = Tone.Quiet)
                    }
                }
            }
        }
        if (facts.any { it.status == "kept" }) {
            item { SectionTitle("Lo que Lente recuerda") }
            item { Field(q, { q = it }, "Buscar en lo que recuerda") }
            item {
                Group {
                    kept.forEachIndexed { i, f ->
                        if (i > 0) Hairline()
                        ListRow(f.text, chevron = false) { Text("Borrar", style = Type.callout.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = c.ink, modifier = Modifier.clickable { vm.fact(f.id, false) }.padding(8.dp)) }
                    }
                }
            }
        }
        if (lang.phrases.isNotEmpty()) {
            item { SectionTitle("Lo que sueles decir") }
            item { Group { lang.phrases.forEachIndexed { i, p -> if (i > 0) Hairline(); ListRow("“$p”") } } }
        }
        if (lang.glossary.isNotEmpty()) {
            item { SectionTitle("Mi vocabulario") }
            item {
                Group {
                    lang.glossary.forEachIndexed { i, g ->
                        if (i > 0) Hairline()
                        ListRow("${g.term}: ${g.meaning}", hint = g.example.ifBlank { null }?.let { "“$it”" }, value = "×${g.count}")
                    }
                }
            }
        }
    }
}

@Composable
private fun Tile(value: String, label: String, modifier: Modifier) {
    Card(modifier) {
        Text(value, style = Type.large.copy(fontFeatureSettings = "tnum"), color = Lente.c.ink)
        Text(label, style = Type.caption, color = Lente.c.muted)
    }
}

// --- Dispositivos -----------------------------------------------------------------------------

@Composable
fun Dispositivos(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    val capture by Capture.state.collectAsState()
    val phoneOn = capture is Capture.State.On || capture == Capture.State.Starting
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = Lente.gutter).padding(top = 4.dp, bottom = 24.dp).testTag("dispositivos")) {
        // The device as one card: its picture, its name and state, and a badge that says at a glance whether it hears.
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface)) {
            Box(Modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(c.raised, c.surface)))) {
                ClipPicture(Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                Row(
                    Modifier.align(Alignment.TopEnd).padding(12.dp).clip(RoundedCornerShape(10.dp)).background(c.surface).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Dot(if (s.clip) c.ok else c.muted, 8.dp)
                    Spacer(Modifier.width(6.dp))
                    Text(if (s.clip) "Conectado" else "Desconectado", style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = c.ink)
                }
            }
            Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp)) {
                Text(if (s.phoneIsDevice) "Tu teléfono" else "Clip de Lente", style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink)
                Text(
                    when {
                        !s.clip -> "Enciéndelo cerca: se conecta solo a la misma red Wi-Fi que el hub."
                        s.listening -> "${Copy.device(s)} · Escuchando · ${Copy.mode(s)}"
                        else -> "${Copy.device(s)} · En pausa · ${Copy.mode(s)}"
                    },
                    style = Type.callout, color = c.muted,
                )
            }
        }
        SectionTitle("Hoy")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile(Format.recorded(hub.recordedMs), "Grabado", Modifier.weight(1f))
            StatTile(Format.minutes(hub.spend.audioSeconds), "Transcrito", Modifier.weight(1f))
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile(Format.tokens(hub.spend.tokens), "Tokens", Modifier.weight(1f))
            StatTile(Format.usd(hub.spend.usd, hub.spend.unpriced), "Costo aproximado", Modifier.weight(1f))
        }
        Text("El audio se transcribe; se guarda solo con «Guardar audio» activado, cifrado. En silencio no se envía.", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
        SectionTitle("Conexión")
        Group {
            val clean = s.audioLost == 0 && s.audioLate == 0
            ListRow(
                if (clean) "Sin pérdidas" else "Audio con problemas",
                hint = if (clean) "Todo el audio llegó a tiempo" else "${s.audioLost} perdidos · ${s.audioLate} con retraso",
                leading = { Dot(if (clean) c.ok else c.live, 10.dp) },
            )
        }
        SectionTitle("Captura")
        Segmented(listOf("mic" to "Solo audio", "camera" to "Audio y cámara"), s.mode, vm::setMode, label = "Modo del clip")
        SectionTitle("Otras formas de usar Lente")
        Group {
            val hint = when {
                s.clipIsDevice && !phoneOn -> "El clip ya está conectado"
                phoneOn -> "Escuchando con el teléfono, también con la pantalla apagada"
                else -> "Su micrófono y cámara, sin el clip"
            }
            ListRow(
                if (phoneOn) "Dejar de usar el teléfono" else "Usar el teléfono", hint = hint, chevron = false,
                leading = { Icon(Glyph.Phone, c.ink, size = 20.dp) },
                onClick = if (s.clipIsDevice && !phoneOn) null else ({ if (phoneOn) vm.stopPhone() else usePhone() }),
                modifier = Modifier.testTag("phone-toggle"),
            )
            Hairline(); ListRow("Modo computadora", hint = "Meet, Teams o Zoom, sin el clip", leading = { Icon(Glyph.Device, c.muted, size = 20.dp) }, titleColor = c.muted, trailing = { SoonTag() }, chevron = false, onClick = { vm.go(Screen.Pronto("computadora")) })
            Hairline(); ListRow("Hub en la nube", hint = "Funciona fuera de casa", leading = { Icon(Glyph.Link, c.muted, size = 20.dp) }, titleColor = c.muted, trailing = { SoonTag() }, chevron = false, onClick = { vm.go(Screen.Pronto("nube")) })
        }
        SectionTitle("Hub")
        Group { ListRow(vm.hubAddress?.removePrefix("https://")?.removePrefix("http://")?.substringBefore('/')?.let { if (it.endsWith(".modal.run")) "En la nube" else it } ?: "Sin hub", leading = { Icon(Glyph.Link, c.ink, size = 20.dp) }, onClick = { vm.go(Screen.Ajustes) }) }
    }
}

/** One number of the day in its own tile: the value large, what it is under it. */
@Composable
private fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    val c = Lente.c
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(c.surface).padding(horizontal = 16.dp, vertical = 14.dp)) {
        Text(value, style = Type.title.copy(fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum"), color = c.ink, maxLines = 1)
        Text(label, style = Type.caption, color = c.muted)
    }
}

@Composable
private fun SoonTag() = Text("Pronto", style = Type.caption, color = Lente.c.muted, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Lente.c.raised).padding(horizontal = 8.dp, vertical = 2.dp))

/** The clip on a pair of glasses: the transparent render in light, the one lit on black in dark. */
@Composable
fun ClipPicture(modifier: Modifier = Modifier) {
    val c = Lente.c
    androidx.compose.foundation.Image(
        androidx.compose.ui.res.painterResource(if (c.dark) app.lente.R.drawable.art_clip_dark else app.lente.R.drawable.art_clip),
        contentDescription = "El clip de Lente en unos lentes",
        contentScale = androidx.compose.ui.layout.ContentScale.Fit,
        modifier = modifier.fillMaxWidth().aspectRatio(16f / 9f),
    )
}

// --- Ajustes ----------------------------------------------------------------------------------

@Composable
fun Ajustes(vm: LenteViewModel, hub: HubState, replayIntro: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    val voice by vm.readAloud.collectAsState()
    val theme by vm.theme.collectAsState()
    val signedIn by vm.signedIn.collectAsState()
    // Ajustes is a list of rows; what edits opens in a sheet (names, theme, hub, devices, deletes), never inline.
    var sheet by rememberSaveable { mutableStateOf<String?>(null) }
    val open = { what: String -> sheet = what }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = Lente.gutter).padding(top = 4.dp, bottom = 24.dp).testTag("ajustes")) {
        if (vm.account.configured || vm.account.signedIn) AccountSection(vm, open)
        SectionTitle("Tú")
        Group {
            SetRow(Glyph.Person, "Tu nombre", value = s.names.joinToString(", ").ifBlank { "Sin definir" }) { open("names") }
            Hairline(); SetRow(Glyph.Mic, "Tu voz", hint = "Di «Lente, soy…» con el clip", value = if (s.wearer.isNotEmpty()) "Reconocida" else "Sin reconocer")
        }
        SectionTitle("Lente")
        Group {
            SwitchRow("Solo grabar", s.recordOnly, { vm.setAssist(if (it) "record" else "assist") }, hint = "Sin sugerencias", tag = "set-record", leading = { RowGlyph(Glyph.Wave) })
            Hairline(); SwitchRow("Leer en voz alta", voice, vm::setReadAloud, hint = "Respuestas y resúmenes", tag = "set-voice", leading = { RowGlyph(Glyph.Speaker) })
            Hairline(); SpeechRateRow(vm)
            Hairline(); SwitchRow("Todas las preguntas", s.everyQuestion, vm::everyQuestion, hint = "Solo para pruebas", tag = "set-all", leading = { RowGlyph(Glyph.Sparkle) })
        }
        // add-media-archive 4.1: what is kept besides the text, only where the hub offers it (its owner, for now).
        if (s.media.offered) {
            SectionTitle("Qué se guarda")
            Group {
                SwitchRow("Guardar audio", s.media.audio, { vm.setMedia("audio", it) }, hint = "Solo lo que se dice, cifrado", tag = "set-media-audio", leading = { RowGlyph(Glyph.Wave) })
                Hairline(); SwitchRow("Guardar fotos", s.media.photos, { vm.setMedia("photos", it) }, hint = "Una cuando cambia la escena", tag = "set-media-photos", leading = { RowGlyph(Glyph.Camera) })
                Hairline(); SetRow(Glyph.Trash, "Borrar después de", value = "${s.media.retentionDays} días") { vm.setMediaRetention(s.media.nextRetention) }
            }
            Text("El audio y las fotos se guardan cifrados con tu clave, solo se reproducen desde Lente y se borran solos al pasar esos días, al olvidar un día o al borrar una reunión. Apagarlos deja de guardar en ese momento.", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
        }
        SectionTitle("Notificaciones")
        Group {
            val feed by vm.feed.collectAsState()
            LaunchedEffect(Unit) { if (vm.feed.value == null) vm.loadFeed() }
            val p = feed?.prefs
            SetRow(Glyph.Bell, "Avisos", value = when { p == null -> null; !p.phone -> "Apagados"; p.quietOn -> "Con horas de silencio"; else -> "Encendidos" }) { open("notifications") }
        }
        SectionTitle("Apariencia")
        Group { SetRow(Glyph.Contrast, "Tema", value = THEMES.firstOrNull { it.first == theme }?.second ?: "Sistema") { open("theme") } }
        SectionTitle("Conexión")
        Group { SetRow(Glyph.Link, "Hub", value = vm.hubAddress?.removePrefix("https://")?.removePrefix("http://")?.substringBefore('/')?.let { host -> if (host.endsWith(".modal.run")) "En la nube" else if (host.length > 16) host.take(15) + "…" else host } ?: "Sin hub") { open("hub") } }
        SectionTitle("Privacidad")
        Group {
            // add-sight-mode: for someone trying Lente (the INCI session); the hub keeps nothing while it is on.
            SwitchRow("Sesión de invitado", s.guest, vm::setGuest, hint = if (s.guest) app.lente.core.Sight.GUEST else "No guarda audio, fotos ni el día", tag = "set-guest", leading = { RowGlyph(Glyph.Person) })
            Hairline()
            SetRow(Glyph.Trash, "Borrar toda la memoria", danger = true) { open("wipe") }
            if (signedIn) { Hairline(); AccountDataRows(vm, open) }
        }
        Text("Lente guarda el texto; el audio y las fotos, solo con «Guardar audio» y «Guardar fotos» activados. Los precios del gasto son los de lista.", style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
        SectionTitle("Ayuda")
        Group {
            SetRow(Glyph.Play, "Ver la introducción", onClick = replayIntro)
            // add-sight-mode: the next time Ver opens, Lente introduces itself and asks again.
            Hairline(); SetRow(Glyph.Person, "Volver a conocernos", hint = "Lente se presenta otra vez en Ver", onClick = vm::meetAgain)
            Hairline(); SetRow(Glyph.Brain, "Modelos", value = "Muse · Meta")
            Hairline(); SetRow(Glyph.Doc, "Versión", value = BuildConfig.VERSION_NAME)
        }
        if (signedIn) {
            Spacer(Modifier.height(20.dp))
            Text(
                "Cerrar sesión", style = Type.body, color = c.ink, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).clickable(onClick = vm::signOut).padding(vertical = 15.dp).testTag("sign-out"),
            )
        }
    }
    sheet?.let { AjustesSheet(vm, hub, it) { sheet = null } }
}

/** «Velocidad de la voz» (add-sight-mode): Lente's own text-to-speech rate, 0.8× to 2.0×; a sample plays on release. */
@Composable
private fun SpeechRateRow(vm: LenteViewModel) {
    val c = Lente.c
    val rate by vm.speechRate.collectAsState()
    Column(Modifier.fillMaxWidth().padding(horizontal = Lente.gutter, vertical = 10.dp).testTag("set-speech-rate")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RowGlyph(Glyph.Speaker)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Velocidad de la voz", style = Type.body, color = c.ink)
                Text("Con TalkBack se usa la suya", style = Type.caption, color = c.muted)
            }
            Text(app.lente.core.SpeechVoice.rateLabel(rate), style = Type.callout, color = c.muted)
        }
        androidx.compose.material3.Slider(
            value = rate, onValueChange = vm::setSpeechRate, valueRange = app.lente.core.SpeechVoice.MIN_RATE..app.lente.core.SpeechVoice.MAX_RATE,
            onValueChangeFinished = { vm.speak("Así habla Lente.") },
            colors = androidx.compose.material3.SliderDefaults.colors(thumbColor = c.ink, activeTrackColor = c.ink, inactiveTrackColor = c.raised),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Velocidad de la voz" },
        )
    }
}

private val THEMES = listOf("system" to "Sistema", "light" to "Claro", "dark" to "Oscuro")

/** A settings row: a bare glyph, the title (red when it destroys), an optional hint and value, a chevron when it opens something. */
@Composable
private fun SetRow(glyph: Glyph, title: String, hint: String? = null, value: String? = null, danger: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = Lente.c
    ListRow(title, hint = hint, value = value, titleColor = if (danger) c.live else null, leading = { RowGlyph(glyph, if (danger) c.live else c.ink) }, onClick = onClick)
}

@Composable
private fun RowGlyph(glyph: Glyph, tint: androidx.compose.ui.graphics.Color = Lente.c.ink) = Icon(glyph, tint, size = 20.dp)

/** The sheet a row opens: a centred small title and its content, on the grey ground, fully open. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
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

/** The sheets of Ajustes, by what was tapped. */
@Composable
private fun AjustesSheet(vm: LenteViewModel, hub: HubState, what: String, close: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    val scope = rememberCoroutineScope()
    when {
        what == "names" -> {
            var names by rememberSaveable { mutableStateOf(s.names.joinToString(", ")) }
            SettingsSheet("Tu nombre", close) {
                Field(names, { names = it }, "Rulo, Raúl", onDone = { vm.saveNames(names); close() }, tag = "names")
                Text("Lente te avisa cuando alguien dice uno de estos nombres. Separa los apodos con comas.", style = Type.caption, color = c.muted)
                Button("Guardar", { vm.saveNames(names); close() }, Modifier.fillMaxWidth())
            }
        }
        what == "theme" -> {
            val theme by vm.theme.collectAsState()
            SettingsSheet("Tema", close) {
                Group {
                    THEMES.forEachIndexed { i, (key, label) ->
                        if (i > 0) Hairline()
                        ListRow(label, onClick = { vm.setTheme(key); close() }, chevron = false, trailing = { if (theme == key) Icon(Glyph.Check, c.ink, size = 20.dp) })
                    }
                }
            }
        }
        what == "hub" -> {
            val link by vm.link.collectAsState()
            var address by rememberSaveable { mutableStateOf(vm.hubAddress ?: "") }
            var code by rememberSaveable { mutableStateOf("") }
            var note by remember { mutableStateOf<String?>(null) }
            SettingsSheet("Hub", close) {
                Text("La dirección de la computadora o de la nube donde corre Lente.", style = Type.callout, color = c.muted)
                Field(address, { address = it }, "192.168.1.20", tag = "hub-address")
                Button("Conectar", { scope.launch { note = vm.tryHub(address) ?: "Conectado." } }, Modifier.fillMaxWidth())
                if (link == app.lente.Link.Unpaired) {
                    Field(code, { code = it }, "Código de emparejamiento")
                    Button("Emparejar", { scope.launch { note = if (vm.pair(code)) "Emparejado." else "Ese código no sirve: pide uno nuevo en el hub." } }, Modifier.fillMaxWidth(), tone = Tone.Plain)
                }
                note?.let { Text(it, style = Type.caption, color = c.muted) }
            }
        }
        what == "wipe" -> SettingsSheet("Borrar toda la memoria", close) {
            Text("Se borran tus reuniones, recuerdos y tareas. No se puede deshacer.", style = Type.callout, color = c.ink)
            Button("Borrar toda la memoria", { vm.deleteAll(); close() }, Modifier.fillMaxWidth().testTag("wipe"), tone = Tone.Live)
            Button("Cancelar", close, Modifier.fillMaxWidth(), tone = Tone.Plain)
        }
        what == "delete-account" -> SettingsSheet("Borrar mi cuenta", close) {
            Text("Primero se borra tu clave: lo que quede en copias ya no se puede leer. Se borra todo, sin vuelta atrás.", style = Type.callout, color = c.ink)
            Button("Borrar mi cuenta", { vm.deleteAccount(); close() }, Modifier.fillMaxWidth().testTag("delete-account"), tone = Tone.Live)
            Button("Cancelar", close, Modifier.fillMaxWidth(), tone = Tone.Plain)
        }
        what == "new-device" -> NewDeviceSheet(vm, close)
        what == "notifications" -> NotificationsSheet(vm, close)
        what.startsWith("device:") -> {
            val devices by vm.devices.collectAsState()
            val d = devices.firstOrNull { it.id == what.removePrefix("device:") } ?: return close()
            SettingsSheet(d.label, close) {
                Group {
                    ListRow("Tipo", value = Account.kindLine(d))
                    Hairline(); ListRow("Estado", value = if (d.revoked) "Revocado" else Account.lastSeen(d.lastSeenAt, System.currentTimeMillis()))
                }
                if (!d.revoked) Button("Revocar acceso", { vm.revokeDevice(d.id); close() }, Modifier.fillMaxWidth().testTag("revoke-${d.id}"), tone = Tone.Live)
            }
        }
    }
}

/**
 * Notificaciones (add-notifications): alerts on the phone, which kinds, quiet hours, meetings, the lock
 * screen and the clip's buzz. Saved on the hub so they follow the account, or on the phone for an old hub.
 */
@Composable
private fun NotificationsSheet(vm: LenteViewModel, close: () -> Unit) {
    val c = Lente.c
    val context = LocalContext.current
    val feed by vm.feed.collectAsState()
    val p = feed?.prefs ?: app.lente.core.NotificationPrefs()
    val save = { next: app.lente.core.NotificationPrefs -> vm.saveNotifyPrefs(next) }
    var allowed by remember { mutableStateOf(app.lente.platform.Alerts.allowed(context)) }
    val asking by vm.askNotifyPermission.collectAsState()
    // After the permission dialog closes, read the answer again.
    LaunchedEffect(asking) { if (!asking) allowed = app.lente.platform.Alerts.allowed(context) }
    SettingsSheet("Notificaciones", close) {
        if (!allowed && p.phone) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Android no deja que Lente te avise todavía.", style = Type.callout, color = c.ink)
                Button("Permitir notificaciones", { vm.askNotifyPermission.value = true }, Modifier.fillMaxWidth().testTag("notify-allow"))
            }
        }
        Group {
            SwitchRow("Avisos en el teléfono", p.phone, { save(p.copy(phone = it)) }, hint = "También con la app cerrada, con unos minutos de retraso", tag = "notify-phone", leading = { RowGlyph(Glyph.Bell) })
        }
        SheetLabel2("Qué te avisa")
        Group {
            val glyphs = mapOf("recordings" to Glyph.Doc, "approvals" to Glyph.Tasks, "memories" to Glyph.Brain, "agents" to Glyph.Terminal)
            val hints = mapOf("recordings" to "Notas listas o que fallaron", "approvals" to "Correos, tareas y recordatorios por aprobar", "memories" to "Recuerdos por revisar", "agents" to "Trabajos por aprobar, hechos o fallidos")
            app.lente.core.Notifications.GROUPS.forEachIndexed { i, g ->
                if (i > 0) Hairline()
                SwitchRow(app.lente.core.Notifications.GROUP_LABELS[g] ?: g, p.group(g), { on -> save(p.copy(groups = p.groups + (g to on))) }, hint = hints[g], tag = "notify-$g", leading = { RowGlyph(glyphs[g] ?: Glyph.Bell) })
            }
        }
        SheetLabel2("Cuándo")
        Group {
            SwitchRow("Horas de silencio", p.quietOn, { save(p.copy(quietOn = it)) }, hint = if (p.quietOn) "De ${app.lente.core.Notifications.clock(p.quietFrom)} a ${app.lente.core.Notifications.clock(p.quietTo)}" else "Sin avisos de noche", tag = "notify-quiet", leading = { RowGlyph(Glyph.Clock) })
            if (p.quietOn) {
                Hairline(); TimeStepper("Desde", p.quietFrom) { save(p.copy(quietFrom = it)) }
                Hairline(); TimeStepper("Hasta", p.quietTo) { save(p.copy(quietTo = it)) }
            }
            Hairline(); SwitchRow("En reuniones, solo lo urgente", p.meetingsUrgentOnly, { save(p.copy(meetingsUrgentOnly = it)) }, hint = "Aprobaciones y trabajos que fallaron", tag = "notify-meetings", leading = { RowGlyph(Glyph.Wave) })
        }
        SheetLabel2("Privacidad y clip")
        Group {
            SwitchRow("Ocultar el contenido", p.hideContent, { save(p.copy(hideContent = it)) }, hint = "En la pantalla bloqueada solo dice «Algo nuevo»", tag = "notify-hide", leading = { RowGlyph(Glyph.Eye) })
            Hairline(); SwitchRow("Vibrar el clip para lo urgente", p.clipBuzz, { save(p.copy(clipBuzz = it)) }, hint = "Una señal en tus lentes, fuera de las horas de silencio", tag = "notify-clip", leading = { RowGlyph(Glyph.Device) })
        }
        if (feed?.fromHub == false) Text("Tu hub todavía no guarda estos ajustes: quedan en este teléfono, y el clip no vibrará hasta que lo actualices.", style = Type.caption, color = c.muted, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun SheetLabel2(text: String) = Text(text, style = Type.caption, color = Lente.c.muted, modifier = Modifier.padding(start = 4.dp, top = 4.dp))

/** A time of day with − and + in half hours, for quiet hours. */
@Composable
private fun TimeStepper(label: String, minutes: Int, onChange: (Int) -> Unit) {
    val c = Lente.c
    val day = 24 * 60
    Row(Modifier.fillMaxWidth().padding(horizontal = Lente.gutter, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width(34.dp))
        Text(label, style = Type.body, color = c.ink, modifier = Modifier.weight(1f))
        PlainIcon(Glyph.Back, "Media hora antes", Modifier.size(40.dp)) { onChange((minutes - 30 + day) % day) }
        Text(app.lente.core.Notifications.clock(minutes), style = Type.headline.copy(fontFeatureSettings = "tnum"), color = c.ink, modifier = Modifier.padding(horizontal = 6.dp))
        PlainIcon(Glyph.ChevronRight, "Media hora después", Modifier.size(40.dp)) { onChange((minutes + 30) % day) }
    }
}

/** A new clip or agent token: the kind, what an agent may do, a name, then the token once with copy. */
@Composable
private fun NewDeviceSheet(vm: LenteViewModel, close: () -> Unit) {
    val c = Lente.c
    val token by vm.newClipToken.collectAsState()
    val clipboard = LocalClipboardManager.current
    var label by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("clip") }
    var access by rememberSaveable { mutableStateOf("read") }
    var tokenKind by rememberSaveable { mutableStateOf("clip") }
    val done = { vm.forgetClipToken(); close() }
    SettingsSheet("Conectar un clip o agente", done) {
        if (token == null) {
            Segmented(listOf("clip" to "Clip", "mcp" to "Agente"), kind, { kind = it }, label = "Tipo")
            if (kind == "mcp") Segmented(Account.AGENT_ACCESS, access, { access = it }, label = "Puede")
            Field(label, { label = it }, if (kind == "mcp") "Nombre del agente" else "Nombre del clip", tag = "clip-label")
            Button("Crear token", { if (kind == "mcp") vm.newAgent(label, access) else vm.newClip(label); tokenKind = kind; label = "" }, Modifier.fillMaxWidth())
        } else {
            Text(if (tokenKind == "mcp") "Token del agente. Se muestra una sola vez: ponlo en tu agente (Claude Code, Codex, Cursor) o en LENTE_TOKEN." else "Token del clip. Se muestra una sola vez: cópialo ahora en el firmware del clip.", style = Type.callout, color = c.muted)
            Text(token!!, style = Type.measured, color = c.ink, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(14.dp).testTag("clip-token"))
            Button("Copiar", { clipboard.setText(AnnotatedString(token!!)) }, Modifier.fillMaxWidth())
            Button("Listo", done, Modifier.fillMaxWidth(), tone = Tone.Plain)
        }
    }
}

/** The account at the top of Ajustes: who (or the way in), this month's spend, and the clips and agents with access. */
@Composable
fun AccountSection(vm: LenteViewModel, open: (String) -> Unit) {
    val c = Lente.c
    val signedIn by vm.signedIn.collectAsState()
    val info by vm.accountInfo.collectAsState()
    val devices by vm.devices.collectAsState()
    val activity = LocalContext.current as? Activity
    LaunchedEffect(signedIn) { if (signedIn) vm.loadAccount() }
    // A new token is shown once: leaving the screen forgets it.
    DisposableEffect(Unit) { onDispose { vm.forgetClipToken() } }

    if (!signedIn) {
        Column(Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { Icon(Glyph.Person, c.ink, size = 24.dp) }
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("Tu cuenta", style = Type.headline, color = c.ink)
                    Text("Tu memoria en la nube, en cualquier teléfono", style = Type.caption, color = c.muted)
                }
            }
            Button("Entrar con Google", { activity?.let(vm::signIn) }, Modifier.fillMaxWidth().testTag("sign-in"))
        }
        return
    }
    val name = vm.account.name.ifBlank { "Tu cuenta" }
    Group(Modifier.padding(top = 8.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) {
                Text(name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }, style = Type.headline, color = c.bg)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(name, style = Type.headline, color = c.ink)
                (info?.email?.ifBlank { null } ?: vm.account.email.ifBlank { null })?.let { Text(it, style = Type.caption, color = c.muted) }
            }
        }
        info?.let { Hairline(); SetRow(Glyph.Summary, "Gasto este mes", value = Account.spendLine(it).removeSuffix(" este mes")) }
    }
    SectionTitle("Clips y agentes")
    Group {
        devices.forEachIndexed { i, d ->
            if (i > 0) Hairline()
            SetRow(if (d.kind == "mcp") Glyph.Team else Glyph.Device, d.label, hint = Account.kindLine(d) + " · " + if (d.revoked) "Revocado" else Account.lastSeen(d.lastSeenAt, System.currentTimeMillis())) { open("device:${d.id}") }
        }
        if (devices.isNotEmpty()) Hairline()
        SetRow(Glyph.Plus, "Conectar un clip o agente") { open("new-device") }
    }
}

/** Export and delete the account, as rows of the privacy group. */
@Composable
private fun AccountDataRows(vm: LenteViewModel, open: (String) -> Unit) {
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let(vm::exportTo) }
    SetRow(Glyph.Share, "Exportar mis datos") { save.launch("lente-export.json") }
    Hairline(); SetRow(Glyph.Person, "Borrar mi cuenta", danger = true) { open("delete-account") }
}

// --- Pronto -----------------------------------------------------------------------------------

@Composable
fun Pronto(what: String) {
    val c = Lente.c
    val (title, text, change) = SOON[what] ?: Triple("Pronto", "", "")
    Column(Modifier.fillMaxSize().padding(32.dp).testTag("pronto"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)).background(c.surface), contentAlignment = Alignment.Center) { Icon(if (what == "equipo") Glyph.Team else Glyph.Link, c.ink, size = 34.dp) }
        Spacer(Modifier.height(16.dp))
        Text("Pronto", style = Type.caption, color = c.muted)
        Text(title, style = Type.title, color = c.ink, modifier = Modifier.padding(top = 6.dp))
        Text(text, style = Type.body, color = c.muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
        if (change.isNotBlank()) Text(change, style = Type.measured, color = c.muted, modifier = Modifier.padding(top = 12.dp).clip(RoundedCornerShape(8.dp)).background(c.raised).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}
