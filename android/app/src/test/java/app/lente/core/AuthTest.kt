package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthTest {
    @Test fun nonceIsRandomAndGoogleGetsItsSha256InHex() {
        val a = Auth.newNonce()
        assertNotEquals(a, Auth.newNonce())
        assertEquals(43, a.length)
        // SHA-256("abc"), the standard test vector.
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Auth.hashedNonce("abc"))
    }

    @Test fun idTokenSignInSendsTheRawNonceToSupabase() {
        val call = Auth.idTokenSignIn("https://ref.supabase.co/", "id.token.jwt", "raw-nonce")
        assertEquals("https://ref.supabase.co/auth/v1/token?grant_type=id_token", call.url)
        assertEquals("google", call.body.getString("provider"))
        assertEquals("id.token.jwt", call.body.getString("id_token"))
        assertEquals("raw-nonce", call.body.getString("nonce"))
        assertEquals("https://ref.supabase.co/auth/v1/token?grant_type=refresh_token", Auth.refresh("https://ref.supabase.co", "r1").url)
    }

    @Test fun sessionFromSupabasesAnswer() {
        val now = 1_000_000L
        val s = Auth.parseSession("""{"access_token":"a","refresh_token":"r","expires_in":3600,"user":{"email":"owner@example.com","user_metadata":{"full_name":"Persona Sintética"}}}""", now)
        assertEquals(now + 3_600_000, s.expiresAt)
        assertEquals("owner@example.com", s.email)
        assertEquals("Persona Sintética", s.name)
        val withAt = Auth.parseSession("""{"access_token":"a","refresh_token":"r","expires_in":3600,"expires_at":5000}""", now)
        assertEquals(5_000_000L, withAt.expiresAt)
        assertThrows(IllegalArgumentException::class.java) { Auth.parseSession("""{"error":"invalid_grant"}""", now) }
        assertThrows(IllegalArgumentException::class.java) { Auth.parseSession("not json", now) }
    }

    @Test fun refreshFiveMinutesBeforeExpiry() {
        val s = Auth.Session("a", "r", expiresAt = 10 * 60_000L)
        assertFalse(s.needsRefresh(4 * 60_000L))
        assertTrue(s.needsRefresh(5 * 60_000L + 1))
        assertTrue(s.needsRefresh(20 * 60_000L))
    }

    @Test fun sessionRoundTripsAndRejectsHalfSessions() {
        val s = Auth.Session("a", "r", 42L, "e@x.co", "N")
        assertEquals(s, Auth.Session.fromJson(JSONObject(s.toJson().toString())))
        assertNull(Auth.Session.fromJson(JSONObject("""{"access_token":"a"}""")))
        assertNull(Auth.Session.fromJson(null))
    }

    @Test fun only401IsWorthARefresh() {
        assertTrue(Auth.isUnauthorized(401))
        assertFalse(Auth.isUnauthorized(403))
        assertFalse(Auth.isUnauthorized(500))
    }
}
