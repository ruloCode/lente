package app.lente.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.core.Projects

/**
 * One project as a card (add-projects 2.2): its name and last activity, what is open, and the next
 * task. Inicio shows up to three; the Proyectos screen shows them all.
 */
@Composable
fun ProjectCard(p: Projects.Summary, now: Long, onClick: () -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(c.surface).clickable(onClick = onClick).padding(16.dp).testTag("project-${p.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(p.name, style = Type.headline, color = if (p.active) c.ink else c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(Projects.activity(p.lastActivityAt, now), style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 8.dp))
        }
        Text(Projects.counts(p), style = Type.callout, color = c.muted, modifier = Modifier.padding(top = 2.dp))
        p.next?.let { next ->
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Glyph.ChevronRight, c.ink, size = 16.dp)
                Spacer(Modifier.width(4.dp))
                Text(next, style = Type.callout, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Every project: active first by last activity, then the archived ones. */
@Composable
fun ProyectosScreen(vm: LenteViewModel) {
    val list by vm.projects.collectAsState()
    val now = remember { System.currentTimeMillis() }
    LaunchedEffect(Unit) { vm.loadProjects() }
    val active = list.filter { it.active }
    val archived = list.filterNot { it.active }
    LazyColumn(Modifier.fillMaxSize().testTag("projects"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (list.isEmpty()) item("empty") { Empty("Todavía no hay proyectos. Lente los arma solo cuando termina una reunión.") }
        items(active, key = { it.id }) { p -> ProjectCard(p, now) { vm.go(Screen.Proyecto(p.id)) } }
        if (archived.isNotEmpty()) {
            item("archived-title") { SectionTitle("Archivados") }
            items(archived, key = { it.id }) { p -> ProjectCard(p, now) { vm.go(Screen.Proyecto(p.id)) } }
        }
    }
}

/**
 * One project (add-home-dock): a cover with its monogram and state, what it is about from its own meetings,
 * the actions to ask or record within it, its numbers, what comes next, its decisions and open questions,
 * its pending tasks and its meetings. Renaming, archiving and merging live in a sheet.
 */
@Composable
fun ProyectoScreen(vm: LenteViewModel) {
    val c = Lente.c
    val detail by vm.project.collectAsState()
    val all by vm.projects.collectAsState()
    val hub by vm.hub.collectAsState()
    val d = detail ?: return Empty("Cargando el proyecto…", Modifier.padding(Lente.gutter))
    val p = d.project
    val now = remember { System.currentTimeMillis() }
    val brief = remember(d, hub.meetings) { Projects.brief(d, hub.meetings) }
    var editing by rememberSaveable(p.id) { mutableStateOf(false) }
    var allTasks by rememberSaveable(p.id) { mutableStateOf(false) }
    if (editing) ProjectSheet(vm, p, all) { editing = false }
    LazyColumn(Modifier.fillMaxSize().testTag("project"), contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item("head") {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface)) {
                // The cover: the project's own colour from its id, its monogram, and whether it is active.
                val hue = (p.id.hashCode() and 0x7fffffff) % 360
                val tone = androidx.compose.ui.graphics.Color.hsv(hue.toFloat(), 0.28f, 0.42f)
                Box(Modifier.fillMaxWidth().height(92.dp).background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(tone, tone.copy(alpha = 0.55f), c.ink)))) {
                    Row(
                        Modifier.align(Alignment.TopEnd).padding(12.dp).clip(RoundedCornerShape(10.dp)).background(androidx.compose.ui.graphics.Color.White.copy(alpha = 0.18f)).padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(if (p.active) c.ok else androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f)))
                        Spacer(Modifier.width(6.dp))
                        Text(if (p.active) "Activo" else "Archivado", style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = androidx.compose.ui.graphics.Color.White)
                    }
                }
                Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                    Box(Modifier.offset(y = (-28).dp).size(56.dp).clip(RoundedCornerShape(14.dp)).background(c.surface).padding(3.dp).clip(RoundedCornerShape(12.dp)).background(c.ink), contentAlignment = Alignment.Center) {
                        Text(Projects.monogram(p.name), style = Type.headline, color = c.bg)
                    }
                    Text(p.name, style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink, modifier = Modifier.offset(y = (-18).dp).testTag("project-name"))
                    Text(Projects.activity(p.lastActivityAt, now).replaceFirstChar { it.uppercase() }, style = Type.callout, color = c.muted, modifier = Modifier.offset(y = (-16).dp))
                    // What the project is about, from the newest summary of its meetings.
                    Text(
                        brief.about ?: "Lente escribe aquí de qué va el proyecto cuando termine su próxima reunión.",
                        style = Type.body, color = if (brief.about != null) c.ink else c.muted, maxLines = 4, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp).testTag("project-about"),
                    )
                }
            }
        }
        item("actions") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProjectAction(Glyph.Sparkle, "Preguntar", c.ink, c.bg, Modifier.weight(1f).testTag("project-ask")) { vm.askInProject(p.id) }
                ProjectAction(Glyph.Mic, "Grabar aquí", c.surface, c.ink, Modifier.weight(1f).testTag("project-record")) { vm.recordInProject(p.id) }
                ProjectAction(Glyph.Compose, "Editar", c.surface, c.ink, Modifier.weight(1f).testTag("project-edit")) { editing = true }
            }
        }
        item("stats") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProjectStat("${p.meetings}", "Reuniones", Modifier.weight(1f))
                ProjectStat("${p.meetingsThisWeek}", "Esta semana", Modifier.weight(1f))
                ProjectStat("${d.tasks.size}", "Pendientes", Modifier.weight(1f))
            }
        }
        p.next?.let { next ->
            item("next") {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp)) {
                    Box(Modifier.width(3.dp).height(40.dp).clip(RoundedCornerShape(2.dp)).background(c.ink))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("Lo siguiente", style = Type.caption, color = c.muted)
                        Text(next, style = Type.body.copy(fontWeight = FontWeight.Medium), color = c.ink)
                    }
                }
            }
        }
        if (brief.decisions.isNotEmpty() || brief.questions.isNotEmpty()) {
            item("brief-title") { SectionTitle("Lo que se ha decidido") }
            item("brief") {
                Group {
                    brief.decisions.forEachIndexed { i, text ->
                        if (i > 0) Hairline()
                        BriefRow(Glyph.Check, text)
                    }
                    brief.questions.forEachIndexed { i, text ->
                        if (i > 0 || brief.decisions.isNotEmpty()) Hairline()
                        BriefRow(Glyph.Search, text, muted = true)
                    }
                }
            }
        }
        item("tasks-title") { SectionTitle("Pendientes", trailing = if (d.tasks.isEmpty()) null else "${d.tasks.size}") }
        item("tasks") {
            Group {
                if (d.tasks.isEmpty()) ListRow("Nada pendiente", leading = { Icon(Glyph.Check, c.muted, size = 20.dp) })
                val shown = if (allTasks) d.tasks else d.tasks.take(TASKS_SHOWN)
                shown.forEachIndexed { i, t ->
                    if (i > 0) Hairline()
                    ListRow(t.title, hint = t.due, leading = { Box(Modifier.size(20.dp).clip(CircleShape).border(1.5.dp, c.line, CircleShape)) }, onClick = { vm.go(Screen.Reunion(t.meetingId)) })
                }
                if (d.tasks.size > TASKS_SHOWN) {
                    Hairline()
                    ListRow(if (allTasks) "Ver menos" else "Ver las ${d.tasks.size}", titleColor = c.ink, chevron = false, onClick = { allTasks = !allTasks })
                }
            }
        }
        item("meetings-title") { SectionTitle("Reuniones", trailing = if (d.meetings.isEmpty()) null else "${d.meetings.size}") }
        item("meetings") {
            Group {
                if (d.meetings.isEmpty()) ListRow("Sin reuniones todavía", leading = { Icon(Glyph.Calendar, c.muted, size = 20.dp) })
                d.meetings.forEachIndexed { i, m ->
                    if (i > 0) Hairline()
                    ListRow(
                        m.title.ifBlank { "Reunión sin título" }, hint = Projects.activity(m.startedAt, now).replaceFirstChar { it.uppercase() },
                        leading = { DateBadge(m.startedAt) }, onClick = { vm.go(Screen.Reunion(m.id)) },
                    )
                }
            }
        }
    }
}

/** Open tasks a project shows before «Ver las N». */
private const val TASKS_SHOWN = 4

@Composable
private fun ProjectAction(glyph: Glyph, label: String, fill: androidx.compose.ui.graphics.Color, ink: androidx.compose.ui.graphics.Color, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(fill).clickable(onClick = onClick).padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(glyph, ink, size = 20.dp)
        Spacer(Modifier.height(6.dp))
        Text(label, style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = ink)
    }
}

@Composable
private fun ProjectStat(value: String, label: String, modifier: Modifier) {
    val c = Lente.c
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(c.surface).padding(horizontal = 14.dp, vertical = 12.dp)) {
        Text(value, style = Type.title.copy(fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum"), color = c.ink)
        Text(label, style = Type.caption, color = c.muted, maxLines = 1)
    }
}

@Composable
private fun BriefRow(glyph: Glyph, text: String, muted: Boolean = false) {
    val c = Lente.c
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
        Icon(glyph, if (muted) c.muted else c.ink, Modifier.padding(top = 2.dp), size = 18.dp)
        Spacer(Modifier.width(12.dp))
        Text(text, style = Type.callout, color = if (muted) c.muted else c.ink)
    }
}

/** A meeting's date as a small calendar leaf: the day large, the month under it. */
@Composable
private fun DateBadge(at: Long) {
    val c = Lente.c
    val date = java.time.Instant.ofEpochMilli(at).atZone(java.time.ZoneId.systemDefault())
    Column(Modifier.size(width = 40.dp, height = 42.dp).clip(RoundedCornerShape(8.dp)).background(c.raised), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("${date.dayOfMonth}", style = Type.headline.copy(fontFeatureSettings = "tnum"), color = c.ink)
        Text(java.time.format.DateTimeFormatter.ofPattern("MMM", java.util.Locale.forLanguageTag("es")).format(date).replace(".", "").uppercase(), style = Type.caption.copy(fontSize = Type.caption.fontSize * 0.8f), color = c.muted)
    }
}

/** Rename, archive or reactivate, and merge into another project, in one sheet. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun ProjectSheet(vm: LenteViewModel, p: Projects.Summary, all: List<Projects.Summary>, close: () -> Unit) {
    val c = Lente.c
    var name by rememberSaveable(p.id) { mutableStateOf(p.name) }
    var merging by rememberSaveable(p.id) { mutableStateOf(false) }
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = close, sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.bg, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = Lente.gutter).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Editar proyecto", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Field(name, { name = it }, "Nombre del proyecto", tag = "project-rename", onDone = { if (name.isNotBlank() && name != p.name) { vm.renameProject(p.id, name); close() } })
            Button("Guardar nombre", { vm.renameProject(p.id, name); close() }, Modifier.fillMaxWidth(), enabled = name.isNotBlank() && name != p.name)
            Group {
                ListRow(if (p.active) "Archivar" else "Reactivar", hint = if (p.active) "Sale de Inicio; sus reuniones se quedan" else "Vuelve a Inicio", leading = { Icon(Glyph.Doc, c.ink, size = 20.dp) }, onClick = { vm.archiveProject(p.id, p.active); close() })
                val others = all.filter { it.id != p.id && it.active }
                if (others.isNotEmpty()) {
                    Hairline()
                    ListRow("Juntar con otro proyecto", hint = "Sus reuniones pasan al que elijas", leading = { Icon(Glyph.Link, c.ink, size = 20.dp) }, chevron = false, onClick = { merging = !merging }, trailing = { Icon(if (merging) Glyph.ChevronDown else Glyph.ChevronRight, c.muted, size = 16.dp) })
                    if (merging) others.forEach { o -> Hairline(); ListRow(o.name, onClick = { vm.mergeProject(p.id, o.id); close() }) }
                }
            }
        }
    }
}
