package app.lente.ui

import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lente.core.Alignment as Marks
import app.lente.core.Attempt
import app.lente.core.Lesson
import app.lente.core.Lessons
import app.lente.core.Mark
import app.lente.core.NoteEvent
import app.lente.core.Solfege
import app.lente.platform.PitchListener
import app.lente.platform.PracticeLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/** What the Practice screen shows (add-practice-mode 3.1). */
data class PracticeView(
    val lessons: List<Lesson> = Lessons.BUILT_IN,
    val index: Int = 0,
    val loading: Boolean = true,
    /** An attempt is running and the microphone is open. */
    val listening: Boolean = false,
    /** The note sounding now. */
    val heard: Int? = null,
    /** One mark per note reached (all of them once the attempt ends). */
    val marks: List<Mark> = emptyList(),
    /** Waiting for the coaching line. */
    val coaching: Boolean = false,
    val line: String? = null,
    val notice: String? = null,
) {
    val lesson: Lesson get() = lessons[index.coerceIn(0, lessons.lastIndex)]
    /** The note to play next, highlighted while listening. */
    val next: Int get() = marks.size
}

/**
 * Practice: a lesson, the phone listening for its notes, and a coaching line when the attempt ends. The
 * hub is reached through [fetchLessons] (`GET /practice/lessons`) and [postAttempt] (`POST
 * /practice/attempt`); both answer the body of a 2xx, or null (unreachable, or 400 refused), and then the
 * built-in lessons and a line made on the phone stand in. [speak] says the line.
 */
class PracticeModel(
    private val scope: CoroutineScope,
    private val fetchLessons: suspend () -> String?,
    private val postAttempt: suspend (JSONObject) -> String?,
    private val speak: (String) -> Unit,
    private val stopSpeaking: () -> Unit = {},
) {
    private val state = MutableStateFlow(PracticeView())
    val view: StateFlow<PracticeView> = state

    private var attempt: Attempt? = null
    private var ticker: Job? = null
    private var loaded = false
    private val listener = PitchListener(onHeard = { m -> state.update { it.copy(heard = m) } }, onNote = ::onNote)

    /** Opens the screen on a lesson (the first, or `lessonId`) and starts listening. */
    fun open(lessonId: String? = null) {
        scope.launch {
            if (!loaded) {
                state.update { it.copy(loading = true) }
                val list = withTimeoutOrNull(LESSONS_TIMEOUT_MS) { fetchLessons() }?.let { runCatching { Lessons.parse(it) }.getOrNull() }
                loaded = true
                state.update { it.copy(lessons = list?.takeIf { l -> l.isNotEmpty() } ?: Lessons.BUILT_IN, loading = false) }
            }
            val i = lessonId?.let { id -> state.value.lessons.indexOfFirst { it.id == id } }?.takeIf { it >= 0 } ?: state.value.index
            state.update { it.copy(index = i) }
            begin()
        }
    }

    /** «Otra vez»: the same lesson from the start. */
    fun again() = begin()

    /** «Siguiente lección». */
    fun nextLesson() {
        state.update { it.copy(index = (it.index + 1) % it.lessons.size) }
        begin()
    }

    private fun begin() {
        stopSpeaking()
        ticker?.cancel()
        listener.stop()
        val lesson = state.value.lesson
        val at = Attempt(lesson, SystemClock.elapsedRealtime())
        attempt = at
        state.update { it.copy(listening = true, heard = null, marks = emptyList(), coaching = false, line = null, notice = null) }
        if (!listener.start()) {
            attempt = null
            state.update { it.copy(listening = false, notice = MIC_NEEDED) }
            return
        }
        ticker = scope.launch {
            while (isActive) {
                delay(TICK_MS)
                if (attempt === at && at.done(SystemClock.elapsedRealtime())) { finish(); break }
            }
        }
    }

    private fun onNote(note: NoteEvent) {
        val at = attempt ?: return
        val live = at.add(note.midi, note.onsetMs)
        state.update { it.copy(marks = live.marks) }
        if (at.done(SystemClock.elapsedRealtime())) finish()
    }

    /** «Terminar», or the attempt ended by itself: mark every note, then coach. */
    fun finish() {
        val at = attempt ?: return
        attempt = null
        ticker?.cancel()
        listener.stop()
        val result: Marks = at.result()
        state.update { it.copy(listening = false, heard = null, marks = result.marks) }
        if (at.played.isEmpty()) {
            state.update { it.copy(marks = emptyList(), notice = NOTHING_HEARD) }
            return
        }
        PracticeLog.attempt(at.lesson.id, result.right, at.lesson.notes.size)
        state.update { it.copy(coaching = true) }
        scope.launch {
            val sent = SystemClock.elapsedRealtime()
            val answer = withTimeoutOrNull(COACH_TIMEOUT_MS) { postAttempt(at.body()) }?.let(Lessons::coach)
            // Only a real line is a coach time: an empty one (the coach failed) would make the bench look fast or slow.
            if (answer != null && answer.line.isNotEmpty()) PracticeLog.coach(SystemClock.elapsedRealtime() - sent)
            // A new attempt may have started while the hub answered: then this line is stale.
            if (attempt != null) return@launch
            when {
                // The coach's line, spoken.
                answer != null && answer.line.isNotEmpty() -> { state.update { it.copy(coaching = false, line = answer.line) }; speak(answer.line) }
                // The hub kept the attempt but its coach failed: the summary is shown, not spoken.
                answer != null && answer.summary.isNotEmpty() -> state.update { it.copy(coaching = false, line = answer.summary) }
                // The hub could not be reached or refused it: the phone's own line, said in the phone's voice.
                else -> Lessons.localLine(at.lesson, result).let { l -> state.update { it.copy(coaching = false, line = l) }; speak(l) }
            }
        }
    }

    /** The screen closed: the microphone is released. */
    fun close() {
        attempt = null
        ticker?.cancel()
        listener.stop()
        stopSpeaking()
        state.update { it.copy(listening = false, heard = null, coaching = false) }
    }

    companion object {
        const val LESSONS_TIMEOUT_MS = 3_000L
        /** The coach streams one or two sentences; past this the phone says its own line. */
        const val COACH_TIMEOUT_MS = 12_000L
        const val TICK_MS = 250L
        const val MIC_NEEDED = "Lente necesita el micrófono para escucharte. Actívalo en Ajustes del teléfono."
        const val NOTHING_HEARD = "No escuché ninguna nota. Toca «Otra vez» y acerca el teléfono al piano."
        const val LISTENING = "Lente está escuchando"
        const val THINKING = "Lente está pensando…"
    }
}

/** How one note of the lesson reads to TalkBack. */
private fun noteDescription(i: Int, midi: Int, mark: Mark?, isNext: Boolean): String {
    val n = "Nota ${i + 1}, ${Solfege.spoken(midi)}"
    return when {
        mark == Mark.Right -> "$n: bien"
        mark is Mark.Wrong -> "$n: tocaste ${Solfege.spoken(mark.played)}"
        mark == Mark.Missed -> "$n: faltó"
        isNext -> "$n: la siguiente"
        else -> n
    }
}

/**
 * The Practice screen: the lesson's notes large in solfège with the next one highlighted, the note heard
 * now, a check or a cross per note, the coaching line, and «Otra vez», «Siguiente lección», «Terminar».
 * The model is opened by whoever shows the screen and closed here when it leaves.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PracticeScreen(model: PracticeModel, onExit: () -> Unit) {
    val v by model.view.collectAsState()
    val c = Lente.c
    val host = LocalView.current
    DisposableEffect(Unit) {
        host.keepScreenOn = true
        onDispose { host.keepScreenOn = false; model.close() }
    }
    Column(
        Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding()
            .verticalScroll(rememberScrollState()).padding(horizontal = Lente.gutter).testTag("practice"),
    ) {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button("Salir", onClick = onExit, tone = Tone.Quiet, glyph = Glyph.Back, modifier = Modifier.testTag("practice-exit"))
            Spacer(Modifier.weight(1f))
            Text("Lección ${v.index + 1} de ${v.lessons.size}", style = Type.caption, color = c.muted)
        }
        Text(
            if (v.loading) "Cargando lecciones…" else v.lesson.title, style = Type.large, color = c.ink,
            modifier = Modifier.padding(top = 4.dp).semantics { heading() }.testTag("practice-title"),
        )
        val status = when { v.listening -> PracticeModel.LISTENING; v.coaching -> PracticeModel.THINKING; else -> "" }
        Row(
            Modifier.padding(top = 8.dp).height(28.dp).semantics { liveRegion = LiveRegionMode.Polite }.testTag("practice-status"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (status.isNotEmpty()) {
                Dot(if (v.listening) c.live else c.muted, 10.dp)
                Spacer(Modifier.width(8.dp))
                Text(status, style = Type.headline, color = if (v.listening) c.live else c.muted)
            }
        }

        // The lesson, note by note.
        FlowRow(
            Modifier.fillMaxWidth().padding(top = 16.dp).testTag("practice-notes"),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            v.lesson.notes.forEachIndexed { i, midi ->
                val mark = v.marks.getOrNull(i)
                val isNext = v.listening && i == v.next
                val bg = when { isNext -> c.accentFill; mark == null -> c.raised; else -> c.surface }
                val fg = when { isNext -> c.onAccent; mark == Mark.Right -> c.ok; mark is Mark.Wrong -> c.live; mark == Mark.Missed -> c.muted; else -> c.ink }
                Column(
                    Modifier.sizeIn(minWidth = 64.dp, minHeight = 72.dp).clip(RoundedCornerShape(14.dp)).background(bg)
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                        .clearAndSetSemantics { contentDescription = noteDescription(i, midi, mark, isNext) }
                        .testTag("practice-note-$i"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(Solfege.name(midi), color = fg, style = Type.title.copy(fontSize = 28.sp, lineHeight = 34.sp))
                    Box(Modifier.height(20.dp), contentAlignment = Alignment.Center) {
                        when (mark) {
                            Mark.Right -> Icon(Glyph.Check, c.ok, size = 18.dp)
                            is Mark.Wrong -> Text(Solfege.name(mark.played), color = c.live, style = Type.caption.copy(fontWeight = FontWeight.Bold))
                            Mark.Missed -> Icon(Glyph.Close, c.muted, size = 18.dp)
                            null -> {}
                        }
                    }
                }
            }
        }

        // The note heard now.
        Column(
            Modifier.fillMaxWidth().padding(top = 24.dp)
                .clearAndSetSemantics { contentDescription = v.heard?.let { "Escucho ${Solfege.spoken(it)}" } ?: "No escucho ninguna nota" }
                .testTag("practice-heard"),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Escucho", style = Type.label, color = c.muted)
            Text(
                v.heard?.let { Solfege.name(it) } ?: "—", color = if (v.heard != null) c.ink else c.muted,
                style = Type.large.copy(fontSize = 72.sp, lineHeight = 80.sp),
            )
        }

        (v.line ?: v.notice)?.let { text ->
            Card(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                Text(
                    text, style = Type.title.copy(fontWeight = FontWeight.SemiBold), color = c.ink,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("practice-line"),
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        if (v.listening) {
            Button("Terminar", onClick = model::finish, tone = Tone.Plain, glyph = Glyph.Stop, modifier = Modifier.fillMaxWidth().testTag("practice-finish"))
        } else {
            Button("Otra vez", onClick = model::again, glyph = Glyph.Retry, enabled = !v.coaching && !v.loading, modifier = Modifier.fillMaxWidth().testTag("practice-again"))
            Spacer(Modifier.height(10.dp))
            Button("Siguiente lección", onClick = model::nextLesson, tone = Tone.Plain, enabled = !v.coaching && !v.loading, modifier = Modifier.fillMaxWidth().testTag("practice-next"))
        }
        Spacer(Modifier.height(24.dp))
    }
}
