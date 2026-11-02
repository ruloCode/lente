package app.lente.ui

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
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(c.surface).border(0.5.dp, c.line, shape).clickable(onClick = onClick).padding(16.dp).testTag("project-${p.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(p.name, style = Type.headline, color = if (p.active) c.ink else c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(Projects.activity(p.lastActivityAt, now), style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 8.dp))
        }
        Text(Projects.counts(p), style = Type.callout, color = c.muted, modifier = Modifier.padding(top = 2.dp))
        p.next?.let { next ->
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Glyph.ChevronRight, c.accent, size = 16.dp)
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

/** One project: its open tasks and meetings, and rename, merge and archive. */
@Composable
fun ProyectoScreen(vm: LenteViewModel) {
    val detail by vm.project.collectAsState()
    val all by vm.projects.collectAsState()
    val d = detail ?: return Empty("Cargando el proyecto…")
    val p = d.project
    val now = remember { System.currentTimeMillis() }
    var name by rememberSaveable(p.id) { mutableStateOf(p.name) }
    var merging by rememberSaveable(p.id) { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().testTag("project"), contentPadding = PaddingValues(bottom = 24.dp)) {
        item("head") {
            Column(Modifier.padding(horizontal = Lente.gutter, vertical = 8.dp)) {
                Text(p.name, style = Type.title, color = Lente.c.ink, modifier = Modifier.testTag("project-name"))
                Text("${Projects.activity(p.lastActivityAt, now)} · ${Projects.counts(p)}", style = Type.callout, color = Lente.c.muted, modifier = Modifier.padding(top = 2.dp))
            }
        }
        item("tasks-title") { SectionTitle("Pendientes", Modifier.padding(horizontal = Lente.gutter)) }
        item("tasks") {
            Group(Modifier.padding(horizontal = Lente.gutter)) {
                if (d.tasks.isEmpty()) ListRow("Nada pendiente")
                d.tasks.forEachIndexed { i, t ->
                    if (i > 0) Hairline()
                    ListRow(t.title, hint = t.due, onClick = { vm.go(Screen.Reunion(t.meetingId)) })
                }
            }
        }
        item("meetings-title") { SectionTitle("Reuniones", Modifier.padding(start = Lente.gutter, end = Lente.gutter, top = 16.dp), trailing = "${d.meetings.size}") }
        item("meetings") {
            Group(Modifier.padding(horizontal = Lente.gutter)) {
                if (d.meetings.isEmpty()) ListRow("Sin reuniones")
                d.meetings.forEachIndexed { i, m ->
                    if (i > 0) Hairline()
                    ListRow(m.title.ifBlank { "Reunión sin título" }, value = Projects.activity(m.startedAt, now), onClick = { vm.go(Screen.Reunion(m.id)) })
                }
            }
        }
        item("manage-title") { SectionTitle("Proyecto", Modifier.padding(start = Lente.gutter, end = Lente.gutter, top = 16.dp)) }
        item("manage") {
            Card(Modifier.padding(horizontal = Lente.gutter)) {
                Field(name, { name = it }, "Nombre del proyecto", tag = "project-rename", onDone = { if (name.isNotBlank() && name != p.name) vm.renameProject(p.id, name) })
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button("Guardar nombre", { vm.renameProject(p.id, name) }, Modifier.weight(1f), tone = Tone.Plain, enabled = name.isNotBlank() && name != p.name)
                    Button(if (p.active) "Archivar" else "Reactivar", { vm.archiveProject(p.id, p.active) }, Modifier.weight(1f), tone = Tone.Plain)
                }
                val others = all.filter { it.id != p.id && it.active }
                if (others.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    if (!merging) Button("Juntar con otro proyecto", { merging = true }, Modifier.fillMaxWidth(), tone = Tone.Plain)
                    else {
                        Text("Sus reuniones pasan al proyecto que elijas y este se archiva.", style = Type.caption, color = Lente.c.muted)
                        others.forEach { o -> ListRow(o.name, onClick = { merging = false; vm.mergeProject(p.id, o.id) }) }
                        ListRow("Cancelar", onClick = { merging = false }, chevron = false)
                    }
                }
            }
        }
    }
}
