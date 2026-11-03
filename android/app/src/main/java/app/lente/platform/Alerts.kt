package app.lente.platform

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.lente.MainActivity
import app.lente.R
import app.lente.core.Feed
import app.lente.core.NotificationItem
import app.lente.core.Notifications
import java.time.LocalTime

/**
 * Android notifications for the activity feed (add-notifications): one channel, one notification per new
 * item, once ever, with the text hidden on the lock screen when the wearer asks. Tapping opens Actividad.
 * The first check on a phone only remembers what is already there, so turning alerts on never floods.
 */
object Alerts {
    const val CHANNEL = "lente_activity"
    /** The extra that tells MainActivity to open Actividad. */
    const val OPEN_EXTRA = "open"
    const val OPEN_ACTIVITY = "actividad"
    /** Item ids remembered as alerted, newest kept. */
    private const val REMEMBERED = 300

    fun allowed(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    private fun channel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Actividad de Lente", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Notas listas, aprobaciones, recuerdos por revisar y trabajos de tus agentes"
        })
    }

    /**
     * Posts what is new in `feed` for this phone and remembers it. `inMeeting` lets the wearer's setting keep
     * a meeting quiet but for urgent items. Returns how many it posted.
     */
    fun deliver(context: Context, prefs: Prefs, feed: Feed, inMeeting: Boolean): Int {
        val known = prefs.notifyAlerted
        if (known == null) {
            // First check on this phone: remember what is there, alert from now on.
            prefs.notifyAlerted = feed.items.map { it.id }.takeLast(REMEMBERED).toSet()
            return 0
        }
        val now = LocalTime.now()
        val fresh = Notifications.toAlert(feed, known, now.hour * 60 + now.minute, inMeeting)
        if (fresh.isEmpty()) return 0
        prefs.notifyAlerted = (known + fresh.map { it.id }).toList().takeLast(REMEMBERED).toSet()
        if (!allowed(context)) return 0
        channel(context)
        fresh.forEach { post(context, it, feed.prefs.hideContent) }
        return fresh.size
    }

    private fun post(context: Context, item: NotificationItem, hide: Boolean) {
        val open = Intent(context, MainActivity::class.java).putExtra(OPEN_EXTRA, OPEN_ACTIVITY).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val tap = PendingIntent.getActivity(context, item.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val (title, body) = Notifications.lockText(item, hide = false)
        val (lockTitle, lockBody) = Notifications.lockText(item, hide = true)
        val public = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_stat_lente).setContentTitle(lockTitle).setContentText(lockBody).build()
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lente)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setWhen(item.at)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .setCategory(if (item.urgent) NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_STATUS)
            .setPriority(if (item.urgent) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(if (hide) NotificationCompat.VISIBILITY_PRIVATE else NotificationCompat.VISIBILITY_PUBLIC)
            .setPublicVersion(public)
            .setGroup(CHANNEL)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(item.id.hashCode(), n)
        } catch (_: SecurityException) {
            // The permission was taken back between the check and the post: the item stays in Actividad.
        }
    }
}
