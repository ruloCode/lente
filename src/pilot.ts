// Lente pilot hub. The clip on the glasses streams microphone audio over TCP and
// sends a photo when its button (or the phone's Look button) is pressed. Muse Voice
// Transcribe turns the audio into turns; when a turn is a question, Muse Spark writes
// a reply the wearer can say, a photo gets a one-line "on screen" read, and every few
// minutes Spark sums up what is happening. A phone on the same Wi-Fi follows along at
// http://<laptop>:8080 and can read everything out loud.
//
// Modes: camera + mic, or mic only (the clip powers the camera down to save battery).
// Listening can be paused. The day is kept as text in data/days/ (git-ignored).
//
// Usage: pnpm pilot   (MODEL_API_KEY in .env; ELEVENLABS_API_KEY optional for a natural voice)

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { AsrSession, type AsrTurn } from "./asr-session.ts";
import { streamChat, type ChatMessage } from "./chat.ts";
import { AudioConditioner, AudioTimeline, ClipFrameParser, JitterBuffer, isQuestion, parseAudioFrame, parseHello, rms, toCue } from "./clip-protocol.ts";
import { DayLog, type DayEntry } from "./day-log.ts";
import { iconPng, logoSvg, webManifest } from "./brand.ts";
import { PILOT_PAGE } from "./pilot-page.ts";
import { type AddressDecision, type AddressTurn, addressMessages, isAddressed, parseYesNo } from "./addressing.ts";
import { LanguageStore } from "./language-store.ts";
import { countAskedAnswered, forgetMeeting, mergeGlossary, totalAskedAnswered, viewGlossary } from "./language-profile.ts";
import { MeetingStore } from "./meeting-store.ts";
import { type Meeting, type MeetingTurn, addTurn, extractionMessages, isTooShort, newMeeting, notesSchema, silenceExpired, validateNotes } from "./meetings.ts";
import { ProfileStore } from "./profile.ts";
import { LoudnessRing, WearerTracker, isEnrollment } from "./wearer.ts";
import { chatTargets } from "./providers.ts";

const DEVICE_PORT = Number(process.env.PILOT_DEVICE_PORT ?? 7070);
const WEB_PORT = Number(process.env.PILOT_WEB_PORT ?? 8080);
const MIC_GAIN = Number(process.env.PILOT_MIC_GAIN ?? 10);
const SUMMARY_EVERY_MS = Number(process.env.PILOT_SUMMARY_MIN ?? 5) * 60_000;
const LANGUAGE = process.env.PILOT_LANG ?? "Spanish";
const FRAME_MS = 80;
const FRAME_BYTES = (16000 * 2 * FRAME_MS) / 1000;
const LIVE_GAP_MS = 400;
const MEETING_SILENCE_MS = Number(process.env.PILOT_MEETING_SILENCE_S ?? 600) * 1000;
const meetings = new MeetingStore(fileURLToPath(new URL("../data/meetings/", import.meta.url)));
const language = new LanguageStore(fileURLToPath(new URL("../data/language.json", import.meta.url)));
const profile = new ProfileStore(fileURLToPath(new URL("../data/profile.json", import.meta.url)));
const key = process.env.MODEL_API_KEY;
const elevenKey = process.env.ELEVENLABS_API_KEY;
const elevenVoice = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

const SAY_THIS_PROMPT =
  "You help a non-native English speaker answer in a live meeting. Given the conversation and the " +
  "question just asked, write ONE natural sentence they can say right now. Under 90 characters, " +
  "in the language of the question, no quotes, no preamble.";
const ON_SCREEN_PROMPT =
  "You are the eyes of someone in a meeting, seeing through a small camera on their glasses. " +
  `In ONE sentence in ${LANGUAGE}, under 100 characters, say what matters in this view: what the slide, ` +
  "screen, whiteboard or document is showing. If it shows nothing useful, describe the scene briefly. No preamble.";
const LIVE_PROMPT =
  "You narrate, in real time, what someone sees through a small camera on their glasses. " +
  `In ONE short sentence in ${LANGUAGE}, under 120 characters, say what is in front of them now. ` +
  "Read out any text that matters (a slide title, a sign, a screen). If the view barely changed from " +
  "the previous description, say only what changed. No preamble.";
const SUMMARY_PROMPT =
  "You keep someone up to date on what is happening around them, from what their glasses heard " +
  `(and sometimes saw). In ${LANGUAGE}, in at most two short sentences, say what matters: decisions, ` +
  "questions aimed at them, commitments, the topic. Speak to them directly. If nothing relevant happened, " +
  "say so in a few words. No preamble, no lists.";

// --- State shared with the phone ----------------------------------------------------------

type Mode = "camera" | "mic";
let status = {
  kind: "status",
  clip: false,
  mode: "mic" as Mode,
  listening: true,
  live: false,
  voice: elevenKey ? "elevenlabs" : "device",
  audioLost: 0,
  audioLate: 0,
  /** The meeting in progress, if any. */
  meeting: null as null | { id: string; title: string; startedAt: number; turns: number },
  /** Name and aliases other people use for the wearer (set on the phone). */
  names: profile.names,
  /** Testing: cue on every question, not only those aimed at the wearer. */
  everyQuestion: profile.everyQuestion,
  /** Speaker label of the wearer in this transcription session, once known. */
  wearer: "",
  /** Why the last clip was refused (old firmware, bad hello); cleared by the next good hello. */
  clipError: "",
  asr: key ? "waiting for the clip…" : "no MODEL_API_KEY: audio level only",
};

const clients = new Set<ServerResponse>();
const day = new DayLog(fileURLToPath(new URL("../data/days/", import.meta.url)));

function broadcast(event: object): void {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}

/** Broadcast and keep it in the day's record. */
function record(entry: DayEntry, extra: object = {}): void {
  day.add(entry);
  broadcast({ ...entry, ...extra });
}

function setStatus(patch: Partial<typeof status>): void {
  status = { ...status, ...patch };
  broadcast(status);
  console.log(`[status] clip=${status.clip ? "on" : "off"} · ${status.mode} · ${status.listening ? "listening" : "paused"} · ${status.asr}`);
}

// --- Muse Spark ------------------------------------------------------------------------------

let sparkTargets = chatTargets().filter((t) => t.id.startsWith("spark-1.3"));

async function askSpark(messages: ChatMessage[], opts: { extra?: Record<string, unknown>; maxTokens?: number } = {}): Promise<string> {
  let lastError: unknown;
  for (const target of sparkTargets) {
    try {
      const { text } = await streamChat(opts.extra ? { ...target, extra: { ...target.extra, ...opts.extra } } : target, messages, opts.maxTokens ?? 400);
      sparkTargets = [target, ...sparkTargets.filter((t) => t !== target)];
      return text;
    } catch (error) {
      lastError = error;
      console.error(`[spark] ${target.id} failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }
  throw lastError;
}

const recentTurns = () =>
  day.entries
    .filter((e): e is Extract<DayEntry, { kind: "turn" }> => e.kind === "turn")
    .slice(-12)
    .map((t) => `${t.speaker ?? "?"}: ${t.text}`)
    .join("\n");

let cueSeq = 0;

async function sayThis(turn: AsrTurn, asker: string | undefined, why: string): Promise<void> {
  const seq = ++cueSeq;
  const started = performance.now();
  try {
    const reply = await askSpark([
      { role: "system", content: SAY_THIS_PROMPT },
      { role: "user", content: `Conversation so far:\n${recentTurns()}\n\nQuestion just asked: ${turn.text}` },
    ]);
    if (seq !== cueSeq) return; // a newer question already took the card
    const ms = Math.round(performance.now() - started);
    const text = toCue(reply);
    if (!text) return;
    record({ at: Date.now(), kind: "cue", label: "DILO", text, ms, asker, why });
    device?.write("B");
    console.log(`[cue] ${ms} ms · ${text}`);
  } catch (error) {
    console.error(`[cue] failed: ${(error as Error).message.slice(0, 200)}`);
  }
}

const ADDRESS_HISTORY_TURNS = 8;

/** A day-log turn on the wall clock, which stays comparable across reconnects. */
function toAddressTurn(e: Extract<DayEntry, { kind: "turn" }>): AddressTurn {
  const startMs = e.spokeAt ?? e.at;
  return { speaker: e.speaker, text: e.text, startMs, endMs: startMs + ((e.audioEndMs ?? 0) - (e.audioStartMs ?? 0)) };
}

const speakerOfTurn = new Map<string, string>();
const SPEAKER_WAIT_MS = 1500;

/** The speaker label can arrive after the turn; the addressing rules need it. */
async function labelOf(turn: AsrTurn): Promise<string | undefined> {
  const deadline = Date.now() + SPEAKER_WAIT_MS;
  while (turn.speaker === undefined && !speakerOfTurn.has(turn.turnId) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  return turn.speaker ?? speakerOfTurn.get(turn.turnId);
}

/** The cue is for the wearer only when the question was aimed at them (or the testing switch is on). */
async function cueIfAddressed(turn: AsrTurn, earlier: AddressTurn[], spokeAt: number | undefined): Promise<void> {
  const speaker = await labelOf(turn);
  const now = spokeAt ?? Date.now();
  const asked: AddressTurn = { speaker, text: turn.text, startMs: now, endMs: now + ((turn.endMs ?? 0) - (turn.startMs ?? 0)) };
  if (profile.everyQuestion) {
    console.log("[address] addressed · testing (every question)");
    return void sayThis(turn, speaker, "testing");
  }
  const d = await decideAddressed(asked, earlier);
  console.log(`[address] ${d.verdict} · ${d.rule}${d.ms ? ` · ${d.ms} ms` : ""}`);
  if (d.verdict === "addressed") {
    const kept = meetingTurns.get(turn.turnId);
    if (kept && current?.turns.includes(kept)) {
      kept.addressed = true;
      meetings.save(current);
    }
    void sayThis(turn, speaker, d.rule);
  }
}

/** Rules first; a model only for the ambiguous slice. `history` excludes the turn itself. */
async function decideAddressed(turn: AddressTurn, history: AddressTurn[]): Promise<AddressDecision & { ms?: number }> {
  const wearer = wearerTracker.wearer();
  const decision = isAddressed(turn, history, wearer, profile.names);
  if (decision.verdict !== "ask") return decision;
  const started = performance.now();
  try {
    const answer = parseYesNo(await askSpark(addressMessages(turn, history, wearer, profile.names)));
    const ms = Math.round(performance.now() - started);
    // An unreadable answer counts as "not aimed at the wearer": a missed cue beats a false buzz.
    return { verdict: answer ? "addressed" : "not-addressed", rule: "model", ms };
  } catch (error) {
    console.error(`[address] model check failed: ${(error as Error).message.slice(0, 200)}`);
    return { verdict: "not-addressed", rule: "none" };
  }
}

async function onScreen(jpeg: Buffer): Promise<void> {
  const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  if (!key) {
    broadcast({ kind: "cue", label: "PHOTO", text: `${Math.round(jpeg.length / 1024)} KB from the clip`, photo });
    return;
  }
  const started = performance.now();
  try {
    const reply = await askSpark([
      { role: "system", content: ON_SCREEN_PROMPT },
      { role: "user", content: [{ type: "text", text: "What am I looking at?" }, { type: "image_url", image_url: { url: photo } }] },
    ]);
    const ms = Math.round(performance.now() - started);
    const text = toCue(reply, 110);
    record({ at: Date.now(), kind: "cue", label: "ON SCREEN", text, ms }, { photo });
    device?.write("B");
    console.log(`[look] ${ms} ms · ${text}`);
  } catch (error) {
    broadcast({ kind: "cue", label: "PHOTO", text: "Could not read the photo", photo });
    console.error(`[look] failed: ${(error as Error).message.slice(0, 200)}`);
  }
}

// --- Meetings: start and end from the phone, notes extracted at the end ----------------------------

let current: Meeting | undefined;
/** ASR turn id → the meeting turn it became, so a late addressing decision can flag it. */
const meetingTurns = new Map<string, MeetingTurn>();
/** Deleted while their notes were still being written: the late result must not bring them back. */
const deletedMeetings = new Set<string>();
let lastSpeechAt = 0;

const meetingSummary = (m: Meeting) => ({
  id: m.id,
  title: m.title,
  startedAt: m.startedAt,
  endedAt: m.endedAt,
  status: m.status,
  turns: m.turns.length,
  notes: m.notes,
  stats: m.stats,
  dropped: m.droppedItems,
});

function meetingsEvent() {
  const all = meetings.list();
  return {
    kind: "meetings",
    items: all.reverse().map(meetingSummary),
    language: { glossary: viewGlossary(language.glossary), ...totalAskedAnswered(all.map((m) => m.stats)) },
  };
}

function broadcastMeetings(): void {
  broadcast(meetingsEvent());
}

function syncMeeting(): void {
  const m = current;
  setStatus({ meeting: m ? { id: m.id, title: m.title, startedAt: m.startedAt, turns: m.turns.length } : null });
}

function startMeeting(title: string): void {
  if (current) return;
  const draft = newMeeting(title, Date.now());
  current = { ...draft, id: meetings.uniqueId(draft.id) };
  lastSpeechAt = Date.now();
  meetings.save(current);
  syncMeeting();
  broadcastMeetings();
  console.log(`[meeting] started ${current.id}${current.title ? ` "${current.title}"` : ""}`);
}

async function endMeeting(reason: "manual" | "silence" | "restart"): Promise<void> {
  const m = current;
  if (!m) return;
  current = undefined;
  m.endedAt = Date.now();
  m.endReason = reason;
  // Labels are only certain once enough was heard: the wearer is known by the end.
  const wearerLabel = wearerTracker.wearer();
  for (const t of m.turns) if (wearerLabel !== undefined && t.speaker === wearerLabel) t.wearer = true;
  m.stats = countAskedAnswered(m.turns);
  m.status = isTooShort(m) ? "too-short" : "extracting";
  meetings.save(m);
  syncMeeting();
  broadcastMeetings();
  console.log(`[meeting] ended ${m.id} (${reason}) · ${m.turns.length} turns${m.status === "too-short" ? " · too short for notes" : ""}`);
  if (m.status === "extracting") await extractNotes(m);
}

async function extractNotes(m: Meeting): Promise<void> {
  const started = performance.now();
  try {
    const turnIds = m.turns.map((t) => t.id);
    const text = await askSpark(extractionMessages(m), {
      extra: { response_format: { type: "json_schema", json_schema: { name: "meeting_notes", strict: true, schema: notesSchema(turnIds) } } },
      maxTokens: 3000,
    });
    const { notes, dropped } = validateNotes(JSON.parse(text), turnIds);
    m.notes = notes;
    m.droppedItems = dropped;
    m.status = "done";
    if (!deletedMeetings.has(m.id)) {
      const found = (notes.glossary ?? []).map((g) => ({ term: g.term, meaning: g.meaning, example: m.turns.find((t) => t.id === g.evidence[0])?.text ?? "" }));
      language.set(mergeGlossary(language.glossary, found, m.id, m.endedAt ?? Date.now()));
    }
    console.log(
      `[meeting] notes for ${m.id} in ${Math.round(performance.now() - started)} ms · ${notes.decisions.length} decisions, ${notes.commitments.length} commitments, ${notes.openQuestions.length} open · ${dropped} dropped`,
    );
  } catch (error) {
    m.status = "failed";
    m.error = (error as Error).message.slice(0, 200);
    console.error(`[meeting] notes for ${m.id} failed: ${m.error}`);
  }
  if (deletedMeetings.has(m.id)) return;
  meetings.save(m);
  broadcastMeetings();
}

/** A hub that stopped mid-meeting finishes it on the next start. */
for (const m of meetings.list().filter((x) => x.status === "running" || x.status === "extracting")) {
  current = m;
  m.status = "running";
  void endMeeting("restart");
}

setInterval(() => {
  if (current && silenceExpired(lastSpeechAt, Date.now(), MEETING_SILENCE_MS)) void endMeeting("silence");
}, 5000);

// --- What is happening: periodic and on-demand summaries ---------------------------------------

let lastSummaryAt = Date.now();
let summarizing = false;

async function summarize(asked: boolean): Promise<void> {
  if (!key || summarizing) return;
  const windowStart = asked ? Date.now() - 10 * 60_000 : lastSummaryAt;
  const recent = day.since(windowStart).filter((e) => e.kind === "turn" || e.kind === "live");
  if (!recent.length) {
    if (asked) record({ at: Date.now(), kind: "summary", text: "Nada nuevo en los últimos 10 minutos." });
    return;
  }
  summarizing = true;
  const started = performance.now();
  try {
    const lines = recent.map((e) =>
      e.kind === "turn" ? `${new Date(e.at).toLocaleTimeString()} ${e.speaker ?? "?"}: ${e.text}` : `${new Date(e.at).toLocaleTimeString()} [seen] ${e.text}`,
    );
    const reply = await askSpark([
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: lines.join("\n") },
    ]);
    lastSummaryAt = Date.now();
    const text = reply.trim().replace(/\s+/g, " ").slice(0, 400);
    record({ at: Date.now(), kind: "summary", text }, { ms: Math.round(performance.now() - started) });
    console.log(`[summary] ${text}`);
  } catch (error) {
    console.error(`[summary] failed: ${(error as Error).message.slice(0, 200)}`);
  } finally {
    summarizing = false;
  }
}

setInterval(() => {
  const due = Date.now() - lastSummaryAt >= SUMMARY_EVERY_MS;
  const heardSomething = day.since(lastSummaryAt).some((e) => e.kind === "turn");
  if (due && heardSomething && status.listening && device) void summarize(false);
}, 30_000);

// --- Live view: photo → description → next photo, paced by the model itself --------------------

let liveBusySince = 0;
let lastLive = "";

function requestLiveFrame(): void {
  if (!status.live || !device || liveBusySince) return;
  liveBusySince = Date.now();
  device.write("P");
}

setInterval(() => {
  if (status.live && liveBusySince && Date.now() - liveBusySince > 10_000) liveBusySince = 0;
  requestLiveFrame();
}, 1000);

async function describeLive(jpeg: Buffer): Promise<void> {
  const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const started = performance.now();
  try {
    if (!key) {
      broadcast({ kind: "live", text: "", photo });
      return;
    }
    const reply = await askSpark([
      { role: "system", content: LIVE_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: lastLive ? `Previous description: ${lastLive}` : "First frame." },
          { type: "image_url", image_url: { url: photo } },
        ],
      },
    ]);
    const ms = Math.round(performance.now() - started);
    const text = toCue(reply, 120);
    if (text && text !== lastLive) {
      lastLive = text;
      record({ at: Date.now(), kind: "live", text }, { ms, photo });
    } else {
      broadcast({ kind: "live", text: "", ms, photo });
    }
    console.log(`[live] ${ms} ms · ${Math.round(jpeg.length / 1024)} KB · ${text}`);
  } catch (error) {
    broadcast({ kind: "live", text: "", photo });
    console.error(`[live] failed: ${(error as Error).message.slice(0, 200)}`);
  } finally {
    liveBusySince = 0;
    setTimeout(requestLiveFrame, LIVE_GAP_MS);
  }
}

// --- Controls from the phone ---------------------------------------------------------------------

function setMode(mode: Mode): void {
  setStatus({ mode });
  device?.write(mode === "camera" ? "C" : "c");
  if (mode === "mic" && status.live) setLive(false);
}

function setLive(on: boolean): void {
  if (on === status.live) return;
  if (on && status.mode === "mic") setMode("camera");
  lastLive = "";
  liveBusySince = 0;
  setStatus({ live: on });
  if (on) requestLiveFrame();
}

function setEveryQuestion(on: boolean): void {
  profile.setEveryQuestion(on);
  setStatus({ everyQuestion: on });
}

function setListening(on: boolean): void {
  setStatus({ listening: on });
  device?.write(on ? "M" : "m");
  if (on) startAsr();
  else {
    stopAsr();
    setStatus({ asr: "paused" });
  }
}

// --- The clip ------------------------------------------------------------------------------------

let device: Socket | undefined;
let asr: AsrSession | undefined;
let pacer: ReturnType<typeof setInterval> | undefined;
let jitter = new JitterBuffer(FRAME_BYTES, FRAME_BYTES * 25);
let conditioner = new AudioConditioner(MIC_GAIN);
let timeline = new AudioTimeline(FRAME_BYTES);
/** Wall-clock time of the first audio frame of this connection: session audio 0 ms. */
let audioOrigin = 0;
let loudness = new LoudnessRing(FRAME_MS);
const wearerTracker = new WearerTracker();

/** Announce the wearer's label to the phone whenever it changes. */
function syncWearer(): void {
  const label = wearerTracker.wearer() ?? "";
  if (label !== status.wearer) {
    setStatus({ wearer: label });
    console.log(`[wearer] ${label ? `speaker ${label} is the wearer` : "not identified"}`);
  }
}

function startAsr(): void {
  if (!key || !device || !status.listening || asr) return;
  setStatus({ asr: "connecting to Muse Voice Transcribe…" });
  const session = new AsrSession(key, {
    onStatus: (s) => setStatus({ asr: s }),
    onPartial: (text) => broadcast({ kind: "partial", text }),
    onSessionStart: () => {
      speakerOfTurn.clear();
      meetingTurns.clear();
      wearerTracker.reset();
      syncWearer();
    },
    onSpeaker: (turnId, speaker) => {
      speakerOfTurn.set(turnId, speaker);
      broadcast({ kind: "speaker", turnId, speaker });
      wearerTracker.noteSpeaker(turnId, speaker);
      syncWearer();
    },
    onTurn: (turn) => {
      const earlier = day.entries.filter((e): e is Extract<DayEntry, { kind: "turn" }> => e.kind === "turn").slice(-ADDRESS_HISTORY_TURNS).map(toAddressTurn);
      if (turn.startMs !== undefined && turn.endMs !== undefined) wearerTracker.noteLoudness(turn.turnId, loudness.medianBetween(turn.startMs, turn.endMs));
      if (isEnrollment(turn.text, profile.names)) wearerTracker.noteEnrollment(turn.turnId);
      if (turn.speaker !== undefined) wearerTracker.noteSpeaker(turn.turnId, turn.speaker);
      syncWearer();
      const question = isQuestion(turn.text);
      const anchor =
        turn.startMs === undefined || turn.endMs === undefined || !audioOrigin
          ? {}
          : { audioStartMs: Math.round(turn.startMs), audioEndMs: Math.round(turn.endMs), spokeAt: audioOrigin + Math.round(turn.startMs) };
      if (current) {
        const added = addTurn(current, { at: Date.now(), startAt: anchor.spokeAt, speaker: turn.speaker, wearer: turn.speaker !== undefined && turn.speaker === wearerTracker.wearer(), text: turn.text });
        meetingTurns.set(turn.turnId, added);
        lastSpeechAt = Date.now();
        meetings.save(current);
        syncMeeting();
      }
      record({ at: Date.now(), kind: "turn", speaker: turn.speaker, text: turn.text, question, ...anchor }, { turnId: turn.turnId });
      const where = anchor.audioStartMs === undefined ? "" : ` [${anchor.audioStartMs}–${anchor.audioEndMs} ms]`;
      console.log(`[turn] ${turn.speaker ?? "?"}: ${turn.text}${where}${question ? "  ← question" : ""}`);
      if (question && key) void cueIfAddressed(turn, earlier, anchor.spokeAt);
    },
  });
  asr = session;
  session.start();
  // Feed transcription on a steady clock so Wi-Fi bursts never look like a stall.
  pacer = setInterval(() => {
    const startMs = jitter.consumedMs;
    session.send(jitter.take(), startMs);
  }, FRAME_MS);
}

function stopAsr(): void {
  if (pacer) clearInterval(pacer);
  pacer = undefined;
  asr?.stop();
  asr = undefined;
}

const tcp = createTcpServer((socket) => {
  device?.destroy();
  device = socket;
  socket.setNoDelay(true);
  const parser = new ClipFrameParser();
  conditioner = new AudioConditioner(MIC_GAIN);
  jitter = new JitterBuffer(FRAME_BYTES, FRAME_BYTES * 25);
  timeline = new AudioTimeline(FRAME_BYTES);
  audioOrigin = 0;
  loudness = new LoudnessRing(FRAME_MS);
  let helloSeen = false;
  let lastLevel = 0;
  console.log(`[clip] connected from ${socket.remoteAddress}`);
  // The hub owns the settings: a clip that reconnects picks them up again.
  socket.write(status.mode === "camera" ? "C" : "c");
  socket.write(status.listening ? "M" : "m");
  setStatus({ clip: true, audioLost: 0, audioLate: 0, asr: key ? (status.listening ? status.asr : "paused") : status.asr });
  startAsr();

  socket.on("data", (chunk) => {
    let frames;
    try {
      frames = parser.push(chunk);
    } catch (error) {
      console.error(`[clip] bad stream: ${(error as Error).message}`);
      socket.destroy();
      return;
    }
    for (const frame of frames) {
      if (!helloSeen) {
        const result = frame.type === "H" ? parseHello(frame.payload) : ({ ok: false, reason: `the first frame is "${frame.type}", not a hello` } as const);
        if (!result.ok) {
          console.error(`[clip] refused: ${result.reason}`);
          if (status.clipError !== result.reason) setStatus({ clipError: result.reason });
          socket.destroy();
          return;
        }
        helloSeen = true;
        if (status.clipError) setStatus({ clipError: "" });
        const h = result.hello;
        console.log(`[clip] hello v${h.proto} fw=${h.fw} ${h.codec} ${h.rate} Hz`);
        continue;
      }
      if (frame.type === "A") {
        let audio;
        try {
          audio = parseAudioFrame(frame.payload);
        } catch (error) {
          console.error(`[clip] bad stream: ${(error as Error).message}`);
          socket.destroy();
          return;
        }
        const lateBefore = timeline.late;
        const { pcm: aligned, lost } = timeline.accept(audio.seq, audio.pcm);
        if (!audioOrigin) audioOrigin = Date.now();
        if (lost) console.log(`[audio] lost ${lost} frame(s) before seq ${audio.seq}: filled ${lost * FRAME_MS} ms with silence · total lost ${timeline.lost}, late ${timeline.late}`);
        if (timeline.late > lateBefore) console.log(`[audio] late or duplicate frame seq ${audio.seq} dropped · total lost ${timeline.lost}, late ${timeline.late}`);
        if (lost || timeline.late > lateBefore) setStatus({ audioLost: timeline.lost, audioLate: timeline.late });
        const clean = conditioner.process(aligned);
        jitter.push(clean);
        loudness.push(rms(clean));
        const now = Date.now();
        if (now - lastLevel > 200) {
          lastLevel = now;
          broadcast({ kind: "level", rms: Math.round(rms(clean)) });
        }
      } else if (frame.type === "J") {
        const jpeg = Buffer.from(frame.payload);
        if (status.live) void describeLive(jpeg);
        else {
          console.log(`[clip] photo ${Math.round(jpeg.length / 1024)} KB`);
          void onScreen(jpeg);
        }
      }
    }
  });

  socket.on("close", () => {
    if (device !== socket) return;
    stopAsr();
    device = undefined;
    liveBusySince = 0;
    setStatus({ clip: false, asr: key ? "waiting for the clip…" : status.asr });
    console.log("[clip] disconnected");
  });
  socket.on("error", (error) => console.error(`[clip] ${error.message}`));
});

// --- Web: the phone page, its event stream, its buttons and the voice --------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function speak(res: ServerResponse, text: string): Promise<void> {
  if (!elevenKey) return void res.writeHead(404).end();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": elevenKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: text.slice(0, 500), model_id: "eleven_flash_v2_5" }),
  });
  if (!r.ok) {
    console.error(`[tts] ElevenLabs HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return void res.writeHead(502).end();
  }
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
  res.end(Buffer.from(await r.arrayBuffer()));
}

const ACTIONS: Record<string, () => void> = {
  "/look": () => device?.write("P"),
  "/live/on": () => setLive(true),
  "/live/off": () => setLive(false),
  "/mode/camera": () => setMode("camera"),
  "/mode/mic": () => setMode("mic"),
  "/listen/on": () => setListening(true),
  "/listen/off": () => setListening(false),
  "/summary": () => void summarize(true),
  "/cues/all": () => setEveryQuestion(true),
  "/cues/addressed": () => setEveryQuestion(false),
};

// What makes the phone page installable: manifest and icons, drawn in src/brand.ts.
const ICON_SIZES: Record<string, number> = { "/icon-192.png": 192, "/icon-512.png": 512, "/apple-touch-icon.png": 180 };
const iconCache = new Map<string, Buffer>();

const web = createHttpServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/manifest.webmanifest") {
      res.writeHead(200, { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" });
      res.end(webManifest());
    } else if (req.method === "GET" && req.url === "/icon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" });
      res.end(logoSvg());
    } else if (req.method === "GET" && req.url && ICON_SIZES[req.url]) {
      if (!iconCache.has(req.url)) iconCache.set(req.url, iconPng(ICON_SIZES[req.url]));
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
      res.end(iconCache.get(req.url));
    } else if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(PILOT_PAGE);
    } else if (req.method === "GET" && req.url === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(`data: ${JSON.stringify(status)}\n\n`);
      res.write(`data: ${JSON.stringify({ kind: "history", items: day.entries.slice(-80) })}\n\n`);
      res.write(`data: ${JSON.stringify(meetingsEvent())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else if (req.method === "POST" && req.url === "/meeting/start") {
      const { title } = JSON.parse((await readBody(req)) || "{}") as { title?: string };
      startMeeting(typeof title === "string" ? title : "");
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/meeting/end") {
      void endMeeting("manual");
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/meetings/delete") {
      const { id } = JSON.parse((await readBody(req)) || "{}") as { id?: string };
      const removed = typeof id === "string" && id !== current?.id && meetings.delete(id);
      if (removed) {
        deletedMeetings.add(id as string);
        language.set(forgetMeeting(language.glossary, id as string));
        broadcastMeetings();
      }
      res.writeHead(removed ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/meetings/delete-all") {
      for (const m of [...meetings.list(), ...(current ? [current] : [])]) deletedMeetings.add(m.id);
      if (current) {
        current = undefined; // discarded, not summarized
        syncMeeting();
      }
      language.set([]);
      console.log(`[meeting] deleted ${meetings.deleteAll()} meeting(s)`);
      broadcastMeetings();
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/profile") {
      const { names } = JSON.parse((await readBody(req)) || "{}") as { names?: string };
      setStatus({ names: profile.setNames(typeof names === "string" ? names : "") });
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/tts") {
      const { text } = JSON.parse((await readBody(req)) || "{}") as { text?: string };
      await speak(res, text ?? "");
    } else if (req.method === "POST" && req.url && ACTIONS[req.url]) {
      ACTIONS[req.url]();
      res.writeHead(204).end();
    } else {
      res.writeHead(404).end();
    }
  } catch (error) {
    console.error(`[web] ${(error as Error).message}`);
    if (!res.headersSent) res.writeHead(500).end();
  }
});
setInterval(() => {
  for (const res of clients) res.write(": keep-alive\n\n");
}, 15_000);

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

tcp.listen(DEVICE_PORT, () => console.log(`Clip port ${DEVICE_PORT} (set HUB_HOST to ${lanAddresses.join(" or ")})`));
web.listen(WEB_PORT, () => {
  for (const ip of lanAddresses) console.log(`Phone: http://${ip}:${WEB_PORT}`);
  console.log(`Voice: ${elevenKey ? "ElevenLabs" : "the phone's own voice (set ELEVENLABS_API_KEY for ElevenLabs)"}`);
  if (!key) console.log("MODEL_API_KEY is not set: the page shows connection, audio level and photos only.");
});
