package app.lente.capture

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import java.util.concurrent.Executor

/**
 * One still from the rear camera when the hub asks (Mirar, En vivo): opens the camera, lets
 * exposure settle for half a second on a hidden preview, takes a JPEG no larger than the clip's
 * (1024 px on the long side) and closes the camera again, so it is never on in between.
 */
class StillCamera(context: Context) {
    private val manager = context.getSystemService(CameraManager::class.java)
    private val thread = HandlerThread("lente-camera").also { it.start() }
    private val handler = Handler(thread.looper)
    private val executor = Executor { handler.post(it) }
    @Volatile private var busy = false

    private fun rearCamera(): String? = manager.cameraIdList.firstOrNull {
        manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
    } ?: manager.cameraIdList.firstOrNull()

    /** The largest JPEG size whose long side is at most 1024 px, or the smallest there is. */
    private fun size(id: String): Size {
        val sizes = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)!!.getOutputSizes(ImageFormat.JPEG)
        return sizes.filter { maxOf(it.width, it.height) <= MAX_SIDE_PX }.maxByOrNull { it.width * it.height } ?: sizes.minBy { it.width * it.height }
    }

    /** What one still holds open; released by `release` whichever way the still ends. */
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var previewSurface: Surface? = null
    private var preview: SurfaceTexture? = null

    /** Runs on the camera thread. */
    private fun release() {
        handler.removeCallbacksAndMessages(null)
        runCatching { session?.close() }
        runCatching { device?.close() }
        runCatching { reader?.close() }
        previewSurface?.release()
        preview?.release()
        session = null; device = null; reader = null; previewSurface = null; preview = null
        busy = false
    }

    @SuppressLint("MissingPermission") // the service only builds a StillCamera with the camera permission
    fun take(done: (ByteArray) -> Unit) {
        if (busy) return
        busy = true
        handler.post { start(done) }
    }

    @SuppressLint("MissingPermission")
    private fun start(done: (ByteArray) -> Unit) {
        val id = runCatching { rearCamera() }.getOrNull() ?: return fail("no camera")
        val size = size(id)
        val orientation = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        val r = ImageReader.newInstance(size.width, size.height, ImageFormat.JPEG, 1).also { reader = it }
        val texture = SurfaceTexture(0).apply { setDefaultBufferSize(640, 480) }.also { preview = it }
        val surface = Surface(texture).also { previewSurface = it }
        // A still that never arrives (a failed capture, a stuck camera) still lets the camera go.
        handler.postDelayed({ fail("no image within $GIVE_UP_MS ms") }, GIVE_UP_MS)
        try {
            manager.openCamera(id, executor, object : CameraDevice.StateCallback() {
                override fun onOpened(d: CameraDevice) {
                    device = d
                    val outputs = listOf(OutputConfiguration(surface), OutputConfiguration(r.surface))
                    d.createCaptureSession(SessionConfiguration(SessionConfiguration.SESSION_REGULAR, outputs, executor, object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(s: CameraCaptureSession) {
                            session = s
                            val repeat = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(surface) }.build()
                            s.setRepeatingRequest(repeat, null, handler)
                            r.setOnImageAvailableListener({ ir ->
                                val image = ir.acquireLatestImage()
                                val bytes = image?.planes?.get(0)?.buffer?.let { b -> ByteArray(b.remaining()).also { b.get(it) } }
                                image?.close()
                                release()
                                if (bytes != null) done(bytes)
                            }, handler)
                            handler.postDelayed({
                                runCatching {
                                    val still = d.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                        addTarget(r.surface)
                                        set(CaptureRequest.JPEG_ORIENTATION, orientation)
                                        set(CaptureRequest.JPEG_QUALITY, JPEG_QUALITY)
                                    }.build()
                                    s.capture(still, object : CameraCaptureSession.CaptureCallback() {
                                        override fun onCaptureFailed(session: CameraCaptureSession, request: CaptureRequest, failure: android.hardware.camera2.CaptureFailure) = fail("capture failed (${failure.reason})")
                                    }, handler)
                                }.onFailure { fail("capture: ${it.message}") }
                            }, SETTLE_MS)
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
        const val SETTLE_MS = 500L
        const val JPEG_QUALITY: Byte = 80
        const val GIVE_UP_MS = 5_000L
    }
}
