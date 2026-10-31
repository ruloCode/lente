package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HubAddressTest {
    @Test fun addsSchemeAndPort() {
        assertEquals("http://192.168.1.20:8080", HubAddress.normalize("192.168.1.20"))
        assertEquals("http://192.168.1.20:8080", HubAddress.normalize(" http://192.168.1.20:8080/ "))
        assertEquals("http://mac.local:9000", HubAddress.normalize("mac.local:9000"))
        assertEquals("https://lente.example.com", HubAddress.normalize("https://lente.example.com"))
    }

    @Test fun refusesWhatCannotBeAHub() {
        assertNull(HubAddress.normalize(""))
        assertNull(HubAddress.normalize("not a host"))
        assertNull(HubAddress.normalize("ftp://x"))
    }

    @Test fun deviceSocketFollowsTheScheme() {
        assertEquals("ws://10.0.2.2:8080/device", HubAddress.deviceSocket("http://10.0.2.2:8080"))
        assertEquals("wss://lente.example.com/device", HubAddress.deviceSocket("https://lente.example.com"))
    }

    @Test fun onlyPrivateAddressesAreLocal() {
        assertTrue(HubAddress.isLocal("http://192.168.0.4:8080"))
        assertTrue(HubAddress.isLocal("http://10.0.2.2:8080"))
        assertTrue(HubAddress.isLocal("http://172.20.1.1:8080"))
        assertTrue(HubAddress.isLocal("http://localhost:8080"))
        assertFalse(HubAddress.isLocal("http://8.8.8.8:8080"))
        assertFalse(HubAddress.isLocal("https://lente.example.com"))
    }
}
