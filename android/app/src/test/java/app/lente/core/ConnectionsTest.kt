package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionsTest {
    private val hub = "https://example-hub.test/"

    @Test fun setupFillsTheHubAndTheTokenForEachAgent() {
        assertEquals("https://example-hub.test/mcp", Connections.mcpUrl(hub))
        assertEquals("claude mcp add --transport http -s user lente https://example-hub.test/mcp --header \"Authorization: Bearer T1\"", Connections.setup("claude", hub, "T1"))
        assertTrue(Connections.setup("codex", hub, "T1").contains("bearer_token_env_var = \"LENTE_TOKEN\""))
        assertTrue(Connections.setup("codex", hub, "T1").startsWith("export LENTE_TOKEN=T1"))
        assertTrue(Connections.setup("cursor", hub, "T1").contains("\"Bearer \${env:LENTE_TOKEN}\""))
        assertTrue(Connections.setup("muse", hub, "T1").contains("\"type\": \"http\""))
        assertEquals("LENTE_TOKEN=T1 node scripts/agent-bridge.ts", Connections.setup(Connections.BRIDGE, hub, "T1"))
    }

    @Test fun theBridgeAlwaysRunsJobsAndOthersReadOrWriteTasks() {
        assertEquals("bridge", Connections.access(Connections.BRIDGE, "read"))
        assertEquals("tasks", Connections.access("claude", "tasks"))
        assertEquals("read", Connections.access("muse", "anything"))
    }

    @Test fun jobsParseWithTheirStage() {
        val json = """{"jobs":[{"id":"j1","agent":"claude","agentName":"Claude Code","instruction":"Actualizar el README","stage":"pending","createdAt":5},{"id":"j2","agentName":"Codex","instruction":"Correr los tests","stage":"done","createdAt":3,"finishedAt":9,"summary":"Todo verde"},{"id":""}]}"""
        val jobs = Connections.jobs(json)
        assertEquals(listOf("j1", "j2"), jobs.map { it.id })
        assertEquals("Todo verde", jobs[1].summary)
        assertEquals(9L, jobs[1].finishedAt)
        assertEquals(1, Connections.waiting(jobs))
        assertEquals("Por aprobar", Connections.stageLabel("pending"))
        assertEquals("Hecho", Connections.stageLabel("done"))
    }

    @Test fun connectedOnceTheNewTokensAgentIsSeen() {
        val made = 1_000_000L
        val unseen = Account.Device("d1", "mcp", "Claude Code", made, null, false)
        assertFalse(Connections.connected(listOf(unseen), "Claude Code", made))
        assertTrue(Connections.connected(listOf(unseen.copy(lastSeenAt = made + 5)), "Claude Code", made))
        assertFalse(Connections.connected(listOf(unseen.copy(lastSeenAt = made + 5, revoked = true)), "Claude Code", made))
        assertFalse(Connections.connected(listOf(unseen.copy(lastSeenAt = made + 5)), "Codex", made))
    }

    @Test fun aNewTokenReplacesOnlyTheSameAgentsUnusedOnes() {
        val d = { id: String, label: String, at: Long, seen: Long? -> Account.Device(id, "mcp", label, at, seen, false) }
        val list = listOf(d("old", "Claude Code", 1, null), d("used", "Claude Code", 2, 5), d("new", "Claude Code", 3, null), d("other", "Codex", 1, null))
        assertEquals(listOf("old"), Connections.unusedToReplace(list, "Claude Code").map { it.id })
        assertEquals(emptyList<String>(), Connections.unusedToReplace(list, "Codex").map { it.id })
    }

    @Test fun madeOnSaysTodayYesterdayOrTheDate() {
        val zone = java.time.ZoneId.of("America/Bogota")
        val at = { d: Int, h: Int -> java.time.ZonedDateTime.of(2026, 11, d, h, 39, 0, 0, zone).toInstant().toEpochMilli() }
        val now = at(3, 12)
        assertEquals("hoy 00:39", Connections.madeOn(at(3, 0), now, zone))
        assertEquals("ayer 12:39", Connections.madeOn(at(2, 12), now, zone))
        assertEquals("1 nov", Connections.madeOn(at(1, 12), now, zone))
    }
}
