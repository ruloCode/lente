package app.lente.core

import org.json.JSONArray
import org.json.JSONObject

/** An agent Lente can be connected to: its name, a two-letter mark, where its setup goes, and whether that setup was run against a hub. */
data class AgentKind(val key: String, val name: String, val mark: String, val where: String, val tested: Boolean)

/** One agent job as the hub lists it (`GET /agent/jobs`). */
data class JobItem(
    val id: String,
    val agentName: String,
    val instruction: String,
    val stage: String,
    val createdAt: Long,
    val finishedAt: Long?,
    val summary: String?,
)

/**
 * Conexiones (add-home-dock): the agents that can use what Lente knows, over MCP at `<hub>/mcp`, and the
 * bridge that runs approved work on the user's computer. The setup lines come from docs/kb/agents.md;
 * Claude Code's and the bridge's were run against a hub, the others come from each agent's docs. Pure.
 */
object Connections {
    const val BRIDGE = "bridge"

    val AGENTS = listOf(
        AgentKind("claude", "Claude Code", "CC", "Un comando en la terminal", tested = true),
        AgentKind("codex", "Codex", "CX", "En ~/.codex/config.toml", tested = false),
        AgentKind("cursor", "Cursor", "CU", "En ~/.cursor/mcp.json", tested = false),
        AgentKind("muse", "Muse Code", "MC", "En ~/.config/muse/settings.json", tested = false),
        AgentKind("mcp", "Otro agente (MCP)", "··", "Cualquier agente que hable MCP", tested = false),
        AgentKind(BRIDGE, "Puente de trabajos", "PT", "Para que hagan trabajo en tu computadora", tested = true),
    )

    /** The token's access for an agent: the bridge always runs jobs; the others read, or read and write tasks. */
    fun access(kind: String, choice: String): String = if (kind == BRIDGE) "bridge" else if (choice == "tasks") "tasks" else "read"

    /** The hub's MCP endpoint. */
    fun mcpUrl(hub: String): String = hub.trim().trimEnd('/') + "/mcp"

    /** What to paste, for each agent, with the hub's address and the token filled in. */
    fun setup(kind: String, hub: String, token: String): String {
        val url = mcpUrl(hub)
        return when (kind) {
            "claude" -> "claude mcp add --transport http -s user lente $url --header \"Authorization: Bearer $token\""
            "codex" -> "export LENTE_TOKEN=$token\n\n# ~/.codex/config.toml\n[mcp_servers.lente]\nurl = \"$url\"\nbearer_token_env_var = \"LENTE_TOKEN\""
            "cursor" -> "export LENTE_TOKEN=$token\n\n// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"lente\": {\n      \"url\": \"$url\",\n      \"headers\": { \"Authorization\": \"Bearer \${env:LENTE_TOKEN}\" }\n    }\n  }\n}"
            "muse" -> "// ~/.config/muse/settings.json\n{\n  \"mcpServers\": {\n    \"lente\": {\n      \"type\": \"http\",\n      \"url\": \"$url\",\n      \"headers\": { \"Authorization\": \"Bearer $token\" }\n    }\n  }\n}"
            BRIDGE -> "LENTE_TOKEN=$token node scripts/agent-bridge.ts"
            else -> "URL: $url\nHeader: Authorization: Bearer $token"
        }
    }

    /** `GET /agent/jobs` as rows, newest first as the hub sends them. */
    fun jobs(text: String): List<JobItem> {
        val arr = JSONObject(text).optJSONArray("jobs") ?: JSONArray()
        return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.mapNotNull { o ->
            val id = o.optString("id").ifBlank { return@mapNotNull null }
            JobItem(
                id = id,
                agentName = o.optString("agentName").ifBlank { "Agente" },
                instruction = o.optString("instruction"),
                stage = o.optString("stage").ifBlank { "pending" },
                createdAt = o.optLong("createdAt"),
                finishedAt = if (o.has("finishedAt") && !o.isNull("finishedAt")) o.optLong("finishedAt") else null,
                summary = o.optString("summary").ifBlank { null },
            )
        }
    }

    /** A job's stage in Spanish. */
    fun stageLabel(stage: String): String = when (stage) {
        "pending" -> "Por aprobar"
        "rejected" -> "Rechazado"
        "queued" -> "En cola"
        "running" -> "Trabajando"
        "done" -> "Hecho"
        "failed" -> "Falló"
        else -> stage
    }

    /** Jobs waiting for the user's approval, for the menu's badge. */
    fun waiting(jobs: List<JobItem>): Int = jobs.count { it.stage == "pending" }

    /**
     * Tokens a new one replaces: the same agent's live tokens never used, all but the newest (the one just
     * made). A token that was used is never touched.
     */
    fun unusedToReplace(devices: List<Account.Device>, label: String): List<Account.Device> {
        val unused = devices.filter { it.kind == "mcp" && it.label == label && !it.revoked && it.lastSeenAt == null }
        val newest = unused.maxByOrNull { it.createdAt } ?: return emptyList()
        return unused.filter { it.id != newest.id }
    }

    /** When a token was made, short: «hoy 12:39», «ayer 09:10» or «2 nov». */
    fun madeOn(at: Long, now: Long, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): String {
        val then = java.time.Instant.ofEpochMilli(at).atZone(zone)
        val today = java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val es = java.util.Locale.forLanguageTag("es")
        val time = java.time.format.DateTimeFormatter.ofPattern("HH:mm", es).format(then)
        return when (then.toLocalDate()) {
            today -> "hoy $time"
            today.minusDays(1) -> "ayer $time"
            else -> java.time.format.DateTimeFormatter.ofPattern("d MMM", es).format(then).replace(".", "")
        }
    }

    /** The agent a new token was made for has connected: a device with that label was seen after the token was made. */
    fun connected(devices: List<Account.Device>, label: String, since: Long): Boolean =
        devices.any { it.kind == "mcp" && it.label == label && !it.revoked && it.createdAt >= since - 60_000 && it.lastSeenAt != null }
}
