package app.lente.platform

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.lente.core.Auth
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The signed-in session on the phone (add-accounts 7.1): sealed with AES-GCM under a key that lives in
 * the Android Keystore and never leaves it, then kept in private preferences. A backup or a copy of
 * the app's files holds only ciphertext.
 */
class SecureSession(context: Context) {
    private val sp = context.getSharedPreferences("lente_auth", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        gen.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return gen.generateKey()
    }

    fun read(): Auth.Session? {
        val sealed = sp.getString(PREF, null) ?: return null
        return try {
            val bytes = Base64.decode(sealed, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
            Auth.Session.fromJson(JSONObject(String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES))))
        } catch (e: Exception) {
            // A key reset (new phone, cleared credentials) makes the old session unreadable: sign in again.
            clear()
            null
        }
    }

    fun write(session: Auth.Session) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(session.toJson().toString().toByteArray())
        sp.edit().putString(PREF, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply()
    }

    fun clear() = sp.edit().remove(PREF).apply()

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "lente-session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val PREF = "session"
    }
}
