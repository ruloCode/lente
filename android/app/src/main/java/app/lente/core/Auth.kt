package app.lente.core

import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Signing in with Google (add-accounts 7.1), the parts that need no phone: the nonce, the requests to
 * Supabase Auth and the session they answer with. Google gets the SHA-256 of a random nonce, Supabase
 * gets the nonce itself and checks the two match. The access token lasts about an hour and is
 * refreshed a few minutes before it ends.
 */
object Auth {
    /** Refresh this long before the access token expires. */
    const val REFRESH_EARLY_MS = 5 * 60 * 1000L

    /** A fresh random nonce, 32 bytes in base64url. */
    fun newNonce(random: SecureRandom = SecureRandom()): String {
        val bytes = ByteArray(32).also(random::nextBytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    /** What Google's sign-in gets: the SHA-256 of the raw nonce, in lowercase hex. */
    fun hashedNonce(raw: String): String =
        MessageDigest.getInstance("SHA-256").digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }

    /** A request to Supabase Auth: where and with what JSON body. */
    data class Call(val url: String, val body: JSONObject)

    private fun base(supabaseUrl: String) = supabaseUrl.trimEnd('/')

    /** The Google ID token traded for a Supabase session, with the raw nonce. */
    fun idTokenSignIn(supabaseUrl: String, idToken: String, rawNonce: String) =
        Call("${base(supabaseUrl)}/auth/v1/token?grant_type=id_token", JSONObject().put("provider", "google").put("id_token", idToken).put("nonce", rawNonce))

    fun refresh(supabaseUrl: String, refreshToken: String) =
        Call("${base(supabaseUrl)}/auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", refreshToken))

    /** A signed-in session as kept on the phone. */
    data class Session(val accessToken: String, val refreshToken: String, val expiresAt: Long, val email: String = "", val name: String = "") {
        fun needsRefresh(now: Long) = expiresAt - now < REFRESH_EARLY_MS

        fun toJson(): JSONObject = JSONObject().put("access_token", accessToken).put("refresh_token", refreshToken).put("expires_at_ms", expiresAt).put("email", email).put("name", name)

        companion object {
            /** A session kept by [toJson], or null when it is not one. */
            fun fromJson(o: JSONObject?): Session? {
                if (o == null) return null
                val access = o.optString("access_token")
                val refresh = o.optString("refresh_token")
                if (access.isEmpty() || refresh.isEmpty()) return null
                return Session(access, refresh, o.optLong("expires_at_ms"), o.optString("email"), o.optString("name"))
            }
        }
    }

    /**
     * Supabase's answer to a sign-in or a refresh as a session. `expires_at` (seconds) wins over
     * `expires_in` when both come; `now` is the phone's clock when the answer arrived.
     */
    fun parseSession(text: String, now: Long): Session {
        val o = try { JSONObject(text) } catch (e: Exception) { throw IllegalArgumentException("Supabase Auth answered with no JSON") }
        val access = o.optString("access_token")
        val refresh = o.optString("refresh_token")
        require(access.isNotEmpty() && refresh.isNotEmpty()) { "Supabase Auth answered with no tokens" }
        val expiresAt = when {
            o.has("expires_at") -> o.getLong("expires_at") * 1000
            o.has("expires_in") -> now + o.getLong("expires_in") * 1000
            else -> now + 3600_000
        }
        val user = o.optJSONObject("user")
        val meta = user?.optJSONObject("user_metadata")
        return Session(access, refresh, expiresAt, user?.optString("email").orEmpty(), meta?.optString("full_name")?.ifEmpty { meta.optString("name") }.orEmpty())
    }

    /** A hub answer that means the session is not (or no longer) accepted, and a refresh is worth one try. */
    fun isUnauthorized(code: Int) = code == 401
}
