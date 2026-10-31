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

    @SuppressLint("MissingPermission") // the service only builds a StillCamera with the camera permission
    fun take(done: (ByteArray) -> Unit) {
        if (busy) return
        busy = true
        val id = rearCamera() ?: return fail("no camera")
        val size = size(id)
        val orientation = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        val reader = ImageReader.newInstance(size.width, size.height, ImageFormat.JPEG, 1)
        val preview = SurfaceTexture(0).apply { setDefaultBufferSize(640, 480) }
        val previewSurface = Surface(preview)
        try {
            manager.openCamera(id, executor, object : CameraDevice.StateCallback() {
                override fun onOpened(device: CameraDevice) {
                    val outputs = listOf(OutputConfiguration(previewSurface), OutputConfiguration(reader.surface))
                    device.createCaptureSession(SessionConfiguration(SessionConfiguration.SESSION_REGULAR, outputs, executor, object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(session: CameraCaptureSession) {
                            val repeat = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(previewSurface) }.build()
                            session.setRepeatingRequest(repeat, null, handler)
                            reader.setOnImageAvailableListener({ r ->
                                val image = r.acquireLatestImage()
                                val bytes = image?.planes?.get(0)?.buffer?.let { b -> ByteArray(b.remaining()).also { b.get(it) } }
                                image?.close()
                                session.close(); device.close(); reader.close(); previewSurface.release(); preview.release()
                                busy = false
                                if (bytes != null) done(bytes)
                            }, handler)
                            handler.postDelayed({
                                runCatching {
                                    val still = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                        addTarget(reader.surface)
                                        set(CaptureRequest.JPEG_ORIENTATION, orientation)
                                        set(CaptureRequest.JPEG_QUALITY, JPEG_QUALITY)
                                    }.build()
                                    session.capture(still, null, handler)
                                }.onFailure { fail("capture: ${it.message}"); device.close() }
                            }, SETTLE_MS)
                        }

                        override fun onConfigureFailed(session: CameraCaptureSession) { device.close(); fail("session") }
                    }))
                }

                override fun onDisconnected(device: CameraDevice) { device.close(); fail("disconnected") }
                override fun onError(device: CameraDevice, error: Int) { device.close(); fail("error $error") }
            })
        } catch (e: Exception) {
            fail(e.message ?: "open")
        }
    }

    private fun fail(why: String) {
        Log.w("LenteCamera", "no still: $why")
        busy = false
    }

    fun close() = thread.quitSafely()

    companion object {
        const val MAX_SIDE_PX = 1024
        const val SETTLE_MS = 500L
        const val JPEG_QUALITY: Byte = 80
    }
}
