package app.lente.core

/**
 * How a call to the hub carries the session (add-accounts 7.2): the current access token as a bearer,
 * and after a 401 one refresh and one more try; a second 401, or a refresh that fails, means the
 * wearer is signed out and goes back to sign-in. With no session at all (a laptop hub with pairing),
 * the call goes out once, with no bearer, exactly as before.
 */
object AuthRetry {
    suspend fun <T> run(
        token: suspend () -> String?,
        refresh: suspend () -> String?,
        code: (T) -> Int,
        call: suspend (bearer: String?) -> T,
        signedOut: suspend () -> Unit = {},
    ): T {
        val first = token()
        val answer = call(first)
        if (first == null || !Auth.isUnauthorized(code(answer))) return answer
        val fresh = refresh() ?: return answer.also { signedOut() }
        val again = call(fresh)
        if (Auth.isUnauthorized(code(again))) signedOut()
        return again
    }

    /** The header a bearer token goes in, or none. */
    fun header(bearer: String?): Pair<String, String>? = bearer?.let { "Authorization" to "Bearer $it" }
}
