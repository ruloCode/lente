package app.lente.core

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * The account screen's data (add-accounts 7.3), read from the hub: `GET /account` (who and this
 * month's spend against the cap) and `GET /devices` (the user's clips with when each was last seen).
 * Pure, with its words in Spanish for the wearer.
 */
object Account {
    data class Info(val email: String, val month: String, val spentUsd: Double, val capUsd: Double?)

    data class Device(val id: String, val kind: String, val label: String, val createdAt: Long, val lastSeenAt: Long?, val revoked: Boolean, val scopes: List<String> = emptyList())

    /**
     * What an agent token may do (add-agent-bridge), as the three choices the screen offers: read the
     * memory and tasks, also write tasks, or run approved jobs (the bridge on the wearer's computer).
     */
    val AGENT_ACCESS = listOf("read" to "Leer", "tasks" to "Leer y tareas", "bridge" to "Puente")

    fun scopesFor(access: String): List<String> = when (access) {
        "tasks" -> listOf("read", "tasks.write")
        "bridge" -> listOf("agent.run")
        else -> listOf("read")
    }

    /** "Agente · Leer y tareas", "Puente", "Clip": what a device is, for its row. */
    fun kindLine(d: Device): String = when {
        d.kind != "mcp" -> if (d.kind == "desktop") "Computadora" else "Clip"
        "agent.run" in d.scopes -> "Puente de agentes"
        "tasks.write" in d.scopes -> "Agente · Leer y tareas"
        else -> "Agente · Leer"
    }

    fun info(text: String): Info {
        val o = JSONObject(text)
        val spend = o.optJSONObject("spend") ?: JSONObject()
        return Info(o.optString("email").takeUnless { o.isNull("email") }.orEmpty(), spend.optString("month"), spend.optDouble("usd", 0.0), if (spend.isNull("capUsd") || !spend.has("capUsd")) null else spend.getDouble("capUsd"))
    }

    fun devices(text: String): List<Device> {
        val list = JSONObject(text).optJSONArray("devices") ?: JSONArray()
        return (0 until list.length()).map { i ->
            val d = list.getJSONObject(i)
            val scopes = d.optJSONArray("scopes") ?: JSONArray()
            Device(d.optString("id"), d.optString("kind"), d.optString("label"), d.optLong("createdAt"), if (d.isNull("lastSeenAt")) null else d.optLong("lastSeenAt"), d.optBoolean("revoked"), (0 until scopes.length()).map { scopes.optString(it) })
        }
    }

    /** "US$ 1,33 de US$ 10,00 este mes", or without a cap "US$ 1,33 este mes". */
    fun spendLine(info: Info): String {
        val money = { usd: Double -> "US$ " + String.format(Locale.forLanguageTag("es-CO"), "%.2f", usd) }
        return if (info.capUsd == null) "${money(info.spentUsd)} este mes" else "${money(info.spentUsd)} de ${money(info.capUsd)} este mes"
    }

    /** How full the month is, 0 to 1, for a bar; null without a cap. */
    fun spendShare(info: Info): Float? = info.capUsd?.takeIf { it > 0 }?.let { (info.spentUsd / it).coerceIn(0.0, 1.0).toFloat() }

    /** "Nunca", "Hace un momento", "Hace 5 min", "Hace 3 h", "Hace 2 días". */
    fun lastSeen(at: Long?, now: Long): String {
        if (at == null) return "Nunca conectado"
        val min = (now - at).coerceAtLeast(0) / 60_000
        return when {
            min < 1 -> "Hace un momento"
            min < 60 -> "Hace $min min"
            min < 24 * 60 -> "Hace ${min / 60} h"
            else -> "Hace ${min / (24 * 60)} ${if (min / (24 * 60) == 1L) "día" else "días"}"
        }
    }

    /** The clip's token from `POST /devices`, shown once. */
    fun createdToken(text: String): String = JSONObject(text).optString("token")
}
