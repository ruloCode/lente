package app.lente.platform

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import app.lente.capture.Capture
import app.lente.core.SpeechVoice
import app.lente.core.Voice
import java.util.Locale

/**
 * Lente's voice: the phone's own text-to-speech, by the page's priority rules. While it speaks, and
 * for a moment after, the phone's microphone sends silence, and every utterance is reported to the
 * hub first (`/narrated`) so a clip that hears it drops the turn. With TalkBack on (add-sight-mode)
 * the text goes to the screen reader as an announcement instead, so the two never speak at once and
 * the wearer's own TalkBack voice and rate apply. Spanish prefers es-CO, then es-US, then es-ES;
 * the rate comes from Ajustes.
 */
class Speech(context: Context, private val rate: () -> Float = { SpeechVoice.DEFAULT_RATE }, private val narrated: (String) -> Unit) {
    private val app = context.applicationContext
    private val a11y = app.getSystemService(AccessibilityManager::class.java)
    private val rules = Voice()
    private var ready = false
    private var spanish: Locale = Locale.forLanguageTag("es-ES")
    private val tts: TextToSpeech = TextToSpeech(app) { status ->
        ready = status == TextToSpeech.SUCCESS
        if (ready) spanish = Locale.forLanguageTag(SpeechVoice.spanish(spanishTags()))
    }.apply {
        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) { Capture.speaking = true }
            override fun onDone(id: String?) = finished()
            @Deprecated("old API") override fun onError(id: String?) = finished()
            override fun onStop(id: String?, interrupted: Boolean) = finished()
        })
    }

    /** The engine's installed Spanish voices, plus the preferred locales it says it can speak by country. */
    private fun spanishTags(): List<String> {
        val voices = runCatching { tts.voices.orEmpty() }.getOrDefault(emptySet())
            .filter { v -> v.locale.language == "es" && TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in v.features.orEmpty() }
            .map { it.locale.toLanguageTag() }
        val byCountry = SpeechVoice.SPANISH.filter { tag -> runCatching { tts.isLanguageAvailable(Locale.forLanguageTag(tag)) }.getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED) >= TextToSpeech.LANG_COUNTRY_AVAILABLE }
        return voices + byCountry
    }

    private fun finished() {
        Capture.speaking = false
        Capture.mutedUntil = System.currentTimeMillis() + Voice.MUTE_TAIL_MS
    }

    /** TalkBack (or another touch-exploring screen reader) is on: it speaks for Lente. */
    val screenReader: Boolean get() = a11y?.isEnabled == true && a11y.isTouchExplorationEnabled

    fun say(text: String, priority: Voice.Priority) = sayAll(listOf(text), priority)

    /** Speaks [parts] in order as one utterance by the priority rules: the first decides, the rest queue behind it. */
    fun sayAll(parts: List<String>, priority: Voice.Priority) {
        val pieces = parts.filter { it.isNotBlank() }
        if (pieces.isEmpty()) return
        val text = pieces.joinToString(" ")
        if (screenReader) {
            // The screen reader speaks it; Low reads still keep their gap so TalkBack is not flooded.
            if (!rules.decide(priority, false, System.currentTimeMillis()).speak) return
            narrated(text)
            announce(text)
            return
        }
        if (!ready) return
        val d = rules.decide(priority, tts.isSpeaking, System.currentTimeMillis())
        if (!d.speak) return
        narrated(text)
        tts.language = if (Voice.looksSpanish(text)) spanish else Locale.US
        tts.setSpeechRate(SpeechVoice.rate(rate()))
        Capture.speaking = true
        pieces.forEachIndexed { i, piece ->
            val mode = if (i == 0 && d.interrupt) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            tts.speak(piece, mode, null, "lente-${System.nanoTime()}")
        }
    }

    /** An announcement through the accessibility service, as `View.announceForAccessibility` sends it. */
    private fun announce(text: String) {
        val m = a11y ?: return
        if (!m.isEnabled) return
        @Suppress("DEPRECATION")
        val event = AccessibilityEvent.obtain(AccessibilityEvent.TYPE_ANNOUNCEMENT).apply {
            className = Speech::class.java.name
            packageName = app.packageName
            this.text.add(text)
        }
        runCatching { m.sendAccessibilityEvent(event) }
    }

    fun stop() { tts.stop(); finished() }

    fun shutdown() { tts.shutdown(); finished() }
}
