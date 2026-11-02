package app.lente.core

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthRetryTest {
    /** A hub that accepts only the given tokens; records what each call carried. */
    private class Hub(private vararg val valid: String) {
        val seen = mutableListOf<String?>()
        suspend fun call(bearer: String?): Int = (if (bearer == null || bearer in valid) 200 else 401).also { seen += bearer }
    }

    @Test fun aValidTokenGoesOutOnce() = runBlocking {
        val hub = Hub("t1")
        var refreshed = 0
        assertEquals(200, AuthRetry.run({ "t1" }, { refreshed++; "t2" }, { it }, hub::call))
        assertEquals(listOf<String?>("t1"), hub.seen)
        assertEquals(0, refreshed)
    }

    @Test fun a401RefreshesOnceAndRepeatsTheCall() = runBlocking {
        val hub = Hub("t2")
        var signedOut = false
        assertEquals(200, AuthRetry.run({ "expired" }, { "t2" }, { it }, hub::call, { signedOut = true }))
        assertEquals(listOf<String?>("expired", "t2"), hub.seen)
        assertFalse(signedOut)
    }

    @Test fun aFailedRefreshOrASecond401SignsOut() = runBlocking {
        var signedOut = 0
        val noRefresh = Hub()
        assertEquals(401, AuthRetry.run({ "expired" }, { null }, { it }, noRefresh::call, { signedOut++ }))
        assertEquals(1, noRefresh.seen.size)
        val stillRefused = Hub()
        assertEquals(401, AuthRetry.run({ "expired" }, { "also-bad" }, { it }, stillRefused::call, { signedOut++ }))
        assertEquals(listOf<String?>("expired", "also-bad"), stillRefused.seen)
        assertEquals(2, signedOut)
    }

    @Test fun withoutASessionTheCallIsAsBefore() = runBlocking {
        val hub = Hub()
        var refreshed = 0
        assertEquals(200, AuthRetry.run({ null }, { refreshed++; "t" }, { it }, hub::call))
        assertEquals(listOf<String?>(null), hub.seen)
        assertEquals(0, refreshed)
    }

    @Test fun theBearerHeader() {
        assertEquals("Authorization" to "Bearer abc", AuthRetry.header("abc"))
        assertNull(AuthRetry.header(null))
        assertTrue(AuthRetry.header("x")!!.second.startsWith("Bearer "))
    }
}
