package app.lente.core

/**
 * Server-sent events parser: feed it text as it arrives, get back the `data` of each complete
 * event. Comments (`: keep-alive`) and other fields are skipped; multi-line data is joined with \n.
 */
class SseParser {
    private val buffer = StringBuilder()

    fun push(chunk: String): List<String> = pushNamed(chunk).map { it.second }

    /** Each complete event as its `event:` name (null when unnamed) and its data. */
    fun pushNamed(chunk: String): List<Pair<String?, String>> {
        buffer.append(chunk.replace("\r\n", "\n"))
        val events = mutableListOf<Pair<String?, String>>()
        while (true) {
            val end = buffer.indexOf("\n\n")
            if (end < 0) break
            val block = buffer.substring(0, end)
            buffer.delete(0, end + 2)
            val lines = block.split('\n')
            val name = lines.firstOrNull { it.startsWith("event:") }?.removePrefix("event:")?.trim()
            val data = lines.filter { it.startsWith("data:") }.map { it.removePrefix("data:").removePrefix(" ") }
            if (data.isNotEmpty()) events += name to data.joinToString("\n")
        }
        return events
    }
}
