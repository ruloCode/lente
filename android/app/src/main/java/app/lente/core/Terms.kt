package app.lente.core

import org.json.JSONObject

/**
 * The preview terms (ship-hackathon 3.1, design decision 4): until a signed-in account accepts the
 * current version, the hub answers every data route with 428 `{needsTerms: true, version}`. Any such
 * answer opens the terms screen; «Acepto» posts that version back. Pure: the phone feeds it the hub's
 * answers and shows what it returns.
 */
data class TermsGate(
    /** The terms screen is up: the hub refused a data route until they are accepted. */
    val needed: Boolean = false,
    /** The version the hub asked for, sent back with «Acepto»; null when it named none. */
    val version: String? = null,
    /** The short summary in Spanish, from the hub's `GET /terms` when it has one. */
    val summary: List<String> = Terms.SUMMARY,
    val accepting: Boolean = false,
    /** Why the last «Acepto» did not go through, for the screen. */
    val error: String? = null,
)

object Terms {
    const val PRECONDITION_REQUIRED = 428
    const val CONFLICT = 409
    const val TERMS_PATH = "/terminos"
    const val PRIVACY_PATH = "/privacidad"

    /** Said when the hub sends no summary of its own: what the terms cover, in four lines. */
    val SUMMARY = listOf(
        "Lente es un prototipo de un hackathon, no un dispositivo médico ni de movilidad.",
        "Guarda texto sellado para tu cuenta; el audio y las fotos no se guardan.",
        "Lo que preguntas, escucha y ve va a los modelos de Meta con créditos gratuitos, que pueden usarlo para mejorar sus productos: no compartas nada sensible.",
        "Puedes borrar tu cuenta y todos sus datos cuando quieras.",
    )

    const val COULD_NOT_ACCEPT = "No se pudo guardar tu respuesta. Prueba otra vez."
    const val CHANGED = "Los términos cambiaron: léelos otra vez y acepta."

    private fun json(body: String): JSONObject? = runCatching { JSONObject(body) }.getOrNull()

    /** The version a 428 (or 409) asks for, or null when the answer is not a terms refusal. */
    fun refusal(code: Int, body: String): String? {
        if (code != PRECONDITION_REQUIRED && code != CONFLICT) return null
        val o = json(body) ?: return null
        if (!o.optBoolean("needsTerms")) return null
        return o.optString("version")
    }

    /** Any answer from a data route: a terms refusal opens the screen (keeping the version asked for); anything else changes nothing. */
    fun answered(g: TermsGate, code: Int, body: String): TermsGate {
        val version = refusal(code, body) ?: return g
        return g.copy(needed = true, version = version.ifBlank { g.version })
    }

    /** `GET /terms`: the hub's summary in Spanish, and whether this account still has to accept. */
    fun view(g: TermsGate, body: String): TermsGate {
        val o = json(body) ?: return g
        val es = o.optJSONObject("summary")?.optJSONArray("es")
        val summary = es?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }?.ifEmpty { null } ?: g.summary
        val version = o.optString("version").ifBlank { g.version }
        return g.copy(summary = summary, version = version)
    }

    /** What «Acepto» sends: the version asked for, or nothing when the hub named none. */
    fun acceptBody(g: TermsGate): JSONObject = JSONObject().apply { g.version?.takeIf { it.isNotBlank() }?.let { put("version", it) } }

    fun accepting(g: TermsGate) = g.copy(accepting = true, error = null)

    /** The answer to `POST /terms/accept`: accepted closes the screen; a newer version keeps it with the new one; else the reason. */
    fun accepted(g: TermsGate, code: Int, body: String): TermsGate {
        if (code in 200..299) return TermsGate(summary = g.summary)
        refusal(code, body)?.let { v -> return g.copy(accepting = false, version = v.ifBlank { g.version }, error = CHANGED) }
        val message = json(body)?.optString("message")?.ifBlank { null }
        return g.copy(accepting = false, error = message ?: COULD_NOT_ACCEPT)
    }

    /** Signing out forgets it: the next account answers for itself. */
    fun signedOut(g: TermsGate) = TermsGate(summary = g.summary)
}

/**
 * What the app opens on (ship-hackathon 3.1). A build with sign-in opens on «Iniciar sesión con
 * Google» against the cloud hub, never on the pairing screen; a laptop hub (paired by address) keeps
 * the first-run intro. Once signed in, the terms screen comes before anything else while it is needed.
 */
enum class Gate { SignIn, Intro, Terms, App }

object Opening {
    /**
     * [configured]: this build has sign-in; [signedIn]: an account is on the phone; [hub]: the address
     * the phone follows (null on a fresh install); [cloudHub]: the build's cloud hub; [welcomed]: the
     * intro was done; [connected]: the phone has a hub at all; [terms]: the hub asked for the terms.
     */
    fun gate(configured: Boolean, signedIn: Boolean, hub: String?, cloudHub: String, welcomed: Boolean, connected: Boolean, terms: Boolean): Gate {
        val onCloud = hub == null || HubAddress.normalize(hub) == HubAddress.normalize(cloudHub)
        if (configured && !signedIn && onCloud) return Gate.SignIn
        if (signedIn && terms) return Gate.Terms
        // Signing in counts as the intro done; «Ver la introducción» in Ajustes still replays it.
        if (signedIn && onCloud) return if (welcomed) Gate.App else Gate.Intro
        return if (!welcomed || !connected) Gate.Intro else Gate.App
    }
}
