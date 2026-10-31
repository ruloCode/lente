package app.lente.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
    // Follow new rows unless the wearer scrolled up; then offer "Nuevo".
    val atEnd by remember { derivedStateOf { val info = list.layoutInfo; info.visibleItemsInfo.lastOrNull()?.index?.let { it >= info.totalItemsCount - 2 } ?: true } }
    var unseen by remember { mutableStateOf(false) }
    val rows = turns.size + if (hub.partial.isNotBlank()) 1 else 0
    LaunchedEffect(rows) {
        if (rows == 0) return@LaunchedEffect
        if (atEnd) list.animateScrollToItem(rows - 1) else unseen = true
    }
    LaunchedEffect(atEnd) { if (atEnd) unseen = false }
    var stopArmed by remember { mutableStateOf(false) }
    LaunchedEffect(stopArmed) { if (stopArmed) { delay(4_000); stopArmed = false } }

    Column(Modifier.fillMaxSize().background(c.bg).testTag("live")) {
        Row(
            Modifier.fillMaxWidth().background(if (s.listening && s.clip) c.liveFill else c.raised).statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val fg = if (s.listening && s.clip) c.onLive else c.ink
            Dot(fg)
            Spacer(Modifier.width(10.dp))
            Text("${Copy.stateWord(s)} · ${Format.clock(hub.elapsedMs(now))}", style = Type.measured.copy(fontSize = Type.headline.fontSize, fontWeight = FontWeight.SemiBold), color = fg, modifier = Modifier.weight(1f).testTag("live-clock"))
            LevelBars(if (s.listening) (hub.level / 3000f).coerceIn(0f, 1f) else 0f, fg)
            Spacer(Modifier.width(12.dp))
            Text(if (stopArmed) "¿Terminar?" else "Detener", style = Type.headline, color = fg, modifier = Modifier.clickable { if (stopArmed) { stopArmed = false; vm.stopSession(); vm.closeLive() } else stopArmed = true }.padding(6.dp).testTag("live-stop"))
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(CircleShape).clickable { vm.closeLive() }.semantics { contentDescription = "Minimizar la vista en vivo" }.testTag("live-collapse"), contentAlignment = Alignment.Center) {
                Icon(Glyph.ChevronDown, c.ink)
            }
            Text(if (s.recordOnly) "Solo grabar" else "Asistir", style = Type.headline, color = c.ink, modifier = Modifier.weight(1f).padding(start = 4.dp))
            Dot(if (s.clip) c.ok else c.muted)
            Spacer(Modifier.width(6.dp))
            Text(Copy.device(s), style = Type.callout, color = c.muted)
        }
        Box(Modifier.padding(horizontal = Lente.gutter)) {
            val card = hub.sessionCard
            if (card != null && !s.recordOnly) DiloCard(card) else Card {
                Text("Cuando te pregunten algo, aquí aparece qué decir.", style = Type.callout, color = c.muted, modifier = Modifier.testTag("live-wait"))
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(state = list, contentPadding = PaddingValues(Lente.gutter), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize().testTag("live-tx")) {
                if (turns.isEmpty() && hub.partial.isBlank()) item {
                    Text(if (s.listening) "Escuchando… lo que se diga aparece aquí." else "En pausa. Toca ▶ para seguir escuchando.", style = Type.callout, color = c.muted)
                }
                items(turns, key = { it.key }) { e ->
                    val who = if (e.speaker != null && e.speaker == s.wearer) s.names.firstOrNull() ?: "Tú" else e.speaker ?: "·"
                    Column {
                        Text(who, style = Type.label, color = if (e.speaker == s.wearer) c.accent else c.muted)
                        Text(e.text, style = Type.body, color = c.ink)
                    }
                }
                if (hub.partial.isNotBlank()) item("live-partial") {
                    Column { Text("…", style = Type.label, color = c.muted); Text(hub.partial, style = Type.body, color = c.muted) }
                }
            }
            if (unseen) Text(
                "Nuevo ↓", style = Type.headline, color = c.onAccent,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp).clip(RoundedCornerShape(50)).background(c.accentFill)
                    .clickable { scope.launch { list.animateScrollToItem((rows - 1).coerceAtLeast(0)) } }.padding(horizontal = 16.dp, vertical = 8.dp).testTag("live-new"),
            )
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = Lente.gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((kind, label) in listOf("aportar" to "Aportar", "pregunta" to "Pregunta", "tema" to "¿De qué hablan?")) {
                val loading = "help-$kind" in busy
                Text(
                    if (loading) "…" else label, style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.ink, maxLines = 1,
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(c.surface).border(1.dp, c.line, RoundedCornerShape(14.dp))
                        .clickable(enabled = !loading && !s.recordOnly) { vm.help(kind) }.padding(vertical = 12.dp).testTag("help-$kind"),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Lente.gutter, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(56.dp).clip(CircleShape).background(c.raised).clickable { vm.toggleListening() }.semantics { contentDescription = if (s.listening) "Pausar" else "Seguir escuchando" }.testTag("live-pause"),
                contentAlignment = Alignment.Center,
            ) { Icon(if (s.listening) Glyph.Pause else Glyph.Play, c.ink) }
            Text(
                when {
                    !s.clip -> "Conecta el clip para escuchar."
                    s.phoneIsDevice -> "Puedes bloquear el teléfono: sigue escuchando con su micrófono."
                    else -> "Puedes bloquear el teléfono: el clip sigue escuchando."
                },
                style = Type.caption, color = c.muted, modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            )
            Box(
                Modifier.size(56.dp).clip(CircleShape).background(c.liveFill).clickable { if (stopArmed) { stopArmed = false; vm.stopSession(); vm.closeLive() } else stopArmed = true }
                    .semantics { contentDescription = "Terminar" },
                contentAlignment = Alignment.Center,
            ) { Icon(Glyph.Stop, c.onLive) }
        }
        if (stopArmed) Text("Toca otra vez para terminar", style = Type.caption, color = c.live, modifier = Modifier.align(Alignment.End).padding(end = 20.dp, bottom = 8.dp))
    }
}

@Suppress("unused")
private val spacer = Modifier.height(0.dp)
