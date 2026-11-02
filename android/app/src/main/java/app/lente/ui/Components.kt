package app.lente.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** A white (or dark grey) card with the kit's soft shadow; flat in dark mode. */
@Composable
fun Card(modifier: Modifier = Modifier, padding: PaddingValues = PaddingValues(Lente.gutter), content: @Composable ColumnScope.() -> Unit) {
    val c = Lente.c
    val shape = RoundedCornerShape(Lente.card)
    Column(
        modifier
            .fillMaxWidth()
            .then(if (c.dark) Modifier else Modifier.shadow(6.dp, shape, ambientColor = Color(0x14101828), spotColor = Color(0x1A101828)))
            .clip(shape)
            .background(c.surface)
            .padding(padding),
        content = content,
    )
}

/** Small uppercase section title over a group, as in iOS settings. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    Row(modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 20.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = Type.label, color = Lente.c.muted, modifier = Modifier.weight(1f))
        if (trailing != null) Text(trailing, style = Type.measured, color = Lente.c.muted)
    }
}

/** A grouped list: rows inside one card with hairlines between them. */
@Composable
fun Group(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) =
    Card(modifier, padding = PaddingValues(0.dp), content = content)

@Composable
fun Hairline() = HorizontalDivider(Modifier.padding(start = Lente.gutter), thickness = 0.5.dp, color = Lente.c.line)

/** One row of a group: title, optional hint below, a value or control at the end. */
@Composable
fun ListRow(
    title: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    value: String? = null,
    valueColor: Color? = null,
    titleColor: Color? = null,
    leading: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    chevron: Boolean = onClick != null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val c = Lente.c
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = Lente.row)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = Lente.gutter, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) { leading(); Spacer(Modifier.width(12.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.body, color = titleColor ?: c.ink)
            if (hint != null) Text(hint, style = Type.caption, color = c.muted)
        }
        if (value != null) Text(value, style = Type.measured.copy(fontSize = Type.callout.fontSize), color = valueColor ?: c.muted, modifier = Modifier.padding(start = 12.dp))
        if (trailing != null) trailing()
        if (chevron) Icon(Glyph.ChevronRight, c.muted, Modifier.padding(start = 6.dp), size = 18.dp)
    }
}

@Composable
fun SwitchRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit, hint: String? = null, tag: String? = null) {
    val c = Lente.c
    ListRow(title, hint = hint, modifier = (if (tag != null) Modifier.testTag(tag) else Modifier).clickable(role = Role.Switch) { onChange(!checked) }) {
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = c.accentFill, checkedThumbColor = c.onAccent, uncheckedTrackColor = c.track, uncheckedThumbColor = c.thumb, uncheckedBorderColor = c.line),
        )
    }
}

/** iOS-style segmented control: a track with a sliding thumb. */
@Composable
fun Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier, label: String = "") {
    val c = Lente.c
    Row(
        modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(12.dp)).background(c.track).padding(3.dp).semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        for ((key, text) in options) {
            val on = key == selected
            val bg by animateColorAsState(if (on) c.thumb else c.track, spring(stiffness = 700f), label = "seg")
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .height(34.dp)
                    .then(if (on && !c.dark) Modifier.shadow(2.dp, RoundedCornerShape(10.dp)) else Modifier)
                    .clip(RoundedCornerShape(10.dp))
                    .background(bg)
                    .semantics { this.selected = on; role = Role.Tab }
                    .clickable { onSelect(key) }
                    .testTag("seg-$key"),
                contentAlignment = Alignment.Center,
            ) {
                Text(text, style = Type.callout.copy(fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium), color = if (on) c.ink else c.muted, maxLines = 1)
            }
        }
    }
}

enum class Tone { Primary, Plain, Live, Quiet }

@Composable
fun Button(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, tone: Tone = Tone.Primary, enabled: Boolean = true, glyph: Glyph? = null) {
    val c = Lente.c
    val (bg, fg) = when (tone) {
        Tone.Primary -> c.accentFill to c.onAccent
        Tone.Plain -> c.raised to c.ink
        Tone.Live -> c.liveFill to c.onLive
        Tone.Quiet -> Color.Transparent to c.accent
    }
    val alpha by animateFloatAsState(if (enabled) 1f else 0.45f, label = "btn")
    Row(
        modifier
            .heightIn(min = Lente.tap)
            .clip(RoundedCornerShape(14.dp))
            .background(bg.copy(alpha = bg.alpha * alpha))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (glyph != null) { Icon(glyph, fg.copy(alpha = alpha), size = 20.dp); Spacer(Modifier.width(8.dp)) }
        Text(text, style = Type.headline, color = fg.copy(alpha = alpha), maxLines = 1)
    }
}

/** A destructive or final action that asks for a second tap within 4 s, like the page. */
@Composable
fun ConfirmButton(text: String, confirm: String, onConfirm: () -> Unit, modifier: Modifier = Modifier, tone: Tone = Tone.Plain, tag: String? = null) {
    var armed by remember { mutableStateOf(false) }
    LaunchedEffect(armed) { if (armed) { delay(4_000); armed = false } }
    Button(if (armed) confirm else text, { if (armed) { armed = false; onConfirm() } else armed = true }, modifier.then(if (tag != null) Modifier.testTag(tag) else Modifier), tone = if (armed) Tone.Live else tone)
}

/** The rounded tag that names a card: DILO, EN PANTALLA… */
@Composable
fun Tag(text: String, modifier: Modifier = Modifier, bg: Color = Lente.c.tag, fg: Color = Lente.c.accent) {
    Text(text, style = Type.label, color = fg, modifier = modifier.clip(RoundedCornerShape(8.dp)).background(bg).padding(horizontal = 8.dp, vertical = 4.dp))
}

@Composable
fun Dot(color: Color, size: androidx.compose.ui.unit.Dp = 8.dp) = Box(Modifier.size(size).clip(CircleShape).background(color))

/** Five bars for the audio level. */
@Composable
fun LevelBars(level: Float, color: Color, modifier: Modifier = Modifier) {
    Row(modifier.height(16.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        for (i in 0 until 5) {
            val on = level > i / 5f + 0.02f
            val h by animateFloatAsState(if (on) 6f + i * 2.5f else 4f, spring(stiffness = 900f), label = "bar")
            Box(Modifier.width(3.dp).height(h.dp).clip(RoundedCornerShape(2.dp)).background(if (on) color else color.copy(alpha = 0.25f)))
        }
    }
}

@Composable
fun Empty(text: String, modifier: Modifier = Modifier, action: String? = null, art: Int? = null, onAction: (() -> Unit)? = null) {
    Card(modifier) {
        if (art != null) Art(art, 120.dp, Modifier.padding(bottom = 4.dp))
        Text(text, style = Type.callout, color = Lente.c.muted)
        if (action != null && onAction != null) {
            Spacer(Modifier.height(8.dp))
            Text(action, style = Type.headline, color = Lente.c.accent, modifier = Modifier.clickable(onClick = onAction).padding(vertical = 6.dp))
        }
    }
}

@Composable
fun Field(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, onDone: (() -> Unit)? = null, tag: String? = null, singleLine: Boolean = true) {
    val c = Lente.c
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(placeholder, color = c.muted, style = Type.body) },
        singleLine = singleLine,
        textStyle = Type.body.copy(color = c.ink),
        shape = RoundedCornerShape(12.dp),
        keyboardOptions = KeyboardOptions(imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = c.accent, unfocusedBorderColor = c.line, focusedContainerColor = c.surface, unfocusedContainerColor = c.surface, cursorColor = c.accent),
        modifier = modifier.fillMaxWidth().then(if (tag != null) Modifier.testTag(tag) else Modifier),
    )
}

/** Text in one line that ends with an ellipsis. */
@Composable
fun One(text: String, style: TextStyle, color: Color, modifier: Modifier = Modifier) =
    Text(text, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)

/** A notice inside a card with an optional action, for notes like "Reconectando…". */
@Composable
fun Notice(text: String, modifier: Modifier = Modifier, action: String? = null, tag: String? = null, onAction: (() -> Unit)? = null) {
    val c = Lente.c
    Surface(modifier.fillMaxWidth().then(if (tag != null) Modifier.testTag(tag) else Modifier), shape = RoundedCornerShape(16.dp), color = c.surface, border = BorderStroke(1.dp, c.line)) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, style = Type.callout, color = c.ink, modifier = Modifier.weight(1f))
            if (action != null && onAction != null) Text(action, style = Type.headline, color = c.accent, modifier = Modifier.padding(start = 12.dp).clickable(onClick = onAction).padding(vertical = 6.dp))
        }
    }
}

/** One of the pack's illustrations (docs/design/ios-kit/assets/premium), centered; decorative, so no description. */
@Composable
fun Art(@androidx.annotation.DrawableRes id: Int, size: Dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(id), contentDescription = null, modifier = Modifier.size(size))
    }
}
