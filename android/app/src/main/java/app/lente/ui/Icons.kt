package app.lente.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Lente's line icons, drawn on a 24-unit grid with a 2-unit stroke. Drawn fresh, no icon set. */
enum class Glyph { Menu, Back, Close, Eye, Wave, Speaker, Summary, Pause, Play, Stop, Check, Search, Share, Trash, ChevronDown, ChevronRight, Phone, Mic, Calendar, Tasks, Brain, Device, Gear, Link, Team, Plus, Camera }

@Composable
fun Icon(glyph: Glyph, tint: Color, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    Canvas(modifier.size(size)) {
        val u = this.size.minDimension / 24f
        val stroke = Stroke(width = 2f * u, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun p(vararg pts: Float, close: Boolean = false): Path = Path().apply {
            moveTo(pts[0] * u, pts[1] * u)
            var i = 2
            while (i < pts.size) { lineTo(pts[i] * u, pts[i + 1] * u); i += 2 }
            if (close) close()
        }
        fun line(vararg pts: Float, close: Boolean = false) = drawPath(p(*pts, close = close), tint, style = stroke)
        fun ring(cx: Float, cy: Float, r: Float) = drawCircle(tint, r * u, Offset(cx * u, cy * u), style = stroke)
        fun box(x: Float, y: Float, w: Float, h: Float, r: Float = 2f) = drawRoundRect(tint, Offset(x * u, y * u), Size(w * u, h * u), androidx.compose.ui.geometry.CornerRadius(r * u), style = stroke)
        when (glyph) {
            Glyph.Menu -> { line(4f, 7f, 20f, 7f); line(4f, 12f, 20f, 12f); line(4f, 17f, 14f, 17f) }
            Glyph.Back -> line(15f, 5f, 8f, 12f, 15f, 19f)
            Glyph.Close -> { line(6f, 6f, 18f, 18f); line(18f, 6f, 6f, 18f) }
            Glyph.Eye -> { line(2f, 12f, 6f, 7f, 12f, 5f, 18f, 7f, 22f, 12f, 18f, 17f, 12f, 19f, 6f, 17f, close = true); ring(12f, 12f, 3f) }
            Glyph.Wave -> { line(4f, 10f, 4f, 14f); line(8f, 7f, 8f, 17f); line(12f, 4f, 12f, 20f); line(16f, 8f, 16f, 16f); line(20f, 11f, 20f, 13f) }
            Glyph.Speaker -> { line(4f, 9f, 8f, 9f, 13f, 5f, 13f, 19f, 8f, 15f, 4f, 15f, close = true); line(16.5f, 9f, 17.5f, 12f, 16.5f, 15f); line(19f, 6.5f, 21f, 12f, 19f, 17.5f) }
            Glyph.Summary -> { line(5f, 6f, 19f, 6f); line(5f, 11f, 19f, 11f); line(5f, 16f, 13f, 16f); line(16f, 15f, 17f, 18f, 20f, 19f) }
            Glyph.Pause -> { line(9f, 6f, 9f, 18f); line(15f, 6f, 15f, 18f) }
            Glyph.Play -> line(8f, 5f, 19f, 12f, 8f, 19f, close = true)
            Glyph.Stop -> box(6f, 6f, 12f, 12f, 2f)
            Glyph.Check -> line(5f, 12.5f, 10f, 17f, 19f, 7f)
            Glyph.Search -> { ring(11f, 11f, 6f); line(15.5f, 15.5f, 20f, 20f) }
            Glyph.Share -> { line(12f, 4f, 12f, 15f); line(8f, 8f, 12f, 4f, 16f, 8f); line(6f, 12f, 6f, 20f, 18f, 20f, 18f, 12f) }
            Glyph.Trash -> { line(4f, 7f, 20f, 7f); line(9f, 7f, 9f, 4f, 15f, 4f, 15f, 7f); line(6f, 7f, 7f, 20f, 17f, 20f, 18f, 7f) }
            Glyph.ChevronDown -> line(6f, 9f, 12f, 15f, 18f, 9f)
            Glyph.ChevronRight -> line(9f, 6f, 15f, 12f, 9f, 18f)
            Glyph.Phone -> { box(7f, 3f, 10f, 18f, 2.5f); line(11f, 17.5f, 13f, 17.5f) }
            Glyph.Mic -> { box(9f, 3f, 6f, 11f, 3f); line(5.5f, 11f, 6.5f, 14.5f, 9f, 16.8f, 12f, 17.5f, 15f, 16.8f, 17.5f, 14.5f, 18.5f, 11f); line(12f, 17.5f, 12f, 21f) }
            Glyph.Calendar -> { box(4f, 5f, 16f, 15f); line(4f, 10f, 20f, 10f); line(8f, 3f, 8f, 7f); line(16f, 3f, 16f, 7f) }
            Glyph.Tasks -> { line(4f, 7f, 6f, 9f, 9f, 5f); line(12f, 7f, 20f, 7f); line(4f, 15f, 6f, 17f, 9f, 13f); line(12f, 15f, 20f, 15f) }
            Glyph.Brain -> { ring(12f, 12f, 8f); line(12f, 4f, 12f, 20f); line(12f, 9f, 8.5f, 9f); line(12f, 15f, 15.5f, 15f) }
            Glyph.Device -> { ring(9f, 12f, 5f); line(14f, 12f, 21f, 12f); line(3f, 12f, 4f, 12f) }
            Glyph.Gear -> { ring(12f, 12f, 3f); ring(12f, 12f, 7.5f); for (a in 0 until 8) { val r = Math.toRadians(a * 45.0); line(12f + 7.5f * Math.cos(r).toFloat(), 12f + 7.5f * Math.sin(r).toFloat(), 12f + 9.8f * Math.cos(r).toFloat(), 12f + 9.8f * Math.sin(r).toFloat()) } }
            Glyph.Link -> { line(10f, 14f, 14f, 10f); line(8.5f, 11.5f, 6f, 14f, 6f, 17f, 7f, 18f, 10f, 18f, 12.5f, 15.5f); line(11.5f, 8.5f, 14f, 6f, 17f, 6f, 18f, 7f, 18f, 10f, 15.5f, 12.5f) }
            Glyph.Team -> { ring(9f, 9f, 3f); ring(16.5f, 10f, 2.5f); line(3.5f, 19f, 5f, 15.5f, 9f, 14f, 13f, 15.5f, 14.5f, 19f); line(15f, 14.5f, 18f, 14.5f, 20.5f, 17.5f) }
            Glyph.Plus -> { line(12f, 5f, 12f, 19f); line(5f, 12f, 19f, 12f) }
            Glyph.Camera -> { box(3f, 7f, 18f, 13f, 3f); line(8f, 7f, 9.5f, 4.5f, 14.5f, 4.5f, 16f, 7f); ring(12f, 13.5f, 3.5f) }
        }
    }
}

/** The Lente mark (lens and line) from src/brand.ts's geometry, in the ink color with the line in the accent. */
@Composable
fun Mark(ink: Color, accent: Color, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    Canvas(modifier.size(size)) { drawMark(ink, accent) }
}

fun DrawScope.drawMark(ink: Color, accent: Color) {
    val u = size.minDimension / 100f
    drawCircle(ink, 24f * u, Offset(50f * u, 46f * u), style = Stroke(4.5f * u))
    drawLine(accent, Offset(30f * u, 76f * u), Offset(70f * u, 76f * u), strokeWidth = 5f * u, cap = StrokeCap.Round)
}
