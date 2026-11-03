package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AccountTest {
    @Test fun infoFromTheHub() {
        val info = Account.info("""{"email":"owner@example.com","spend":{"month":"2026-11","usd":1.33,"capUsd":10}}""")
        assertEquals(Account.Info("owner@example.com", "2026-11", 1.33, 10.0), info)
        assertNull(Account.info("""{"email":null,"spend":{"month":"2026-11","usd":0,"capUsd":null}}""").capUsd)
        assertEquals("", Account.info("""{"email":null,"spend":{}}""").email)
    }

    @Test fun spendInWords() {
        assertEquals("US$ 1,33 de US$ 10,00 este mes", Account.spendLine(Account.Info("", "2026-11", 1.33, 10.0)))
        assertEquals("US$ 0,00 este mes", Account.spendLine(Account.Info("", "2026-11", 0.0, null)))
        assertEquals(0.5f, Account.spendShare(Account.Info("", "", 5.0, 10.0)))
        assertEquals(1f, Account.spendShare(Account.Info("", "", 12.0, 10.0)))
        assertNull(Account.spendShare(Account.Info("", "", 5.0, null)))
    }

    @Test fun devicesFromTheHub() {
        val list = Account.devices("""{"devices":[{"id":"d1","kind":"clip","label":"Clip gafas","createdAt":5,"lastSeenAt":null,"revoked":false},{"id":"d2","kind":"clip","label":"Viejo","createdAt":1,"lastSeenAt":3,"revoked":true}]}""")
        assertEquals(listOf("d1", "d2"), list.map { it.id })
        assertNull(list[0].lastSeenAt)
        assertEquals(true, list[1].revoked)
        assertEquals(emptyList<Account.Device>(), Account.devices("{}"))
    }

    @Test fun agentTokens() {
        assertEquals(listOf("read"), Account.scopesFor("read"))
        assertEquals(listOf("read", "tasks.write"), Account.scopesFor("tasks"))
        assertEquals(listOf("agent.run"), Account.scopesFor("bridge"))
        val list = Account.devices("""{"devices":[{"id":"a","kind":"mcp","label":"Claude Code","scopes":["read","tasks.write"],"createdAt":5,"lastSeenAt":null,"revoked":false},{"id":"b","kind":"mcp","label":"Puente","scopes":["agent.run"],"createdAt":5,"lastSeenAt":null,"revoked":false},{"id":"c","kind":"clip","label":"Clip","createdAt":1,"lastSeenAt":null,"revoked":false}]}""")
        assertEquals(listOf("read", "tasks.write"), list[0].scopes)
        assertEquals(listOf("Agente · Leer y tareas", "Puente de agentes", "Clip"), list.map(Account::kindLine))
        assertEquals("Que lo haga un agente", Copy.TOOL["run_agent"])
    }

    @Test fun lastSeenInWords() {
        val now = 10L * 24 * 3600_000
        assertEquals("Nunca conectado", Account.lastSeen(null, now))
        assertEquals("Hace un momento", Account.lastSeen(now - 20_000, now))
        assertEquals("Hace 5 min", Account.lastSeen(now - 5 * 60_000, now))
        assertEquals("Hace 3 h", Account.lastSeen(now - 3 * 3600_000, now))
        assertEquals("Hace 1 día", Account.lastSeen(now - 25 * 3600_000, now))
        assertEquals("Hace 4 días", Account.lastSeen(now - 4 * 24 * 3600_000, now))
    }

    @Test fun theNewTokenIsReadOnce() {
        assertEquals("abc", Account.createdToken("""{"id":"d","token":"abc"}"""))
    }
}
