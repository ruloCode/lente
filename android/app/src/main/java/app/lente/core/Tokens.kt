package app.lente.core

/**
 * The kit's color tokens (the values of src/theme.ts) as 0xAARRGGBB, for both themes. Pure, so the
 * contrast test runs on the JVM; ui/Theme.kt turns them into Compose colors.
 */
data class Tokens(
    val bg: Long, val surface: Long, val raised: Long, val line: Long, val ink: Long, val muted: Long,
    val accent: Long, val accentFill: Long, val onAccent: Long, val tag: Long,
    val live: Long, val liveFill: Long, val onLive: Long, val ok: Long,
    val track: Long, val thumb: Long, val glass: Long, val scrim: Long,
) {
    companion object {
        val LIGHT = Tokens(
            bg = 0xFFF2F2F7, surface = 0xFFFFFFFF, raised = 0xFFEEF0F5, line = 0xFFE5E6EC, ink = 0xFF0A0C16, muted = 0xFF464C5E,
            accent = 0xFF0842B5, accentFill = 0xFF0A47C2, onAccent = 0xFFFFFFFF, tag = 0xFFE8F0FE,
            live = 0xFFA3001A, liveFill = 0xFFB0001D, onLive = 0xFFFFFFFF, ok = 0xFF0A5C27,
            track = 0xFFE8E9EE, thumb = 0xFFFFFFFF, glass = 0xCCFFFFFF, scrim = 0x61080A16,
        )
        val DARK = Tokens(
            bg = 0xFF000000, surface = 0xFF1C1C1E, raised = 0xFF2C2C2E, line = 0xFF38383A, ink = 0xFFFFFFFF, muted = 0xFFC7C7CC,
            accent = 0xFF8CC8FF, accentFill = 0xFF8CC8FF, onAccent = 0xFF000000, tag = 0xFF26333F,
            live = 0xFFFF8A8A, liveFill = 0xFFFF6B6B, onLive = 0xFF000000, ok = 0xFF5FE08A,
            track = 0xFF2C2C2E, thumb = 0xFF3A3A3C, glass = 0xD11E1E21, scrim = 0x99000000,
        )

        /** Every text color the app paints, on every surface it paints it on (see the ui package). */
        val TEXT_PAIRS: List<Triple<String, String, String>> = listOf(
            Triple("ink", "bg", "titles, timeline, live transcript"),
            Triple("ink", "surface", "cards, rows, menu"),
            Triple("ink", "raised", "buttons, pressed rows"),
            Triple("ink", "thumb", "selected segment"),
            Triple("ink", "glass", "listening pill, dock"),
            Triple("muted", "bg", "captions, hints, section titles"),
            Triple("muted", "surface", "secondary text and measured numbers"),
            Triple("muted", "raised", "the Pronto tag"),
            Triple("muted", "track", "unselected segment"),
            Triple("muted", "glass", "dock labels"),
            Triple("accent", "bg", "links, Omitir"),
            Triple("accent", "surface", "selected row text, text buttons"),
            Triple("accent", "tag", "DILO label, current menu row"),
            Triple("onAccent", "accentFill", "primary buttons"),
            Triple("live", "surface", "recording text on cards"),
            Triple("live", "bg", "Toca otra vez para terminar"),
            Triple("onLive", "liveFill", "the recording strip and the stop button"),
            Triple("ok", "surface", "connected dot label"),
        )
    }

    fun get(name: String): Long = when (name) {
        "bg" -> bg; "surface" -> surface; "raised" -> raised; "line" -> line; "ink" -> ink; "muted" -> muted
        "accent" -> accent; "accentFill" -> accentFill; "onAccent" -> onAccent; "tag" -> tag
        "live" -> live; "liveFill" -> liveFill; "onLive" -> onLive; "ok" -> ok
        "track" -> track; "thumb" -> thumb; "glass" -> glass; "scrim" -> scrim
        else -> error("no token $name")
    }
}

/** WCAG 2 contrast; a translucent surface is painted over `bg` first. */
object Contrast {
    private fun channel(argb: Long, shift: Int) = ((argb shr shift) and 0xFF).toDouble()

    fun over(top: Long, under: Long): Long {
        val a = channel(top, 24) / 255
        fun mix(shift: Int) = Math.round(channel(top, shift) * a + channel(under, shift) * (1 - a))
        return (0xFFL shl 24) or (mix(16) shl 16) or (mix(8) shl 8) or mix(0)
    }

    fun luminance(argb: Long): Double {
        fun lin(c: Double): Double { val s = c / 255; return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(channel(argb, 16)) + 0.7152 * lin(channel(argb, 8)) + 0.0722 * lin(channel(argb, 0))
    }

    fun ratio(a: Long, b: Long): Double {
        val (hi, lo) = listOf(luminance(a), luminance(b)).sortedDescending()
        return (hi + 0.05) / (lo + 0.05)
    }

    fun pair(t: Tokens, text: String, surface: String): Double {
        val s = t.get(surface).let { if ((it ushr 24) < 0xFF) over(it, t.bg) else it }
        return ratio(t.get(text), s)
    }
}
