package app.lente.platform

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import app.lente.core.Notifications
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The background check for a closed app (add-notifications, design decision 4): at most every 15 minutes,
 * with a network, it asks the hub for the feed with the saved credentials and posts what is new. No new
 * dependency: the platform's JobScheduler. A hub without the feed just answers 404 and nothing happens.
 */
class ActivityJob : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartJob(params: JobParameters): Boolean {
        val prefs = Prefs(applicationContext)
        val hub = prefs.hub ?: return false
        val account = GoogleAccount.of(application)
        val client = HubClient(hub, { prefs.cookie }, { account.accessToken() }, { account.refreshAfter401() })
        scope.launch {
            val answer = runCatching { client.get("/notifications") }.getOrNull()
            val feed = answer?.takeIf { it.ok }?.let { runCatching { Notifications.parse(it.text) }.getOrNull() }
            if (feed != null) Alerts.deliver(applicationContext, prefs, feed, inMeeting = false)
            jobFinished(params, false)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val JOB_ID = 4_715
        /** Android's shortest period for a periodic job. */
        private const val PERIOD_MS = 15 * 60_000L

        /** Schedules the check once; scheduling again keeps the existing one. */
        fun schedule(context: Context) {
            val js = context.getSystemService(JobScheduler::class.java) ?: return
            if (js.getPendingJob(JOB_ID) != null) return
            // A refused schedule must never stop the app from opening: the alerts while it runs still work.
            runCatching { scheduleOn(js, context) }.onFailure { android.util.Log.w("Lente", "No pude programar la revisión de actividad: ${it.message}") }
        }

        private fun scheduleOn(js: JobScheduler, context: Context) {
            js.schedule(
                JobInfo.Builder(JOB_ID, ComponentName(context, ActivityJob::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(PERIOD_MS)
                    .setPersisted(false)
                    .build(),
            )
        }

        fun cancel(context: Context) {
            context.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
        }
    }
}
