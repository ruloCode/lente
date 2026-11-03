package app.lente.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lente.LenteViewModel
import app.lente.core.Format
import app.lente.core.HubState
import app.lente.core.View
import kotlinx.coroutines.launch

/** A `data:image/jpeg;base64,…` photo as a bitmap; `sample` 4 decodes a quarter-size thumbnail. */
@Composable
fun rememberPhoto(photo: String?, sample: Int = 1): ImageBitmap? = remember(photo, sample) {
    val bytes = photo?.substringAfter("base64,", "")?.takeIf { it.isNotEmpty() }?.let { runCatching { Base64.decode(it, Base64.DEFAULT) }.getOrNull() }
    bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size, BitmapFactory.Options().apply { inSampleSize = sample }) }?.asImageBitmap()
}

/**
 * The camera's live view over everything: the latest frame large, what Lente says about it, and the
 * session's earlier reads with their time since live view started. Back keeps live reads running;
 * Detener turns them off.
 */
@Composable
fun Camera(vm: LenteViewModel, hub: HubState) {
    val c = Lente.c
    val s = hub.status
    val narrate by vm.narrateLive.collectAsState()
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // A read the wearer picked from the list; null follows the newest frame.
    var pinned by remember { mutableStateOf<View?>(null) }
    var fit by remember { mutableStateOf(false) }
    val shown = pinned ?: hub.view

    Box(Modifier.fillMaxSize().background(c.bg).testTag("camera")) {
        LazyColumn(state = list, contentPadding = PaddingValues(bottom = 150.dp), modifier = Modifier.fillMaxSize()) {
            item("hero") {
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val hero = maxWidth
                    val photo = rememberPhoto(shown?.photo)
                    Box(Modifier.fillMaxWidth().height(hero).background(Color.Black).clickable { fit = !fit }.semantics { contentDescription = if (fit) "Recortar la imagen" else "Ver la imagen completa" }) {
                        if (photo != null) Image(photo, contentDescription = shown?.text?.ifBlank { null } ?: "Lo que ve el clip", contentScale = if (fit) ContentScale.Fit else ContentScale.Crop, modifier = Modifier.fillMaxSize().testTag("camera-photo"))
                        else Text(if (s.live) "Esperando la primera imagen del clip…" else "En vivo está detenido.", style = Type.callout, color = Color.White.copy(alpha = 0.8f), modifier = Modifier.align(Alignment.Center).padding(24.dp))
                        Box(Modifier.fillMaxWidth().height(140.dp).align(Alignment.BottomCenter).background(Brush.verticalGradient(listOf(Color.Transparent, c.bg))))
                    }
                    TopCapsule(s.live, onBack = vm::closeCamera)
                    SaysCard(shown, pinned != null, s.live, Modifier.padding(top = hero - 64.dp, start = Lente.gutter, end = Lente.gutter)) { pinned = null }
                }
            }
            item("reads-title") { SectionTitle("Descripciones", Modifier.padding(horizontal = Lente.gutter), trailing = hub.liveReads.size.takeIf { it > 0 }?.toString()) }
            if (hub.liveReads.isEmpty()) item("reads-empty") {
                Text("Cada vez que cambie lo que ve el clip, aparece aquí.", style = Type.callout, color = c.muted, modifier = Modifier.padding(horizontal = Lente.gutter + 4.dp))
            }
            itemsIndexed(hub.liveReads, key = { _, r -> "${r.at}|${r.text}" }) { i, read ->
                val first = i == 0
                val last = i == hub.liveReads.lastIndex
                val shape = RoundedCornerShape(topStart = if (first) Lente.card else 0.dp, topEnd = if (first) Lente.card else 0.dp, bottomStart = if (last) Lente.card else 0.dp, bottomEnd = if (last) Lente.card else 0.dp)
                Column(Modifier.padding(horizontal = Lente.gutter).clip(shape).background(c.surface)) {
                    ReadRow(read, Format.clock(read.at - hub.liveSince), selected = pinned == read) {
                        pinned = read
                        scope.launch { list.animateScrollToItem(0) }
                    }
                    if (!last) Hairline()
                }
            }
        }
        Controls(vm, hub, narrate, Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun TopCapsule(live: Boolean, onBack: () -> Unit) {
    val c = Lente.c
    // A flat header card over the photo: back on the left, the small centred title, the camera's state on the right.
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp).height(52.dp)
            .clip(RoundedCornerShape(12.dp)).background(c.surface).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlainIcon(Glyph.Back, "Volver a Ahora", Modifier.testTag("camera-back"), onBack)
        Text("En vivo", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        Row(
            Modifier.padding(end = 6.dp).clip(RoundedCornerShape(8.dp)).background(c.raised).padding(horizontal = 10.dp, vertical = 5.dp).testTag("camera-state"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Dot(if (live) c.live else c.muted, 7.dp)
            Spacer(Modifier.width(6.dp))
            Text(if (live) "Cámara" else "Detenida", style = Type.caption, color = c.ink)
        }
    }
}

/** "Lente dice:" with the read on screen and how long the model took. */
@Composable
private fun SaysCard(read: View?, pinned: Boolean, live: Boolean, modifier: Modifier, onFollow: () -> Unit) {
    val c = Lente.c
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(16.dp).testTag("camera-says"),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) { Icon(Glyph.Speaker, c.bg, size = 20.dp) }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(if (pinned) "Lente dijo" else "Lente dice", style = Type.caption, color = c.muted)
            val text = read?.text?.ifBlank { null }
            Text(
                text ?: if (live) "Mirando… la primera descripción llega en uno o dos segundos." else "Toca Mirar para una foto, o Reanudar.",
                style = Type.body, color = if (text != null) c.ink else c.muted, modifier = Modifier.padding(top = 2.dp).testTag("camera-text"),
            )
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (pinned) Text("Volver a lo último", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.ink, modifier = Modifier.clickable(onClick = onFollow).padding(vertical = 4.dp).testTag("camera-follow"))
                Spacer(Modifier.weight(1f))
                read?.ms?.let { Text("%.1f s".format(it / 1000.0), style = Type.measured, color = c.muted) }
            }
        }
    }
}

@Composable
private fun ReadRow(read: View, elapsed: String, selected: Boolean, onClick: () -> Unit) {
    val c = Lente.c
    Row(
        Modifier.fillMaxWidth().background(if (selected) c.raised else Color.Transparent).clickable(onClick = onClick).padding(horizontal = Lente.gutter, vertical = 10.dp).testTag("camera-read"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(elapsed, style = Type.measured.copy(fontSize = Type.callout.fontSize), color = c.muted, modifier = Modifier.width(48.dp))
        val thumb = rememberPhoto(read.photo, sample = 4)
        Box(Modifier.size(width = 84.dp, height = 60.dp).clip(RoundedCornerShape(6.dp)).background(c.raised)) {
            if (thumb != null) Image(thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        Spacer(Modifier.width(12.dp))
        Text(read.text, style = Type.callout, color = c.ink, maxLines = 3, modifier = Modifier.weight(1f))
        Icon(Glyph.ChevronRight, c.muted, Modifier.padding(start = 6.dp), size = 18.dp)
    }
}

/** Narrar en voz alta, Mirar otra vez, Detener (or Reanudar). */
@Composable
private fun Controls(vm: LenteViewModel, hub: HubState, narrate: Boolean, modifier: Modifier) {
    val c = Lente.c
    val s = hub.status
    val shape = RoundedCornerShape(12.dp)
    Box(modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, c.bg, c.bg)))) {
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = Lente.gutter, end = Lente.gutter, top = 28.dp, bottom = 8.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                Modifier.weight(1f).padding(top = 8.dp).height(56.dp).clip(shape).background(c.surface)
                    .clickable(role = Role.Switch) { vm.setNarrateLive(!narrate) }.padding(start = 16.dp, end = 8.dp)
                    .semantics { contentDescription = "Narrar en voz alta" }.testTag("camera-narrate"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // One line at any font size: the word shrinks before it wraps («Narr / ar» at large system text).
                androidx.compose.foundation.text.BasicText(
                    "Narrar", Modifier.weight(1f), style = Type.callout.copy(fontWeight = FontWeight.SemiBold, color = c.ink), maxLines = 1,
                    autoSize = androidx.compose.foundation.text.TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = Type.callout.fontSize),
                )
                Switch(
                    checked = narrate, onCheckedChange = vm::setNarrateLive,
                    colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.bg, checkedBorderColor = c.ink, uncheckedTrackColor = c.track, uncheckedThumbColor = c.thumb, uncheckedBorderColor = c.line),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.size(72.dp).clip(CircleShape).background(if (s.clip) c.ink else c.raised)
                        .clickable(enabled = s.clip) { vm.look() }.semantics { contentDescription = "Mirar otra vez" }.testTag("camera-look"),
                    contentAlignment = Alignment.Center,
                ) { Icon(Glyph.Camera, if (s.clip) c.bg else c.muted, size = 30.dp) }
                Text("Mirar otra vez", style = Type.caption, color = c.ink, modifier = Modifier.padding(top = 4.dp))
            }
            Box(
                // The final action in ink; Reanudar in white.
                Modifier.weight(1f).padding(top = 8.dp).height(56.dp).clip(shape).background(if (s.live) c.ink else c.surface)
                    .clickable(enabled = s.clip) { if (s.live) vm.stopCamera() else vm.setLive(true) }.testTag("camera-stop"),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (s.live) "Detener" else "Reanudar", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = if (s.live) c.bg else c.ink)
            }
        }
    }
}
