package app.lente.platform

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import app.lente.capture.Capture
import app.lente.core.AuthRetry
import app.lente.core.ClipFrames
import app.lente.core.SpokenCount
import app.lente.core.VoiceEvents
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import java.util.Locale
import java.util.concurrent.TimeUnit

/** Someone else's voice for a session's sentences (Ver's speaker): says one, then calls `done`; `stop` drops all. */
interface SentenceVoice {
    fun sentence(turn: Int, text: String, done: () -> Unit)
    fun stop()
}

/**
 * One Hablar con Lente session (add-voice-mode): the hub's `/voice` WebSocket, the phone's
 * microphone and the phone's own voice. The microphone stays open while Lente speaks, so the wearer
 * can interrupt; `VOICE_COMMUNICATION` turns on the platform's echo canceller, and the hub drops
 * whatever still comes back as an echo. Events reach `onEvent` on the main thread.
 */
class VoiceClient(
    context: Context,
    base: String,
    cookie: String?,
    bearer: String?,
    private val onEvent: (String) -> Unit,
    /** Sent as soon as the socket opens (Ver: `{"type":"start","persona":"sight",…}`). */
    private val start: String? = null,
    /** Speaks the replies instead of the phone's own voice (Ver's voice); the `spoken` acks are the same. */
    private val voice: SentenceVoice? = null,
    private val onClosed: (String?) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private val http = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS).build()
    private val spoken = SpokenCount()
    @Volatile private var open = true
    /** Hands-free sends all the time; hold-to-talk sends only while held. */
    @Volatile var handsFree = true
    @Volatile var holding = false
    @Volatile var paused = false
    /** Ver is saying something that is not this session's reply: the phone's microphone sends silence, so it is not heard as the wearer. */
    @Volatile var deaf = false
    /** Only when the hub listens to the phone (not the clip). */
    @Volatile private var micWanted = false
    private var recorder: AudioRecord? = null
    private var thread: Thread? = null
    private var ttsReady = false
    private val tts = TextToSpeech(context.applicationContext) { ttsReady = it == TextToSpeech.SUCCESS }.apply {
        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) { Capture.speaking = true }
            override fun onDone(id: String?) = finished(id)
            @Deprecated("old API") override fun onError(id: String?) = finished(id)
            override fun onStop(id: String?, interrupted: Boolean) { Capture.speaking = false }
        })
    }

    private val socket: WebSocket = http.newWebSocket(
        Request.Builder().url(base.replaceFirst(Regex("^http"), "ws") + "/voice").apply {
            cookie?.let { header("Cookie", it) }
            AuthRetry.header(bearer)?.let { (k, v) -> header(k, v) }
        }.build(),
        object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { start?.let { webSocket.send(it) } }
            override fun onMessage(webSocket: WebSocket, text: String) { main.post { onEvent(text) } }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = closed(null)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "voice socket failed: ${t.message}")
                closed(when (response?.code) {
                    401 -> "Inicia sesión otra vez para hablar con Lente."
                    app.lente.core.Terms.PRECONDITION_REQUIRED -> "Acepta los términos de la prueba para hablar con Lente."
                    else -> "Se perdió la conexión con la computadora."
                })
            }
        },
    )

    private fun closed(why: String?) {
        if (!open) return
        open = false
        stopMicrophone()
        main.post { onClosed(why) }
    }

    private fun finished(id: String?) {
        val turn = id?.substringAfter("voice-")?.substringBefore('-')?.toIntOrNull() ?: return
        Capture.speaking = false
        spoken.finished(turn)?.let { socket.send(VoiceEvents.spoken(turn, it)) }
    }

    /** One sentence of `turn`, queued after the ones before it. */
    fun speak(turn: Int, text: String) {
        if (voice != null && text.isNotBlank()) {
            spoken.queued(turn)
            voice.sentence(turn, text) { main.post { spoken.finished(turn)?.let { socket.send(VoiceEvents.spoken(turn, it)) } } }
            return
        }
        if (!ttsReady || text.isBlank()) {
            // No voice: report it spoken at once so the hub does not wait.
            spoken.queued(turn); spoken.finished(turn)?.let { socket.send(VoiceEvents.spoken(turn, it)) }
            return
        }
        spoken.queued(turn)
        tts.language = Locale.forLanguageTag("es-ES")
        tts.setSpeechRate(1.05f)
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, "voice-$turn-${System.nanoTime()}")
    }

    /** A message of the phone's own on the session (Ver's `location` answer). */
    fun send(text: String) { if (open) socket.send(text) }

    fun stopSpeaking() {
        voice?.stop()
        tts.stop()
        spoken.clear()
        Capture.speaking = false
    }

    /** The phone interrupts: from holding the talk button while Lente speaks. */
    fun bargeIn() {
        stopSpeaking()
        socket.send(VoiceEvents.control("bargeIn"))
    }

    fun pause(on: Boolean) {
        paused = on
        if (on) stopSpeaking()
        socket.send(VoiceEvents.control(if (on) "pause" else "resume"))
    }

    /** Hold-to-talk released: a short silence lets the hub's endpointing close the turn. */
    fun release() {
        holding = false
        tailFrames = TAIL_FRAMES
    }

    @Volatile private var tailFrames = 0

    /** The hub said whose microphone it uses: record only when it is the phone's. */
    fun useMicrophone(phone: Boolean) {
        micWanted = phone
        if (phone) startMicrophone() else stopMicrophone()
    }

    @SuppressLint("MissingPermission") // asked by the activity before the screen opens
    @Synchronized
    private fun startMicrophone() {
        if (recorder != null || !open) return
        val min = AudioRecord.getMinBufferSize(ClipFrames.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, ClipFrames.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, ClipFrames.FRAME_SAMPLES * 2 * 4))
        } catch (e: Exception) {
            main.post { onClosed("No se pudo abrir el micrófono.") }
            return
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            main.post { onClosed("No se pudo abrir el micrófono.") }
            return
        }
        recorder = rec
        rec.startRecording()
        thread = Thread({
            val buf = ShortArray(ClipFrames.FRAME_SAMPLES)
            val bytes = ByteArray(buf.size * 2)
            while (open && micWanted) {
                var got = 0
                while (got < buf.size && open) {
                    val n = rec.read(buf, got, buf.size - got)
                    if (n < 0) return@Thread
                    got += n
                }
                val talking = handsFree || holding
                val tail = !talking && tailFrames > 0
                if (paused || (!talking && !tail)) continue
                if (tail) { tailFrames--; java.util.Arrays.fill(buf, 0) }
                if (deaf) java.util.Arrays.fill(buf, 0)
                for (i in buf.indices) { bytes[i * 2] = (buf[i].toInt() and 0xff).toByte(); bytes[i * 2 + 1] = (buf[i].toInt() shr 8).toByte() }
                socket.send(bytes.toByteString())
            }
        }, "lente-voice-mic").also { it.start() }
    }

    @Synchronized
    private fun stopMicrophone() {
        micWanted = false
        recorder?.let { runCatching { it.stop() }; it.release() }
        recorder = null
        thread = null
    }

    /** Terminar: tells the hub, stops the voice and the microphone. */
    fun end() {
        if (open) socket.send(VoiceEvents.control("end"))
        stopSpeaking()
        stopMicrophone()
        main.postDelayed({ socket.close(1000, null) }, 300)
        open = false
    }

    fun shutdown() {
        end()
        tts.shutdown()
    }

    private companion object {
        const val TAG = "LenteVoice"
        /** 800 ms of silence after hold-to-talk, in 80 ms frames. */
        const val TAIL_FRAMES = 10
    }
}
