package app.lente

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import app.lente.core.HubAddress
import app.lente.ui.LenteRoot
import app.lente.ui.LenteTheme

class MainActivity : ComponentActivity() {
    private val vm: LenteViewModel by viewModels()
    /** add-notifications: the notifications permission, asked from Ajustes → Notificaciones. */
    private val notifyPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { vm.askNotifyPermission.value = false }
    private var afterPermission: ((Boolean) -> Unit)? = null
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        afterPermission?.invoke(granted[Manifest.permission.RECORD_AUDIO] == true || has(Manifest.permission.RECORD_AUDIO))
        afterPermission = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.auto(0x00000000, 0x00000000), navigationBarStyle = SystemBarStyle.auto(0x00000000, 0x00000000))
        super.onCreate(savedInstanceState)
        fromLaunch(intent)
        // The background check for alerts with the app closed (add-notifications); harmless without a hub.
        if (vm.prefs.hub != null) app.lente.platform.ActivityJob.schedule(applicationContext)
        setContent {
            val mode by vm.theme.collectAsState()
            val dark = when (mode) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
            // The status and navigation bar icons follow the app's theme, not only the system's.
            LaunchedEffect(dark) {
                val bars = if (dark) SystemBarStyle.dark(0x00000000) else SystemBarStyle.light(0x00000000, 0x00000000)
                enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            }
            val askNotify by vm.askNotifyPermission.collectAsState()
            LaunchedEffect(askNotify) {
                if (!askNotify) return@LaunchedEffect
                if (Build.VERSION.SDK_INT >= 33 && !has(Manifest.permission.POST_NOTIFICATIONS)) notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                else {
                    // Granted before but turned off for the app: Android's own screen is the only way back.
                    startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))
                    vm.askNotifyPermission.value = false
                }
            }
            LenteTheme(mode) {
                LenteRoot(vm, askMicrophone = ::askMicrophone)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        fromLaunch(intent)
    }

    /** `--es hub <address>` (and `--ez welcomed true`) from adb: how the end-to-end script points the app at a hub. */
    private fun fromLaunch(intent: Intent?) {
        // A tapped notification opens Actividad (add-notifications).
        if (intent?.getStringExtra(app.lente.platform.Alerts.OPEN_EXTRA) == app.lente.platform.Alerts.OPEN_ACTIVITY) vm.go(Screen.Actividad)
        val hub = intent?.getStringExtra("hub")?.let(HubAddress::normalize) ?: return
        if (intent.getBooleanExtra("welcomed", false)) vm.prefs.welcomed = true
        vm.prefs.hub = hub
        vm.connect(hub)
    }

    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    /** The microphone (needed), the camera and notifications (asked together, optional). */
    private fun askMicrophone(then: (Boolean) -> Unit) {
        val wanted = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filterNot(::has)
        if (wanted.isEmpty()) return then(true)
        afterPermission = then
        permissions.launch(wanted.toTypedArray())
    }
}
