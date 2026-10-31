package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TokensTest {
    private val AAA = 7.0

    @Test fun everyTextPairIsAAAInBothThemes() {
        for ((name, t) in listOf("light" to Tokens.LIGHT, "dark" to Tokens.DARK)) {
            val low = Tokens.TEXT_PAIRS.map { (text, surface, where) -> "$text on $surface ($where)" to Contrast.pair(t, text, surface) }.filter { it.second < AAA }
            assertTrue("pairs under $AAA:1 in $name: $low", low.isEmpty())
        }
    }

    @Test fun wcagReference() {
        assertEquals(21.0, Contrast.ratio(0xFF000000, 0xFFFFFFFF), 0.01)
        assertEquals(4.54, Contrast.ratio(0xFF767676, 0xFFFFFFFF), 0.01)
    }

    /** The app's colors are the page's: read src/theme.ts and compare every opaque token. */
    @Test fun sameValuesAsTheHubTheme() {
        val css = Repo.text("src/theme.ts")
        val dark = css.indexOf("prefers-color-scheme: dark")
        fun read(block: String) = Regex("--([a-z-]+):\\s*(#[0-9A-Fa-f]{6})").findAll(block).associate { it.groupValues[1] to (0xFF000000 or it.groupValues[2].drop(1).toLong(16)) }
        val names = mapOf("bg" to "bg", "surface" to "surface", "raised" to "raised", "line" to "line", "ink" to "ink", "muted" to "muted", "accent" to "accent", "accent-fill" to "accentFill", "on-accent" to "onAccent", "tag" to "tag", "live" to "live", "live-fill" to "liveFill", "on-live" to "onLive", "ok" to "ok", "track" to "track", "thumb" to "thumb")
        for ((theme, block) in listOf(Tokens.LIGHT to css.substring(0, dark), Tokens.DARK to css.substring(dark))) {
            val values = read(block)
            for ((css, kt) in names) assertEquals("--$css", values.getValue(css), theme.get(kt))
        }
    }
}
