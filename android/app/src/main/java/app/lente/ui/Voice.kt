package app.lente.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.core.AskSource
import app.lente.core.VoiceEvents
import app.lente.core.VoicePhase

/**
 * Hablar con Lente (add-voice-mode): one large state (escuchando, pensando, hablando), the words the
 * wearer is saying, Lente's reply as it is spoken, and chips for the tools it used and its sources.
 * Hands-free by default; hold-to-talk is one tap away. Pausar and Terminar at the bottom.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VoiceScreen(vm: LenteViewModel) {
    val c = Lente.c
    val view by vm.voice.collectAsState()
    val handsFree by vm.voiceHandsFree.collectAsState()
    val uri = LocalUriHandler.current
    val turn = view.current
    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding().testTag("voice")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Hablar con Lente", style = Type.title, color = c.ink)
                VoiceEvents.sourceLabel(view.source).takeIf { it.isNotEmpty() }?.let { Text(it, style = Type.caption, color = c.muted, modifier = Modifier.testTag("voice-source")) }
            }
            RoundIcon(Glyph.Close, "Terminar", Modifier.testTag("voice-close")) { vm.closeVoice() }
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Lente.gutter), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(24.dp))
            StateOrb(view.phase)
            Spacer(Modifier.height(14.dp))
            Text(VoiceEvents.label(view.phase), style = Type.headline, color = if (view.phase == VoicePhase.Speaking) c.accent else c.ink, modifier = Modifier.testTag("voice-state"))
            Spacer(Modifier.height(28.dp))
            // What the wearer is saying now, or what they said last.
            val said = view.partial.ifBlank { turn?.heard.orEmpty() }
            if (said.isNotBlank()) Text("«$said»", style = Type.body, color = if (view.partial.isNotBlank()) c.ink else c.muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().testTag("voice-heard"))
            if (turn != null && turn.reply.isNotEmpty() && !turn.cancelled) {
                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Box(Modifier.padding(top = 2.dp)) { Mark(size = 24.dp) }
                    Spacer(Modifier.width(12.dp))
                    Text(turn.reply.joinToString(" "), style = Type.body.copy(fontWeight = FontWeight.Medium), color = c.ink, modifier = Modifier.weight(1f).testTag("voice-reply"))
                }
            }
            if (turn != null && (turn.tools.isNotEmpty() || turn.sources.isNotEmpty())) {
                Spacer(Modifier.height(14.dp))
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (t in turn.tools.distinctBy { it.label }) Chip(Glyph.Sparkle, t.label, "voice-tool")
                    for (s in turn.sources) Chip(sourceGlyph(s), s.label, "voice-source-chip") {
                        when {
                            s.url != null -> runCatching { uri.openUri(s.url) }
                            s.meetingId != null -> { vm.closeVoice(); vm.go(Screen.Reunion(s.meetingId, s.turnId)) }
                        }
                    }
                }
            }
            view.error?.let { Spacer(Modifier.height(16.dp)); Notice(it, tag = "voice-error") }
            Spacer(Modifier.height(24.dp))
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.Center) {
            Segmented(listOf("free" to "Manos libres", "hold" to "Mantener para hablar"), if (handsFree) "free" else "hold", { vm.setVoiceHandsFree(it == "free") }, label = "Cómo hablar")
        }
        Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            val paused = view.phase == VoicePhase.Paused
            RoundIcon(if (paused) Glyph.Play else Glyph.Pause, if (paused) "Reanudar" else "Pausar", Modifier.testTag("voice-pause")) { vm.voicePause() }
            Spacer(Modifier.weight(1f))
            if (!handsFree) HoldToTalk(vm) else Spacer(Modifier.size(84.dp))
            Spacer(Modifier.weight(1f))
            RoundIcon(Glyph.Stop, "Terminar", Modifier.testTag("voice-end")) { vm.closeVoice() }
        }
    }
}

private fun sourceGlyph(s: AskSource): Glyph = when (s.kind) { "web" -> Glyph.Link; "seen" -> Glyph.Camera; "heard" -> Glyph.Wave; "fact" -> Glyph.Brain; else -> Glyph.Doc }

@Composable
private fun Chip(glyph: Glyph, label: String, tag: String, onClick: (() -> Unit)? = null) {
    val c = Lente.c
    Row(
        Modifier.clip(RoundedCornerShape(12.dp)).background(c.tag).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 10.dp, vertical = 7.dp).testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(glyph, c.accent, size = 16.dp)
        Spacer(Modifier.width(6.dp))
        Text(label, style = Type.caption, color = c.accent, maxLines = 1)
    }
}

/** The large state: breathing while it listens, pulsing while it thinks, swelling while it speaks. */
@Composable
private fun StateOrb(phase: VoicePhase) {
    val c = Lente.c
    val t = rememberInfiniteTransition(label = "orb")
    val period = when (phase) { VoicePhase.Thinking -> 520; VoicePhase.Speaking -> 360; else -> 1600 }
    val pulse by t.animateFloat(0.92f, 1.06f, infiniteRepeatable(tween(period), RepeatMode.Reverse), label = "pulse")
    val still = phase == VoicePhase.Paused || phase == VoicePhase.Ended || phase == VoicePhase.Connecting
    val fill = when (phase) { VoicePhase.Speaking -> c.accentFill; VoicePhase.Thinking -> c.accent; else -> c.tag }
    Box(Modifier.size(180.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(180.dp).scale(if (still) 1f else pulse * 1.04f).alpha(0.35f).clip(CircleShape).background(fill))
        Box(Modifier.size(132.dp).scale(if (still) 1f else pulse).clip(CircleShape).background(fill).border(0.5.dp, c.line, CircleShape), contentAlignment = Alignment.Center) {
            Icon(when (phase) { VoicePhase.Speaking -> Glyph.Speaker; VoicePhase.Thinking -> Glyph.Sparkle; VoicePhase.Paused -> Glyph.Pause; else -> Glyph.Mic }, if (phase == VoicePhase.Speaking || phase == VoicePhase.Thinking) c.onAccent else c.accent, size = 44.dp)
        }
    }
}

/** Hold to talk: pressing interrupts Lente if it is speaking; letting go closes the turn. */
@Composable
private fun HoldToTalk(vm: LenteViewModel) {
    val c = Lente.c
    Box(
        Modifier.size(84.dp).clip(CircleShape).background(c.accentFill).testTag("voice-hold").semantics { contentDescription = "Mantén presionado para hablar" }
            .pointerInput(Unit) { detectTapGestures(onPress = { vm.voiceHold(true); tryAwaitRelease(); vm.voiceHold(false) }) },
        contentAlignment = Alignment.Center,
    ) { Icon(Glyph.Mic, c.onAccent, size = 34.dp) }
}
