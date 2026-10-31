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
import androidx.core.content.ContextCompat
import app.lente.core.HubAddress
import app.lente.ui.LenteRoot
import app.lente.ui.LenteTheme

class MainActivity : ComponentActivity() {
    private val vm: LenteViewModel by viewModels()
    private var afterPermission: ((Boolean) -> Unit)? = null
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        afterPermission?.invoke(granted[Manifest.permission.RECORD_AUDIO] == true || has(Manifest.permission.RECORD_AUDIO))
        afterPermission = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.auto(0x00000000, 0x00000000), navigationBarStyle = SystemBarStyle.auto(0x00000000, 0x00000000))
        super.onCreate(savedInstanceState)
        fromLaunch(intent)
        setContent {
            LenteTheme {
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
