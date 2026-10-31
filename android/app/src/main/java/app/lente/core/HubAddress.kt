package app.lente.core

import java.net.URI

/** What the wearer types for the hub, made into a base URL: `192.168.1.20` → `http://192.168.1.20:8080`. */
object HubAddress {
    const val DEFAULT_PORT = 8080

    /** The base URL without a trailing slash, or null when the text cannot be a hub address. */
    fun normalize(input: String): String? {
        var text = input.trim().trimEnd('/')
        if (text.isEmpty() || text.any { it.isWhitespace() }) return null
        if (!text.contains("://")) text = "http://$text"
        val uri = runCatching { URI(text) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        val host = uri.host ?: return null
        val port = when {
            uri.port != -1 -> ":${uri.port}"
            scheme == "http" -> ":$DEFAULT_PORT"
            else -> ""
        }
        val hostPart = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
        return "$scheme://$hostPart$port"
    }

    /** The device WebSocket of a hub: same host, `ws` or `wss`, path `/device`. */
    fun deviceSocket(base: String): String = base.replaceFirst(Regex("^http"), "ws") + "/device"

    /** Private, loopback or emulator-host addresses: the only ones the app reaches over plain HTTP. */
    fun isLocal(base: String): Boolean {
        val host = runCatching { URI(base).host }.getOrNull()?.trim('[', ']') ?: return false
        if (host == "localhost" || host.endsWith(".local")) return true
        val parts = host.split('.').mapNotNull { it.toIntOrNull() }
        if (parts.size != 4) return false
        val (a, b) = parts
        return a == 10 || a == 127 || (a == 192 && b == 168) || (a == 172 && b in 16..31) || (a == 169 && b == 254) || (a == 100 && b in 64..127)
    }
}
