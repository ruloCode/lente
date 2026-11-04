package app.lente.core

import org.json.JSONObject

/**
 * «¿Dónde estoy?» in Ver (add-sight-mode): the hub's voice agent sends `locate`, and the phone answers
 * on the same session with where it is, said the way a person in Colombia says an address. Nothing of
 * it is kept or logged on the phone; it goes only in this reply. Pure.
 */
data class Fix(val lat: Double, val lon: Double, val accuracyM: Float, val address: String, val place: String?)

/** The fields of an `android.location.Address` that the line uses, so the line can be tested off the phone. */
data class AddressParts(
    val thoroughfare: String? = null,
    val subThoroughfare: String? = null,
    val subLocality: String? = null,
    val locality: String? = null,
    val subAdminArea: String? = null,
    val adminArea: String? = null,
    val featureName: String? = null,
    /** The geocoder's own first line, used when it gives no street. */
    val firstLine: String? = null,
)

object Place {
    /** The hub waits this long for the answer; the phone gives up a little before. */
    const val REPLY_WITHIN_MS = 8_000L
    const val FIX_WAIT_MS = 5_000L
    const val ADDRESS_WAIT_MS = 2_000L
    /** A last known position younger than this still says where the wearer is. */
    const val LAST_KNOWN_MAX_AGE_MS = 120_000L

    const val NO_PERMISSION = "sin permiso de ubicación"
    const val OFF = "la ubicación del teléfono está apagada"
    const val NO_FIX = "no encontré la ubicación a tiempo"

    /** «Calle 72 # 10-34, Chapinero, Bogotá»: street and number, neighborhood, city; the geocoder's own line when it has no street. */
    fun addressLine(a: AddressParts): String {
        val street = a.thoroughfare?.trim().orEmpty()
        val number = a.subThoroughfare?.trim().orEmpty()
        val first = when {
            street.isNotEmpty() && number.isNotEmpty() -> if ('-' in number && '#' !in number) "$street # $number" else "$street $number"
            street.isNotEmpty() -> street
            else -> a.firstLine?.substringBefore(',')?.trim().orEmpty()
        }
        val city = listOf(a.locality, a.subAdminArea, a.adminArea).firstOrNull { !it.isNullOrBlank() }?.trim()
        return listOf(first, a.subLocality?.trim(), city).filterNot { it.isNullOrBlank() }.map { it!! }
            .fold(mutableListOf<String>()) { out, p -> if (out.none { it.equals(p, ignoreCase = true) }) out += p; out }
            .joinToString(", ")
    }

    /** The place's own name («Parque de la 93»), when the geocoder's feature is a name and not the number or the street. */
    fun placeName(a: AddressParts): String? {
        val f = a.featureName?.trim().orEmpty()
        if (f.isEmpty() || f.none { it.isLetter() }) return null
        val known = listOfNotNull(a.subThoroughfare, a.thoroughfare, a.subLocality, a.locality, a.adminArea).map { it.trim() }
        if (known.any { it.equals(f, ignoreCase = true) }) return null
        if (a.thoroughfare != null && f.startsWith(a.thoroughfare.trim(), ignoreCase = true)) return null
        return f
    }

    fun reply(id: String, fix: Fix): String = JSONObject()
        .put("type", "location").put("id", id).put("ok", true)
        .put("lat", fix.lat).put("lon", fix.lon).put("accuracy", Math.round(fix.accuracyM))
        .put("address", fix.address)
        .apply { fix.place?.let { put("place", it) } }
        .toString()

    fun failure(id: String, reason: String): String =
        JSONObject().put("type", "location").put("id", id).put("ok", false).put("reason", reason).toString()
}
