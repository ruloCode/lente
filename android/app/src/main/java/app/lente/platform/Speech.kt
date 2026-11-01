package app.lente.platform

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import app.lente.capture.Capture
import app.lente.core.Voice
import java.util.Locale

/**
 * Lente's voice: the phone's own text-to-speech, by the page's priority rules. While it speaks, and
 * for a moment after, the phone's microphone sends silence, and every utterance is reported to the
 * hub first (`/narrated`) so a clip that hears it drops the turn.
 */
class Speech(context: Context, private val narrated: (String) -> Unit) {
    private val rules = Voice()
    private var ready = false
    private val tts = TextToSpeech(context.applicationContext) { ready = it == TextToSpeech.SUCCESS }.apply {
        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) { Capture.speaking = true }
            override fun onDone(id: String?) = finished()
            @Deprecated("old API") override fun onError(id: String?) = finished()
            override fun onStop(id: String?, interrupted: Boolean) = finished()
        })
    }

    private fun finished() {
        Capture.speaking = false
        Capture.mutedUntil = System.currentTimeMillis() + Voice.MUTE_TAIL_MS
    }

    fun say(text: String, priority: Voice.Priority) {
        if (!ready || text.isBlank()) return
        val d = rules.decide(priority, tts.isSpeaking, System.currentTimeMillis())
        if (!d.speak) return
        narrated(text)
        tts.language = if (Voice.looksSpanish(text)) Locale.forLanguageTag("es-ES") else Locale.US
        tts.setSpeechRate(1.05f)
        Capture.speaking = true
        tts.speak(text, if (d.interrupt) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "lente-${System.nanoTime()}")
    }

    fun stop() { tts.stop(); finished() }
    fun shutdown() { tts.shutdown(); finished() }
}
