package app.lente.core

/** Which way a phone still has to turn to stand upright. Pure, so the JVM tests cover it. */
object Upright {
    /** How the phone is held, from OrientationEventListener's 0–359 degrees, rounded to the nearest quarter turn. */
    fun held(degrees: Int): Int = ((degrees + 45) / 90 * 90) % 360

    /** The JPEG rotation for the rear camera: the sensor's mounting plus how the phone is held. */
    fun rear(sensorDegrees: Int, heldDegrees: Int): Int = (sensorDegrees + heldDegrees) % 360

    /** Degrees to turn the pixels for an EXIF orientation tag (1 normal, 6 = 90°, 3 = 180°, 8 = 270°); mirrored tags are not produced by a camera and stay as they are. */
    fun exifDegrees(tag: Int): Int = when (tag) { 6 -> 90; 3 -> 180; 8 -> 270; else -> 0 }
}
