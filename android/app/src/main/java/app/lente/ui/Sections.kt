package app.lente.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
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
import app.lente.core.Copy
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
    val todo = a.tasks.filter { !it.done }
    val done = a.tasks.filter { it.done }
    LazyColumn(Modifier.fillMaxSize().testTag("acciones"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (a.pending.isEmpty() && a.tasks.isEmpty()) {
            item { Spacer(Modifier.height(8.dp)) }
            item { Empty("Aún no hay tareas. Al terminar una reunión, Lente propone aquí tareas y correos; nada se hace sin que lo apruebes.") }
            return@LazyColumn
        }
        if (a.pending.isNotEmpty()) {
            item { SectionTitle("Por aprobar", trailing = "${a.pending.size}") }
            items(a.pending, key = { it.id }) { p -> ActionCard(p) { approve, args -> vm.decide(p.id, approve, args) { mailto -> runCatching { ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse(mailto))) }.onFailure { vm.say("No hay una app de correo para abrir el borrador.") } } } }
        }
        item { SectionTitle("Pendientes", trailing = "${todo.size}") }
        item {
            if (todo.isEmpty()) Empty("Nada pendiente.") else Group {
                todo.forEachIndexed { i, t -> if (i > 0) Hairline(); TaskRow(t.title, t.due, t.meetingTitle, false) { vm.taskDone(t.id, true) } }
            }
        }
        if (done.isNotEmpty()) {
            item { SectionTitle("Hechas", trailing = "${done.size}") }
            item { Group { done.forEachIndexed { i, t -> if (i > 0) Hairline(); TaskRow(t.title, t.due, t.meetingTitle, true) { vm.taskDone(t.id, false) } } } }
        }
    }
}

@Composable
private fun TaskRow(title: String, due: String?, meeting: String, done: Boolean, toggle: () -> Unit) {
    val c = Lente.c
    Row(Modifier.fillMaxWidth().clickable(onClick = toggle).padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(done, { toggle() }, colors = CheckboxDefaults.colors(checkedColor = c.accentFill, checkmarkColor = c.onAccent, uncheckedColor = c.muted))
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.body, color = if (done) c.muted else c.ink)
            Text(listOfNotNull(due?.let { "Para $it" }, meeting.ifBlank { null }).joinToString(" · "), style = Type.caption, color = c.muted)
        }
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
            item { Empty("Cuando termines una reunión, aquí verás cuántas veces te preguntaron, las frases que repites y las palabras nuevas.") }
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
