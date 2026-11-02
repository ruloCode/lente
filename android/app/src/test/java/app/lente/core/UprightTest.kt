package app.lente.core

import org.junit.Assert.assertEquals
import org.junit.Test

class UprightTest {
    @Test fun heldRoundsToTheNearestQuarterTurn() {
        assertEquals(listOf(0, 0, 90, 90, 180, 270, 0), listOf(0, 44, 45, 120, 200, 290, 340).map(Upright::held))
    }

    @Test fun rearStillIsUprightInPortraitOnATypicalSensor() {
        // Most phones mount the rear sensor at 90°: an upright portrait still turns 90°, held upside down 270°.
        assertEquals(90, Upright.rear(90, 0))
        assertEquals(180, Upright.rear(90, 90))
        assertEquals(270, Upright.rear(90, 180))
        assertEquals(0, Upright.rear(90, 270))
    }

    @Test fun exifTagsMapToTurns() {
        assertEquals(listOf(0, 90, 180, 270, 0), listOf(1, 6, 3, 8, 2).map(Upright::exifDegrees))
    }
}
