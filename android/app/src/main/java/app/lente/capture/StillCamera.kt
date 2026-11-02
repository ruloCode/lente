package app.lente.capture

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.ExifInterface
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.OrientationEventListener
import android.view.Surface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import app.lente.core.Upright
import java.util.concurrent.Executor

/**
 * Stills from the rear camera when the hub asks (Mirar, En vivo). The first still opens the camera
 * and lets exposure settle on a hidden preview; the camera then stays warm, so the stills of a live
 * view follow one another without reopening it, and closes once no still is asked for `WARM_MS`.
 * Each JPEG is upright for the way the phone is held (from the accelerometer) and no larger than the
 * clip's (1024 px on the long side).
 */
class StillCamera(context: Context) {
    private val manager = context.getSystemService(CameraManager::class.java)
    private val thread = HandlerThread("lente-camera").also { it.start() }
    private val handler = Handler(thread.looper)
    private val executor = Executor { handler.post(it) }
    @Volatile private var busy = false

    /** How the phone is held, in degrees clockwise from upright portrait, rounded to a quarter turn. */
    @Volatile private var held = 0
    private val tilt = object : OrientationEventListener(context) {
        override fun onOrientationChanged(degrees: Int) {
            if (degrees != ORIENTATION_UNKNOWN) held = Upright.held(degrees)
        }
    }

    private fun rearCamera(): String? = manager.cameraIdList.firstOrNull {
        manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
    } ?: manager.cameraIdList.firstOrNull()

    /** The largest JPEG size whose long side is at most 1024 px, or the smallest there is. */
    private fun size(id: String): Size {
        val sizes = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)!!.getOutputSizes(ImageFormat.JPEG)
        return sizes.filter { maxOf(it.width, it.height) <= MAX_SIDE_PX }.maxByOrNull { it.width * it.height } ?: sizes.minBy { it.width * it.height }
    }

    /** What the warm camera holds open; all of it is touched only on the camera thread. */
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var previewSurface: Surface? = null
    private var preview: SurfaceTexture? = null
    private var sensor = 0
    private var readyAt = 0L
    private var pending: ((ByteArray) -> Unit)? = null
    private val idle = Runnable { release() }
    private val giveUp = Runnable { fail("no image within $GIVE_UP_MS ms") }

    private fun release() {
        handler.removeCallbacksAndMessages(null)
        runCatching { session?.close() }
        runCatching { device?.close() }
        runCatching { reader?.close() }
        previewSurface?.release()
        preview?.release()
        tilt.disable()
        session = null; device = null; reader = null; previewSurface = null; preview = null; pending = null
        busy = false
    }

    @SuppressLint("MissingPermission") // the service only builds a StillCamera with the camera permission
    fun take(done: (ByteArray) -> Unit) {
        if (busy) return
        busy = true
        handler.post {
            handler.removeCallbacks(idle)
            handler.postDelayed(giveUp, GIVE_UP_MS)
            pending = done
            val s = session
            // Warm: shoot now, or once the first exposure has settled.
            if (s != null) handler.postAtTime({ capture(s) }, maxOf(readyAt, SystemClock.uptimeMillis())) else open()
        }
    }

    @SuppressLint("MissingPermission")
    private fun open() {
        val id = runCatching { rearCamera() }.getOrNull() ?: return fail("no camera")
        val size = size(id)
        sensor = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        tilt.takeIf { it.canDetectOrientation() }?.enable()
        val r = ImageReader.newInstance(size.width, size.height, ImageFormat.JPEG, 2).also { reader = it }
        r.setOnImageAvailableListener({ ir ->
            val image = ir.acquireLatestImage() ?: return@setOnImageAvailableListener
            val bytes = image.planes[0].buffer.let { b -> ByteArray(b.remaining()).also { b.get(it) } }
            image.close()
            deliver(bytes)
        }, handler)
        val texture = SurfaceTexture(0).apply { setDefaultBufferSize(640, 480) }.also { preview = it }
        val surface = Surface(texture).also { previewSurface = it }
        try {
            manager.openCamera(id, executor, object : CameraDevice.StateCallback() {
                override fun onOpened(d: CameraDevice) {
                    device = d
                    val outputs = listOf(OutputConfiguration(surface), OutputConfiguration(r.surface))
                    d.createCaptureSession(SessionConfiguration(SessionConfiguration.SESSION_REGULAR, outputs, executor, object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(s: CameraCaptureSession) {
                            session = s
                            // The hidden preview keeps exposure and focus following the scene while warm.
                            val repeat = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(surface) }.build()
                            runCatching { s.setRepeatingRequest(repeat, null, handler) }.onFailure { return fail("preview: ${it.message}") }
                            readyAt = SystemClock.uptimeMillis() + SETTLE_MS
                            handler.postAtTime({ capture(s) }, readyAt)
                        }

                        override fun onConfigureFailed(s: CameraCaptureSession) = fail("session")
                    }))
                }

                override fun onDisconnected(d: CameraDevice) { device = d; fail("disconnected") }
                override fun onError(d: CameraDevice, error: Int) { device = d; fail("error $error") }
            })
        } catch (e: Exception) {
            fail(e.message ?: "open")
        }
    }

    private fun capture(s: CameraCaptureSession) {
        val d = device ?: return fail("closed")
        val r = reader ?: return fail("closed")
        runCatching {
            val still = d.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                addTarget(r.surface)
                set(CaptureRequest.JPEG_ORIENTATION, Upright.rear(sensor, held))
                set(CaptureRequest.JPEG_QUALITY, JPEG_QUALITY)
            }.build()
            s.capture(still, object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureFailed(session: CameraCaptureSession, request: CaptureRequest, failure: android.hardware.camera2.CaptureFailure) = fail("capture failed (${failure.reason})")
            }, handler)
        }.onFailure { fail("capture: ${it.message}") }
    }

    private fun deliver(jpeg: ByteArray) {
        handler.removeCallbacks(giveUp)
        val done = pending
        pending = null
        busy = false
        handler.postDelayed(idle, WARM_MS)
        done?.invoke(straighten(jpeg))
    }

    private fun fail(why: String) {
        Log.w("LenteCamera", "no still: $why")
        release()
    }

    /** Lets go of the camera even with a still in flight, then stops the camera thread. */
    fun close() {
        handler.post { release(); thread.quitSafely() }
    }

    companion object {
        const val MAX_SIDE_PX = 1024
        const val SETTLE_MS = 400L
        /** How long the camera stays open after a still, so a live view's next still finds it ready. */
        const val WARM_MS = 8_000L
        const val JPEG_QUALITY: Byte = 80
        const val GIVE_UP_MS = 5_000L

        /**
         * Some phones (many Samsung) leave the requested rotation in the EXIF tag instead of turning the pixels;
         * the hub and the app draw pixels as they are, so turn them here. A JPEG already upright passes untouched.
         */
        fun straighten(jpeg: ByteArray): ByteArray {
            val tag = runCatching { ExifInterface(ByteArrayInputStream(jpeg)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
                .getOrDefault(ExifInterface.ORIENTATION_NORMAL)
            val degrees = Upright.exifDegrees(tag)
            if (degrees == 0) return jpeg
            val bitmap = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return jpeg
            val turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
            return ByteArrayOutputStream(jpeg.size).also { turned.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY.toInt(), it) }.toByteArray()
                .also { bitmap.recycle(); turned.recycle() }
        }
    }
}
