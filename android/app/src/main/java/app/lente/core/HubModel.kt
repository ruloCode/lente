package app.lente.core

import org.json.JSONArray
import org.json.JSONObject

// What the hub sends, as typed values (docs/kb/hub-api.md). Decoding is lenient: a missing field
// takes its empty value, an unknown event kind becomes `HubEvent.Other`, so a newer hub never
// breaks an older app.

data class Pause(val reason: String, val min: Int = 0, val basis: String = "")
data class MeetingNow(val id: String, val title: String, val startedAt: Long, val turns: Int, val auto: Boolean)
data class Session(val startedAt: Long, val listenedMs: Long, val running: Boolean)

data class Status(
    val clip: Boolean = false,
    val device: String = "",
    val mode: String = "mic",
    val listening: Boolean = false,
    val pause: Pause? = Pause("start"),
    val live: Boolean = false,
    val voice: String = "device",
    val audioLost: Int = 0,
    val audioLate: Int = 0,
    val meeting: MeetingNow? = null,
    val names: List<String> = emptyList(),
    val everyQuestion: Boolean = false,
    val assistMode: String = "assist",
    val wearer: String = "",
    val clipError: String = "",
    val asr: String = "",
    val modelDown: String = "",
    /** A failing cloud database (`paused`, `unreachable`, `refused`), empty when fine or not configured. */
    val databaseDown: String = "",
    val session: Session? = null,
) {
    val recordOnly get() = assistMode == "record"
    val phoneIsDevice get() = clip && device == "phone"
    val clipIsDevice get() = clip && device == "clip"
}

/** One entry of the day: a turn, a card, a live read or a summary. */
data class Entry(
    val kind: String,
    val at: Long,
    val text: String,
    val turnId: String? = null,
    val speaker: String? = null,
    val label: String = "",
    val meaning: String? = null,
    val ms: Long? = null,
    val asker: String? = null,
    val why: String? = null,
    val model: String? = null,
    val provider: String? = null,
    val stages: Map<String, Long> = emptyMap(),
    /** Set on a staged card the app must acknowledge. */
    val id: String? = null,
    /** `data:image/jpeg;base64,…` on photo cards and live reads. */
    val photo: String? = null,
) {
    val isDilo get() = kind == "cue" && (label == "DILO" || label == "SAY THIS")
    val isPhoto get() = kind == "cue" && (label == "ON SCREEN" || label == "PHOTO")
    val key get() = "$kind|$at|$text"
}

data class Evidence(val text: String, val evidence: List<String>)
data class Commitment(val what: String, val owner: String, val due: String?, val evidence: List<String>)
data class Notes(
    val summary: String,
    val decisions: List<Evidence>,
    val commitments: List<Commitment>,
    val openQuestions: List<Evidence>,
    val glossary: List<Triple<String, String, List<String>>>,
)

data class MeetingSummary(
    val id: String,
    val title: String,
    val topic: String,
    val auto: Boolean,
    val startedAt: Long,
    val endedAt: Long?,
    val status: String,
    val turns: Int,
    val notes: Notes?,
    val asked: Int,
    val answered: Int,
) {
    val displayTitle get() = title.ifBlank { topic }.ifBlank { if (auto) "Episodio" else "Reunión" }
}

data class GlossaryTerm(val term: String, val meaning: String, val count: Int, val example: String)
data class Language(val glossary: List<GlossaryTerm>, val phrases: List<String>, val asked: Int, val answered: Int)

data class Quote(val id: String, val at: Long?, val speaker: String?, val text: String)
data class PendingAction(val id: String, val meetingId: String, val meetingTitle: String, val tool: String, val args: JSONObject, val quotes: List<Quote>)
data class Decided(val id: String, val tool: String, val status: String, val meetingId: String)
data class Task(val id: String, val title: String, val due: String?, val meetingId: String, val meetingTitle: String, val done: Boolean)
data class Actions(val pending: List<PendingAction> = emptyList(), val decided: List<Decided> = emptyList(), val tasks: List<Task> = emptyList())

data class Spend(val audioSeconds: Double = 0.0, val tokens: Long = 0, val usd: Double = 0.0, val unpriced: Boolean = false)

data class Fact(val id: String, val text: String, val status: String, val meetingId: String, val evidence: List<String>)
data class TurnLine(val id: String, val at: Long, val speaker: String?, val wearer: Boolean, val text: String)
data class MeetingDetail(val summary: MeetingSummary, val share: String, val turns: List<TurnLine>)
data class TraceStep(val at: Long, val kind: String, val label: String, val detail: String)
data class SearchMatch(val where: String, val turnId: String?, val line: String)
data class SearchResult(val id: String, val title: String, val startedAt: Long, val matches: List<SearchMatch>)
data class BriefingItem(val kind: String, val text: String)
data class Briefing(val title: String, val remembered: Boolean, val items: List<BriefingItem>)
data class HelpAnswer(val ok: Boolean, val label: String, val text: String, val meaning: String?, val message: String)

sealed interface HubEvent {
    data class StatusEvent(val status: Status) : HubEvent
    data class History(val items: List<Entry>) : HubEvent
    data class Partial(val text: String) : HubEvent
    data class Speaker(val turnId: String, val speaker: String) : HubEvent
    data class Stages(val id: String, val stages: Map<String, Long>) : HubEvent
    data class Level(val rms: Int) : HubEvent
    data class Recorded(val ms: Long) : HubEvent
    data class SpendEvent(val spend: Spend) : HubEvent
    data class Meetings(val items: List<MeetingSummary>, val language: Language) : HubEvent
    data class ActionsEvent(val actions: Actions) : HubEvent
    /** A turn, cue, live read or summary as it happens. */
    data class Day(val entry: Entry) : HubEvent
    data class Other(val kind: String) : HubEvent
}

object HubJson {
    fun event(text: String): HubEvent {
        val o = JSONObject(text)
        return when (val kind = o.optString("kind")) {
            "status" -> HubEvent.StatusEvent(status(o))
            "history" -> HubEvent.History(o.optJSONArray("items").objects().map(::entry))
            "partial" -> HubEvent.Partial(o.optString("text"))
            "speaker" -> HubEvent.Speaker(o.opt("turnId")?.toString() ?: "", o.optString("speaker"))
            "stages" -> HubEvent.Stages(o.optString("id"), longs(o.optJSONObject("stages")))
            "level" -> HubEvent.Level(o.optInt("rms"))
            "recorded" -> HubEvent.Recorded(o.optLong("ms"))
            "spend" -> HubEvent.SpendEvent(spend(o))
            "meetings" -> HubEvent.Meetings(o.optJSONArray("items").objects().map(::meeting), language(o.optJSONObject("language")))
            "actions" -> HubEvent.ActionsEvent(actions(o))
            "turn", "cue", "live", "frame", "summary" -> HubEvent.Day(entry(o))
            else -> HubEvent.Other(kind)
        }
    }

    fun status(o: JSONObject) = Status(
        clip = o.optBoolean("clip"),
        device = o.optString("device"),
        mode = o.optString("mode", "mic"),
        listening = o.optBoolean("listening"),
        pause = o.optJSONObject("pause")?.let { Pause(it.optString("reason"), it.optInt("min"), it.optString("basis")) },
        live = o.optBoolean("live"),
        voice = o.optString("voice", "device"),
        audioLost = o.optInt("audioLost"),
        audioLate = o.optInt("audioLate"),
        meeting = o.optJSONObject("meeting")?.let { MeetingNow(it.optString("id"), it.optString("title"), it.optLong("startedAt"), it.optInt("turns"), it.optBoolean("auto")) },
        names = o.optJSONArray("names").strings(),
        everyQuestion = o.optBoolean("everyQuestion"),
        assistMode = o.optString("assistMode", "assist"),
        wearer = o.optString("wearer"),
        clipError = o.optString("clipError"),
        asr = o.optString("asr"),
        modelDown = o.optString("modelDown"),
        databaseDown = o.optString("databaseDown"),
        session = o.optJSONObject("session")?.let { Session(it.optLong("startedAt"), it.optLong("listenedMs"), it.optBoolean("running")) },
    )

    fun entry(o: JSONObject) = Entry(
        kind = o.optString("kind"),
        at = o.optLong("at"),
        text = o.optString("text"),
        turnId = o.opt("turnId")?.toString(),
        speaker = o.str("speaker"),
        label = o.optString("label"),
        meaning = o.str("meaning"),
        ms = if (o.has("ms")) o.optLong("ms") else null,
        asker = o.str("asker"),
        why = o.str("why"),
        model = o.str("model"),
        provider = o.str("provider"),
        stages = longs(o.optJSONObject("stages")),
        id = o.str("id"),
        photo = o.str("photo"),
    )

    fun notes(o: JSONObject?): Notes? = o?.let {
        Notes(
            summary = it.optString("summary"),
            decisions = it.optJSONArray("decisions").objects().map { d -> Evidence(d.optString("text"), d.optJSONArray("evidence").strings()) },
            commitments = it.optJSONArray("commitments").objects().map { c -> Commitment(c.optString("what"), c.optString("owner"), c.str("due"), c.optJSONArray("evidence").strings()) },
            openQuestions = it.optJSONArray("openQuestions").objects().map { q -> Evidence(q.optString("text"), q.optJSONArray("evidence").strings()) },
            glossary = it.optJSONArray("glossary").objects().map { g -> Triple(g.optString("term"), g.optString("meaning"), g.optJSONArray("evidence").strings()) },
        )
    }

    fun meeting(o: JSONObject) = MeetingSummary(
        id = o.optString("id"),
        title = o.optString("title"),
        topic = o.optString("topic"),
        auto = o.optBoolean("auto"),
        startedAt = o.optLong("startedAt"),
        endedAt = if (o.has("endedAt")) o.optLong("endedAt") else null,
        status = o.optString("status"),
        turns = o.optInt("turns"),
        notes = notes(o.optJSONObject("notes")),
        asked = o.optJSONObject("stats")?.optInt("asked") ?: 0,
        answered = o.optJSONObject("stats")?.optInt("answered") ?: 0,
    )

    fun language(o: JSONObject?) = Language(
        glossary = o?.optJSONArray("glossary").objects().map { GlossaryTerm(it.optString("term"), it.optString("meaning"), it.optInt("count"), it.optString("example")) },
        phrases = o?.optJSONArray("phrases").strings(),
        asked = o?.optInt("asked") ?: 0,
        answered = o?.optInt("answered") ?: 0,
    )

    fun actions(o: JSONObject) = Actions(
        pending = o.optJSONArray("pending").objects().map {
            PendingAction(
                id = it.optString("id"),
                meetingId = it.optString("meetingId"),
                meetingTitle = it.optString("meetingTitle"),
                tool = it.optString("tool"),
                args = it.optJSONObject("args") ?: it.optJSONObject("proposedArgs") ?: JSONObject(),
                quotes = it.optJSONArray("quotes").objects().map { q -> Quote(q.optString("id"), if (q.has("at")) q.optLong("at") else null, q.str("speaker"), q.optString("text")) },
            )
        },
        decided = o.optJSONArray("decided").objects().map { Decided(it.optString("id"), it.optString("tool"), it.optString("status"), it.optString("meetingId")) },
        tasks = o.optJSONArray("tasks").objects().map { Task(it.optString("id"), it.optString("title"), it.str("due"), it.optString("meetingId"), it.optString("meetingTitle"), it.optBoolean("done")) },
    )

    fun spend(o: JSONObject): Spend {
        var tokens = 0L
        o.optJSONObject("models")?.let { models -> for (k in models.keys()) models.optJSONObject(k)?.let { tokens += it.optLong("input") + it.optLong("output") } }
        return Spend(o.optDouble("audioSeconds", 0.0), tokens, o.optDouble("usd", 0.0), (o.optJSONArray("unpriced")?.length() ?: 0) > 0)
    }

    fun facts(text: String) = JSONObject(text).optJSONArray("facts").objects().map {
        Fact(it.optString("id"), it.optString("text"), it.optString("status"), it.optString("meetingId"), it.optJSONArray("evidence").strings())
    }

    fun meetingDetail(text: String): MeetingDetail {
        val o = JSONObject(text)
        return MeetingDetail(
            summary = meeting(o),
            share = o.optString("share"),
            turns = o.optJSONArray("turnList").objects().map { TurnLine(it.optString("id"), it.optLong("at"), it.str("speaker"), it.optBoolean("wearer"), it.optString("text")) },
        )
    }

    fun trace(text: String) = JSONObject(text).optJSONArray("steps").objects().map { TraceStep(it.optLong("at"), it.optString("kind"), it.optString("label"), it.optString("detail")) }

    fun search(text: String) = JSONObject(text).optJSONArray("results").objects().map {
        SearchResult(it.optString("id"), it.optString("title"), it.optLong("startedAt"), it.optJSONArray("matches").objects().map { m -> SearchMatch(m.optString("where"), m.str("turnId"), m.optString("line")) })
    }

    fun briefing(text: String): Briefing {
        val o = JSONObject(text)
        return Briefing(o.optString("title"), o.optBoolean("remembered"), o.optJSONArray("items").objects().map { BriefingItem(it.optString("kind"), it.optString("text")) })
    }

    fun help(text: String): HelpAnswer {
        val o = JSONObject(text)
        return HelpAnswer(o.optBoolean("ok"), o.optString("label"), o.optString("text"), o.str("meaning"), o.optString("message"))
    }

    private fun JSONObject.str(name: String): String? = if (has(name) && !isNull(name)) optString(name) else null
    private fun longs(o: JSONObject?): Map<String, Long> = o?.keys()?.asSequence()?.associateWith { o.optLong(it) } ?: emptyMap()
    private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
    private fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).map { optString(it) }
}
