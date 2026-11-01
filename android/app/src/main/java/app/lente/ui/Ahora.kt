package app.lente.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.capture.Capture
import app.lente.core.Copy
import app.lente.core.Entry
import app.lente.core.Format
import app.lente.core.HubState
import kotlinx.coroutines.delay

/** Ahora: the live loop. Status, mode, the Dilo card, the meeting, what is happening, the photo and today's timeline. */
@Composable
fun Ahora(vm: LenteViewModel, hub: HubState, usePhone: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    val capture by vm.let { Capture.state }.collectAsState()
    val timeline = hub.entries.takeLast(TIMELINE_ROWS)
    Column(Modifier.fillMaxSize()) {
    AnimatedVisibility(s.listening && s.clip, enter = fadeIn() + expandVertically()) { LiveBar(vm, hub, Modifier.padding(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 8.dp)) }
    LazyColumn(
        Modifier.fillMaxSize().testTag("ahora"),
        contentPadding = PaddingValues(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item("status") { StatusRow(hub) { vm.go(Screen.Dispositivos) } }
        item("assist") { Segmented(listOf("assist" to "Asistir", "record" to "Solo grabar"), s.assistMode, vm::setAssist, label = "Modo de Lente") }
        Copy.note(s)?.let { note -> item("note") { Notice(note, tag = "status-note") } }
        if (!s.clip && capture !is Capture.State.On && capture != Capture.State.Starting) item("use-phone") {
            Button("Usar el teléfono", usePhone, Modifier.fillMaxWidth().testTag("use-phone"), tone = Tone.Plain, glyph = Glyph.Phone)
        }
        (capture as? Capture.State.Stopped)?.let { stopped -> item("phone-note") { Notice(stopped.why, action = if (stopped.resumable) "Reanudar" else null, tag = "phone-note", onAction = usePhone) } }
        Copy.pause(s)?.let { (text, action) -> item("pause") { Notice(text, action = action, tag = "pause-note") { vm.setListening(true) } } }
        val card = hub.card
        if (card != null && !s.recordOnly) item("cue") { DiloCard(card) }
        item("meeting") { MeetingCard(vm, hub) }
        item("now") { NowCard(hub.summary) }
        item("view") { ViewCard(vm, hub) }
        item("today") { SectionTitle("Hoy", trailing = if (hub.turnCount > 0) "${hub.turnCount} turnos" else null) }
        if (timeline.isEmpty() && hub.partial.isBlank()) item("hint") {
            Text("Aquí aparece lo que se dice a tu alrededor, con una letra por persona. Solo se guarda como texto.", style = Type.callout, color = c.muted, modifier = Modifier.padding(horizontal = 4.dp))
        }
        items(timeline, key = { it.key }) { e -> TimelineRow(e, s.wearer) }
        if (hub.partial.isNotBlank()) item("partial") {
            Text(hub.partial, style = Type.body, color = c.muted, modifier = Modifier.padding(horizontal = 4.dp).testTag("partial"))
        }
    }
    }
}

const val TIMELINE_ROWS = 120

/** Red bar that says the session is running and opens En vivo. */
@Composable
private fun LiveBar(vm: LenteViewModel, hub: HubState, modifier: Modifier = Modifier) {
    val c = Lente.c
    val now = ticker()
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.liveFill).clickable { vm.openLive() }.padding(horizontal = 16.dp, vertical = 12.dp).testTag("live-bar"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(c.onLive)
        Spacer(Modifier.width(10.dp))
        Text("${Copy.stateWord(hub.status)} · ${Format.clock(hub.elapsedMs(now))}", style = Type.measured.copy(fontSize = Type.callout.fontSize, fontWeight = FontWeight.SemiBold), color = c.onLive, modifier = Modifier.weight(1f))
        Text("Abrir", style = Type.headline, color = c.onLive)
    }
}

/** The phone's clock, ticking every half second, for elapsed times. */
@Composable
fun ticker(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(500); now = System.currentTimeMillis() } }
    return now
}

@Composable
private fun StatusRow(hub: HubState, onClick: () -> Unit) {
    val c = Lente.c
    val s = hub.status
    Card(Modifier.clickable(onClick = onClick).testTag("status-row"), padding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Dot(if (s.clip) c.ok else c.muted, 10.dp)
            Spacer(Modifier.width(10.dp))
            Text(Copy.device(s), style = Type.headline, color = c.ink, modifier = Modifier.testTag("device"))
            Spacer(Modifier.width(8.dp))
            Text(Copy.mode(s), style = Type.callout, color = c.muted, modifier = Modifier.weight(1f))
            LevelBars(if (s.listening) (hub.level / 3000f).coerceIn(0f, 1f) else 0f, if (s.listening && s.clip) c.liveFill else c.muted)
        }
    }
}

/** The one card: label, the line to say large, the Spanish meaning, and measured numbers in muted text. */
@Composable
fun DiloCard(e: Entry, modifier: Modifier = Modifier) {
    val c = Lente.c
    Card(modifier.animateContentSize(spring(stiffness = 500f)).semantics { liveRegion = LiveRegionMode.Assertive }.testTag("dilo"), padding = PaddingValues(20.dp)) {
        Tag(if (e.isDilo) "DILO" else e.label.uppercase(), Modifier.testTag("dilo-label"))
        Spacer(Modifier.height(12.dp))
        Text(e.text, style = Type.large, color = c.ink, modifier = Modifier.testTag("dilo-text"))
        e.meaning?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = Type.body, color = c.muted, modifier = Modifier.testTag("dilo-meaning"))
        }
        val meta = Copy.cardMeta(e)
        if (meta.isNotBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(meta, style = Type.measured, color = c.muted, modifier = Modifier.testTag("dilo-meta"))
        }
        val stages = Format.stages(e.stages)
        if (stages.isNotBlank()) Text(stages, style = Type.measured.copy(fontSize = Type.caption.fontSize * 0.92f), color = c.muted, modifier = Modifier.padding(top = 2.dp).testTag("dilo-stages"))
    }
}

@Composable
private fun MeetingCard(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val m = hub.status.meeting
    var title by rememberSaveable { mutableStateOf("") }
    Card(padding = PaddingValues(12.dp)) {
        if (m != null && !m.auto) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Dot(c.liveFill)
                Spacer(Modifier.width(10.dp))
                One("En reunión: ${m.title.ifBlank { "sin título" }} · ${m.turns} turnos", Type.callout, c.ink, Modifier.weight(1f).testTag("meeting-live"))
                ConfirmButton("Terminar", "¿Terminar?", { vm.endMeeting() }, tag = "meeting-end")
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field(title, { title = it }, "Título (opcional)", Modifier.weight(1f), onDone = { vm.startMeeting(title); title = "" }, tag = "meeting-title")
                Spacer(Modifier.width(10.dp))
                Button("Iniciar", { vm.startMeeting(title); title = "" }, Modifier.testTag("meeting-start"))
            }
        }
    }
}

@Composable
private fun NowCard(summary: Entry?) {
    val c = Lente.c
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("QUÉ ESTÁ PASANDO", style = Type.label, color = c.muted, modifier = Modifier.weight(1f))
            summary?.let { Text(Format.hhmm(it.at), style = Type.measured, color = c.muted) }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            summary?.text ?: "Aquí aparece un resumen corto cada pocos minutos de conversación, o cuando tocas Resumen.",
            style = Type.body, color = if (summary != null) c.ink else c.muted, modifier = Modifier.testTag("now-text"),
        )
    }
}

@Composable
private fun ViewCard(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val v = hub.view
    val s = hub.status
    if (v == null && s.mode == "camera") return
    // While live reads run, the card opens the camera's full live view.
    Card(Modifier.then(if (s.live) Modifier.clickable { vm.openCamera() }.testTag("view-open") else Modifier), padding = PaddingValues(0.dp)) {
        if (v != null) {
            val bitmap = rememberPhoto(v.photo)
            if (bitmap != null) Box {
                Image(bitmap, contentDescription = v.text.ifBlank { "Foto del clip" }, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f).testTag("photo"))
                Tag(v.badge, Modifier.padding(12.dp), bg = c.glass, fg = c.ink)
            }
            if (v.text.isNotBlank() || v.ms != null) Column(Modifier.padding(16.dp)) {
                if (v.text.isNotBlank()) Text(v.text, style = Type.body, color = c.ink, modifier = Modifier.testTag("view-text"))
                v.ms?.let { Text("descrito en $it ms", style = Type.measured, color = c.muted, modifier = Modifier.padding(top = 4.dp)) }
                Format.stages(v.stages).takeIf { it.isNotBlank() }?.let { Text(it, style = Type.measured, color = c.muted) }
            }
        }
        if (s.mode != "camera") Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Cámara apagada para ahorrar batería. Mirar toma una sola foto.", style = Type.callout, color = c.muted, modifier = Modifier.weight(1f))
            Text("Activar", style = Type.headline, color = c.accent, modifier = Modifier.padding(start = 12.dp).clickable { vm.setMode("camera") }.padding(vertical = 6.dp).testTag("cam-on"))
        }
    }
}

@Composable
fun TimelineRow(e: Entry, wearer: String) {
    val c = Lente.c
    val chip = Copy.speaker(e, wearer)
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp).testTag("row-${e.kind}"), verticalAlignment = Alignment.Top) {
        Box(Modifier.width(30.dp).height(24.dp).clip(RoundedCornerShape(8.dp)).background(if (chip == "Tú") c.tag else c.raised), contentAlignment = Alignment.Center) {
            Text(chip, style = Type.label, color = if (chip == "Tú") c.accent else c.ink, maxLines = 1)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(if (e.isDilo) "Dilo: ${e.text}" else e.text, style = Type.callout, color = c.ink)
            val meta = listOfNotNull(Format.hhmm(e.at), if (e.kind == "cue") Copy.cardMeta(e).ifBlank { null } else null).joinToString(" · ")
            Text(meta, style = Type.measured.copy(fontSize = Type.caption.fontSize * 0.92f), color = c.muted)
        }
    }
}

