package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** ship-hackathon 3.1: the 428 `needsTerms` gate and the screen the app opens on. */
class TermsTest {
    private val refused = """{"needsTerms":true,"version":"preview-2026-11-04","message":"Antes de seguir, lee y acepta los términos de la prueba.","links":{"terms":"/terminos","privacy":"/privacidad"}}"""

    @Test fun a428WithNeedsTermsFromAnyDataRouteOpensTheScreenWithItsVersion() {
        val g = Terms.answered(TermsGate(), 428, refused)
        assertTrue(g.needed)
        assertEquals("preview-2026-11-04", g.version)
        assertEquals("""{"version":"preview-2026-11-04"}""", Terms.acceptBody(g).toString())
    }

    @Test fun otherAnswersChangeNothing() {
        val g = TermsGate()
        assertEquals(g, Terms.answered(g, 200, """{"needsTerms":true}"""))
        assertEquals(g, Terms.answered(g, 428, "not json"))
        assertEquals(g, Terms.answered(g, 428, """{"error":"precondition"}"""))
        assertEquals(g, Terms.answered(g, 401, refused))
        assertEquals(g, Terms.answered(g, 0, ""))
        // Once open, an unrelated answer does not close it.
        val open = Terms.answered(g, 428, refused)
        assertEquals(open, Terms.answered(open, 200, "{}"))
    }

    @Test fun withNoVersionAcceptoSendsAnEmptyBody() {
        val g = Terms.answered(TermsGate(), 428, """{"needsTerms":true}""")
        assertTrue(g.needed)
        assertNull(g.version)
        assertEquals("{}", Terms.acceptBody(g).toString())
    }

    @Test fun acceptedClosesTheScreen() {
        val g = Terms.accepting(Terms.answered(TermsGate(), 428, refused))
        assertTrue(g.accepting)
        val done = Terms.accepted(g, 200, """{"ok":true,"version":"preview-2026-11-04","acceptedAt":1}""")
        assertFalse(done.needed)
        assertFalse(done.accepting)
        assertNull(done.error)
    }

    @Test fun aNewerVersionKeepsTheScreenWithTheNewOne() {
        val g = Terms.accepting(Terms.answered(TermsGate(), 428, refused))
        val again = Terms.accepted(g, 409, """{"needsTerms":true,"version":"preview-2026-11-10"}""")
        assertTrue(again.needed)
        assertEquals("preview-2026-11-10", again.version)
        assertEquals(Terms.CHANGED, again.error)
        assertFalse(again.accepting)
    }

    @Test fun aFailedAcceptSaysWhy() {
        val g = Terms.accepting(Terms.answered(TermsGate(), 428, refused))
        assertEquals("No pudimos guardar tu respuesta.", Terms.accepted(g, 503, """{"ok":false,"message":"No pudimos guardar tu respuesta."}""").error)
        val offline = Terms.accepted(g, 0, "timeout")
        assertEquals(Terms.COULD_NOT_ACCEPT, offline.error)
        assertTrue(offline.needed)
    }

    @Test fun theHubsSummaryReplacesTheBuiltInOne() {
        val g = Terms.view(TermsGate(), """{"version":"v2","needsTerms":true,"summary":{"es":["Uno.","Dos."],"en":["One."]}}""")
        assertEquals(listOf("Uno.", "Dos."), g.summary)
        assertEquals("v2", g.version)
        assertEquals(Terms.SUMMARY, Terms.view(TermsGate(), "{}").summary)
        assertEquals(Terms.SUMMARY, Terms.view(TermsGate(), "<html>").summary)
        assertFalse(Terms.signedOut(Terms.answered(TermsGate(), 428, refused)).needed)
    }

    private val cloud = "https://lente.example.modal.run"

    @Test fun aFreshInstallOpensOnSignInAgainstTheCloudHubNeverPairing() {
        assertEquals(Gate.SignIn, Opening.gate(configured = true, signedIn = false, hub = null, cloudHub = cloud, welcomed = false, connected = false, terms = false))
        // Signed out later on the cloud hub: back to sign-in, not to pairing.
        assertEquals(Gate.SignIn, Opening.gate(true, false, "$cloud/", cloud, welcomed = true, connected = true, terms = false))
        // Signed in (which marks the intro done): straight in; the intro only when replayed from Ajustes.
        assertEquals(Gate.App, Opening.gate(true, true, cloud, cloud, welcomed = true, connected = false, terms = false))
        assertEquals(Gate.Intro, Opening.gate(true, true, cloud, cloud, welcomed = false, connected = true, terms = false))
        assertEquals(Gate.Terms, Opening.gate(true, true, cloud, cloud, welcomed = true, connected = true, terms = true))
    }

    @Test fun aLaptopHubOrABuildWithoutSignInKeepsTheIntro() {
        assertEquals(Gate.Intro, Opening.gate(configured = false, signedIn = false, hub = null, cloudHub = cloud, welcomed = false, connected = false, terms = false))
        assertEquals(Gate.Intro, Opening.gate(true, false, "http://192.168.1.20:8080", cloud, welcomed = false, connected = true, terms = false))
        assertEquals(Gate.App, Opening.gate(true, false, "http://192.168.1.20:8080", cloud, welcomed = true, connected = true, terms = false))
        assertEquals(Gate.Intro, Opening.gate(false, false, "http://192.168.1.20:8080", cloud, welcomed = true, connected = false, terms = false))
    }
}
