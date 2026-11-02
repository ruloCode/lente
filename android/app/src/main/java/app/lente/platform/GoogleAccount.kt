package app.lente.platform

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import app.lente.BuildConfig
import app.lente.core.Auth
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Why signing in did not end with a session, in words for the wearer. */
class SignInFailed(message: String) : Exception(message)

/**
 * Signing in with Google and keeping the session fresh (add-accounts 7.1). Google's account picker
 * (Credential Manager, with the Web client ID and the hashed nonce) gives an ID token; Supabase Auth
 * trades it, with the raw nonce, for an access and refresh token, kept sealed by [SecureSession].
 * [accessToken] refreshes once before expiry; [refreshAfter401] is the one retry a 401 gets.
 */
class GoogleAccount(private val store: SecureSession) {
    private val http = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()
    private val json = "application/json".toMediaType()
    private val lock = Mutex()
    @Volatile private var session: Auth.Session? = store.read()

    val signedIn get() = session != null
    val email get() = session?.email.orEmpty()
    val name get() = session?.name.orEmpty()

    /** Whether this build knows its Supabase project and Google client (set in gradle.properties). */
    val configured get() = BuildConfig.SUPABASE_URL.isNotEmpty() && BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotEmpty() && BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotEmpty()

    /** Shows Google's account picker and signs in; throws [SignInFailed] with a message to show. */
    suspend fun signIn(activity: Activity): Auth.Session {
        if (!configured) throw SignInFailed("Esta versión de la app no tiene configurado el inicio de sesión.")
        val nonce = Auth.newNonce()
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false)
            .setNonce(Auth.hashedNonce(nonce))
            .build()
        val credential = try {
            CredentialManager.create(activity).getCredential(activity, GetCredentialRequest.Builder().addCredentialOption(option).build()).credential
        } catch (e: GetCredentialCancellationException) {
            throw SignInFailed("Cancelaste el inicio de sesión.")
        } catch (e: GetCredentialException) {
            throw SignInFailed("Google no pudo iniciar sesión (${e.type.substringAfterLast('.')}).")
        }
        if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) throw SignInFailed("Google no devolvió una cuenta.")
        val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
        return lock.withLock { exchange(Auth.idTokenSignIn(BuildConfig.SUPABASE_URL, idToken, nonce)).also(::keep) }
    }

    /** A current access token, refreshed first when it is about to expire; null when signed out. */
    suspend fun accessToken(now: Long = System.currentTimeMillis()): String? = lock.withLock {
        val s = session ?: return@withLock null
        if (!s.needsRefresh(now)) return@withLock s.accessToken
        refreshLocked(s)?.accessToken
    }

    /** After a 401: refresh once; null means back to sign-in. */
    suspend fun refreshAfter401(): String? = lock.withLock { session?.let { refreshLocked(it) }?.accessToken }

    fun signOut() {
        session = null
        store.clear()
    }

    private suspend fun refreshLocked(s: Auth.Session): Auth.Session? = try {
        exchange(Auth.refresh(BuildConfig.SUPABASE_URL, s.refreshToken)).also(::keep)
    } catch (e: SignInFailed) {
        signOut()
        null
    }

    private fun keep(s: Auth.Session) {
        session = s
        store.write(s)
    }

    private suspend fun exchange(call: Auth.Call): Auth.Session = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(call.url).header("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY).post(call.body.toString().toRequestBody(json)).build()
        try {
            http.newCall(req).execute().use { res ->
                val text = res.body.string()
                if (!res.isSuccessful) throw SignInFailed(if (res.code == 400 || res.code == 401) "Tu sesión venció. Vuelve a entrar con Google." else "Supabase respondió ${res.code}.")
                Auth.parseSession(text, System.currentTimeMillis())
            }
        } catch (e: IOException) {
            throw SignInFailed("Sin conexión para iniciar sesión.")
        } catch (e: IllegalArgumentException) {
            throw SignInFailed("La respuesta de inicio de sesión no se pudo leer.")
        }
    }
}
