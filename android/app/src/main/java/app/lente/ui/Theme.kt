package app.lente.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lente.core.Tokens

/** The kit's tokens as Compose colors; values and contrast are checked in core/TokensTest. */
class Palette(t: Tokens, val dark: Boolean) {
    val bg = Color(t.bg); val surface = Color(t.surface); val raised = Color(t.raised); val line = Color(t.line)
    val ink = Color(t.ink); val muted = Color(t.muted)
    val accent = Color(t.accent); val accentFill = Color(t.accentFill); val onAccent = Color(t.onAccent); val tag = Color(t.tag)
    val live = Color(t.live); val liveFill = Color(t.liveFill); val onLive = Color(t.onLive); val ok = Color(t.ok)
    val track = Color(t.track); val thumb = Color(t.thumb); val glass = Color(t.glass); val scrim = Color(t.scrim)
}

val LocalPalette = staticCompositionLocalOf { Palette(Tokens.LIGHT, false) }

object Lente {
    val c: Palette @Composable get() = LocalPalette.current
    /** Cards are flat with small corners (add-home-dock's look): grey ground, white cards, ink for what acts. */
    val card = 12.dp
    val gutter = 16.dp
    val tap = 48.dp
    val row = 52.dp
}

/** Type scale: system font, sizes from the kit. Measured numbers use tabular figures. */
object Type {
    val large = TextStyle(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp)
    val title = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold)
    val headline = TextStyle(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
    val body = TextStyle(fontSize = 17.sp, lineHeight = 24.sp)
    val callout = TextStyle(fontSize = 15.sp, lineHeight = 20.sp)
    val caption = TextStyle(fontSize = 13.sp, lineHeight = 18.sp)
    val label = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
    val measured = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = "tnum")
}

@Composable
fun LenteTheme(mode: String = "system", content: @Composable () -> Unit) {
    val dark = when (mode) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
    val p = remember(dark) { Palette(if (dark) Tokens.DARK else Tokens.LIGHT, dark) }
    val scheme = if (dark) {
        darkColorScheme(primary = p.accentFill, onPrimary = p.onAccent, background = p.bg, onBackground = p.ink, surface = p.surface, onSurface = p.ink, surfaceVariant = p.raised, onSurfaceVariant = p.muted, outline = p.line, error = p.live)
    } else {
        lightColorScheme(primary = p.accentFill, onPrimary = p.onAccent, background = p.bg, onBackground = p.ink, surface = p.surface, onSurface = p.ink, surfaceVariant = p.raised, onSurfaceVariant = p.muted, outline = p.line, error = p.live)
    }
    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(LocalPalette provides p, content = content)
    }
}
