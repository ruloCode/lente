package app.lente.ui

import android.content.Intent
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.core.Copy
import app.lente.core.Format
import app.lente.core.HubState
import app.lente.core.MeetingSummary
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY = DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("es"))
fun day(at: Long): String = DAY.format(Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault())).replace(".", "")

/** Reuniones: a briefing before, then past meetings with search. */
@Composable
fun Reuniones(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    var title by rememberSaveable { mutableStateOf("") }
    var names by rememberSaveable { mutableStateOf("") }
    var q by rememberSaveable { mutableStateOf("") }
    val briefing by vm.briefing.collectAsState()
    val results by vm.search.collectAsState()
    val busy by vm.busy.collectAsState()
    LazyColumn(Modifier.fillMaxSize().testTag("reuniones"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionTitle("Antes de la reunión") }
        item {
            Card {
                Text("Te recuerdo qué quedó pendiente con esas personas y frases útiles.", style = Type.callout, color = c.muted)
                Spacer(Modifier.height(10.dp))
                Field(title, { title = it }, "Reunión (ej. Sprint review)", tag = "brief-title")
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Field(names, { names = it }, "Con quién", Modifier.weight(1f), tag = "brief-names")
                    Spacer(Modifier.width(10.dp))
                    Button(if ("briefing" in busy) "…" else "Preparar", { vm.prepareBriefing(title.trim(), names) }, enabled = "briefing" !in busy, modifier = Modifier.testTag("brief-btn"))
                }
                briefing?.let { b ->
                    Spacer(Modifier.height(12.dp))
                    if (!b.remembered) Text("Aún no recuerdo reuniones relacionadas; solo te dejo frases para empezar.", style = Type.callout, color = c.muted)
                    for ((kind, label) in Copy.BRIEFING) {
                        val items = b.items.filter { it.kind == kind }
                        if (items.isEmpty()) continue
                        Text(label.uppercase(), style = Type.label, color = c.muted, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                        for (i in items) Text("• ${i.text}", style = Type.callout, color = c.ink, modifier = Modifier.padding(vertical = 2.dp))
                    }
                }
            }
        }
        item { SectionTitle("Anteriores") }
        item { Field(q, { q = it; vm.search(it) }, "Buscar en reuniones", tag = "search") }
        val shown = results
        if (shown != null) {
            if (shown.isEmpty()) item { Empty("Nada coincide con “$q”.") }
            items(shown, key = { "r" + it.id }) { r ->
                Card(Modifier.clickable { vm.go(Screen.Reunion(r.id, r.matches.firstOrNull()?.turnId)) }) {
                    One(r.title.ifBlank { "Reunión" }, Type.headline, c.ink)
                    Text(day(r.startedAt), style = Type.measured, color = c.muted)
                    for (m in r.matches.take(3)) Text(m.line, style = Type.callout, color = c.ink, maxLines = 2, modifier = Modifier.padding(top = 6.dp))
                }
            }
        } else if (hub.meetings.isEmpty()) {
            item { Empty("Aún no hay reuniones guardadas. Inicia una desde Ahora y aquí verás sus notas.", action = "Ir a Ahora") { vm.go(Screen.Ahora) } }
        } else {
            item {
                Group {
                    hub.meetings.forEachIndexed { i, m ->
                        if (i > 0) Hairline()
                        MeetingRow(m) { vm.go(Screen.Reunion(m.id)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MeetingRow(m: MeetingSummary, onClick: () -> Unit) {
    val state = Copy.MEETING_STATE[m.status]
    val hint = listOfNotNull(day(m.startedAt) + " · " + Format.hhmm(m.startedAt), "${m.turns} turnos", state, if (m.auto) "Solo grabar" else null).joinToString(" · ")
    ListRow(m.displayTitle, hint = hint, onClick = onClick, modifier = Modifier.testTag("meeting-${m.id}"))
}

/** One meeting: notes and transcript, share, delete, and the agent's trace. */
@Composable
fun Reunion(vm: LenteViewModel, screen: Screen.Reunion) {
    val c = Lente.c
    val ctx = LocalContext.current
    val detail by vm.detail.collectAsState()
    val trace by vm.trace.collectAsState()
    var tab by rememberSaveable(screen.id) { mutableStateOf(if (screen.turnId != null) "tr" else "notes") }
    var focus by rememberSaveable(screen.id) { mutableStateOf(screen.turnId) }
    val list = rememberLazyListState()
    val d = detail?.takeIf { it.summary.id == screen.id }
    if (d == null) {
        Box(Modifier.fillMaxSize().padding(Lente.gutter)) { Text("Cargando…", style = Type.callout, color = c.muted) }
        return
    }
    val m = d.summary
    LaunchedEffect(tab, focus, d) {
        // The turns come after the header card and the tabs.
        if (tab == "tr" && focus != null) d.turns.indexOfFirst { it.id == focus }.takeIf { it >= 0 }?.let { list.scrollToItem(it + 2) }
    }
    LazyColumn(state = list, modifier = Modifier.fillMaxSize().testTag("reunion"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Card {
                Text(m.displayTitle, style = Type.title, color = c.ink, modifier = Modifier.testTag("md-title"))
                val ended = m.endedAt?.let { " – " + Format.hhmm(it) } ?: ""
                Text(listOfNotNull("${day(m.startedAt)} · ${Format.hhmm(m.startedAt)}$ended", "${m.turns} turnos", Copy.MEETING_STATE[m.status]).joinToString(" · "), style = Type.measured, color = c.muted, modifier = Modifier.padding(top = 4.dp))
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button("Compartir", {
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, m.displayTitle).putExtra(Intent.EXTRA_TEXT, d.share)
                        ctx.startActivity(Intent.createChooser(send, "Compartir notas"))
                    }, tone = Tone.Plain, glyph = Glyph.Share, modifier = Modifier.testTag("md-share"))
                    ConfirmButton("Borrar", "¿Seguro?", { vm.deleteMeeting(m.id) }, tag = "md-del")
                }
            }
        }
        item { Segmented(listOf("notes" to "Notas", "tr" to "Transcripción"), tab, { tab = it }) }
        if (tab == "notes") notes(m) { turnId -> focus = turnId; tab = "tr" }
        else {
            if (d.turns.isEmpty()) item { Empty("Sin transcripción.") }
            items(d.turns, key = { it.id }) { t ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (t.id == focus) c.tag else c.bg).padding(8.dp)) {
                    Text(if (t.wearer) "Tú" else t.speaker ?: "·", style = Type.label, color = if (t.wearer) c.accent else c.ink, modifier = Modifier.width(34.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t.text, style = Type.callout, color = c.ink)
                        Text(Format.hhmm(t.at), style = Type.measured, color = c.muted)
                    }
                }
            }
        }
        item {
            Card {
                Row(Modifier.fillMaxWidth().clickable { if (trace == null) vm.loadTrace(m.id) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Rastro del agente", style = Type.headline, color = c.ink, modifier = Modifier.weight(1f))
                    Icon(if (trace == null) Glyph.ChevronRight else Glyph.ChevronDown, c.muted, size = 18.dp)
                }
                trace?.let { steps ->
                    if (steps.isEmpty()) Text("Sin rastro: el agente no corrió en esta reunión.", style = Type.callout, color = c.muted, modifier = Modifier.padding(top = 8.dp))
                    for ((i, st) in steps.withIndex()) Row(Modifier.padding(top = 8.dp)) {
                        Text("${i + 1}", style = Type.measured, color = c.muted, modifier = Modifier.width(22.dp))
                        Column { Text(st.label, style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.ink); if (st.detail.isNotBlank()) Text(st.detail, style = Type.caption, color = c.muted) }
                    }
                }
            }
        }
    }
}

private fun LazyListScope.notes(m: MeetingSummary, openTurn: (String) -> Unit) {
    val n = m.notes
    if (n == null) {
        item { Empty(Copy.MEETING_STATE[m.status]?.replaceFirstChar { it.uppercase() } ?: "Sin notas.") }
        return
    }
    item {
        Card {
            Text("RESUMEN", style = Type.label, color = Lente.c.muted)
            Spacer(Modifier.height(6.dp))
            Text(n.summary, style = Type.body, color = Lente.c.ink)
        }
    }
    fun section(title: String, lines: List<Pair<String, String?>>) {
        if (lines.isEmpty()) return
        item(title) {
            Card(padding = PaddingValues(vertical = 8.dp)) {
                Text(title.uppercase(), style = Type.label, color = Lente.c.muted, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                for ((text, turn) in lines) Text(
                    text, style = Type.callout, color = Lente.c.ink,
                    modifier = Modifier.fillMaxWidth().then(if (turn != null) Modifier.clickable { openTurn(turn) } else Modifier).padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
    }
    section("Decisiones", n.decisions.map { it.text to it.evidence.firstOrNull() })
    section("Compromisos", n.commitments.map { (if (it.owner == "you") "Tú" else it.owner) + ": " + it.what + (it.due?.let { d -> " ($d)" } ?: "") to it.evidence.firstOrNull() })
    section("Preguntas abiertas", n.openQuestions.map { it.text to it.evidence.firstOrNull() })
    section("Glosario", n.glossary.map { "${it.first}: ${it.second}" to it.third.firstOrNull() })
}
