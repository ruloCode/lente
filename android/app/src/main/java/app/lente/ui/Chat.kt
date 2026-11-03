package app.lente.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Screen
import app.lente.core.AskSource
import app.lente.core.ChatLine
import app.lente.core.ChatSheet

/** Questions the wearer can start from. */
private val SUGGESTIONS = listOf("Resumen de hoy", "¿Qué me falta por hacer?", "¿Qué vi hoy?", "¿Qué prometí esta semana?")

@Composable
fun Asked(line: ChatLine) {
    val c = Lente.c
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Text(line.text, style = Type.body, color = c.ink, modifier = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(12.dp)).background(c.surface).padding(horizontal = 14.dp, vertical = 10.dp).testTag("chat-asked"))
    }
}

/**
 * One of Lente's answers, full width with no avatar: the text, the sources it cites, and under it copy,
 * share, read aloud and, on the newest answer, ask again.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Answer(vm: LenteViewModel, line: ChatLine, onRetry: (() -> Unit)? = null) {
    val c = Lente.c
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth().testTag(if (line.pending) "chat-thinking" else "chat-answer")) {
        if (line.pending) Thinking()
        else {
            Text(line.text, style = Type.body, color = if (line.found) c.ink else c.muted, modifier = Modifier.testTag("chat-answer-text"))
            if (line.sources.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (s in line.sources) SourceChip(s) { s.meetingId?.let { vm.go(Screen.Reunion(it, s.turnId)) } }
                }
            }
            Row(Modifier.padding(top = 8.dp).offset(x = (-8).dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                SmallAction(Glyph.Copy, "Copiar") {
                    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Lente", line.text))
                    vm.say("Copiado.")
                }
                SmallAction(Glyph.Share, "Compartir") {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, ChatSheet.shared(line))
                    runCatching { context.startActivity(Intent.createChooser(send, null)) }
                }
                SmallAction(Glyph.Speaker, "Leer en voz alta") { vm.speak(line.text) }
                if (onRetry != null) SmallAction(Glyph.Retry, "Preguntar otra vez", onRetry)
            }
        }
    }
}

@Composable
private fun Thinking() {
    val c = Lente.c
    val t = rememberInfiniteTransition(label = "thinking")
    Row(Modifier.padding(vertical = 8.dp).semantics { contentDescription = "Lente está buscando en tu memoria" }, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        for (i in 0 until 3) {
            val a by t.animateFloat(0.25f, 1f, infiniteRepeatable(tween(520, delayMillis = i * 160), RepeatMode.Reverse), label = "dot$i")
            Box(Modifier.size(8.dp).alpha(a).clip(CircleShape).background(c.ink))
        }
        Spacer(Modifier.width(6.dp))
        Text("Buscando en lo que viste y escuchaste…", style = Type.callout, color = c.muted)
    }
}

@Composable
private fun SourceChip(s: AskSource, onClick: () -> Unit) {
    val c = Lente.c
    val glyph = when (s.kind) { "seen" -> Glyph.Camera; "heard" -> Glyph.Wave; "fact" -> Glyph.Brain; else -> Glyph.Doc }
    Row(
        Modifier.clip(RoundedCornerShape(8.dp)).background(c.raised).then(if (s.meetingId != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp, vertical = 7.dp).testTag("chat-source"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(glyph, c.ink, size = 16.dp)
        Spacer(Modifier.width(6.dp))
        Text(s.label, style = Type.caption, color = c.ink, maxLines = 1)
    }
}

@Composable
private fun SmallAction(glyph: Glyph, label: String, onClick: () -> Unit) {
    Box(Modifier.size(36.dp).clip(CircleShape).clickable(onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Icon(glyph, Lente.c.muted, size = 18.dp)
    }
}

@Composable
fun Suggestions(enabled: Boolean, pick: (String) -> Unit) {
    val c = Lente.c
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (q in SUGGESTIONS) {
            Row(
                Modifier.clip(RoundedCornerShape(18.dp)).background(c.surface).border(0.5.dp, c.line, RoundedCornerShape(18.dp))
                    .clickable(enabled = enabled) { pick(q) }.padding(horizontal = 14.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Glyph.Sparkle, c.ink, size = 16.dp)
                Spacer(Modifier.width(6.dp))
                Text(q, style = Type.callout, color = c.ink, maxLines = 1)
            }
        }
    }
}

/**
 * The chat's composer (add-home-dock): one card with the field on top and, under it, where Lente looks
 * (the whole memory or one project), dictation, and the round button, which talks to Lente while the
 * field is empty and sends once there is text (ChatSheet.button).
 */
@Composable
fun Composer(
    enabled: Boolean,
    placeholder: String,
    scope: String,
    scoped: Boolean,
    onScope: () -> Unit,
    talk: () -> Unit,
    modifier: Modifier = Modifier,
    send: (String) -> Unit,
) {
    val c = Lente.c
    var text by rememberSaveable { mutableStateOf("") }
    fun submit() { if (text.isNotBlank() && enabled) { send(text.trim()); text = "" } }
    // Dictation through the phone's own recognizer, in Spanish; the words land in the field to check before sending.
    val dictate = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { text = listOf(text, it).filter(String::isNotBlank).joinToString(" ") }
    }
    val sending = ChatSheet.button(text) == ChatSheet.Button.Send
    val shape = RoundedCornerShape(12.dp)
    Column(modifier.clip(shape).background(c.surface).padding(start = 8.dp, end = 8.dp, top = 14.dp, bottom = 8.dp)) {
        Box(Modifier.fillMaxWidth().heightIn(min = 30.dp).padding(horizontal = 10.dp), contentAlignment = Alignment.CenterStart) {
            if (text.isEmpty()) Text(placeholder, style = Type.body, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            BasicTextField(
                text, { text = it }, Modifier.fillMaxWidth().testTag("chat-input"),
                textStyle = Type.body.copy(color = c.ink), cursorBrush = SolidColor(c.ink), maxLines = 6,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { submit() }),
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clip(RoundedCornerShape(8.dp)).background(c.raised).clickable(onClick = onScope)
                    .padding(start = 12.dp, end = 8.dp, top = 9.dp, bottom = 9.dp).testTag("chat-scope"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(scope, style = Type.callout.copy(fontWeight = if (scoped) FontWeight.SemiBold else FontWeight.Normal), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp))
                Icon(Glyph.ChevronDown, c.muted, Modifier.padding(start = 2.dp), size = 16.dp)
            }
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.size(42.dp).clip(CircleShape).clickable {
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CO")
                        .putExtra(RecognizerIntent.EXTRA_PROMPT, "Pregúntale a Lente")
                    runCatching { dictate.launch(intent) }
                }.semantics { contentDescription = "Dictar" }.testTag("chat-mic"),
                contentAlignment = Alignment.Center,
            ) { Icon(Glyph.Mic, c.ink, size = 20.dp) }
            Spacer(Modifier.width(8.dp))
            val on = !sending || enabled
            Box(
                Modifier.size(42.dp).clip(CircleShape).background(if (on) c.ink else c.raised).clickable(enabled = on) { if (sending) submit() else talk() }
                    .semantics { contentDescription = if (sending) "Enviar" else "Hablar con Lente" }.testTag(if (sending) "chat-send" else "talk"),
                contentAlignment = Alignment.Center,
            ) { Icon(if (sending) Glyph.Up else Glyph.Wave, if (on) c.bg else c.muted, size = 20.dp) }
        }
    }
}

/**
 * A round button with one icon, as in the top corners. In light mode it casts a soft shadow, so its fill
 * is opaque: through the translucent glass the shadow's own shape showed as an off-centre octagon.
 */
@Composable
fun RoundIcon(glyph: Glyph, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Lente.c
    Box(
        modifier.size(44.dp).shadow(if (c.dark) 0.dp else 4.dp, CircleShape).clip(CircleShape).background(if (c.dark) c.glass else c.surface).border(0.5.dp, c.line, CircleShape)
            .clickable(onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(glyph, c.ink) }
}

/** A bare icon with a 44 dp touch target, for a sheet's header: no circle, no shadow. */
@Composable
fun PlainIcon(glyph: Glyph, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Icon(glyph, Lente.c.ink, size = 22.dp)
    }
}

/** The mark inside a soft glass circle: Lente as someone you talk to. */
@Composable
fun GlassMark(size: androidx.compose.ui.unit.Dp) {
    val c = Lente.c
    Box(
        Modifier.size(size).shadow(if (c.dark) 0.dp else size / 6, CircleShape).clip(CircleShape)
            .background(androidx.compose.ui.graphics.Brush.radialGradient(listOf(c.surface, c.raised))).border(0.5.dp, c.line, CircleShape),
        contentAlignment = Alignment.Center,
    ) { Mark(size = size * 0.62f) }
}
