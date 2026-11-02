package app.lente.capture

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.lente.MainActivity
import app.lente.R
import app.lente.core.AuthRetry
import app.lente.core.ClipFrames
import app.lente.core.HubAddress
import app.lente.core.HubCommand
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.util.concurrent.TimeUnit

/**
 * The phone standing in for the clip: a foreground service that records the microphone at 16 kHz
 * and sends clip protocol v2 frames over the hub's `/device` WebSocket. It keeps going with the
 * screen off, obeys the hub's listen, pause, photo and takeover commands, and sends silence while
 * Lente itself is speaking so the hub never transcribes its own voice.
 */
class CaptureService : Service() {
    private var socket: WebSocket? = null
    private var recorder: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    @Volatile private var sending = false
    private var camera: StillCamera? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stop(null)
            return START_NOT_STICKY
        }
        val hub = intent?.getStringExtra(EXTRA_HUB) ?: return START_NOT_STICKY.also { stopSelf() }
        val cookie = intent.getStringExtra(EXTRA_COOKIE)
        val bearer = intent.getStringExtra(EXTRA_BEARER)
        val withCamera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or (if (withCamera) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), types)
        if (!running) open(hub, cookie, bearer, withCamera)
        return START_NOT_STICKY
    }

    // open, startMicrophone and stop run on the main thread, OkHttp's thread and the microphone thread:
    // one lock, and every step checks it still belongs to the running capture.
    @Synchronized
    private fun open(hub: String, cookie: String?, bearer: String?, withCamera: Boolean) {
        running = true
        Capture.set(Capture.State.Starting)
        camera = if (withCamera) StillCamera(this) else null
        val http = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build()
        val req = Request.Builder().url(HubAddress.deviceSocket(hub)).apply {
            cookie?.let { header("Cookie", it) }
            // A hub with accounts takes the phone as the signed-in user's device (add-accounts 7.2).
            AuthRetry.header(bearer)?.let { (k, v) -> header(k, v) }
        }.build()
        socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                synchronized(this@CaptureService) {
                    // Stopped while the socket was still opening: this socket is no longer ours.
                    if (!running || webSocket !== socket) return
                    webSocket.send(ClipFrames.hello(fw = FIRMWARE, camera = camera != null).toByteString())
                    startMicrophone()
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                for (b in bytes.toByteArray()) when (HubCommand.of(b)) {
                    HubCommand.Listen -> setSending(true)
                    HubCommand.Pause -> setSending(false)
                    HubCommand.Photo -> camera?.take { jpeg -> socket?.send(ClipFrames.jpeg(jpeg).toByteString()) }
                    HubCommand.Takeover -> stop(Capture.State.Stopped("El clip tomó el control: el teléfono dejó de escuchar.", resumable = false))
                    else -> {} // B: the app already buzzes on the card event; C/c: the phone's camera is only used on request.
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (running) stop(Capture.State.Stopped("Se perdió la conexión con la computadora.", resumable = true))
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "device socket failed: ${t.message}")
                if (running) stop(Capture.State.Stopped(if (response == null && Capture.state.value == Capture.State.Starting) "No se pudo conectar con la computadora." else "Se perdió la conexión con la computadora.", resumable = true))
            }
        })
    }

    private fun setSending(on: Boolean) {
        sending = on
        if (running) Capture.set(Capture.State.On(on))
    }

    @SuppressLint("MissingPermission") // checked by the activity before it starts the service
    @Synchronized
    private fun startMicrophone() {
        if (!running) return
        val min = AudioRecord.getMinBufferSize(ClipFrames.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, ClipFrames.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, ClipFrames.FRAME_SAMPLES * 2 * 4))
        } catch (e: Exception) {
            return stop(Capture.State.Stopped("No se pudo abrir el micrófono.", resumable = true))
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) return stop(Capture.State.Stopped("No se pudo abrir el micrófono.", resumable = true))
        recorder = rec
        rec.startRecording()
        Capture.set(Capture.State.On(sending))
        thread = Thread({
            val buf = ShortArray(ClipFrames.FRAME_SAMPLES)
            val silence = ShortArray(ClipFrames.FRAME_SAMPLES)
            var seq = 0L
            while (running) {
                var got = 0
                while (got < buf.size && running) {
                    val n = rec.read(buf, got, buf.size - got)
                    if (n < 0) { stop(Capture.State.Stopped("El micrófono se detuvo.", resumable = true)); return@Thread }
                    got += n
                }
                if (!running) break
                // Paused: nothing leaves the phone. Speaking: silence keeps the sequence and clock whole.
                if (sending) socket?.send(ClipFrames.audio(seq, seq * ClipFrames.FRAME_MS, if (Capture.muted) silence else buf).toByteString())
                seq++
            }
        }, "lente-mic").also { it.start() }
    }

    @Synchronized
    private fun stop(after: Capture.State?) {
        if (!running) { stopSelf(); return }
        running = false
        sending = false
        runCatching { recorder?.stop() }
        recorder?.release()
        recorder = null
        // close() before the upgrade only queues the close and still calls onOpen; cancel() tears it down.
        socket?.let { if (Capture.state.value == Capture.State.Starting) it.cancel() else it.close(1000, "stopped") }
        socket = null
        camera?.close()
        camera = null
        Capture.set(after ?: Capture.State.Off)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (running) stop(null)
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Micrófono del teléfono", NotificationManager.IMPORTANCE_LOW).apply { description = "Visible mientras Lente escucha con el teléfono" })
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, CaptureService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lente)
            .setContentTitle("Lente escucha con el teléfono")
            .setContentText("Solo se guarda texto, nunca audio.")
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(0, "Detener", stop)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        private const val TAG = "LenteCapture"
        const val FIRMWARE = "android-1"
        private const val CHANNEL = "capture"
        private const val NOTIFICATION_ID = 7
        private const val EXTRA_HUB = "hub"
        private const val EXTRA_COOKIE = "cookie"
        private const val EXTRA_BEARER = "bearer"
        private const val ACTION_STOP = "app.lente.STOP_CAPTURE"

        fun start(context: Context, hub: String, cookie: String?, bearer: String? = null) {
            val intent = Intent(context, CaptureService::class.java).putExtra(EXTRA_HUB, hub).putExtra(EXTRA_COOKIE, cookie).putExtra(EXTRA_BEARER, bearer)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            if (Capture.state.value is Capture.State.Off) return
            context.startService(Intent(context, CaptureService::class.java).setAction(ACTION_STOP))
        }

    }
}
