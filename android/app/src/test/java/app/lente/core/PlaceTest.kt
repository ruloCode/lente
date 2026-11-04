package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** «¿Dónde estoy?» in Ver: the address line and the answer to the hub. Made-up places and coordinates. */
class PlaceTest {
    @Test fun aColombianAddressReadsStreetAndNumberNeighborhoodCity() {
        val a = AddressParts(thoroughfare = "Calle 72", subThoroughfare = "10-34", subLocality = "Chapinero", locality = "Bogotá", adminArea = "Bogotá", featureName = "10-34")
        assertEquals("Calle 72 # 10-34, Chapinero, Bogotá", Place.addressLine(a))
        assertNull(Place.placeName(a))
        assertEquals("Carrera 7 120, Usaquén, Bogotá", Place.addressLine(AddressParts("Carrera 7", "120", "Usaquén", "Bogotá")))
        assertEquals("Calle 10 # 4-21, Medellín", Place.addressLine(AddressParts("Calle 10", "# 4-21", adminArea = "Medellín")))
    }

    @Test fun withNoStreetItUsesTheGeocodersLineAndTheCityFromWhatThereIs() {
        val a = AddressParts(subLocality = "La Candelaria", subAdminArea = "Bogotá", firstLine = "Plaza de Bolívar, Bogotá, Colombia", featureName = "Plaza de Bolívar")
        assertEquals("Plaza de Bolívar, La Candelaria, Bogotá", Place.addressLine(a))
        assertEquals("Plaza de Bolívar", Place.placeName(a))
        assertEquals("", Place.addressLine(AddressParts()))
        assertNull(Place.placeName(AddressParts(thoroughfare = "Calle 72", featureName = "Calle 72 #10-34")))
        assertNull(Place.placeName(AddressParts(featureName = "123")))
    }

    @Test fun theAnswerCarriesTheIdAndOnlyWhatTheHubAskedFor() {
        val ok = JSONObject(Place.reply("q1", Fix(4.65, -74.05, 12.4f, "Calle 72 # 10-34, Chapinero, Bogotá", "Parque Lourdes")))
        assertEquals("location", ok.getString("type"))
        assertEquals("q1", ok.getString("id"))
        assertTrue(ok.getBoolean("ok"))
        assertEquals(4.65, ok.getDouble("lat"), 0.0)
        assertEquals(-74.05, ok.getDouble("lon"), 0.0)
        assertEquals(12, ok.getInt("accuracy"))
        assertEquals("Parque Lourdes", ok.getString("place"))
        assertFalse(JSONObject(Place.reply("q2", Fix(0.0, 0.0, 5f, "", null))).has("place"))
        val no = JSONObject(Place.failure("q3", Place.NO_PERMISSION))
        assertEquals("q3", no.getString("id"))
        assertFalse(no.getBoolean("ok"))
        assertEquals("sin permiso de ubicación", no.getString("reason"))
    }
}
