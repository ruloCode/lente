package app.lente.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lente.LenteViewModel
import app.lente.core.HubState
import app.lente.core.Sight

/** High contrast whatever the theme: white on black, the state in yellow. */
private val SightInk = Color.White
private val SightGround = Color.Black
private val SightState = Color(0xFFFFD60A)

/**
 * Ver (add-sight-mode): one full-screen surface for someone who cannot see it, and a conversation:
 * Lente listens all the time, so the wearer just talks. The latest line (a description, «Lente: …» or
 * «Tú: …») in very large type; a tap looks, a long press pauses or resumes the listening, a two-finger
 * tap pauses or resumes narration. For TalkBack the surface is one node whose description says all
 * that, with the same actions in its actions menu; the state line is a polite live region. Salir sits
 * apart, at the bottom.
 */
@Composable
fun SightScreen(vm: LenteViewModel, hub: HubState) {
    val view by vm.sight.collectAsState()
    val talk by vm.voice.collectAsState()
    val narration = Sight.narrationAction(view)
    val listen = Sight.listenAction(talk.phase, view.quiet)
    val quiet = if (view.quiet) Sight.TALK_AGAIN else Sight.QUIET
    // The screen stays on (a wearer who cannot see it must not find it locked), with light status icons on the black.
    val host = LocalView.current
    DisposableEffect(Unit) {
        host.keepScreenOn = true
        val bars = (host.context as? android.app.Activity)?.window?.let { androidx.core.view.WindowCompat.getInsetsController(it, host) }
        val lightBefore = bars?.isAppearanceLightStatusBars
        bars?.isAppearanceLightStatusBars = false
        onDispose {
            host.keepScreenOn = false
            if (lightBefore != null) bars.isAppearanceLightStatusBars = lightBefore
        }
    }
    Box(Modifier.fillMaxSize().background(SightGround).testTag("sight")) {
        val shown = Sight.shown(view)
        val size = when { shown.length <= 140 -> 40.sp; shown.length <= 400 -> 30.sp; else -> 23.sp }
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().testTag("sight-surface").focusable()
                .clearAndSetSemantics {
                    contentDescription = Sight.SURFACE
                    onClick(label = Sight.LOOK) { vm.sightLook(); true }
                    onLongClick(label = listen) { vm.sightListen(); true }
                    customActions = listOf(
                        CustomAccessibilityAction(Sight.LOOK) { vm.sightLook(); true },
                        CustomAccessibilityAction(listen) { vm.sightListen(); true },
                        CustomAccessibilityAction(narration) { vm.sightNarration(); true },
                        CustomAccessibilityAction(quiet) { if (view.quiet) vm.sightTalkAgain() else vm.sightQuiet(); true },
                        CustomAccessibilityAction(Sight.REPEAT) { vm.sightRepeat(); true },
                        CustomAccessibilityAction(Sight.EXIT) { vm.closeSight(); true },
                    )
                }
                .sightGestures(onTap = vm::sightLook, onLong = vm::sightListen, onTwo = vm::sightNarration)
                .padding(horizontal = 24.dp),
        ) {
            Spacer(Modifier.height((if (hub.status.guest) 92.dp else 64.dp) + (if (talk.error != null) 36.dp else 0.dp)))
            Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) {
                Text(
                    shown, color = if (view.line.isBlank() && view.text.isBlank()) SightInk.copy(alpha = 0.75f) else SightInk,
                    style = Type.body.copy(fontSize = size, lineHeight = size * 1.25f, fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).testTag("sight-text"),
                )
            }
            Spacer(Modifier.height(96.dp))
        }
        // The state, read out politely when it changes; the guest line under it.
        Column(Modifier.align(Alignment.TopStart).statusBarsPadding().padding(horizontal = 24.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Dot(SightState, 12.dp)
                Spacer(Modifier.width(10.dp))
                Text(
                    Sight.stateLine(view, talk.phase), color = SightState, style = Type.title.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("sight-state"),
                )
            }
            talk.error?.let { Text(it, color = SightInk, style = Type.headline, modifier = Modifier.padding(top = 6.dp).testTag("sight-error")) }
            if (hub.status.guest) Text(Sight.GUEST, color = SightInk, style = Type.headline, modifier = Modifier.padding(top = 6.dp).testTag("sight-guest"))
        }
        Box(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = 24.dp, vertical = 16.dp).fillMaxWidth().height(64.dp)
                .clip(RoundedCornerShape(16.dp)).border(2.dp, SightInk, RoundedCornerShape(16.dp))
                .testTag("sight-exit").clickable(role = Role.Button, onClick = vm::closeSight)
                .clearAndSetSemantics { contentDescription = "Salir de Ver"; role = Role.Button; onClick(label = Sight.EXIT) { vm.closeSight(); true } },
            contentAlignment = Alignment.Center,
        ) { Text(Sight.EXIT, color = SightInk, style = Type.title) }
    }
}

/**
 * One tap, a long press and a two-finger tap on the same surface: the gesture is decided when every
 * finger lifts (or the long press fires), and movement past the touch slop is a scroll, not a tap.
 */
private fun Modifier.sightGestures(onTap: () -> Unit, onLong: () -> Unit, onTwo: () -> Unit) = pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val longAfter = viewConfiguration.longPressTimeoutMillis
        var fingers = 1
        var moved = false
        var long = false
        var now = down.uptimeMillis
        while (true) {
            val waitLong = !long && !moved && fingers == 1
            val event = if (waitLong) withTimeoutOrNull((longAfter - (now - down.uptimeMillis)).coerceAtLeast(1)) { awaitPointerEvent() } else awaitPointerEvent()
            if (event == null) { long = true; onLong(); continue }
            now = event.changes.maxOf { it.uptimeMillis }
            fingers = maxOf(fingers, event.changes.count { it.pressed })
            if (event.changes.any { it.id == down.id && (it.position - down.position).getDistance() > viewConfiguration.touchSlop }) moved = true
            if (event.changes.none { it.pressed }) break
        }
        if (!long && !moved) if (fingers >= 2) onTwo() else onTap()
    }
}
