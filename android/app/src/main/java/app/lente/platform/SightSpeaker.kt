package app.lente.platform

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaDataSource
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import app.lente.capture.Capture
import app.lente.core.Coach
import app.lente.core.LineKind
import app.lente.core.SpeechQueue
import app.lente.core.SpeechVoice
import app.lente.core.SpokenLine
import app.lente.core.Voice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * Ver's one voice (add-sight-mode): the voice session's replies, a look's answers and the live
 * narration, a line at a time in [SpeechQueue]'s order. Each line is the hub's Colombian voice
 * (`POST /tts`, voice `sight`) when it answers within [SpeechQueue.TTS_WAIT_MS], else the phone's own
 * voice, a female Spanish one when the engine has it. With TalkBack on the line is announced through
 * the accessibility service instead. Every line goes to `narrated` first, the hub's echo guard.
 * The coach (add-language-coach) also speaks through it: a line in a target language asks the hub for
 * that language's voice, falls back to the phone's voice in the language, and with neither stays text
 * ([missingVoice]). Called on the main thread.
 */
class SightSpeaker(
    context: Context,
    private val scope: CoroutineScope,
    /** The hub's audio for a line in its language (null: Spanish): (status, bytes); 404 means the hub has no voice of its own. */
    private val fetch: suspend (String, String?) -> Pair<Int, ByteArray?>,
    private val rate: () -> Float,
    private val narrated: (String) -> Unit,
    private val screenReader: () -> Boolean,
    private val announce: (String) -> Unit,
    /** The wearer is talking or Lente is thinking: narration waits. */
    private val holdNarration: () -> Boolean,
    /** A look's answer or a narration started (its kind) or ended (null): the session's phone microphone sends silence meanwhile. */
    private val ambient: (LineKind?) -> Unit = {},
    /** A target-language line had neither the hub's audio nor a phone voice in the language: it stays text. */
    private val missingVoice: (Coach.Language) -> Unit = {},
) : SentenceVoice {
    private val main = Handler(Looper.getMainLooper())
    private val queue = SpeechQueue()
    private var ids = 0L
    private val after = mutableMapOf<Long, () -> Unit>()
    private val audio = mutableMapOf<Long, Pair<Long, Deferred<ByteArray?>>>()
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var playJob: Job? = null
    /** The hub answered 404: no voice of its own on this run, so no more asking. */
    private var hubHasNoVoice = false

    private var ttsReady = false
    private var female: android.speech.tts.Voice? = null
    private var spanish: Locale = Locale.forLanguageTag("es-ES")
    /** The phone's installed voice for each coach language, by its code ("pt"); missing when the engine has none. */
    private var targetVoices: Map<String, android.speech.tts.Voice> = emptyMap()
    private val pending = ConcurrentHashMap<String, () -> Unit>()
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ttsReady = status == TextToSpeech.SUCCESS
        if (ttsReady) pickVoice()
    }.apply {
        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { pending.remove(id)?.invoke() }
            @Deprecated("old API") override fun onError(id: String?) { pending.remove(id)?.invoke() }
            override fun onStop(id: String?, interrupted: Boolean) { pending.remove(id)?.invoke() }
        })
    }

    private fun pickVoice() {
        val voices = runCatching { tts.voices.orEmpty() }.getOrDefault(emptySet())
            .filter { v -> v.locale.language == "es" && TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in v.features.orEmpty() }
        spanish = Locale.forLanguageTag(SpeechVoice.spanish(voices.map { it.locale.toLanguageTag() }))
        val name = SpeechVoice.female(voices.associate { it.name to it.locale.toLanguageTag() })
        female = voices.firstOrNull { it.name == name }
        Log.i(TAG, "phone voice: ${female?.name ?: "engine default"} ($spanish)")
        val installed = runCatching { tts.voices.orEmpty() }.getOrDefault(emptySet()).filter { TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features.orEmpty() }
        targetVoices = Coach.LANGUAGES.mapNotNull { lang ->
            val tag = Coach.phoneVoice(lang, installed.map { it.locale.toLanguageTag() }) ?: return@mapNotNull null
            // An on-device voice first: the network ones need a connection the hub's voice already lacks.
            val same = installed.filter { it.locale.toLanguageTag().replace('_', '-').equals(tag, ignoreCase = true) }
            (same.firstOrNull { !it.isNetworkConnectionRequired } ?: same.firstOrNull())?.let { lang.code to it }
        }.toMap()
        Log.i(TAG, "coach voices: ${targetVoices.mapValues { it.value.locale.toLanguageTag() }}")
    }

    init {
        scope.launch(Dispatchers.Main) { run() }
    }

    /**
     * A look's answer, a coach line or a live description. All but narration go a sentence at a time, so
     * the first starts as soon as its own audio is ready; a description stays whole (only the newest waits).
     */
    fun say(text: String, kind: LineKind, lang: String? = null, slow: Boolean = false) {
        if (kind == LineKind.Narration) return offer(text, kind, null)
        for (s in SpeechQueue.sentences(text)) offer(s, kind, null, lang, slow)
    }

    /** One sentence of a voice reply; `done` once it was said (or skipped), never after [stop]. */
    override fun sentence(turn: Int, text: String, lang: String?, done: () -> Unit) {
        main.post { offer(text, LineKind.Reply, done, lang) }
    }

    private fun offer(text: String, kind: LineKind, done: (() -> Unit)?, lang: String? = null, slow: Boolean = false) {
        if (text.isBlank()) { done?.invoke(); return }
        val line = SpokenLine(++ids, text.trim(), kind, System.currentTimeMillis(), lang, slow)
        done?.let { after[line.id] = it }
        // The conversation's lines are fetched at once, so the next sentence is ready when this one ends; «Más despacio» asks only if the phone has no voice for it.
        if (kind != LineKind.Narration && !slow) prefetch(line)
        if (queue.offer(line)) playJob?.cancel()
        wake.trySend(Unit)
    }

    private fun prefetch(line: SpokenLine) {
        if (hubHasNoVoice || screenReader()) return
        audio[line.id] = System.currentTimeMillis() to scope.async(Dispatchers.IO) {
            val (code, bytes) = fetch(line.text, line.lang)
            if (code == 404) hubHasNoVoice = true
            bytes
        }
    }

    /** A reply or a look is playing or waiting (what «Grabar en silencio» lets finish before it closes the session). */
    val conversing: Boolean get() = queue.conversing

    /** Narration paused: nothing more of it, and the one playing stops. */
    fun stopNarration() { if (queue.dropNarration()) playJob?.cancel() }

    /** Barge-in, a pause or leaving: nothing waiting is said, the line playing stops, no acks follow. */
    override fun stop() {
        main.post {
            for (l in queue.clear()) { after.remove(l.id); audio.remove(l.id)?.second?.cancel() }
            queue.playing?.let { after.remove(it.id) }
            playJob?.cancel()
        }
    }

    private suspend fun run() {
        while (true) {
            val line = queue.next(System.currentTimeMillis(), holdNarration())
            if (line == null) {
                // Woken by a new line; a held narration is looked at again shortly.
                withTimeoutOrNull(HOLD_RECHECK_MS) { wake.receive() }
                continue
            }
            val job = scope.launch(Dispatchers.Main) { play(line) }
            playJob = job
            val outside = line.kind != LineKind.Reply
            if (outside) ambient(line.kind)
            job.join()
            if (outside) ambient(null)
            queue.done()
            audio.remove(line.id)?.second?.cancel()
            after.remove(line.id)?.invoke()
        }
    }

    private suspend fun play(line: SpokenLine) {
        narrated(line.text)
        if (screenReader()) {
            announce(line.text)
            delay(SpeechQueue.readMs(line.text))
            return
        }
        Capture.speaking = true
        try {
            val target = Coach.target(line.lang)
            if (target != null) return sayInTarget(line, target)
            if (line.id !in audio) prefetch(line)
            val (asked, bytes) = audio[line.id] ?: (0L to null)
            val wait = SpeechQueue.ttsWaitMs(asked, System.currentTimeMillis())
            val sound = bytes?.let { withTimeoutOrNull(wait) { runCatching { it.await() }.getOrNull() } }
            // The log says when the line starts, in ms after it was handed over: numbers only, never the text.
            if (sound != null && playAudio(sound, SpeechVoice.rate(rate()) / SpeechVoice.DEFAULT_RATE) { Log.i(TAG, "${line.kind}: hub voice starts ${System.currentTimeMillis() - line.at} ms after it was asked") }) return
            Log.i(TAG, "${line.kind}: phone voice starts ${System.currentTimeMillis() - line.at} ms after it was asked")
            phoneSay(line.text)
        } finally {
            Capture.speaking = false
            Capture.mutedUntil = System.currentTimeMillis() + Voice.MUTE_TAIL_MS
        }
    }

    /**
     * A line in the coach's target language, in the order of [Coach.way]: the hub's voice for the language,
     * the phone's voice in it, or the text alone. «Más despacio» is the phone's voice at [Coach.SLOW_RATE],
     * or the hub's audio played that much slower when the phone has no voice in the language.
     */
    private suspend fun sayInTarget(line: SpokenLine, target: Coach.Language) {
        // The engine lists its voices once it has started: a coach line right after opening waits for it.
        if (!ttsReady) withTimeoutOrNull(SpeechQueue.TTS_INIT_WAIT_MS) { while (!ttsReady) delay(50) }
        val phone = targetVoices[target.code]
        var sound: ByteArray? = null
        if (!(line.slow && phone != null)) {
            if (line.id !in audio) prefetch(line)
            val (asked, bytes) = audio[line.id] ?: (0L to null)
            sound = bytes?.let { withTimeoutOrNull(SpeechQueue.ttsWaitMs(asked, System.currentTimeMillis())) { runCatching { it.await() }.getOrNull() } }
        }
        val way = Coach.way(hubAudio = sound != null, phoneVoice = phone != null, slow = line.slow)
        val speed = if (line.slow) Coach.SLOW_RATE else SpeechVoice.rate(rate()) / SpeechVoice.DEFAULT_RATE
        if (way == Coach.Way.Hub && playAudio(sound!!, speed) { Log.i(TAG, "${line.kind} ${target.code}: hub voice starts ${System.currentTimeMillis() - line.at} ms after it was asked") }) return
        if (phone != null) phoneSay(line.text, phone, if (line.slow) Coach.SLOW_RATE else SpeechVoice.rate(rate()))
        else missingVoice(target)
    }

    /** Plays the hub's audio to its end at [speed]; false when it could not start (then the phone's voice says it). */
    private suspend fun playAudio(bytes: ByteArray, speed: Float, started: () -> Unit = {}): Boolean = suspendCancellableCoroutine { cont ->
        val mp = MediaPlayer()
        var playing = false
        var released = false
        fun release() { if (!released) { released = true; runCatching { mp.stop() }; mp.release() } }
        try {
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            mp.setDataSource(Bytes(bytes))
            mp.setOnPreparedListener {
                if (kotlin.math.abs(speed - 1f) > 0.01f) runCatching { it.playbackParams = it.playbackParams.setSpeed(speed) }
                playing = true
                it.start()
                started()
            }
            mp.setOnCompletionListener { release(); if (cont.isActive) cont.resume(true) }
            mp.setOnErrorListener { _, what, extra ->
                Log.w(TAG, "hub voice failed to play ($what/$extra)")
                release(); if (cont.isActive) cont.resume(playing); true
            }
            mp.prepareAsync()
        } catch (e: Exception) {
            Log.w(TAG, "hub voice failed to play: ${e.message}")
            release(); if (cont.isActive) cont.resume(false)
        }
        cont.invokeOnCancellation { main.post { release() } }
    }

    /** The phone's own voice (Spanish unless [voice] is given), to the end of the line. */
    private suspend fun phoneSay(text: String, voice: android.speech.tts.Voice? = female, speechRate: Float = SpeechVoice.rate(rate())) {
        // A speaker made just now (Practicar's first line) may have an engine still starting.
        if (!ttsReady) withTimeoutOrNull(SpeechQueue.TTS_INIT_WAIT_MS) { while (!ttsReady) delay(50) }
        if (!ttsReady) return
        suspendCancellableCoroutine { cont ->
            val id = "sight-${System.nanoTime()}"
            pending[id] = { if (cont.isActive) cont.resume(Unit) }
            if (voice != null) tts.voice = voice else tts.language = spanish
            tts.setSpeechRate(speechRate)
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) pending.remove(id)?.invoke()
            cont.invokeOnCancellation { pending.remove(id); tts.stop() }
        }
    }

    fun shutdown() {
        stop()
        tts.shutdown()
    }

    /** The hub's MP3 straight from memory: nothing is written to the phone. */
    private class Bytes(private val data: ByteArray) : MediaDataSource() {
        override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
            if (position >= data.size) return -1
            val n = minOf(size, data.size - position.toInt())
            System.arraycopy(data, position.toInt(), buffer, offset, n)
            return n
        }
        override fun getSize(): Long = data.size.toLong()
        override fun close() {}
    }

    private companion object {
        const val TAG = "LenteSight"
        const val HOLD_RECHECK_MS = 400L
    }
}
