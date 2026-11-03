package app.lente.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.zIndex
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.lente.core.Memories
import app.lente.core.Memory
import kotlin.math.atan2
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Recuerdos takes the app's own tokens (light and dark), with the rings in ink like a drawn dial; only the moments keep their colours. */
private val Mono = FontFamily.Monospace
/** The wheel's outer radius: fixed, whatever room the visor has. */
private val WHEEL = 96.dp
/** The wheel's centre across the visor: right of the middle, so the cards fan out to its left. */
private const val WHEEL_X = 0.71f
/** The eye's disc and its pupil, as shares of the outer ring's radius. */
private const val DISC_K = 0.53f
private const val PUPIL_K = 0.12f
/** Degrees between two cards on the carousel's arc, and the card's size. */
private const val ARC_STEP = 17f
private val CARD_W = 104.dp
private val CARD_H = 66.dp
/** Degrees of finger turn around the rings that move one moment. */
private const val STEP_DEG = 18f
/** How the wheel settles on a moment when the finger lets go or a card is tapped: a soft, slightly springy stop. */
private val SETTLE = spring<Float>(dampingRatio = 0.72f, stiffness = 170f)
/** Revivir fetches this many photos ahead of the clock (and again each time it passes that many). */
private const val PREFETCH_FRAMES = 6

/**
 * Recuerdos (add-home-dock, the phone side of add-memory-timeline): the wearer's own moments from the hub,
 * a visor with the time rings that turn with the finger, the chosen moment with its photo, and the moments
 * by day. Tapping the visor or a moment relives it: its photos in turn, its speech and its lines.
 */
@Composable
fun Recuerdos(vm: app.lente.LenteViewModel) {
    val c = Lente.c
    val loaded by vm.memories.collectAsState()
    LaunchedEffect(Unit) { vm.loadMemories() }
    val moments = loaded
    if (moments.isNullOrEmpty()) {
        Column(Modifier.fillMaxSize().padding(horizontal = Lente.gutter, vertical = 32.dp).testTag("recuerdos"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (moments == null) "Cargando tus recuerdos…" else "Aún no hay recuerdos", style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink)
            if (moments != null) Text("Graba con las gafas en Solo grabar: cada conversación aparece aquí con sus fotos y su audio, para revivirla.", style = Type.callout, color = c.muted)
        }
        return
    }
    androidx.compose.runtime.key(moments.size, moments.last().id) { Wheel(vm, moments) }
}

@Composable
private fun Wheel(vm: app.lente.LenteViewModel, moments: List<Memory>) {
    var sel by rememberSaveable { mutableStateOf(moments.lastIndex) }
    val relived = remember { mutableStateListOf(*Array(moments.size) { 0 }) }
    var reliving by remember { mutableStateOf<Int?>(null) }
    // Where the wheel is, in moments: it follows the finger continuously and settles on the nearest one.
    val pos = remember { androidx.compose.animation.core.Animatable(sel.toFloat()) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    val last = moments.lastIndex.toFloat()
    val choose = { i: Int -> if (i != sel) { sel = i; haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove) } }
    val drag = { steps: Float -> scope.launch { pos.snapTo((pos.value + steps).coerceIn(0f, last)); choose(kotlin.math.round(pos.value).toInt()) } }
    val settle = { scope.launch { pos.animateTo(kotlin.math.round(pos.value), SETTLE) } }
    val pick = { i: Int -> choose(i); scope.launch { pos.animateTo(i.toFloat(), SETTLE) } }
    val open = { i: Int -> pick(i); relived[i] = relived[i] + 1; reliving = i }
    // The chosen moment on top (a preview and its details), the rings below to move through time.
    Column(Modifier.fillMaxSize().navigationBarsPadding().padding(start = Lente.gutter, end = Lente.gutter, top = 4.dp, bottom = 12.dp).testTag("recuerdos"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // The details change with a short fade and lift, in the direction the wheel moved.
        androidx.compose.animation.AnimatedContent(
            targetState = sel,
            transitionSpec = {
                val dir = if (targetState > initialState) 1 else -1
                (androidx.compose.animation.fadeIn(tween(220, delayMillis = 60)) + androidx.compose.animation.slideInVertically(tween(260)) { it / 10 * dir })
                    .togetherWith(androidx.compose.animation.fadeOut(tween(140)) + androidx.compose.animation.slideOutVertically(tween(200)) { -it / 14 * dir })
                    .using(androidx.compose.animation.SizeTransform(clip = false))
            },
            label = "preview",
        ) { i -> Preview(vm, moments[i], relived[i]) { open(i) } }
        Visor(vm, moments, sel, pos.value, relived[sel], Modifier.weight(1f), onDrag = { drag(it) }, onRelease = { settle() }, onPick = { pick(it) }, onOpen = { open(sel) })
    }
    reliving?.let { i -> Revivir(vm, moments[i], relived[i], onAgain = { relived[i] = relived[i] + 1 }, onClose = { reliving = null }) }
}

/**
 * The chosen moment: a preview of its colours with the day and the time and a button to relive it, then
 * its title, where and how long, the lines said, its summary and how often it was relived.
 */
@Composable
private fun Preview(vm: app.lente.LenteViewModel, m: Memory, count: Int, onOpen: () -> Unit) {
    val c = Lente.c
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).testTag("recuerdo-preview")) {
        Box(Modifier.fillMaxWidth().height(96.dp).clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)).clickable(onClick = onOpen)) {
            MomentPicture(vm, m, 0f, Modifier.fillMaxSize())
            Text(m.rel, style = Type.caption.copy(letterSpacing = 2.sp), color = Color.White, modifier = Modifier.align(Alignment.TopStart).padding(12.dp))
            Text(m.time, style = Type.callout.copy(fontFamily = Mono, fontSize = 14.sp), color = Color.White, modifier = Modifier.align(Alignment.BottomStart).padding(12.dp))
            Row(
                Modifier.align(Alignment.BottomEnd).padding(10.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(start = 10.dp, end = 14.dp, top = 7.dp, bottom = 7.dp).testTag("recuerdo-revivir"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Glyph.Play, Color(0xFF0A0B0E), size = 16.dp)
                Spacer(Modifier.width(6.dp))
                Text("Revivir", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = Color(0xFF0A0B0E))
            }
        }
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(m.day.uppercase(), style = Type.caption.copy(letterSpacing = 1.4.sp), color = c.muted)
            Text(m.title, style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink, modifier = Modifier.testTag("recuerdo-title"))
            Text(Memories.meta(m) + if (count > 0) " · revivido $count×" else "", style = Type.callout, color = c.muted)
            Text(m.summary, style = Type.callout, color = c.ink, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        }
    }
}

/**
 * The visor, a card like the rest of the app: a wheel of fixed size, its rings turning with `pos` and its eye showing the day, the
 * time and the relive count, and the moments as a carousel of cards fanned along an arc to its left,
 * the chosen one at nine o'clock, larger, lifted and outlined. Turning the finger around the wheel moves through
 * time; tapping a card chooses it, tapping the chosen one (or the wheel) relives it.
 */
@Composable
private fun Visor(vm: app.lente.LenteViewModel, moments: List<Memory>, sel: Int, pos: Float, count: Int, modifier: Modifier, onDrag: (Float) -> Unit, onRelease: () -> Unit, onPick: (Int) -> Unit, onOpen: () -> Unit) {
    val c = Lente.c
    val m = moments[sel]
    androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).testTag("recuerdos-visor")) {
        val cx = maxWidth * WHEEL_X
        val cy = maxHeight * 0.46f
        val density = androidx.compose.ui.platform.LocalDensity.current
        val cxPx = with(density) { cx.toPx() }
        val cyPx = with(density) { cy.toPx() }
        Box(
            Modifier.fillMaxSize()
                .pointerInput(Unit) {
                    // Turning around the wheel's centre: the wheel follows the angle the finger sweeps, one moment per
                    // STEP_DEG, and settles on the nearest moment when the finger lets go.
                    var last = 0f
                    detectDragGestures(onDragStart = { o -> last = angle(o, cxPx, cyPx) }, onDragEnd = onRelease, onDragCancel = onRelease) { change, _ ->
                        val a = angle(change.position, cxPx, cyPx)
                        var d = a - last
                        if (d > 180f) d -= 360f
                        if (d < -180f) d += 360f
                        last = a
                        // On the wheel's left side a clockwise turn moves the finger up, bringing later moments up.
                        onDrag(d / STEP_DEG)
                    }
                }
                .pointerInput(Unit) { detectTapGestures { onOpen() } }
                .semantics { contentDescription = "Anillos del tiempo: gíralos para recorrer tus recuerdos; toca para revivir ${m.title}" },
        ) {
            Canvas(Modifier.fillMaxSize()) {
                // A faint wash of the chosen moment's colour behind the cards.
                drawRect(Brush.radialGradient(listOf(Color(m.tint).copy(alpha = 0.14f), Color.Transparent), center = Offset(cxPx - WHEEL.toPx() * 1.6f, cyPx), radius = size.maxDimension * 0.7f))
                rings(pos, Offset(cxPx, cyPx), WHEEL.toPx(), ink = c.ink, line = c.line, disc = c.bg)
            }
        }
        // The eye: the day above the pupil, the time and the count below it.
        val pupil = WHEEL * PUPIL_K
        Box(Modifier.offset(x = cx - WHEEL, y = cy - WHEEL).size(WHEEL * 2)) {
            androidx.compose.animation.Crossfade(m.rel, Modifier.align(Alignment.Center).offset(y = -(pupil + 14.dp)), animationSpec = tween(220), label = "eye-day") { rel ->
                Text(rel, style = Type.caption.copy(letterSpacing = 2.4.sp, fontWeight = FontWeight.SemiBold), color = c.ink)
            }
            androidx.compose.animation.Crossfade(m.time to count, Modifier.align(Alignment.Center).offset(y = pupil + 14.dp), animationSpec = tween(220), label = "eye-time") { (time, n) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(time, style = Type.callout.copy(fontFamily = Mono, fontSize = 13.sp), color = c.ink)
                    Text("$n× REVIVIR", style = Type.caption.copy(fontFamily = Mono, fontSize = 9.sp, letterSpacing = 0.6.sp, fontWeight = if (n > 0) FontWeight.Bold else FontWeight.Normal), color = if (n > 0) c.ink else c.muted)
                }
            }
        }
        // The carousel: each card on an arc just outside the wheel's left side, at nine o'clock for the chosen one,
        // later moments below. Scale, fade and lift follow the wheel's position continuously, so it glides.
        val arc = WHEEL * 1.06f
        moments.forEachIndexed { i, mem ->
            val d = i - pos
            val far = kotlin.math.abs(d)
            if (far > 4.2f) return@forEachIndexed
            val a = Math.toRadians((d * ARC_STEP).toDouble())
            val x = cx - arc * cos(a).toFloat() - CARD_W
            val y = cy + arc * sin(a).toFloat() - CARD_H / 2
            val on = i == sel
            val focus = 1f - minOf(far, 1f)
            Box(
                Modifier.offset(x = x, y = y)
                    .zIndex(100f - far * 10f)
                    .graphicsLayer {
                        rotationZ = -d * ARC_STEP
                        transformOrigin = TransformOrigin(1f, 0.5f)
                        val k = 1f + 0.12f * focus - 0.05f * minOf(far, 4f)
                        scaleX = k; scaleY = k
                        alpha = 1f - minOf(far, 4f) * 0.21f
                        shadowElevation = 14.dp.toPx() * focus
                        shape = RoundedCornerShape(6.dp)
                        clip = true
                    }
                    .size(CARD_W, CARD_H)
                    .border(if (on) 2.dp else 0.5.dp, if (on) c.ink else c.line, RoundedCornerShape(6.dp))
                    .clickable { if (on) onOpen() else onPick(i) }
                    .testTag("recuerdo-card-${mem.id}"),
            ) {
                MomentPicture(vm, mem, 0f, Modifier.fillMaxSize())
                Text(mem.time.take(5), style = Type.caption.copy(fontFamily = Mono, fontSize = 10.sp), color = Color.White.copy(alpha = 0.85f), modifier = Modifier.align(Alignment.BottomStart).padding(6.dp))
            }
        }
        Text("Gira la rueda · toca para revivir", style = Type.caption, color = c.muted, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp))
    }
}

private fun angle(p: Offset, cx: Float, cy: Float): Float = Math.toDegrees(atan2((p.y - cy).toDouble(), (p.x - cx).toDouble())).toFloat()

/** Concentric rings around `centre` with outer radius `r`, each turning at its own speed as `pos` moves, around a dark disc and a pupil. */
private fun DrawScope.rings(pos: Float, centre: Offset, r: Float, ink: Color, line: Color, disc: Color) {
    val hair = Stroke(1.dp.toPx())
    fun circle(k: Float, color: Color = line, stroke: Stroke = hair) = drawCircle(color, r * k, centre, style = stroke)
    fun segments(k: Float, n: Int, gapDeg: Float, width: Float, color: Color, turn: Float) = rotate(turn, centre) {
        val radius = r * k
        val sweep = 360f / n - gapDeg
        for (i in 0 until n) drawArc(color, i * 360f / n, sweep, false, Offset(centre.x - radius, centre.y - radius), Size(radius * 2, radius * 2), style = Stroke(width))
    }
    circle(0.98f)
    segments(0.84f, 12, 4f, 2.2.dp.toPx(), ink.copy(alpha = 0.55f), -pos * 9f)
    segments(0.73f, 31, 3.2f, 5.dp.toPx(), ink.copy(alpha = 0.22f), -pos * 21f)
    circle(0.65f)
    segments(0.59f, 24, 5f, 2.dp.toPx(), ink.copy(alpha = 0.5f), pos * 34f)
    // The mark at twelve o'clock that the moments pass under.
    drawArc(ink, -90f, 15f, false, Offset(centre.x - r * 0.84f, centre.y - r * 0.84f), Size(r * 1.68f, r * 1.68f), style = Stroke(3.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round))
    drawCircle(disc, r * DISC_K, centre)
    circle(DISC_K, ink.copy(alpha = 0.75f), Stroke(1.3.dp.toPx()))
    drawCircle(ink.copy(alpha = 0.85f), r * PUPIL_K, centre)
}

/**
 * Revivir: the moment played back as timed text, in the app's own light (or dark) look: the moment's
 * colours as a rounded picture, the clock running from when it happened, the line being said in a card,
 * scrub, pause and again; at the end, from the third time on, Lente offers its summary.
 * Never shared: there is no share action here.
 */
@Composable
private fun Revivir(vm: app.lente.LenteViewModel, m: Memory, count: Int, onAgain: () -> Unit, onClose: () -> Unit) {
    val c = Lente.c
    var t by remember(m.id) { mutableStateOf(0f) }
    var playing by remember(m.id) { mutableStateOf(true) }
    var summary by remember(m.id) { mutableStateOf(false) }
    /** Bumped by «again» and by scrubbing, so the sound starts over where the clock is. */
    var epoch by remember(m.id) { mutableStateOf(0) }
    val ended = t >= m.durationS
    LaunchedEffect(playing) {
        if (!playing) return@LaunchedEffect
        var last = withFrameNanos { it }
        while (playing && t < m.durationS) {
            val now = withFrameNanos { it }
            t = min(m.durationS, t + (now - last) / 1e9f)
            last = now
        }
        playing = false
    }
    // The sound follows the clock: each scene plays its kept speech from where the clock is in it.
    val scene = Memories.sceneAt(m, t)?.first
    LaunchedEffect(playing, scene, epoch) {
        val audio = scene?.audio
        if (!playing || audio == null) vm.stopScene() else vm.playScene(audio, ((t - scene.startS) * 1000).toInt())
    }
    androidx.compose.runtime.DisposableEffect(m.id) { onDispose { vm.stopScene() } }
    // A photo takes a few seconds to come from the hub: fetch the next ones ahead of the clock, in parallel.
    val shown = m.frames.indexOfLast { it.atS <= t }.coerceAtLeast(0)
    LaunchedEffect(m.id, shown / PREFETCH_FRAMES) {
        m.frames.drop(shown).take(PREFETCH_FRAMES * 2).forEach { f -> launch { vm.frame(f.path) } }
    }
    val again = { onAgain(); summary = false; t = 0f; epoch++; playing = true }
    val blink by rememberInfiniteTransition(label = "rec").animateFloat(1f, 0.2f, infiniteRepeatable(tween(600), RepeatMode.Reverse), label = "rec-dot")
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(c.bg).testTag("revivir")) {
            Column(Modifier.fillMaxSize().padding(start = Lente.gutter, end = Lente.gutter, top = 44.dp, bottom = 60.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlainIcon(Glyph.Close, "Volver a Recuerdos", Modifier.testTag("revivir-close"), onClose)
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(7.dp).alpha(if (playing) blink else 1f).clip(CircleShape).background(c.live))
                            Spacer(Modifier.width(6.dp))
                            Text(if (playing) "Reviviendo" else "En pausa", style = Type.caption, color = c.muted)
                        }
                        Text(m.title, style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, maxLines = 1)
                    }
                    Spacer(Modifier.size(44.dp))
                }
                Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(12.dp))) {
                    MomentPicture(vm, m, t, Modifier.fillMaxSize())
                    Text(Memories.clockAt(m.time, t), style = Type.callout.copy(fontFamily = Mono, fontWeight = FontWeight.Medium), color = Color.White, modifier = Modifier.align(Alignment.BottomStart).padding(12.dp).testTag("revivir-clock"))
                    Text("$count× REVIVIR", style = Type.caption.copy(fontFamily = Mono, letterSpacing = 1.sp), color = Color.White.copy(alpha = 0.85f), modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp))
                }
                Text(m.day + " · " + m.place, style = Type.caption, color = c.muted, modifier = Modifier.padding(start = 4.dp))
                Spacer(Modifier.weight(1f))
                val line = Memories.lineAt(m, t)
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp).alpha(if (line == null) 0f else 1f).testTag("revivir-line")) {
                    Text(if (line?.camera == true) "Lo que la cámara describió" else line?.who ?: "", style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = c.muted)
                    Spacer(Modifier.height(4.dp))
                    Text(line?.text ?: "", style = Type.body.copy(fontSize = 19.sp, lineHeight = 26.sp), color = c.ink)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Slider(
                        value = t / m.durationS, onValueChange = { t = it * m.durationS; epoch++ }, modifier = Modifier.weight(1f).testTag("revivir-scrub"),
                        colors = SliderDefaults.colors(thumbColor = c.ink, activeTrackColor = c.ink, inactiveTrackColor = c.raised),
                    )
                    Box(
                        Modifier.size(48.dp).clip(CircleShape).background(c.ink).clickable { if (ended) again() else playing = !playing }.semantics { contentDescription = if (playing) "Pausar" else "Reanudar" },
                        contentAlignment = Alignment.Center,
                    ) { Icon(if (playing) Glyph.Pause else Glyph.Play, c.bg, size = 20.dp) }
                    PlainIcon(Glyph.Retry, "Revivir desde el principio", onClick = again)
                }
            }
            if (ended) EndCard(m, count, summary, onSummary = { summary = true }, onAgain = again, onBack = onClose)
        }
    }
}

/**
 * The moment's picture at `t`: the photo taken then (the last one shown stays until the next arrives, so
 * the photos play as a video), over the moment's colours while it loads or when none was kept.
 */
@Composable
private fun MomentPicture(vm: app.lente.LenteViewModel, m: Memory, t: Float, modifier: Modifier) {
    val path = Memories.frameAt(m, t)?.path
    var img by remember(m.id) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(path) { if (path != null) vm.frame(path)?.let { img = it } }
    Box(modifier) {
        Canvas(Modifier.fillMaxSize()) { scene(m, t) }
        img?.let { androidx.compose.foundation.Image(it, null, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop) }
    }
}

/** The moment's colours as a slow point of view: two soft lights drifting and a vignette, no picture. */
private fun DrawScope.scene(m: Memory, t: Float) {
    val p = t / m.durationS
    drawRect(Brush.verticalGradient(listOf(Color(m.tint), Color(m.tint2))))
    val sway = sin(t * 0.9f) * 0.03f
    drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.22f), Color.Transparent), center = Offset(size.width * (0.3f + p * 0.1f + sway), size.height * 0.32f), radius = size.width * 0.7f), size.width * 0.7f, Offset(size.width * (0.3f + p * 0.1f + sway), size.height * 0.32f))
    drawCircle(Brush.radialGradient(listOf(Color(m.tint).copy(alpha = 0.6f), Color.Transparent), center = Offset(size.width * (0.75f - p * 0.08f), size.height * (0.62f + cos(t * 1.7f) * 0.01f)), radius = size.width * 0.6f), size.width * 0.6f, Offset(size.width * (0.75f - p * 0.08f), size.height * 0.62f))
    drawRect(Brush.radialGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.45f)), center = Offset(size.width * 0.5f, size.height * 0.45f), radius = size.maxDimension * 0.75f))
    // Scan lines, very faint.
    val step = 3.dp.toPx()
    var y = 0f
    while (y < size.height) { drawLine(Color.White.copy(alpha = 0.025f), Offset(0f, y), Offset(size.width, y)); y += step }
}

/** The end of a moment, as a card like the app's sheets: again or back; from the third relive, a kind word and the summary to move on. */
@Composable
private fun EndCard(m: Memory, count: Int, showSummary: Boolean, onSummary: () -> Unit, onAgain: () -> Unit, onBack: () -> Unit) {
    val c = Lente.c
    Box(Modifier.fillMaxSize().background(c.scrim).padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 360.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface).padding(20.dp).testTag("revivir-end"),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(m.title, style = Type.title.copy(fontWeight = FontWeight.Medium), color = c.ink)
            if (Memories.nudge(count)) Text(
                "Has revivido este momento $count veces hoy. ¿Te dejo el resumen y sigues con tu día?",
                style = Type.callout, color = c.ink,
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(c.raised).padding(horizontal = 14.dp, vertical = 12.dp).testTag("revivir-nudge"),
            )
            if (showSummary) Row {
                Box(Modifier.width(2.dp).height(44.dp).background(c.ink))
                Spacer(Modifier.width(12.dp))
                Text(m.summary, style = Type.callout, color = c.ink, modifier = Modifier.testTag("revivir-summary"))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pill("Revivir de nuevo", c.ink, c.bg, Modifier.weight(1f), onAgain)
                Pill("Volver", c.surface, c.ink, Modifier.weight(1f), onBack, border = c.line)
            }
            if (Memories.nudge(count) && !showSummary) Pill("Ver resumen", c.surface, c.ink, Modifier.fillMaxWidth(), onSummary, border = c.ink)
        }
    }
}

@Composable
private fun Pill(label: String, fill: Color, ink: Color, modifier: Modifier, onClick: () -> Unit, border: Color = fill) {
    Box(
        modifier.height(46.dp).clip(RoundedCornerShape(12.dp)).background(fill).border(1.dp, border, RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, style = Type.callout.copy(fontWeight = FontWeight.Medium), color = ink) }
}
