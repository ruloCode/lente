package app.lente.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.Link
import app.lente.R
import kotlinx.coroutines.launch

private const val STEPS = 6
private val ART = 168.dp

/** First run: what Lente does, the hub, the wearer's names, the clip, the voice, and the listening promise. */
@Composable
fun Intro(vm: LenteViewModel, onDone: () -> Unit) {
    val c = Lente.c
    val link by vm.link.collectAsState()
    val hub by vm.hub.collectAsState()
    val connected = link == Link.Live || link == Link.Connecting || link is Link.Reconnecting
    var step by rememberSaveable { mutableIntStateOf(0) }
    var address by rememberSaveable { mutableStateOf(vm.prefs.hub ?: "") }
    var names by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun next() {
        when (step) {
            1 -> if (!connected) {
                checking = true
                scope.launch {
                    error = vm.tryHub(address)
                    checking = false
                    if (error == null) step++
                }
                return
            }
            2 -> if (names.isNotBlank()) vm.saveNames(names)
        }
        if (step == STEPS - 1) onDone() else step++
    }

    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding().imePadding().testTag("intro")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (i in 0 until STEPS) Box(Modifier.height(6.dp).width(if (i == step) 22.dp else 6.dp).clip(CircleShape).background(if (i <= step) c.ink else c.line))
            }
            if (step >= 2) Text("Omitir", style = Type.headline.copy(fontWeight = FontWeight.Normal), color = c.ink, modifier = Modifier.clickable(onClick = onDone).padding(8.dp).testTag("intro-skip"))
        }
        AnimatedContent(step, Modifier.weight(1f), transitionSpec = {
            (slideInHorizontally(tween(300)) { it / 4 } + fadeIn(tween(300))) togetherWith (slideOutHorizontally(tween(220)) { -it / 4 } + fadeOut(tween(180)))
        }, label = "intro") { s ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 16.dp)) {
                when (s) {
                    0 -> {
                        Spacer(Modifier.height(32.dp))
                        androidx.compose.foundation.Image(
                            androidx.compose.ui.res.painterResource(R.drawable.art_app_icon), contentDescription = "Lente",
                            modifier = Modifier.size(104.dp).clip(RoundedCornerShape(22.dp)),
                        )
                        Heading("Te dice qué decir, justo cuando te preguntan.")
                        Body("Lente escucha la reunión desde el clip de tus lentes. Cuando alguien te hace una pregunta, aquí aparece una frase para responder: DILO.")
                    }
                    1 -> {
                        Heading("Conecta con tu computadora")
                        Body("Lente corre en tu computadora. Escribe la dirección que muestra al arrancar (Phone: http://…). Tu teléfono y la computadora deben estar en la misma red Wi-Fi.")
                        Spacer(Modifier.height(20.dp))
                        Field(address, { address = it; error = null }, "192.168.1.20", onDone = ::next, tag = "intro-hub")
                        error?.let { Text(it, style = Type.callout, color = c.live, modifier = Modifier.padding(top = 10.dp).testTag("intro-error")) }
                        if (connected) Text("Conectado con ${vm.hubAddress}.", style = Type.callout, color = c.ok, modifier = Modifier.padding(top = 10.dp))
                    }
                    2 -> {
                        Art(R.drawable.art_intro_names, ART)
                        Heading("¿Cómo te llaman?")
                        Body("Lente te avisa cuando alguien dice uno de estos nombres. Separa los apodos con comas.")
                        Spacer(Modifier.height(20.dp))
                        Field(names.ifEmpty { hub.status.names.joinToString(", ") }, { names = it }, "Rulo, Raúl", onDone = ::next, tag = "intro-names")
                    }
                    3 -> {
                        ClipPicture()
                        Heading("Conecta el clip")
                        Body("Enciéndelo: se conecta solo a la misma red Wi-Fi que la computadora donde corre Lente. Si no lo tienes a mano, en Ahora puedes usar el micrófono del teléfono.")
                        Spacer(Modifier.height(20.dp))
                        StatusLine(hub.status.clip, if (hub.status.clip) app.lente.core.Copy.device(hub.status) else "Esperando el clip…")
                    }
                    4 -> {
                        Art(R.drawable.art_intro_voice, ART)
                        Heading("Que reconozca tu voz")
                        Body("Con el clip puesto, di en voz alta:")
                        Text("“Lente, soy …”", style = Type.large, color = c.ink, modifier = Modifier.padding(vertical = 20.dp))
                        StatusLine(hub.status.wearer.isNotEmpty(), if (hub.status.wearer.isNotEmpty()) "Te reconocí" else "Escuchando…")
                    }
                    else -> {
                        Art(R.drawable.art_intro_privacy, ART)
                        Heading("Siempre a la vista")
                        Body("Mientras escucha verás la franja roja arriba y este botón. Tócalo cuando quieras pausar. Lente guarda el texto del día y, con «Guardar audio» y «Guardar fotos» activados, también el audio de lo que se dijo y una foto cuando cambia la escena, cifrados y por los días que elijas.")
                        Spacer(Modifier.height(16.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Pill(app.lente.core.Status(clip = true, listening = true)) {}
                            Pill(app.lente.core.Status()) {}
                        }
                        Spacer(Modifier.height(16.dp))
                        Body("En Solo grabar el botón dice «Grabando»: Lente guarda tu día (el texto, y el audio y las fotos si los activas) y aprende de él, sin sugerencias. Avisa a quienes estén contigo.")
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (step > 0) Button("Atrás", { step-- }, tone = Tone.Plain)
            Button(
                when { checking -> "Conectando…"; step == 1 && !connected -> "Conectar"; step == STEPS - 1 -> "Empezar"; else -> "Siguiente" },
                ::next, Modifier.weight(1f).testTag("intro-next"), enabled = !checking && (step != 1 || connected || address.isNotBlank()),
            )
        }
    }
}

@Composable
private fun Heading(text: String) = Text(text, style = Type.large, color = Lente.c.ink, modifier = Modifier.padding(top = 24.dp))

@Composable
private fun Body(text: String) = Text(text, style = Type.body, color = Lente.c.muted, modifier = Modifier.padding(top = 12.dp))

@Composable
private fun StatusLine(ok: Boolean, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Dot(if (ok) Lente.c.ok else Lente.c.muted, 10.dp)
        Spacer(Modifier.width(10.dp))
        Text(text, style = Type.headline, color = Lente.c.ink)
    }
}
