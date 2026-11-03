package app.lente.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.DragInteraction
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.core.Copy
import app.lente.core.Format
import app.lente.core.HubState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** En vivo: the meeting in full screen. Elapsed time, the card slot, the live transcript, help, pause and stop. */
@Composable
fun Live(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val s = hub.status
    val now = ticker()
    val busy by vm.busy.collectAsState()
    val turns = hub.sessionTurns
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // Follow new words unless the wearer dragged the transcript; then offer "Nuevo". Only a drag stops
    // following (not our own scrolling), and reaching the end again by hand resumes it.
    val atEnd by remember { derivedStateOf { val info = list.layoutInfo; info.visibleItemsInfo.lastOrNull()?.index?.let { it >= info.totalItemsCount - 1 } ?: true } }
    var following by remember { mutableStateOf(true) }
    var unseen by remember { mutableStateOf(false) }
    val rows = turns.size + if (hub.partial.isNotBlank()) 1 else 0
    LaunchedEffect(list) { list.interactionSource.interactions.collect { if (it is DragInteraction.Start) following = false } }
    LaunchedEffect(atEnd, list.isScrollInProgress) { if (atEnd && !list.isScrollInProgress) { following = true; unseen = false } }
    LaunchedEffect(rows, hub.partial.length) {
        if (rows == 0) return@LaunchedEffect
        if (following) list.scrollToItem(rows - 1, Int.MAX_VALUE) else unseen = true
    }
    var tab by remember { mutableStateOf(TAB_TRANSCRIPT) }
    var stopArmed by remember { mutableStateOf(false) }
    LaunchedEffect(stopArmed) { if (stopArmed) { delay(4_000); stopArmed = false } }

    val stop = { if (stopArmed) { stopArmed = false; vm.stopSession(); vm.closeLive() } else stopArmed = true }
    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding().testTag("live")) {
        // Header: minimise on the left, the mode in the middle, a balancing slot on the right.
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            PlainIcon(Glyph.ChevronDown, "Minimizar la vista en vivo", Modifier.testTag("live-collapse")) { vm.closeLive() }
            Text(if (s.recordOnly) "Solo grabar" else "Asistir", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f))
            Spacer(Modifier.size(44.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // The session card: what is happening and on which device, the sound level and the running time.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(Copy.stateWord(s), style = Type.headline.copy(fontWeight = FontWeight.Medium), color = c.ink)
                    Text(Copy.device(s), style = Type.caption, color = c.muted)
                    // add-media-archive 4.1: what is being kept besides the text, while it is.
                    s.media.keepingLabel?.let { Text(it, style = Type.caption, color = c.muted, modifier = Modifier.testTag("live-media")) }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(7.dp).clip(RoundedCornerShape(2.dp)).background(if (s.listening) c.ok else c.muted))
                        Spacer(Modifier.width(6.dp))
                        Text(Format.clock(hub.elapsedMs(now)), style = Type.measured.copy(fontSize = Type.callout.fontSize), color = c.ink, modifier = Modifier.testTag("live-clock"))
                    }
                    Spacer(Modifier.height(4.dp))
                    LevelBars(if (s.listening) (hub.level / 3000f).coerceIn(0f, 1f) else 0f, c.ink)
                }
            }
            val card = hub.sessionCard
            if (card != null && !s.recordOnly) DiloCard(card) else if (!s.recordOnly) Card {
                Text("Cuando te pregunten algo, aquí aparece qué decir.", style = Type.callout, color = c.muted, modifier = Modifier.testTag("live-wait"))
            }
            Tabs(listOf(TAB_TRANSCRIPT to "Transcripción", TAB_SUMMARY to "Resumen"), tab, { tab = it }, Modifier.testTag("live-tabs"), label = "Vista")
            if (tab == TAB_SUMMARY) LiveSummaries(hub, Modifier.weight(1f).fillMaxWidth())
            else Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface)) {
                LazyColumn(state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize().testTag("live-tx")) {
                    if (turns.isEmpty() && hub.partial.isBlank()) item {
                        Text(if (s.listening) "Escuchando… lo que se diga aparece aquí." else "En pausa. Toca Seguir para escuchar.", style = Type.callout, color = c.muted)
                    }
                    items(turns, key = { it.key }) { e ->
                        val mine = e.speaker != null && e.speaker == s.wearer
                        val who = if (mine) s.names.firstOrNull() ?: "Tú" else e.speaker ?: "·"
                        Column {
                            Text(who, style = Type.caption.copy(fontWeight = if (mine) FontWeight.SemiBold else FontWeight.Normal), color = if (mine) c.ink else c.muted)
                            Text(e.text, style = Type.body, color = c.ink)
                        }
                    }
                    if (hub.partial.isNotBlank()) item("live-partial") {
                        Column { Text("…", style = Type.caption, color = c.muted); Text(hub.partial, style = Type.body, color = c.muted) }
                    }
                }
                if (unseen) Text(
                    "Nuevo ↓", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.bg,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp).clip(RoundedCornerShape(10.dp)).background(c.ink)
                        .clickable { following = true; unseen = false; scope.launch { list.scrollToItem((rows - 1).coerceAtLeast(0), Int.MAX_VALUE) } }.padding(horizontal = 14.dp, vertical = 8.dp).testTag("live-new"),
                )
            }
            if (!s.recordOnly) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((kind, label) in listOf("aportar" to "Aportar", "pregunta" to "Pregunta", "tema" to "¿De qué hablan?")) {
                    val loading = "help-$kind" in busy
                    Text(
                        if (loading) "…" else label, style = Type.callout, color = c.ink, maxLines = 1,
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(c.surface)
                            .clickable(enabled = !loading) { vm.help(kind) }.padding(vertical = 11.dp).testTag("help-$kind"),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
        Text(
            when {
                stopArmed -> "Toca otra vez para terminar"
                !s.clip -> "Conecta el clip para escuchar."
                s.phoneIsDevice -> "Puedes bloquear el teléfono: sigue escuchando con su micrófono."
                else -> "Puedes bloquear el teléfono: el clip sigue escuchando."
            },
            style = Type.caption, color = if (stopArmed) c.live else c.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(start = Lente.gutter, end = Lente.gutter, top = 10.dp),
        )
        // The pair at the bottom, as in the reference: pause or go on (white) and end (ink, a second tap to confirm).
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Lente.gutter, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            LiveAction(if (s.listening) Glyph.Pause else Glyph.Play, if (s.listening) "Pausar" else "Seguir", c.surface, c.ink, Modifier.weight(1f).testTag("live-pause")) { vm.toggleListening() }
            LiveAction(Glyph.Stop, if (stopArmed) "¿Terminar?" else "Terminar", if (stopArmed) c.liveFill else c.ink, if (stopArmed) c.onLive else c.bg, Modifier.weight(1f).testTag("live-stop"), stop)
        }
    }
}

@Composable
private fun LiveAction(glyph: Glyph, label: String, fill: androidx.compose.ui.graphics.Color, ink: androidx.compose.ui.graphics.Color, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier.height(52.dp).clip(RoundedCornerShape(12.dp)).background(fill).clickable(onClick = onClick).semantics { contentDescription = label },
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(glyph, ink, size = 18.dp)
        Spacer(Modifier.width(10.dp))
        Text(label, style = Type.headline.copy(fontWeight = FontWeight.Medium), color = ink)
    }
}

private const val TAB_TRANSCRIPT = "tx"
private const val TAB_SUMMARY = "resumen"

/** Resumen: what the hub summarized during this session, newest first, with the time of each. */
@Composable
private fun LiveSummaries(hub: HubState, modifier: Modifier) {
    val c = Lente.c
    val summaries = hub.sessionSummaries
    LazyColumn(modifier.testTag("live-summary"), contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (summaries.isEmpty()) item {
            Text("Lente resume la conversación cada pocos minutos; el primer resumen aparece aquí.", style = Type.callout, color = c.muted)
        }
        items(summaries, key = { "summary-${it.at}" }) { e ->
            Card {
                Text(Format.hhmm(e.at), style = Type.measured, color = c.muted)
                Spacer(Modifier.height(6.dp))
                Text(e.text, style = Type.body, color = c.ink)
            }
        }
    }
}
