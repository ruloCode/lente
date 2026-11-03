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
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Lente's line icons, drawn on a 24-unit grid with a 2-unit stroke. Drawn fresh, no icon set. */
enum class Glyph { Menu, Back, Close, Eye, Wave, Speaker, Summary, Pause, Play, Stop, Check, Search, Share, Trash, ChevronDown, ChevronRight, Phone, Mic, Calendar, Tasks, Brain, Device, Gear, Link, Team, Plus, Camera, Send, Sparkle, Copy, Doc, Up, Retry, Compose, Clock, Person, Contrast, Terminal, Braces, IBeam, Plug, Bell }

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
            Glyph.Bell -> { drawArc(tint, 180f, 180f, false, Offset(6.5f * u, 4.5f * u), Size(11f * u, 11f * u), style = stroke); line(6.5f, 10f, 6.5f, 15f, 4.5f, 17.5f, 19.5f, 17.5f, 17.5f, 15f, 17.5f, 10f); line(10.5f, 20.5f, 13.5f, 20.5f); line(12f, 2.5f, 12f, 4.5f) }
            Glyph.Terminal -> { box(3f, 5f, 18f, 14f, 2.5f); line(7f, 9.5f, 10f, 12f, 7f, 14.5f); line(12.5f, 15f, 16.5f, 15f) }
            Glyph.Braces -> { line(9f, 4f, 7.5f, 4f, 6.5f, 5f, 6.5f, 10.5f, 4.5f, 12f, 6.5f, 13.5f, 6.5f, 19f, 7.5f, 20f, 9f, 20f); line(15f, 4f, 16.5f, 4f, 17.5f, 5f, 17.5f, 10.5f, 19.5f, 12f, 17.5f, 13.5f, 17.5f, 19f, 16.5f, 20f, 15f, 20f) }
            Glyph.IBeam -> { line(8.5f, 4f, 12f, 5.5f, 15.5f, 4f); line(12f, 5.5f, 12f, 18.5f); line(8.5f, 20f, 12f, 18.5f, 15.5f, 20f); line(10f, 12f, 14f, 12f) }
            Glyph.Plug -> { line(9f, 3f, 9f, 7f); line(15f, 3f, 15f, 7f); line(6f, 7f, 18f, 7f, 18f, 10f, 15.5f, 13.5f, 8.5f, 13.5f, 6f, 10f, close = true); line(12f, 13.5f, 12f, 21f) }
            Glyph.Person -> { ring(12f, 8.5f, 3.8f); drawArc(tint, 200f, 140f, false, Offset(4.5f * u, 13f * u), Size(15f * u, 14f * u), style = stroke) }
            Glyph.Contrast -> { ring(12f, 12f, 8.5f); drawArc(tint, -90f, 180f, true, Offset(3.5f * u, 3.5f * u), Size(17f * u, 17f * u)) }
            Glyph.Clock -> { ring(12f, 12f, 8.5f); line(12f, 7.5f, 12f, 12f, 15f, 14f) }
            Glyph.Up -> { line(12f, 19f, 12f, 5f); line(6f, 11f, 12f, 5f, 18f, 11f) }
            Glyph.Retry -> { drawArc(tint, -100f, 300f, false, Offset(4f * u, 4f * u), Size(16f * u, 16f * u), style = stroke); line(13.6f, 1.2f, 10.6f, 4.1f, 13.5f, 7.1f) }
            Glyph.Compose -> { line(11f, 4f, 6f, 4f, 4f, 6f, 4f, 18f, 6f, 20f, 18f, 20f, 20f, 18f, 20f, 13f); line(9f, 15f, 9.5f, 11.5f, 17.5f, 3.5f, 20.5f, 6.5f, 12.5f, 14.5f, close = true) }
            Glyph.Plus -> { line(12f, 5f, 12f, 19f); line(5f, 12f, 19f, 12f) }
            Glyph.Camera -> { box(3f, 7f, 18f, 13f, 3f); line(8f, 7f, 9.5f, 4.5f, 14.5f, 4.5f, 16f, 7f); ring(12f, 13.5f, 3.5f) }
            Glyph.Send -> { line(4f, 11.5f, 20f, 4f, 13f, 20f, 11f, 13f, close = true); line(11f, 13f, 20f, 4f) }
            Glyph.Sparkle -> { line(12f, 3f, 13.8f, 10.2f, 21f, 12f, 13.8f, 13.8f, 12f, 21f, 10.2f, 13.8f, 3f, 12f, 10.2f, 10.2f, close = true); line(19f, 3.5f, 19f, 6.5f); line(17.5f, 5f, 20.5f, 5f) }
            Glyph.Copy -> { box(8f, 8f, 12f, 12f, 2.5f); line(16f, 8f, 16f, 5.5f, 14f, 4f, 6f, 4f, 4f, 5.5f, 4f, 14f, 5.5f, 16f, 8f, 16f) }
            Glyph.Doc -> { line(6f, 3f, 14f, 3f, 19f, 8f, 19f, 21f, 6f, 21f, close = true); line(14f, 3f, 14f, 8f, 19f, 8f); line(9f, 13f, 16f, 13f); line(9f, 17f, 14f, 17f) }
        }
    }
}

/** The Lente mark: two overlapping lenses with a voice wave where they meet (docs/design/ios-kit/assets/premium/logo-b.svg).
 *  Brand colors in both themes: the blues read on light and on black. */
@Composable
fun Mark(modifier: Modifier = Modifier, size: Dp = 24.dp) {
    Canvas(modifier.size(size)) { drawMark() }
}

fun DrawScope.drawMark() {
    val k = size.minDimension / MARK_WIDTH
    withTransform({
        translate(size.width / 2 - MARK_CX * k, size.height / 2 - MARK_CY * k)
        scale(k, k, Offset.Zero)
    }) {
        for ((path, color) in MarkParts) drawPath(path, color)
    }
}

// The mark's paths in the SVG's 2048-unit box, its center and width there.
private const val MARK_CX = 1030.1f
private const val MARK_CY = 1018.2f
private const val MARK_WIDTH = 923f
private val MarkParts by lazy {
    listOf(
        "M 1022.1 1227.1 C 1007.6 1241.9 992.9 1256.6 978.2 1271.2 C 940.8 1308.4 917.7 1326.8 861.2 1328.7 C 823.9 1329.9 779.8 1314.5 754.1 1287.4 C 729.9 1262.1 704.6 1237.6 680.2 1212.5 C 624.2 1155.2 568.6 1118.7 569.0 1029.5 C 569.4 946.0 609.4 913.0 663.2 858.7 L 737.6 782.6 C 791.0 728.3 854.9 704.8 927.9 740.8 C 949.7 751.5 964.6 768.2 981.4 785.2 C 995.8 800.0 1010.4 814.6 1025.1 829.2 C 1025.3 829.0 1025.5 828.8 1025.7 828.6 C 1049.9 807.1 1071.9 781.5 1096.0 760.1 C 1126.5 733.6 1167.8 720.5 1207.9 725.0 C 1228.4 727.4 1248.7 733.7 1266.4 744.1 C 1289.2 757.3 1305.7 776.0 1323.4 794.9 C 1335.8 808.1 1348.7 821.1 1361.4 834.1 L 1409.4 883.6 C 1420.8 895.2 1432.3 906.6 1442.5 919.3 C 1488.5 976.9 1491.6 1063.3 1451.6 1124.9 C 1436.6 1148.0 1416.5 1165.0 1396.8 1183.6 C 1382.5 1197.0 1368.4 1210.7 1354.5 1224.6 C 1332.4 1246.7 1308.7 1274.1 1285.2 1293.5 C 1254.3 1318.9 1205.8 1331.5 1166.6 1326.1 C 1109.1 1318.7 1086.6 1287 1047.4 1249.5 C 1043.1 1245.4 1027.3 1229.4 1023.0 1226.6 L 1022.1 1227.1 z" to Color(0xFF1F6EFB),
        "M 1025.1 829.2 C 1025.3 829.0 1025.5 828.8 1025.7 828.6 C 1049.9 807.1 1071.9 781.5 1096.0 760.1 C 1126.5 733.6 1167.8 720.5 1207.9 725.0 C 1228.4 727.4 1248.7 733.7 1266.4 744.1 C 1289.2 757.3 1305.7 776.0 1323.4 794.9 C 1335.8 808.1 1348.7 821.1 1361.4 834.1 L 1409.4 883.6 C 1420.8 895.2 1432.3 906.6 1442.5 919.3 C 1488.5 976.9 1491.6 1063.3 1451.6 1124.9 C 1436.6 1148.0 1416.5 1165.0 1396.8 1183.6 C 1382.5 1197.0 1368.4 1210.7 1354.5 1224.6 C 1332.4 1246.7 1308.7 1274.1 1285.2 1293.5 C 1254.3 1318.9 1205.8 1331.5 1166.6 1326.1 C 1109.1 1318.7 1086.6 1287 1047.4 1249.5 C 1043.1 1245.4 1027.3 1229.4 1023.0 1226.6 C 1028.9 1219.8 1039.1 1210.0 1045.6 1203.9 C 1109.3 1144.5 1165.8 1093.5 1148.5 997.0 C 1137.9 937.8 1101.7 905.8 1061.1 865.0 C 1051.0 854.7 1036.4 837.6 1025.1 829.8 L 1025.1 829.2 z" to Color(0xFF5C9BFE),
        "M 1025.1 829.8 C 1036.4 837.6 1051.0 854.7 1061.1 865.0 C 1101.7 905.8 1137.9 937.8 1148.5 997.0 C 1165.8 1093.5 1109.3 1144.5 1045.6 1203.9 C 1039.1 1210.0 1028.9 1219.8 1023.0 1226.6 L 1022.1 1227.1 C 964.1 1166.5 887.9 1116.6 892.1 1022.7 C 895.0 956.2 922.1 928.2 967.2 884.9 L 1025.1 829.8 z" to Color(0xFF0B1430),
        "M 1007.8 942.7 L 1039.7 942.7 C 1039.9 998.3 1040.6 1056.0 1039.7 1111.4 L 1007.8 1111.4 L 1007.8 942.7 z" to Color(0xFF1F6EFB),
        "M 955.4 981.5 L 984.2 981.5 L 984.1 1072.3 L 955.4 1072.1 L 955.4 981.5 z" to Color(0xFF1F6EFB),
        "M 1063.2 981.8 L 1092 981.8 L 1092.1 1072.2 L 1063.2 1072.2 L 1063.2 981.8 z" to Color(0xFF1F6EFB),
    ).map { (d, color) -> PathParser().parsePathString(d).toPath() to color }
}
