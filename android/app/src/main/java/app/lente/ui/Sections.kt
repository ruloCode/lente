package app.lente.ui

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
    val add = { if (newTask.isNotBlank()) { vm.addTask(newTask.trim(), newWho); newTask = "" } }
    LazyColumn(Modifier.fillMaxSize().testTag("acciones"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item("new") {
            Card {
                Field(newTask, { newTask = it }, "Nueva tarea", tag = "task-new", onDone = add)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Segmented(TaskOwners.ORDER.map { it to when (it) { "lente" -> "Lente"; "other" -> "Otro"; else -> "Tú" } }, newWho, { newWho = it }, Modifier.weight(1f), label = "Quién la hace")
                    Spacer(Modifier.width(10.dp))
                    Button("Agregar", add, enabled = newTask.isNotBlank())
                }
            }
        }
        if (a.pending.isNotEmpty()) {
            item { SectionTitle("Por aprobar", trailing = "${a.pending.size}") }
            items(a.pending, key = { it.id }) { p -> ActionCard(p) { approve, args -> vm.decide(p.id, approve, args) { mailto -> runCatching { ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse(mailto))) } } } }
        }
        if (a.tasks.any { !it.done }) item("view") {
            TaskViewControls(a.tasks, byProject, { byProject = it }, projectFilter, { projectFilter = it }, whoFilter, { whoFilter = it })
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
                        TaskRow(t, onToggle = { vm.taskDone(t.id, true) }, onOwner = { vm.setTaskOwner(t.id, TaskOwners.next(t.who)) }, onDelete = { vm.deleteTask(t.id) })
                    }
                }
            }
        }
        if (done.isNotEmpty()) {
            item { SectionTitle("Hechas", trailing = "${done.size}") }
            item { Group { done.forEachIndexed { i, t -> if (i > 0) Hairline(); TaskRow(t, onToggle = { vm.taskDone(t.id, false) }, onOwner = null, onDelete = { vm.deleteTask(t.id) }) } } }
        }
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
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Segmented(listOf("who" to "Por quién", "project" to "Por proyecto"), if (byProject) "project" else "who", { setByProject(it == "project") }, label = "Ordenar tareas")
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
    val shape = RoundedCornerShape(18.dp)
    Box {
        Row(
            Modifier.clip(shape).background(if (active) c.tag else c.surface).border(0.5.dp, c.line, shape).clickable { open = true }.padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp).testTag(tag),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = Type.callout, color = if (active) c.accent else c.ink, maxLines = 1)
            Icon(Glyph.ChevronDown, c.muted, Modifier.padding(start = 2.dp), size = 16.dp)
        }
        DropdownMenu(open, { open = false }) {
            options.forEach { (value, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { onPick(value); open = false }) }
        }
    }
}

@Composable
private fun TaskRow(t: app.lente.core.Task, onToggle: () -> Unit, onOwner: (() -> Unit)?, onDelete: () -> Unit) {
    val c = Lente.c
    Row(Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(horizontal = 8.dp, vertical = 6.dp).testTag("task-${t.id}"), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(t.done, { onToggle() }, colors = CheckboxDefaults.colors(checkedColor = c.accentFill, checkmarkColor = c.onAccent, uncheckedColor = c.muted))
        Column(Modifier.weight(1f)) {
            Text(t.title, style = Type.body, color = if (t.done) c.muted else c.ink)
            TaskOwners.context(t).takeIf { it.isNotEmpty() }?.let { Text(it, style = Type.caption, color = c.muted) }
        }
        if (onOwner != null) Tag(TaskOwners.tag(t), Modifier.padding(start = 8.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onOwner).testTag("task-owner-${t.id}"))
        Box(Modifier.padding(start = 4.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onDelete).padding(6.dp).testTag("task-delete-${t.id}")) { Icon(Glyph.Trash, c.muted, size = 18.dp) }
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
            Text(label.uppercase(), style = Type.label, color = c.muted, modifier = Modifier.padding(top = 10.dp, bottom = 4.dp))
            if (editing) Field(values[k] ?: "", { values[k] = it }, label, singleLine = k != "body")
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
                        ListRow(f.text, chevron = false) { Text("Borrar", style = Type.callout, color = c.accent, modifier = Modifier.clickable { vm.fact(f.id, false) }.padding(8.dp)) }
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
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Lente.gutter).padding(bottom = 32.dp).testTag("dispositivos")) {
        ClipPicture(Modifier.padding(top = 8.dp))
        SectionTitle("Clip")
        Group {
            ListRow(Copy.device(s), leading = { Dot(if (s.clip) c.ok else c.muted, 10.dp) }, value = Copy.mode(s))
            Hairline(); ListRow("Audio perdido", value = "${s.audioLost}")
            Hairline(); ListRow("Audio con retraso", value = "${s.audioLate}")
            Hairline(); ListRow("Grabado hoy", hint = "Audio recibido, guardado solo como texto", value = Format.recorded(hub.recordedMs))
        }
        if (!s.clip) Text("Enciende el clip: se conecta solo a la misma red Wi-Fi que la computadora.", style = Type.caption, color = c.muted, modifier = Modifier.padding(4.dp, 8.dp))
        SectionTitle("Hoy")
        Group {
            ListRow("Transcrito", hint = "Audio enviado a transcribir; en silencio no se envía", value = Format.minutes(hub.spend.audioSeconds))
            Hairline(); ListRow("Tokens", hint = "Resúmenes y respuestas", value = Format.tokens(hub.spend.tokens))
            Hairline(); ListRow("Costo aproximado", hint = "Precios de lista", value = Format.usd(hub.spend.usd, hub.spend.unpriced))
        }
        SectionTitle("Modo")
        Segmented(listOf("mic" to "Solo audio", "camera" to "Audio y cámara"), s.mode, vm::setMode, label = "Modo del clip")
        SectionTitle("Otras formas de usar Lente")
        Group {
            val hint = when {
                s.clipIsDevice && !phoneOn -> "El clip está conectado: el teléfono no hace falta."
                phoneOn -> "Escuchando con el micrófono del teléfono, también con la pantalla apagada"
                else -> "Su micrófono y cámara, sin el clip"
            }
            ListRow(
                if (phoneOn) "Dejar de usar el teléfono" else "Usar el teléfono", hint = hint, chevron = false,
                leading = { Icon(Glyph.Phone, c.ink) },
                onClick = if (s.clipIsDevice && !phoneOn) null else ({ if (phoneOn) vm.stopPhone() else usePhone() }),
                modifier = Modifier.testTag("phone-toggle"),
            )
            Hairline(); ListRow("Modo computadora", hint = "Meet, Teams o Zoom, sin el clip", value = "Pronto", onClick = { vm.go(Screen.Pronto("computadora")) })
            Hairline(); ListRow("Hub en la nube", hint = "Funciona fuera de casa", value = "Pronto", onClick = { vm.go(Screen.Pronto("nube")) })
        }
        SectionTitle("Hub")
        Group { ListRow(vm.hubAddress ?: "Sin hub", hint = "La computadora donde corre Lente", onClick = { vm.go(Screen.Ajustes) }) }
    }
}

/** The clip on a pair of glasses: the transparent render in light, the one lit on black in dark. */
@Composable
fun ClipPicture(modifier: Modifier = Modifier) {
    val c = Lente.c
    androidx.compose.foundation.Image(
        androidx.compose.ui.res.painterResource(if (c.dark) app.lente.R.drawable.art_clip_dark else app.lente.R.drawable.art_clip),
        contentDescription = "El clip de Lente en unos lentes",
        contentScale = androidx.compose.ui.layout.ContentScale.Fit,
        modifier = modifier.fillMaxWidth().aspectRatio(3f / 2f).clip(RoundedCornerShape(Lente.card)),
    )
}

// --- Ajustes ----------------------------------------------------------------------------------

@Composable
fun Ajustes(vm: LenteViewModel, hub: HubState, replayIntro: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    val voice by vm.readAloud.collectAsState()
    var names by rememberSaveable(s.names) { mutableStateOf(s.names.joinToString(", ")) }
    var editing by rememberSaveable { mutableStateOf(false) }
    var address by rememberSaveable { mutableStateOf(vm.hubAddress ?: "") }
    var code by rememberSaveable { mutableStateOf("") }
    var linkNote by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val link by vm.link.collectAsState()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Lente.gutter).padding(bottom = 32.dp).testTag("ajustes")) {
        if (vm.account.configured || vm.account.signedIn) AccountSection(vm)
        SectionTitle("Tú")
        Group {
            ListRow("Tu nombre", value = s.names.joinToString(", ").ifBlank { "sin definir" }, onClick = { editing = !editing })
            if (editing) Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Field(names, { names = it }, "Rulo, Raúl", Modifier.weight(1f), onDone = { vm.saveNames(names); editing = false }, tag = "names")
                    Spacer(Modifier.width(10.dp))
                    Button("Guardar", { vm.saveNames(names); editing = false })
                }
                Text("Lente te avisa cuando alguien dice uno de estos nombres. Separa los apodos con comas.", style = Type.caption, color = c.muted, modifier = Modifier.padding(top = 6.dp))
            }
            Hairline(); ListRow("Tu voz", hint = "Di “Lente, soy …” con el clip puesto", value = if (s.wearer.isNotEmpty()) "Reconocida" else "Sin reconocer")
        }
        SectionTitle("Apariencia")
        val theme by vm.theme.collectAsState()
        Segmented(listOf("system" to "Sistema", "light" to "Claro", "dark" to "Oscuro"), theme, vm::setTheme, label = "Tema")
        SectionTitle("Lente")
        Group {
            SwitchRow("Solo grabar", s.recordOnly, { vm.setAssist(if (it) "record" else "assist") }, hint = "Guarda tu día como texto y aprende, sin sugerencias", tag = "set-record")
            Hairline(); SwitchRow("Leer en voz alta", voice, vm::setReadAloud, hint = "Las respuestas y los resúmenes, en el teléfono", tag = "set-voice")
            Hairline(); SwitchRow("Contestar todas las preguntas", s.everyQuestion, vm::everyQuestion, hint = "Para pruebas: aunque no sean para ti", tag = "set-all")
        }
        SectionTitle("Hub")
        Card {
            Text("La dirección de la computadora donde corre Lente.", style = Type.callout, color = c.muted)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field(address, { address = it }, "192.168.1.20", Modifier.weight(1f), tag = "hub-address")
                Spacer(Modifier.width(10.dp))
                Button("Conectar", { scope.launch { linkNote = vm.tryHub(address) ?: "Conectado." } })
            }
            if (link == app.lente.Link.Unpaired) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Field(code, { code = it }, "Código de emparejamiento", Modifier.weight(1f))
                    Spacer(Modifier.width(10.dp))
                    Button("Emparejar", { scope.launch { linkNote = if (vm.pair(code)) "Emparejado." else "Ese código no sirve: pide uno nuevo en el hub." } })
                }
            }
            linkNote?.let { Text(it, style = Type.caption, color = c.muted, modifier = Modifier.padding(top = 8.dp)) }
        }
        SectionTitle("Privacidad")
        Card {
            Text("Lente guarda solo texto, nunca audio, también en Solo grabar. Mientras escucha o graba lo verás siempre arriba, y puedes pausarlo cuando quieras. En el teléfono solo queda la dirección del hub y estos ajustes.", style = Type.callout, color = c.ink)
            Spacer(Modifier.height(12.dp))
            ConfirmButton("Borrar toda la memoria", "Toca de nuevo para borrar todo", vm::deleteAll, tag = "wipe")
        }
        SectionTitle("Ayuda")
        Group {
            ListRow("Ver la introducción", onClick = replayIntro)
            Hairline(); ListRow("Modelos", hint = "Muse Voice Transcribe y Muse Spark 1.3 de Meta, en el hub")
            Hairline(); ListRow("Versión", value = BuildConfig.VERSION_NAME)
        }
    }
}

// --- Cuenta (add-accounts 7.3) ------------------------------------------------------------------

/** The account in Ajustes: who, this month's spend, the clips, a new clip token, export, delete, sign out. */
@Composable
fun AccountSection(vm: LenteViewModel) {
    val c = Lente.c
    val signedIn by vm.signedIn.collectAsState()
    val info by vm.accountInfo.collectAsState()
    val devices by vm.devices.collectAsState()
    val token by vm.newClipToken.collectAsState()
    val activity = LocalContext.current as? Activity
    val clipboard = LocalClipboardManager.current
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let(vm::exportTo) }
    var label by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(signedIn) { if (signedIn) vm.loadAccount() }
    // The token is shown once: leaving the screen forgets it.
    DisposableEffect(Unit) { onDispose { vm.forgetClipToken() } }

    SectionTitle("Cuenta")
    if (!signedIn) {
        Card {
            Text("Entra con tu cuenta de Google para tener tu memoria en la nube, en cualquier teléfono.", style = Type.callout, color = c.muted)
            Spacer(Modifier.height(10.dp))
            Button("Entrar con Google", { activity?.let(vm::signIn) }, Modifier.testTag("sign-in"))
        }
        return
    }
    Group {
        ListRow(vm.account.name.ifBlank { "Tu cuenta" }, hint = info?.email?.ifBlank { null } ?: vm.account.email.ifBlank { null })
        info?.let {
            Hairline(); ListRow("Gasto", hint = "Modelos y transcripción, precios de lista", value = Account.spendLine(it))
        }
    }
    SectionTitle("Dispositivos")
    Group {
        if (devices.isEmpty()) ListRow("Sin clips todavía", hint = "Crea un token y grábalo en el clip")
        devices.forEachIndexed { i, d ->
            if (i > 0) Hairline()
            ListRow(d.label, hint = if (d.revoked) "Revocado" else Account.lastSeen(d.lastSeenAt, System.currentTimeMillis()))
            if (!d.revoked) ConfirmButton("Revocar", "Toca de nuevo para revocar", { vm.revokeDevice(d.id) }, Modifier.padding(horizontal = 16.dp, vertical = 6.dp), tag = "revoke-${d.id}")
        }
    }
    Card {
        if (token == null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field(label, { label = it }, "Nombre del clip", Modifier.weight(1f), tag = "clip-label")
                Spacer(Modifier.width(10.dp))
                Button("Nuevo token", { vm.newClip(label); label = "" })
            }
        } else {
            Text("Token del clip. Se muestra una sola vez: cópialo ahora en el firmware del clip.", style = Type.callout, color = c.muted)
            Text(token!!, style = Type.measured, color = c.ink, modifier = Modifier.padding(vertical = 8.dp).testTag("clip-token"))
            Row {
                Button("Copiar", { clipboard.setText(AnnotatedString(token!!)) })
                Spacer(Modifier.width(10.dp))
                Button("Listo", vm::forgetClipToken, tone = Tone.Plain)
            }
        }
    }
    SectionTitle("Tus datos")
    Card {
        Text("Descarga todo lo que Lente guarda de ti, o borra tu cuenta: primero se borra tu clave, y lo que quede en copias ya no se puede leer.", style = Type.callout, color = c.ink)
        Spacer(Modifier.height(12.dp))
        Button("Exportar mis datos", { save.launch("lente-export.json") }, tone = Tone.Plain)
        Spacer(Modifier.height(8.dp))
        ConfirmButton("Borrar mi cuenta", "Toca de nuevo: se borra todo, sin vuelta atrás", vm::deleteAccount, tag = "delete-account")
        Spacer(Modifier.height(8.dp))
        Button("Cerrar sesión", vm::signOut, tone = Tone.Plain)
    }
}

// --- Pronto -----------------------------------------------------------------------------------

@Composable
fun Pronto(what: String) {
    val c = Lente.c
    val (title, text, change) = SOON[what] ?: Triple("Pronto", "", "")
    Column(Modifier.fillMaxSize().padding(32.dp).testTag("pronto"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(22.dp)).background(c.tag), contentAlignment = Alignment.Center) { Icon(if (what == "equipo") Glyph.Team else Glyph.Link, c.accent, size = 34.dp) }
        Spacer(Modifier.height(16.dp))
        Text("PRONTO", style = Type.label, color = c.muted)
        Text(title, style = Type.title, color = c.ink, modifier = Modifier.padding(top = 6.dp))
        Text(text, style = Type.body, color = c.muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
        if (change.isNotBlank()) Text(change, style = Type.measured, color = c.muted, modifier = Modifier.padding(top = 12.dp).clip(RoundedCornerShape(8.dp)).background(c.raised).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}
