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
    val shape = RoundedCornerShape(50)
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp).height(52.dp)
            .shadow(if (c.dark) 0.dp else 8.dp, shape).clip(shape).background(c.glass).border(0.5.dp, c.line, shape).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.clip(shape).clickable(onClick = onBack).padding(horizontal = 8.dp, vertical = 8.dp).semantics { contentDescription = "Volver a Ahora" }.testTag("camera-back"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Glyph.Back, c.accent, size = 22.dp)
            Text("Ahora", style = Type.body, color = c.accent)
        }
        Text("En vivo", style = Type.headline, color = c.ink, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        Row(
            Modifier.clip(shape).background(if (live) c.liveFill else c.raised).padding(horizontal = 12.dp, vertical = 6.dp).testTag("camera-state"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Dot(if (live) c.onLive else c.muted)
            Spacer(Modifier.width(6.dp))
            Text(if (live) "CÁMARA" else "DETENIDA", style = Type.label, color = if (live) c.onLive else c.ink)
        }
    }
}

/** "Lente dice:" with the read on screen and how long the model took. */
@Composable
private fun SaysCard(read: View?, pinned: Boolean, live: Boolean, modifier: Modifier, onFollow: () -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(24.dp)
    Row(
        modifier.fillMaxWidth().shadow(if (c.dark) 0.dp else 12.dp, shape).clip(shape).background(c.surface).border(0.5.dp, c.line, shape).padding(16.dp).testTag("camera-says"),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(c.accentFill), contentAlignment = Alignment.Center) { Icon(Glyph.Speaker, c.onAccent) }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(if (pinned) "Lente dijo:" else "Lente dice:", style = Type.headline, color = c.ink)
            val text = read?.text?.ifBlank { null }
            Text(
                text ?: if (live) "Mirando… la primera descripción llega en uno o dos segundos." else "Toca Mirar para una foto, o Reanudar.",
                style = Type.body, color = if (text != null) c.ink else c.muted, modifier = Modifier.padding(top = 2.dp).testTag("camera-text"),
            )
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (pinned) Text("Volver a lo último", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.accent, modifier = Modifier.clickable(onClick = onFollow).padding(vertical = 4.dp).testTag("camera-follow"))
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
        Modifier.fillMaxWidth().background(if (selected) c.tag else Color.Transparent).clickable(onClick = onClick).padding(horizontal = Lente.gutter, vertical = 10.dp).testTag("camera-read"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(elapsed, style = Type.measured.copy(fontSize = Type.callout.fontSize), color = c.muted, modifier = Modifier.width(48.dp))
        val thumb = rememberPhoto(read.photo, sample = 4)
        Box(Modifier.size(width = 84.dp, height = 60.dp).clip(RoundedCornerShape(10.dp)).background(c.raised)) {
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
    val shape = RoundedCornerShape(50)
    Box(modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, c.bg, c.bg)))) {
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = Lente.gutter, end = Lente.gutter, top = 28.dp, bottom = 8.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                Modifier.weight(1f).padding(top = 8.dp).height(56.dp).clip(shape).background(c.surface).border(0.5.dp, c.line, shape)
                    .clickable(role = Role.Switch) { vm.setNarrateLive(!narrate) }.padding(start = 16.dp, end = 8.dp)
                    .semantics { contentDescription = "Narrar en voz alta" }.testTag("camera-narrate"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Narrar", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = c.ink, modifier = Modifier.weight(1f))
                Switch(
                    checked = narrate, onCheckedChange = vm::setNarrateLive,
                    colors = SwitchDefaults.colors(checkedTrackColor = c.accentFill, checkedThumbColor = c.onAccent, uncheckedTrackColor = c.track, uncheckedThumbColor = c.thumb, uncheckedBorderColor = c.line),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.size(72.dp).shadow(if (c.dark) 0.dp else 10.dp, CircleShape).clip(CircleShape).background(if (s.clip) c.accentFill else c.raised)
                        .clickable(enabled = s.clip) { vm.look() }.semantics { contentDescription = "Mirar otra vez" }.testTag("camera-look"),
                    contentAlignment = Alignment.Center,
                ) { Icon(Glyph.Camera, if (s.clip) c.onAccent else c.muted, size = 30.dp) }
                Text("Mirar otra vez", style = Type.caption, color = c.ink, modifier = Modifier.padding(top = 4.dp))
            }
            Box(
                Modifier.weight(1f).padding(top = 8.dp).height(56.dp).clip(shape).background(c.surface).border(0.5.dp, c.line, shape)
                    .clickable(enabled = s.clip) { if (s.live) vm.stopCamera() else vm.setLive(true) }.testTag("camera-stop"),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (s.live) "Detener" else "Reanudar", style = Type.callout.copy(fontWeight = FontWeight.SemiBold), color = if (s.live) c.live else c.accent)
            }
        }
    }
}
