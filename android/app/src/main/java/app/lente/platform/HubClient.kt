package app.lente.platform

import app.lente.core.HubEvent
import app.lente.core.HubJson
import app.lente.core.SseParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** One answer from the hub: status code and body text (empty on 204). */
data class Answer(val code: Int, val text: String) {
    val ok get() = code in 200..299
}

/** What the event stream is doing, for the "Reconectando…" note. */
sealed interface Stream {
    data object Open : Stream
    data class Down(val why: String, val retryInMs: Long) : Stream
    data object Unpaired : Stream
    data class Event(val event: HubEvent) : Stream
}

/** The hub over HTTP: JSON posts up, server-sent events down. Every call names what failed. */
class HubClient(val base: String, private val cookie: () -> String?) {
    private val http = OkHttpClient.Builder().connectTimeout(5, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
    /** The event stream stays open; the hub's 15 s keep-alive keeps reads under this timeout. */
    private val stream = http.newBuilder().readTimeout(45, TimeUnit.SECONDS).build()
    private val json = "application/json".toMediaType()

    private fun request(path: String) = Request.Builder().url(base + path).apply { cookie()?.let { header("Cookie", it) } }

    suspend fun get(path: String): Answer = call(request(path).get().build())

    suspend fun post(path: String, body: JSONObject? = null): Answer =
        call(request(path).post((body?.toString() ?: "").toRequestBody(json)).build())

    private suspend fun call(req: Request): Answer = withContext(Dispatchers.IO) {
        try {
            http.newCall(req).execute().use { Answer(it.code, it.body.string()) }
        } catch (e: IOException) {
            Answer(0, e.message ?: "no connection")
        }
    }

    /** `GET /health`: whether a hub answers at this address at all. */
    suspend fun health(): Answer = get("/health")

    /** `POST /pair`: trade a cloud hub's pairing code for a session cookie. */
    suspend fun pair(code: String): String? = withContext(Dispatchers.IO) {
        try {
            http.newCall(request("/pair").post(JSONObject().put("code", code).toString().toRequestBody(json)).build()).execute().use { res ->
                if (res.code != 204) null else res.headers("Set-Cookie").firstOrNull { it.startsWith("lente_session=") }?.substringBefore(';')
            }
        } catch (e: IOException) {
            null
        }
    }

    /** The hub's events, reconnecting with backoff (1 s doubling to 10 s) until the collector stops. */
    fun events(): Flow<Stream> = flow {
        var backoff = FIRST_RETRY_MS
        while (true) {
            var why: String
            val call = stream.newCall(request("/events").header("Accept", "text/event-stream").build())
            // A cancelled collector does not interrupt a blocking read; cancelling the call does.
            val onCancel = currentCoroutineContext()[Job]?.invokeOnCompletion { call.cancel() }
            try {
                call.execute().use { res ->
                    if (res.code == 401) { emit(Stream.Unpaired); return@flow }
                    if (!res.isSuccessful) throw IOException("the hub answered ${res.code} on /events")
                    emit(Stream.Open)
                    backoff = FIRST_RETRY_MS
                    val parser = SseParser()
                    val source = res.body.source()
                    while (true) {
                        val line = source.readUtf8Line() ?: break
                        for (data in parser.push(line + "\n")) {
                            val event = runCatching { HubJson.event(data) }.getOrNull() ?: continue
                            emit(Stream.Event(event))
                        }
                    }
                    why = "the hub closed the stream"
                }
            } catch (e: IOException) {
                why = e.message ?: "no connection"
            } finally {
                onCancel?.dispose()
            }
            currentCoroutineContext().ensureActive()
            emit(Stream.Down(why, backoff))
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(MAX_RETRY_MS)
        }
    }.flowOn(Dispatchers.IO)

    companion object {
        const val FIRST_RETRY_MS = 1_000L
        const val MAX_RETRY_MS = 10_000L
    }
}
