package app.lente.platform

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetSocketAddress
import java.util.Collections

/**
 * add-accounts 7.2 on the JVM: the app's real HubClient (OkHttp) against a stand-in for a hub with
 * accounts, which accepts one bearer token and answers 401 to any other.
 */
class HubClientAuthTest {
    private lateinit var server: HttpServer
    private lateinit var base: String
    private val seen = Collections.synchronizedList(mutableListOf<String>())
    @Volatile private var valid = "fresh"

    @Before fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { ex ->
            val auth = ex.requestHeaders.getFirst("Authorization").orEmpty()
            seen += "${ex.requestMethod} ${ex.requestURI.path} $auth"
            val ok = auth == "Bearer $valid"
            if (ex.requestURI.path == "/events" && ok) {
                ex.responseHeaders.add("Content-Type", "text/event-stream")
                ex.sendResponseHeaders(200, 0)
                ex.responseBody.write("data: {\"kind\":\"spend\"}\n\n".toByteArray())
                ex.responseBody.flush()
                ex.close()
                return@createContext
            }
            ex.sendResponseHeaders(if (ok) 204 else 401, -1)
            ex.close()
        }
        server.start()
        base = "http://127.0.0.1:${server.address.port}"
    }

    @After fun stop() = server.stop(0)

    @Test fun everyCallCarriesTheBearerAndA401RefreshesOnce() = runBlocking {
        var token = "expired"
        var refreshes = 0
        val client = HubClient(base, { null }, { token }, { refreshes++; token = "fresh"; token })
        assertEquals(204, client.post("/listen/on").code)
        assertEquals(listOf("POST /listen/on Bearer expired", "POST /listen/on Bearer fresh"), seen.toList())
        assertEquals(1, refreshes)
        assertEquals(204, client.get("/facts").code)
        assertEquals("GET /facts Bearer fresh", seen.last())
        assertEquals(1, refreshes)
    }

    @Test fun aRefreshThatFailsSignsOut() = runBlocking {
        var signedOut = false
        val client = HubClient(base, { null }, { "revoked" }, { null }, { signedOut = true })
        assertEquals(401, client.post("/listen/on").code)
        assertTrue(signedOut)
        assertEquals(1, seen.size)
    }

    @Test fun theEventStreamReconnectsAfterARefreshAndOtherwiseFallsBackToSignIn() = runBlocking {
        var token = "expired"
        val client = HubClient(base, { null }, { token }, { token = "fresh"; token })
        assertEquals(Stream.Open, client.events().first { it == Stream.Open })
        assertEquals(listOf("GET /events Bearer expired", "GET /events Bearer fresh"), seen.toList())

        valid = "nothing-works"
        var signedOut = false
        val stale = HubClient(base, { null }, { "old" }, { null }, { signedOut = true })
        assertEquals(Stream.Unpaired, stale.events().first())
        assertTrue(signedOut)
    }

    @Test fun withoutAnAccountNothingChanges() = runBlocking {
        valid = "unused"
        val client = HubClient(base, { "lente_session=paired" })
        client.post("/listen/on")
        assertEquals("POST /listen/on ", seen.single())
    }
}
