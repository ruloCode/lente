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
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import app.lente.core.Greeting

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
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item("hero") { if (s.listening) ListeningHero(vm, hub) else RestingHero(vm, hub) }
        Copy.note(s)?.let { note -> item("note") { Notice(note, tag = "status-note") } }
        if (!s.clip && capture !is Capture.State.On && capture != Capture.State.Starting) item("use-phone") {
            Button("Usar el teléfono", usePhone, Modifier.fillMaxWidth().testTag("use-phone"), tone = Tone.Plain, glyph = Glyph.Phone)
        }
        (capture as? Capture.State.Stopped)?.let { stopped -> item("phone-note") { Notice(stopped.why, action = if (stopped.resumable) "Reanudar" else null, tag = "phone-note", onAction = usePhone) } }
        Copy.pause(s)?.let { (text, action) -> item("pause") { Notice(text, action = action, tag = "pause-note") { vm.setListening(true) } } }
        val card = hub.card
        if (card != null && !s.recordOnly) item("cue") { DiloCard(card) }
        item("actions") { QuickActions(vm, hub) }
        if (s.listening || hub.summary != null) item("now") { NowCard(hub.summary) }
        item("stats") { TodayCard(hub) }
        item("meeting") { MeetingCard(vm, hub) }
        item("view") { ViewCard(vm, hub) }
        item("today") { SectionTitle("Lo último", trailing = if (hub.turnCount > 0) "${hub.turnCount} turnos" else null) }
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

/** Which device listens, as one row that opens Dispositivos; `device` is what the end-to-end script reads. */
@Composable
private fun DeviceLine(vm: LenteViewModel, hub: HubState, modifier: Modifier = Modifier, stacked: Boolean = false) {
    val c = Lente.c
    val s = hub.status
    // Narrow (beside the clip picture) the mode goes under the device; wide, everything sits on one line with the sound level.
    Column(modifier.clip(RoundedCornerShape(12.dp)).clickable { vm.go(Screen.Dispositivos) }.padding(vertical = 6.dp).testTag("status-row")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Dot(if (s.clip) c.ok else c.muted, 10.dp)
            Spacer(Modifier.width(8.dp))
            Text(Copy.device(s), style = Type.headline, color = c.ink, modifier = Modifier.testTag("device"))
            if (!stacked) {
                Spacer(Modifier.width(8.dp))
                Text(Copy.mode(s), style = Type.caption, color = c.muted, maxLines = 1)
                Spacer(Modifier.width(8.dp))
                LevelBars(if (s.listening) (hub.level / 3000f).coerceIn(0f, 1f) else 0f, if (s.listening && s.clip) c.liveFill else c.muted)
            }
        }
        if (stacked) Text(Copy.mode(s), style = Type.caption, color = c.muted, maxLines = 1, modifier = Modifier.padding(start = 18.dp, top = 2.dp))
    }
}

/** At rest: the clip on its glasses, which device is there, one big button to start, and Asistir or Solo grabar. */
@Composable
private fun RestingHero(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val s = hub.status
    Card(padding = PaddingValues(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                androidx.compose.ui.res.painterResource(if (c.dark) app.lente.R.drawable.art_clip_dark else app.lente.R.drawable.art_clip),
                contentDescription = "El clip de Lente en unos lentes", contentScale = ContentScale.Fit,
                modifier = Modifier.weight(0.5f).aspectRatio(1.25f).clip(RoundedCornerShape(16.dp)),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(0.5f)) {
                DeviceLine(vm, hub, stacked = true)
                Text(
                    if (s.clip) "Nada se transcribe hasta que toques." else "Sin clip, el teléfono puede escuchar por él.",
                    style = Type.caption, color = c.muted, modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Button("Empezar a escuchar", { vm.setListening(true) }, Modifier.fillMaxWidth().height(54.dp).testTag("start-listening"), glyph = Glyph.Play)
        Spacer(Modifier.height(12.dp))
        Segmented(listOf("assist" to "Asistir", "record" to "Solo grabar"), s.assistMode, vm::setAssist, label = "Modo de Lente")
    }
}

/** Listening: Lente's mark in a glass orb that breathes with the room's sound, and what it is doing. */
@Composable
private fun ListeningHero(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val s = hub.status
    val level by animateFloatAsState((hub.level / 3000f).coerceIn(0f, 1f), spring(stiffness = 300f), label = "level")
    val breath = rememberInfiniteTransition(label = "orb")
    val pulse by breath.animateFloat(0f, 1f, infiniteRepeatable(tween(2200), RepeatMode.Restart), label = "pulse")
    val ring = if (s.clip || s.listening) c.accent else c.muted
    Card(padding = PaddingValues(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 16.dp)) {
        Box(Modifier.fillMaxWidth().height(196.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(196.dp)) {
                val r = size.minDimension / 2
                // One ripple leaving the orb every 2.2 s, and a ring that swells with the sound.
                drawCircle(ring.copy(alpha = 0.28f * (1f - pulse)), r * (0.56f + 0.44f * pulse), style = Stroke(2.dp.toPx()))
                drawCircle(ring.copy(alpha = 0.55f), r * (0.6f + 0.18f * level), style = Stroke((2f + 4f * level).dp.toPx()))
            }
            GlassMark(112.dp)
        }
        Text(
            if (s.recordOnly) "Grabo tu día como texto, sin sugerencias." else "Te escucho. Te aviso cuando te pregunten.",
            style = Type.headline, color = c.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        )
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { DeviceLine(vm, hub) }
        Spacer(Modifier.height(8.dp))
        Segmented(listOf("assist" to "Asistir", "record" to "Solo grabar"), s.assistMode, vm::setAssist, label = "Modo de Lente")
    }
}

/** Mirar, En vivo, Voz and Resumen as four round glass buttons. */
@Composable
private fun QuickActions(vm: LenteViewModel, hub: HubState) {
    val s = hub.status
    val voice by vm.readAloud.collectAsState()
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
        QuickAction("Mirar", Glyph.Eye, enabled = s.clip, pressed = false, "dock-look") { vm.look() }
        QuickAction("En vivo", Glyph.Camera, enabled = s.clip, pressed = s.live, "dock-live") { vm.openCamera() }
        QuickAction("Voz", Glyph.Speaker, enabled = true, pressed = voice, "dock-voice") { vm.setReadAloud(!voice) }
        QuickAction("Resumen", Glyph.Summary, enabled = true, pressed = false, "dock-summary") { vm.summary() }
    }
}

@Composable
private fun QuickAction(label: String, glyph: Glyph, enabled: Boolean, pressed: Boolean, tag: String, onClick: () -> Unit) {
    val c = Lente.c
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.semantics(mergeDescendants = true) {}) {
        Box(
            Modifier.size(64.dp).shadow(if (c.dark || !enabled) 0.dp else 8.dp, CircleShape).clip(CircleShape)
                .background(if (pressed) c.accentFill else c.surface).border(0.5.dp, if (pressed) androidx.compose.ui.graphics.Color.Transparent else c.line, CircleShape)
                .clickable(enabled = enabled, onClick = onClick).testTag(tag).semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) { Icon(glyph, when { pressed -> c.onAccent; enabled -> c.accent; else -> c.muted }, size = 26.dp) }
        Text(label, style = Type.caption.copy(fontWeight = FontWeight.Medium), color = if (enabled) c.ink else c.muted, modifier = Modifier.padding(top = 6.dp))
    }
}

/** Today in three numbers: minutes transcribed, DILO lines, and what it cost. */
@Composable
private fun TodayCard(hub: HubState) {
    val c = Lente.c
    val dilos = hub.entries.count { it.kind == "cue" && it.isDilo }
    Card(padding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
        Text("Hoy", style = Type.headline, color = c.ink)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().testTag("today-stats")) {
            Stat(Glyph.Wave, Format.minutes(hub.spend.audioSeconds), "transcritos", Modifier.weight(1f))
            Stat(Glyph.Sparkle, "$dilos", if (dilos == 1) "DILO" else "DILO", Modifier.weight(1f))
            Stat(Glyph.Summary, Format.usd(hub.spend.usd, hub.spend.unpriced), "aprox.", Modifier.weight(1f))
        }
    }
}

@Composable
private fun Stat(glyph: Glyph, value: String, label: String, modifier: Modifier) {
    val c = Lente.c
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(glyph, c.accent, size = 20.dp)
        Text(value, style = Type.title, color = c.ink, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
        Text(label, style = Type.caption, color = c.muted)
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

