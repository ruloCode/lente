package app.lente.core

/** Lente's own voice (add-sight-mode): which Spanish the engine speaks and how fast. Pure. */
object SpeechVoice {
    /** Colombian Spanish first (the wearers are in Bogotá), then the Americas, then Spain. */
    val SPANISH = listOf("es-CO", "es-US", "es-ES")
    const val DEFAULT_RATE = 1.05f
    const val MIN_RATE = 0.8f
    const val MAX_RATE = 2.0f

    /** In range and on a 0.05 step, so the slider moves smoothly and still lands on round values. */
    fun rate(r: Float): Float = if (r.isNaN()) DEFAULT_RATE else (Math.round(r.coerceIn(MIN_RATE, MAX_RATE) * 20f) / 20f)

    /** «1,05×» for the slider. */
    fun rateLabel(r: Float): String = String.format(java.util.Locale.forLanguageTag("es-CO"), "%.2f×", rate(r))

    /** The engine's locale tags ("es-CO", "es_US"…) to the one to speak Spanish in: the first preferred it has, any Spanish, else es-ES. */
    fun spanish(available: Collection<String>): String {
        val tags = available.map { it.replace('_', '-') }
        SPANISH.firstOrNull { p -> tags.any { it.equals(p, ignoreCase = true) } }?.let { return it }
        return tags.firstOrNull { it.lowercase().let { t -> t == "es" || t.startsWith("es-") } } ?: "es-ES"
    }

    /**
     * Ver's fallback voice: a female Spanish one by the engine's voice names (name to locale tag), in the
     * order of [SPANISH], or null to keep the engine's choice. Engines say it in the name: "female" (Google's
     * older "es-us-x-sfb#female_1-local"), "esf" ("es-us-x-esf-local"), Samsung's "SMTf00".
     */
    fun female(voices: Map<String, String>): String? {
        val women = voices.filter { (name, _) -> isFemale(name) }
        for (p in SPANISH) women.entries.firstOrNull { it.value.replace('_', '-').equals(p, ignoreCase = true) }?.let { return it.key }
        return women.entries.firstOrNull { it.value.lowercase().let { t -> t == "es" || t.startsWith("es-") || t.startsWith("es_") } }?.key
    }

    fun isFemale(name: String): Boolean {
        val n = name.lowercase()
        return "female" in n || Regex("(^|[^a-z])esf([^a-z]|$)").containsMatchIn(n) || Regex("smtf\\d").containsMatchIn(n)
    }
}
