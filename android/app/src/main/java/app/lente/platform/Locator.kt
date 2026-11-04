package app.lente.platform

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import app.lente.core.AddressParts
import app.lente.core.Fix
import app.lente.core.Place
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import kotlin.coroutines.resume

/**
 * Where the phone is, for «¿Dónde estoy?» in Ver: a fresh position from the platform (fused, else GPS,
 * else network; a last known one under two minutes old when none comes in time), then the address in
 * Colombian Spanish. Nothing is stored or logged; the caller sends it to the hub and forgets it.
 */
object Locator {
    /** The fix, or the short Spanish reason there is none. */
    suspend fun locate(context: Context): Pair<Fix?, String?> {
        val app = context.applicationContext
        val fine = app.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = app.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return null to Place.NO_PERMISSION
        val lm = app.getSystemService(LocationManager::class.java) ?: return null to Place.OFF
        if (!lm.isLocationEnabled) return null to Place.OFF
        val location = current(lm, fine) ?: lastKnown(lm) ?: return null to Place.NO_FIX
        val parts = withTimeoutOrNull(Place.ADDRESS_WAIT_MS) { address(app, location) }
        val fix = Fix(location.latitude, location.longitude, location.accuracy, parts?.let(Place::addressLine).orEmpty(), parts?.let(Place::placeName))
        return fix to null
    }

    private fun provider(lm: LocationManager, fine: Boolean): String? {
        val on = lm.getProviders(true)
        return listOf("fused", LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { fine || it != LocationManager.GPS_PROVIDER }
            .firstOrNull { it in on }
    }

    @SuppressLint("MissingPermission") // checked in locate
    private suspend fun current(lm: LocationManager, fine: Boolean): Location? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val p = provider(lm, fine) ?: return null
        return withTimeoutOrNull(Place.FIX_WAIT_MS) {
            suspendCancellableCoroutine { cont ->
                val cancel = CancellationSignal()
                cont.invokeOnCancellation { cancel.cancel() }
                lm.getCurrentLocation(p, cancel, MainExecutor) { loc -> if (cont.isActive) cont.resume(loc) }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun lastKnown(lm: LocationManager): Location? = lm.getProviders(true)
        .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
        .filter { System.currentTimeMillis() - it.time <= Place.LAST_KNOWN_MAX_AGE_MS }
        .minByOrNull { it.accuracy }

    private suspend fun address(context: Context, l: Location): AddressParts? {
        if (!Geocoder.isPresent()) return null
        val geocoder = Geocoder(context, Locale.forLanguageTag("es-CO"))
        val found: Address? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            suspendCancellableCoroutine { cont ->
                geocoder.getFromLocation(l.latitude, l.longitude, 1, object : Geocoder.GeocodeListener {
                    override fun onGeocode(addresses: MutableList<Address>) { if (cont.isActive) cont.resume(addresses.firstOrNull()) }
                    override fun onError(errorMessage: String?) { if (cont.isActive) cont.resume(null) }
                })
            }
        } else withContext(Dispatchers.IO) {
            @Suppress("DEPRECATION")
            runCatching { geocoder.getFromLocation(l.latitude, l.longitude, 1)?.firstOrNull() }.getOrNull()
        }
        return found?.let {
            AddressParts(it.thoroughfare, it.subThoroughfare, it.subLocality, it.locality, it.subAdminArea, it.adminArea, it.featureName, if (it.maxAddressLineIndex >= 0) it.getAddressLine(0) else null)
        }
    }
}

/** Runs callbacks on the main thread (the platform's location callback wants an executor). */
private object MainExecutor : java.util.concurrent.Executor {
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    override fun execute(command: Runnable) { main.post(command) }
}
