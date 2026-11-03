package app.lente.ui

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.core.NotificationItem
import app.lente.core.Notifications
import kotlinx.coroutines.delay

/**
 * Actividad (add-notifications): everything that happened in Lente and what waits for the wearer, by day,
 * each item with what to do about it. Opening it marks the feed read; the unread dots stay for this visit.
 */
@Composable
fun Actividad(vm: LenteViewModel) {
    val c = Lente.c
    val feed by vm.feed.collectAsState()
    var onlyTodo by rememberSaveable { mutableStateOf(false) }
    // The read mark as it was when the wearer came in, so this visit still shows what was new.
    var readBefore by remember { mutableStateOf<Long?>(null) }
    val now = ticker()
    LaunchedEffect(Unit) { vm.loadFeed(); delay(READ_AFTER_MS); vm.markFeedRead() }
    LaunchedEffect(feed?.items?.size) { if (readBefore == null && feed != null) readBefore = feed!!.readAt }

    val f = feed
    val items = f?.items.orEmpty().let { list -> if (onlyTodo) list.filter { it.urgent || it.kind == "memory-review" } else list }
    val unread = f?.items.orEmpty().count { it.at > (readBefore ?: f?.readAt ?: 0L) }
    LazyColumn(Modifier.fillMaxSize().navigationBarsPadding().testTag("actividad"), contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item("summary") {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(if (unread > 0) c.ink else c.raised), contentAlignment = Alignment.Center) {
                        Icon(Glyph.Bell, if (unread > 0) c.bg else c.ink, size = 22.dp)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (unread == 0) "Todo al día" else if (unread == 1) "1 novedad" else "$unread novedades", style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink)
                        val waiting = f?.items.orEmpty().count { it.urgent }
                        Text(if (waiting > 0) "$waiting esperan tu decisión" else "Nada espera tu decisión", style = Type.callout, color = c.muted)
                    }
                }
                Tabs(listOf("todo" to "Todo", "hacer" to "Por hacer"), if (onlyTodo) "hacer" else "todo", { onlyTodo = it == "hacer" }, label = "Filtro")
            }
        }
        when {
            f == null -> item("loading") { Group { ListRow("Cargando tu actividad…", leading = { Icon(Glyph.Clock, c.muted, size = 20.dp) }) } }
            items.isEmpty() -> item("empty") {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(vertical = 28.dp, horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Glyph.Check, c.muted, size = 28.dp)
                    Spacer(Modifier.height(10.dp))
                    Text(if (onlyTodo) "Nada por hacer" else "Sin actividad todavía", style = Type.body.copy(fontWeight = FontWeight.Medium), color = c.ink)
                    Text(if (onlyTodo) "Cuando algo espere tu decisión, aparece aquí." else "Las notas de tus reuniones, lo que espera tu aprobación y los trabajos de tus agentes aparecen aquí.", style = Type.callout, color = c.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
            else -> for ((day, list) in Notifications.byDay(items, now)) {
                item("day-$day") { SectionTitle(day) }
                item("list-$day") {
                    Group {
                        list.forEachIndexed { i, it ->
                            if (i > 0) Hairline()
                            ActivityRow(it, isNew = it.at > (readBefore ?: Long.MAX_VALUE), now = now) { open(vm, it) }
                        }
                    }
                }
            }
        }
        if (f != null && !f.fromHub) item("local") {
            Text("Tu hub todavía no guarda la actividad: se muestra la de este teléfono y lo leído se recuerda aquí.", style = Type.caption, color = c.muted, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
        }
    }
}

/** How long Actividad waits before it marks the feed read, so the wearer sees what was new. */
private const val READ_AFTER_MS = 1_200L

/** Where an item leads: the meeting's notes, the approvals, the memories to review, or the agents' jobs. */
private fun open(vm: LenteViewModel, item: NotificationItem) {
    when {
        item.kind.startsWith("notes-") && item.meetingId != null -> vm.go(Screen.Reunion(item.meetingId))
        item.kind == "approval" -> vm.go(Screen.Acciones)
        item.kind == "memory-review" -> vm.go(Screen.Memoria)
        item.kind.startsWith("job-") -> vm.go(Screen.Conexiones)
    }
}

/** The action an item offers, in words. */
private fun actionLabel(item: NotificationItem): String? = when (item.kind) {
    "notes-ready", "notes-failed", "notes-short" -> "Abrir notas"
    "approval" -> "Revisar"
    "memory-review" -> "Revisar"
    "job-done", "job-failed" -> "Ver trabajo"
    else -> null
}

private fun glyphFor(item: NotificationItem): Glyph = when (item.kind) {
    "notes-writing" -> Glyph.Clock
    "notes-ready" -> Glyph.Doc
    "notes-failed", "job-failed" -> Glyph.Close
    "notes-short" -> Glyph.Wave
    "approval" -> if (item.group == "agents") Glyph.Terminal else Glyph.Tasks
    "memory-review" -> Glyph.Brain
    "job-done" -> Glyph.Check
    else -> Glyph.Bell
}

/** One item: its glyph (ink when it waits for the wearer), what happened, when, and its action; a dot while new. */
@Composable
private fun ActivityRow(item: NotificationItem, isNew: Boolean, now: Long, onClick: () -> Unit) {
    val c = Lente.c
    val failed = item.kind.endsWith("failed")
    Row(Modifier.fillMaxWidth().clickable(enabled = actionLabel(item) != null, onClick = onClick).padding(horizontal = 14.dp, vertical = 12.dp).testTag("activity-${item.id}"), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(if (item.urgent && !failed) c.ink else c.raised), contentAlignment = Alignment.Center) {
            if (item.kind == "notes-writing") androidx.compose.material3.CircularProgressIndicator(Modifier.size(18.dp), color = c.ink, trackColor = c.surface, strokeWidth = 2.dp)
            else Icon(glyphFor(item), if (item.urgent && !failed) c.bg else if (failed) c.live else c.ink, size = 18.dp)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(item.title, style = Type.body.copy(fontWeight = if (isNew) FontWeight.SemiBold else FontWeight.Normal), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (item.body.isNotBlank()) Text(item.body, style = Type.callout, color = c.muted, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            // The action and the time share the last line, so the title keeps the whole width.
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                actionLabel(item)?.let { label ->
                    Text(
                        label, style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = if (item.urgent) c.bg else c.ink,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (item.urgent) c.ink else c.raised).padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                }
                Text(Notifications.whenLabel(item.at, now), style = Type.caption, color = c.muted)
            }
        }
        if (isNew) Box(Modifier.padding(start = 8.dp, top = 8.dp).size(8.dp).clip(CircleShape).background(c.accentFill))
    }
}

/** The bell beside Ajustes: bare like the other header icons, with the unread count in an ink badge. */
@Composable
fun BellButton(unread: Int, onClick: () -> Unit) {
    val c = Lente.c
    Box(Modifier.size(44.dp).testTag("bell")) {
        PlainIcon(Glyph.Bell, if (unread > 0) "Actividad, $unread sin leer" else "Actividad", onClick = onClick)
        if (unread > 0) Box(
            Modifier.align(Alignment.TopEnd).padding(top = 6.dp, end = 4.dp).size(if (unread > 9) 20.dp else 17.dp).clip(CircleShape).background(c.ink),
            contentAlignment = Alignment.Center,
        ) { Text(if (unread > 9) "9+" else "$unread", style = Type.caption.copy(fontSize = Type.caption.fontSize * 0.78f, fontWeight = FontWeight.Bold), color = c.bg) }
    }
}
