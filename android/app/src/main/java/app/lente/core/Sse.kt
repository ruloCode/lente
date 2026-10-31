package app.lente.core

/**
 * Server-sent events parser: feed it text as it arrives, get back the `data` of each complete
 * event. Comments (`: keep-alive`) and other fields are skipped; multi-line data is joined with \n.
 */
class SseParser {
    private val buffer = StringBuilder()

    fun push(chunk: String): List<String> {
        buffer.append(chunk.replace("\r\n", "\n"))
        val events = mutableListOf<String>()
        while (true) {
            val end = buffer.indexOf("\n\n")
            if (end < 0) break
            val block = buffer.substring(0, end)
            buffer.delete(0, end + 2)
            val data = block.split('\n').filter { it.startsWith("data:") }.map { it.removePrefix("data:").removePrefix(" ") }
            if (data.isNotEmpty()) events += data.joinToString("\n")
        }
        return events
    }
}
