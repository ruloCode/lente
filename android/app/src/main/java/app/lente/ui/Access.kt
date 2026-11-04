package app.lente.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import app.lente.LenteViewModel
import app.lente.R
import app.lente.core.Terms

/**
 * A fresh install's first screen (ship-hackathon 3.1): sign in with Google to the cloud hub, no
 * address and no pairing. A laptop hub is still reachable, quietly, under it.
 */
@Composable
fun SignInScreen(vm: LenteViewModel, useComputer: () -> Unit) {
    val c = Lente.c
    val activity = LocalContext.current as? Activity
    Column(
        Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp).testTag("sign-in-screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(32.dp))
        Image(painterResource(R.drawable.art_app_icon), contentDescription = "Lente", modifier = Modifier.size(104.dp).clip(RoundedCornerShape(22.dp)))
        Text("Te ayuda a hablar, a ver y a recordar.", style = Type.large, color = c.ink, modifier = Modifier.padding(top = 12.dp).semantics { heading() })
        Text("Entra con tu cuenta de Google. Tu memoria queda en tu cuenta, en la nube, y la puedes borrar cuando quieras.", style = Type.body, color = c.muted)
        Spacer(Modifier.height(12.dp))
        Button("Iniciar sesión con Google", { activity?.let(vm::signIn) }, Modifier.fillMaxWidth().testTag("sign-in"))
        Text(
            "Usar Lente en mi computadora", style = Type.callout, color = c.muted,
            modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = useComputer).padding(vertical = 12.dp).testTag("use-computer"),
        )
    }
}

/**
 * The preview terms, once per account (ship-hackathon 3.1, design decision 4): the summary in
 * Spanish, the full terms and privacy pages on the hub, and «Acepto».
 */
@Composable
fun TermsScreen(vm: LenteViewModel) {
    val c = Lente.c
    val gate by vm.terms.collectAsState()
    val context = LocalContext.current
    fun openPage(path: String) {
        val base = vm.hubAddress ?: return
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(base + path))) }
    }
    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding().testTag("terms-screen")) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Antes de empezar", style = Type.large, color = c.ink, modifier = Modifier.padding(top = 16.dp).semantics { heading() })
            Text("Lente es una prueba abierta del hackathon. En corto:", style = Type.body, color = c.muted)
            for (line in gate.summary) Row {
                Text("•", style = Type.body, color = c.ink)
                Spacer(Modifier.width(10.dp))
                Text(line, style = Type.body, color = c.ink)
            }
            Link("Términos de la prueba", "terms-link") { openPage(Terms.TERMS_PATH) }
            Link("Privacidad", "privacy-link") { openPage(Terms.PRIVACY_PATH) }
            gate.error?.let { Text(it, style = Type.callout, color = c.live, modifier = Modifier.testTag("terms-error")) }
        }
        Button(
            if (gate.accepting) "Guardando…" else "Acepto", vm::acceptTerms,
            Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 16.dp).testTag("terms-accept"), enabled = !gate.accepting,
        )
    }
}

@Composable
private fun Link(text: String, tag: String, onClick: () -> Unit) = Text(
    text, style = Type.body.copy(textDecoration = TextDecoration.Underline), color = Lente.c.ink,
    modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Abrir", onClick = onClick).padding(vertical = 6.dp).testTag(tag),
)
