package app.lente.core

/**
 * Idiomas (add-language-coach): the tutor is a voice session with the `coach` persona. Which voice says
 * each sentence: the hub's `/tts` voice for the language, else the phone's own voice in that language,
 * else only the text with a Spanish note. Pure, so the JVM tests check the choice the speaker makes.
 * The wire is design decision 13 of the change.
 */
object Coach {
    const val PERSONA = "coach"
    const val MODE_TUTOR = "tutor"

    /** A target language: its code on the wire, its name in Spanish, the phone voice wanted and the hub's voice. */
    data class Language(val code: String, val name: String, val tag: String, val hubVoice: String, val noVoice: String)

    val PT = Language("pt", "Portugués", "pt-BR", "coach-pt", "No tengo voz en portugués en este teléfono.")

    /** The languages the record sheet offers today (the demo slice: Brazilian Portuguese). */
    val LANGUAGES = listOf(PT)

    fun language(code: String?): Language? = LANGUAGES.firstOrNull { it.code == code?.lowercase() }

    /** «Más despacio»: the slowest rate Ajustes allows. */
    const val SLOW_RATE = SpeechVoice.MIN_RATE

    const val SLOWER = "Más despacio"
    const val REPEAT = "Repetir"
    const val LOOKING = "Mirando…"
    const val LOOK = "Nombrar lo que veo"
    const val LOOK_HINT = "Toca para que Lente nombre en portugués lo que tienes al frente"

    const val LOOK_LINE = "Toca y Lente lo dice en portugués"

    fun title(lang: Language): String = "Idiomas · ${lang.name}"

    /** What TalkBack says for the phrase card and its two buttons. */
    fun phraseDescription(p: Pronounce, lang: Language): String =
        "En ${lang.name.lowercase()}: ${p.text}" + if (p.meaning.isNotBlank()) ". Significa: ${p.meaning}" else ""
    fun slowerDescription(p: Pronounce): String = "$SLOWER: decir «${p.text}» otra vez, más lento"
    fun repeatDescription(p: Pronounce): String = "$REPEAT: decir «${p.text}» otra vez"

    /** The session's first message (decision 13): the coach, its language and the tutor mode; never the welcome. */
    fun start(lang: Language, mode: String = MODE_TUTOR): String =
        org.json.JSONObject(VoiceEvents.start(PERSONA, intro = false)).put("lang", lang.code).put("mode", mode).toString()

    /** The tap on the look surface, on the same session. */
    fun look(): String = VoiceEvents.control("look")

    /** A sentence's language is the target only when it says so; anything else is Spanish, today's voice. */
    fun target(lang: String?): Language? = language(lang)

    /** The `/tts` voice for a sentence: the target's own, else Ver's Spanish voice. */
    fun hubVoice(lang: String?): String = target(lang)?.hubVoice ?: Sight.PERSONA

    /**
     * The phone's voice for [lang] among the engine's installed locale tags ("pt-BR", "pt_PT"…): the exact
     * one wanted (pt-BR), else any of the same language, else null. Spanish goes through [SpeechVoice.spanish].
     */
    fun phoneVoice(lang: Language, available: Collection<String>): String? {
        val tags = available.map { it.replace('_', '-') }
        tags.firstOrNull { it.equals(lang.tag, ignoreCase = true) }?.let { return it }
        return tags.firstOrNull { it.lowercase().let { t -> t == lang.code || t.startsWith("${lang.code}-") } }
    }

    /** How a target-language sentence is said. */
    enum class Way { Hub, Phone, Text }

    /**
     * The order of decision 13: the hub's audio when it came in time, then the phone's voice for the
     * language, else the text alone. «Más despacio» prefers the phone's voice, which takes a rate; with
     * none, the hub's audio played slower.
     */
    fun way(hubAudio: Boolean, phoneVoice: Boolean, slow: Boolean = false): Way = when {
        slow && phoneVoice -> Way.Phone
        hubAudio -> Way.Hub
        phoneVoice -> Way.Phone
        else -> Way.Text
    }
}

/** A `pronounce` event: the phrase in the target language, its Spanish meaning, and its language. */
data class Pronounce(val text: String, val meaning: String, val lang: String, val turn: Int? = null)
