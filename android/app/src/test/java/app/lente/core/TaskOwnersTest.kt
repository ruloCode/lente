package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class TaskOwnersTest {
    private fun t(id: String, who: String, done: Boolean = false, other: String? = null) = Task(id, "T$id", null, "m", "", done, who, other, "")

    @Test fun groupsByOwnerInOrderWithoutDoneOrEmptyGroups() {
        val g = TaskOwners.groups(listOf(t("1", "other", other = "Ana"), t("2", "me"), t("3", "lente"), t("4", "me", done = true), t("5", "raro")))
        assertEquals(listOf("me", "lente", "other"), g.map { it.first })
        assertEquals(listOf("2", "5"), g[0].second.map { it.id })
        assertEquals(listOf("me"), TaskOwners.groups(listOf(t("1", "me"))).map { it.first })
    }

    @Test fun wordsForOwners() {
        assertEquals("Te toca", TaskOwners.heading("me"))
        assertEquals("Lente puede hacerlo", TaskOwners.heading("lente"))
        assertEquals("Esperando a otros", TaskOwners.heading("other"))
        assertEquals("Ana", TaskOwners.tag(t("1", "other", other = "Ana")))
        assertEquals("Otro", TaskOwners.tag(t("1", "other")))
        assertEquals("Tú", TaskOwners.tag(t("1", "me")))
        assertEquals("lente", TaskOwners.next("me"))
        assertEquals("other", TaskOwners.next("lente"))
        assertEquals("me", TaskOwners.next("other"))
    }

    @Test fun contextLine() {
        assertEquals("Ternium · Kickoff · Para viernes", TaskOwners.context(Task("1", "x", "viernes", "m", "Kickoff", false, "me", null, "Ternium")))
        assertEquals("", TaskOwners.context(Task("1", "x", null, "", "", false)))
    }

    @Test fun parsedFromTheHubWithOwnersAndOlderHubsWithout() {
        val a = HubJson.actions(JSONObject("""{"kind":"actions","pending":[],"decided":[],"tasks":[{"id":"1","title":"x","due":null,"meetingId":"m","meetingTitle":"K","done":false,"who":"other","otherName":"Ana","projectName":"Ternium"},{"id":"2","title":"y","meetingId":"","meetingTitle":"","done":false}]}"""))
        assertEquals(listOf("other", "me"), a.tasks.map { it.who })
        assertEquals("Ana", a.tasks[0].otherName)
        assertEquals("Ternium", a.tasks[0].projectName)
    }
}
