// Lente pilot hub. The clip on the glasses streams microphone audio over TCP and
// sends a photo when its button (or the phone's Look button) is pressed. Muse Voice
// Transcribe turns the audio into turns; when a turn is a question, Muse Spark writes
// a reply the wearer can say, a photo gets a one-line "on screen" read, and every few
// minutes Spark sums up what is happening. A phone on the same Wi-Fi follows along at
// http://<laptop>:8080 and can read everything out loud.
//
// Modes: camera + mic, or mic only (the clip powers the camera down to save battery).
// Listening can be paused, and starts paused: the wearer starts it from the phone. While listening,
// a silence gate sends audio to transcription only around speech, and Lente pauses itself when the
// wearer has been silent for a while with no meeting open. Today's spend is kept in data/usage.json.
// Solo grabar records without cues and splits the day into episodes that get notes like meetings.
// The day is kept as text in data/days/ (git-ignored).
//
// Usage: pnpm pilot   (MODEL_API_KEY in .env; ELEVENLABS_API_KEY optional for a natural voice)

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createTcpServer } from "node:net";
import { createSocket } from "node:dgram";
import type { Duplex } from "node:stream";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AsrSession, type AsrTurn } from "./asr-session.ts";
import { type ChatMessage, completeChat, streamReply } from "./chat.ts";
import { AudioConditioner, AudioTimeline, COMMANDS, ClipFrameParser, DISCOVERY_PORT, JitterBuffer, discoveryReply, PHONE_DEVICE, isQuestion, parseAudioFrame, parseHello, rms, toCue } from "./clip-protocol.ts";
import { ask, askSchema } from "./ask.ts";
import { DayLog, type DayEntry } from "./day-log.ts";
import { iconPng, logoSvg, webManifest } from "./brand.ts";
import { DESKTOP_PAGE } from "./desktop-page.ts";
import { PILOT_PAGE } from "./pilot-page.ts";
import { DEVICE_WS_PATH, acceptDevice } from "./ws-device.ts";
import { DeviceAuth, SESSION_COOKIE } from "./device-auth.ts";
import { HealthTracker } from "./health.ts";
import { PAIR_PAGE } from "./pair-page.ts";
import { type AuthMode, decideUpgrade, decideWeb } from "./access-gate.ts";
import { type Identity, type IdentitySources, LOCAL_OWNER, identify } from "./identify.ts";
import { BUSY_MESSAGE, EVICT_CHECK_MS, WearerRegistry, mayStartListening, parseListeningCap } from "./wearer-registry.ts";
import { UserAuth } from "./user-auth.ts";
import { FileDeviceStore, UserDevices, deviceRoute } from "./user-devices.ts";
import { Accounts, CLOSED_TEST_MESSAGE, FileAccountStore, JsonFile, parseAllowList } from "./accounts.ts";
import { checkKekAtStart, keksFromEnv } from "./kek-check.ts";
import { DatabaseHealth, dbFailing } from "./db-health.ts";
import { SupabaseRest } from "./supabase-rest.ts";
import { type CachedStores, openCachedStores } from "./cached-stores.ts";
import { type DigestCall, writeProfile } from "./digests.ts";
import { NightlyDigests, catchUp, localDay, localDayStart } from "./nightly.ts";
import { askTiers } from "./ask-tiers.ts";
import { SupabaseAccounts, SupabaseDevices, supabaseCanaries } from "./supabase-stores.ts";
import { type AddressDecision, type AddressTurn, addressMessages, isAddressed, parseNames, parseYesNo } from "./addressing.ts";
import { LanguageStore } from "./language-store.ts";
import { countAskedAnswered, forgetMeeting, mergeGlossary, totalAskedAnswered, viewGlossary, wearerPhrases } from "./language-profile.ts";
import { type Briefing, briefingMessages, briefingSchema, citedSources, memoryPrefix, parseReply, rememberedMeetings, replyMessages, validateBriefing } from "./briefing.ts";
import { FactStore, keptFacts } from "./fact-store.ts";
import { MeetingStore } from "./meeting-store.ts";
import { ActionStore, decide, parseDecision } from "./action-store.ts";
import { runApproved } from "./agent-loop.ts";
import { TraceWriter, traceLine } from "./agent-trace.ts";
import { TaskStore, meetingTools } from "./agent-tools.ts";
import { EPISODE_MAX_MS, EPISODE_SILENCE_MS, type EndReason, type EpisodePolicy, type Meeting, type MeetingTurn, addTurn, applyTitleAndTopic, episodeEnd, extractionMessages, isTooShort, newMeeting, notesAsText, notesSchema, searchMeetings, silenceExpired, validateNotes } from "./meetings.ts";
import { type AssistMode, ProfileStore } from "./profile.ts";
import { type RecordedSnapshot, RecordedToday } from "./recorded-time.ts";
import { LoudnessRing, WearerTracker, isEnrollment } from "./wearer.ts";
import { type ChatTarget, chatTargets } from "./providers.ts";
import { CUE_FIRST_TOKEN_TIMEOUT_MS, RoutePolicy } from "./routing.ts";
import { ArrivalClock, type Stages, formatStages } from "./stages.ts";
import { SessionClock, connectEvents } from "./live-session.ts";
import { HELP_REFUSALS, type HelpOutcome, requestHelp } from "./help.ts";
import { GATE_DEFAULTS, SilenceGate } from "./silence-gate.ts";
import { IDLE_PAUSE_MIN, IdleWatch } from "./idle-pause.ts";
import { NarrationGuard } from "./self-voice.ts";
import { type UsageSnapshot, UsageMeter } from "./usage-meter.ts";

const DEVICE_PORT = Number(process.env.PILOT_DEVICE_PORT ?? 7070);
const WEB_PORT = Number(process.env.PILOT_WEB_PORT ?? 8080);
const MIC_GAIN = Number(process.env.PILOT_MIC_GAIN ?? 10);
const SUMMARY_EVERY_MS = Number(process.env.PILOT_SUMMARY_MIN ?? 5) * 60_000;
const LANGUAGE = process.env.PILOT_LANG ?? "Spanish";
const FRAME_MS = 80;
const FRAME_BYTES = (16000 * 2 * FRAME_MS) / 1000;
/** Live view: wait between a frame arriving and asking for the next; frames show as they come, the model describes the newest. */
const LIVE_FRAME_GAP_MS = 600;
/** Days of the record (what was heard and seen outside meetings) the chat with Lente remembers. */
const ASK_DAYS = 7;
const MEETING_SILENCE_MS = Number(process.env.PILOT_MEETING_SILENCE_S ?? 600) * 1000;
/** Solo grabar's automatic episodes; the eval and the checks shorten them. */
const EPISODES: EpisodePolicy = {
  silenceMs: process.env.PILOT_EPISODE_SILENCE_S ? Number(process.env.PILOT_EPISODE_SILENCE_S) * 1000 : EPISODE_SILENCE_MS,
  maxMs: process.env.PILOT_EPISODE_MAX_MIN ? Number(process.env.PILOT_EPISODE_MAX_MIN) * 60_000 : EPISODE_MAX_MS,
};
/** Where the day, meetings and profile are kept; the eval runner points it at a scratch folder. */
const DATA_DIR = process.env.PILOT_DATA_DIR ?? fileURLToPath(new URL("../data/", import.meta.url));
const key = process.env.MODEL_API_KEY;
const elevenKey = process.env.ELEVENLABS_API_KEY;
const elevenVoice = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

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

function readJson<T>(file: string, tag: string): Partial<T> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Partial<T>;
  } catch (error) {
    console.error(`[${tag}] could not read ${file}: ${(error as Error).message}`);
    return undefined;
  }
}

/** Cloud hub: clips need a device token and browsers a pairing; the laptop hub (no LENTE_CLOUD) stays open on the LAN. */
const CLOUD = process.env.LENTE_CLOUD === "1";
const auth = CLOUD ? new DeviceAuth(join(DATA_DIR, "devices.json")) : undefined;
/** Accounts (add-accounts): with a Supabase project configured, every request acts for a signed-in user. */
const SUPABASE_URL = process.env.SUPABASE_URL;
const userAuth = SUPABASE_URL ? new UserAuth(SUPABASE_URL) : undefined;
const supabase = SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? new SupabaseRest({ url: SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY }) : undefined;
/** The database in health and on the phone (decision 13); checked every minute so a paused project shows. */
const dbHealth = supabase ? new DatabaseHealth(() => supabase.system.ping()) : undefined;
const DB_CHECK_EVERY_MS = 60_000;
const AUTH_MODE: AuthMode = userAuth ? "accounts" : auth ? "pairing" : "open";
/**
 * What was said, heard or seen, as the log may show it: in full on the owner's own hub, only its
 * length on a hub with accounts, whose logs must never carry users' content (task 2.3).
 */
const LOG_CONTENT = AUTH_MODE !== "accounts";
const said = (text: string | undefined): string => (LOG_CONTENT ? (text ?? "") : `‹${(text ?? "").length} chars›`);
/** Accounts mode: each user's clips, desktops and MCP clients, by token hash. */
const userDevices = userAuth ? new UserDevices(supabase ? new SupabaseDevices(supabase) : new FileDeviceStore(join(DATA_DIR, "user-devices.json"))) : undefined;
/** Accounts mode: a KEK that opens its canary, and accounts only for the allow list. */
const accounts = userAuth ? await openAccounts() : undefined;

async function openAccounts(): Promise<Accounts> {
  try {
    const keks = keksFromEnv(process.env);
    const canaries = new JsonFile<Record<string, string>>(join(DATA_DIR, "kek-canaries.json"), () => ({}));
    // The canary sits next to the wrapped keys it vouches for: in the database when there is one.
    await checkKekAtStart(keks, supabase ? supabaseCanaries(supabase) : {
      read: async (version) => (canaries.read()[version] ? Buffer.from(canaries.read()[version]!, "base64") : undefined),
      write: async (version, sealed) => canaries.write({ ...canaries.read(), [version]: sealed.toString("base64") }),
    });
    const allowed = parseAllowList(process.env.LENTE_ALLOWED_EMAILS);
    if (allowed.size === 0) console.warn("LENTE_ALLOWED_EMAILS is empty: nobody can open an account.");
    return new Accounts(supabase ? new SupabaseAccounts(supabase) : new FileAccountStore(join(DATA_DIR, "accounts.json")), keks, allowed);
  } catch (error) {
    console.error(`Accounts cannot start: ${(error as Error).message}`);
    process.exit(1);
  }
}

/** Accounts mode: the refusal for a caller outside the allow list or without an account, if any. */
async function refusal(who: Identity | undefined): Promise<string | undefined> {
  if (!accounts || !who) return undefined;
  const admission = await accounts.admit(who.userId, who.email);
  if (admission.ok) return undefined;
  return JSON.stringify({ error: admission.reason, message: admission.reason === "closed_test" ? CLOSED_TEST_MESSAGE : "Inicia sesión de nuevo." });
}
const identitySources: IdentitySources = {
  mode: AUTH_MODE,
  cookieName: SESSION_COOKIE,
  pairedSession: (cookie) => Boolean(auth?.checkSession(cookie)),
  knownDevice: (token) => Boolean(auth?.checkDevice(token)),
  verifyAccessToken: (token) => userAuth!.verify(token),
  deviceUser: (token) => userDevices!.resolve(token),
};
/** Who each admitted request acts for; read by the routes once the hub keeps one runtime per user. */
const requestIdentity = new WeakMap<IncomingMessage, Identity>();
const health = new HealthTracker();

/** A broken model or transcription key, as a reason class for the phone's note (no text from the call). */
const modelDown = () => {
  const h = health.snapshot();
  return h.model.state === "failing" ? h.model.reason : h.transcription.state === "failing" ? h.transcription.reason : "";
};
/** A failing database as its state (`paused`, `unreachable`, `refused`), `""` when fine or not configured. */
const databaseDown = (): string => {
  const db = dbHealth?.peek();
  return db && dbFailing(db.state) ? db.state : "";
};
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

// What makes the phone page installable: manifest and icons, drawn in src/brand.ts.
const ICON_SIZES: Record<string, number> = { "/icon-192.png": 192, "/icon-512.png": 512, "/apple-touch-icon.png": 180 };
const iconCache = new Map<string, Buffer>();

/** Behind the platform's TLS proxy a plain-HTTP request carries `x-forwarded-proto: http`. */
const plainHttp = (req: IncomingMessage): boolean => req.headers["x-forwarded-proto"] === "http";

/** GET /health: three checks and an overall flag; reasons are classes, never content. Storage is probed with a write. */
function healthReport() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const probe = join(DATA_DIR, ".health");
    writeFileSync(probe, String(Date.now()));
    readFileSync(probe);
    health.ok("storage");
  } catch (error) {
    health.failed("storage", (error as Error).message);
  }
  return health.snapshot();
}

/** Web gate: /health, and on a cloud hub TLS and pairing. Returns true when the request was answered here. */
async function gateWeb(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = req.url?.split("?")[0];
  const who = await identify({ authorization: req.headers.authorization, cookie: req.headers.cookie, url: req.url }, identitySources, "web");
  const refused = path === "/health" ? undefined : await refusal(who);
  if (refused) {
    res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(refused);
    return true;
  }
  if (who) requestIdentity.set(req, who);
  switch (decideWeb({ method: req.method, path, plainHttp: plainHttp(req), identified: Boolean(who) }, AUTH_MODE)) {
    case "health": {
      const base = healthReport();
      const database = dbHealth ? await dbHealth.check() : undefined;
      const report = database ? { ...base, ok: base.ok && !dbFailing(database.state), database } : base;
      res.writeHead(report.ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(report));
      return true;
    }
    case "pass":
      return false;
    case "redirect-https":
      res.writeHead(308, { Location: `https://${req.headers.host ?? ""}${req.url}` }).end();
      return true;
    case "pair": {
      const { code } = JSON.parse((await readBody(req)) || "{}") as { code?: string };
      const token = typeof code === "string" ? auth?.pair(code) : undefined;
      if (!token) res.writeHead(403, { "Cache-Control": "no-store" }).end();
      else res.writeHead(204, { "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000` }).end();
      return true;
    }
    case "pair-page":
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(PAIR_PAGE);
      return true;
    case "signin-page":
    case "auth":
      // Web sign-in with Google lands with add-accounts 3.2; until then the app signs in with a bearer token.
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Inicia sesión desde la app de Lente.");
      return true;
    default:
      res.writeHead(401, { "Cache-Control": "no-store" }).end();
      return true;
  }
}


// --- One wearer's live state (add-accounts 6.1) ------------------------------------------------

/**
 * Everything that belongs to one wearer: their stores, the clip link and transcription session,
 * the meeting in progress, idle pause and the silence gate, the phone's event stream, the usage
 * meter and the live view. The laptop hub has one, for its owner, kept in `DATA_DIR` as before; a
 * hub with accounts makes one per signed-in user on first use and evicts it when idle.
 */
function createWearerRuntime(userId: string, dataDir: string, mayListen: () => boolean = () => true, sealed?: CachedStores) {
  /** The runtime's repeating jobs, cleared when it is evicted. */
  const timers: ReturnType<typeof setInterval>[] = [];
  const every = (fn: () => void, ms: number): void => void timers.push(setInterval(fn, ms));

  // The laptop's files, or a signed-in user's sealed stores answered from memory (task 6.5).
  const meetings = sealed?.meetings ?? new MeetingStore(join(dataDir, "meetings"));
  const facts = sealed?.facts ?? new FactStore(join(dataDir, "facts.json"));
  const actions = sealed?.actions ?? new ActionStore(join(dataDir, "actions.json"));
  const taskStore = sealed?.tasks ?? new TaskStore(join(dataDir, "tasks.json"));
  const traces = sealed?.traces ?? new TraceWriter(join(dataDir, "traces"));
  // An account's reminders file lives only while its runtime does, never on the volume in the clear.
  const REMINDERS_FILE = sealed ? join(mkdtempSync(join(tmpdir(), "lente-reminders-")), "reminders.ics") : join(dataDir, "reminders.ics");
  const language = sealed?.language ?? new LanguageStore(join(dataDir, "language.json"));
  const profile = sealed?.profile ?? new ProfileStore(join(dataDir, "profile.json"));
  const RECORDED_FILE = join(dataDir, "recorded.json");
  const recorded = new RecordedToday(readRecorded());
  /** How often the phone hears the recorded time while audio arrives, and how often it is saved. */
  const RECORDED_PUSH_MS = 1000;
  const RECORDED_SAVE_MS = 10_000;
  /** Lente pauses itself after this long without the wearer speaking (no meeting open). */
  const IDLE_MS = Number(process.env.PILOT_IDLE_MIN ?? IDLE_PAUSE_MIN) * 60_000;
  const IDLE_CHECK_MS = 5000;
  /** The silence gate's speech level and hangover; the rest are GATE_DEFAULTS. */
  const GATE = {
    minSpeechRms: Number(process.env.PILOT_SPEECH_RMS ?? GATE_DEFAULTS.minSpeechRms),
    hangoverMs: Number(process.env.PILOT_GATE_HANGOVER_MS ?? GATE_DEFAULTS.hangoverMs),
  };
  const USAGE_FILE = join(dataDir, "usage.json");
  const usage = new UsageMeter(sealed ? sealed.usage.initial : readJson<UsageSnapshot>(USAGE_FILE, "usage"));
  const USAGE_PUSH_MS = 5000;
  function readRecorded(): Partial<RecordedSnapshot> | undefined {
    return readJson<RecordedSnapshot>(RECORDED_FILE, "recorded");
  }

  let recordedSavedAt = 0;
  function saveRecorded(): void {
    recordedSavedAt = Date.now();
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(RECORDED_FILE, JSON.stringify(recorded.snapshot()) + "\n");
    } catch (error) {
      console.error(`[recorded] could not save ${RECORDED_FILE}: ${(error as Error).message}`);
    }
  }

  const recordedEvent = () => ({ kind: "recorded", ms: recorded.total() });

  let usageSavedAt = 0;
  let usageChanged = false;
  function saveUsage(): void {
    usageSavedAt = Date.now();
    usageChanged = false;
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(USAGE_FILE, JSON.stringify(usage.snapshot()) + "\n");
      sealed?.usage.save(usage.snapshot());
    } catch (error) {
      console.error(`[usage] could not save ${USAGE_FILE}: ${(error as Error).message}`);
    }
  }

  /** Today's seconds sent, tokens per model and approximate US$, for "Hoy" on the phone. */
  const spendEvent = () => ({ kind: "spend", ...usage.today() });

  every(() => {
    if (!usageChanged) return;
    broadcast(spendEvent());
    if (Date.now() - usageSavedAt >= RECORDED_SAVE_MS) saveUsage();
  }, USAGE_PUSH_MS);

  // --- State shared with the phone ----------------------------------------------------------

  type Mode = "camera" | "mic";
  /** Why listening is off: not started since boot, paused or stopped from the phone, or idle. */
  type Pause = { reason: "start" | "manual" } | { reason: "idle"; at: number; basis: "wearer" | "anyone"; /** The idle time that ran out. */ min: number };
  let status = {
    kind: "status",
    clip: false,
    /** Which device is connected: the clip, or the phone page standing in for it (`""` when none). */
    device: "" as "" | "clip" | "phone",
    mode: "mic" as Mode,
    listening: false,
    pause: { reason: "start" } as Pause | null,
    live: false,
    voice: elevenKey ? "elevenlabs" : "device",
    audioLost: 0,
    audioLate: 0,
    /** The meeting in progress, if any; `auto` for a Solo grabar episode. */
    meeting: null as null | { id: string; title: string; startedAt: number; turns: number; auto?: boolean },
    /** Name and aliases other people use for the wearer (set on the phone). */
    names: profile.names,
    /** Testing: cue on every question, not only those aimed at the wearer. */
    everyQuestion: profile.everyQuestion,
    /** Asistir (cues) or Solo grabar (record and learn, no cues). */
    assistMode: profile.assistMode,
    /** Speaker label of the wearer in this transcription session, once known. */
    wearer: "",
    /** Why the last clip was refused (old firmware, bad hello); cleared by the next good hello. */
    clipError: "",
    asr: key ? "waiting for the clip…" : "no MODEL_API_KEY: audio level only",
  };

  const clients = new Set<ServerResponse>();
  const day = sealed?.day ?? new DayLog(join(dataDir, "days"));
  /** The listening session behind the phone's elapsed time; it runs while listening with the clip on. */
  const sessionClock = new SessionClock();
  /** Text of the turn in progress, for a phone that connects mid-sentence; cleared on turn and on pause. */
  let latestPartial = "";

  /** The status as sent: the session view is taken at send time so every phone shows the same elapsed time. */
  const statusEvent = () => ({ ...status, modelDown: modelDown(), databaseDown: databaseDown(), session: sessionClock.view(Date.now()) });

  /** What the phone read out loud lately; a turn that repeats it is Lente hearing itself. */
  const narration = new NarrationGuard();

  function broadcast(event: object): void {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(line);
  }

  /** Broadcast and keep it in the day's record. */
  function record(entry: DayEntry, extra: object = {}): void {
    day.add(entry);
    broadcast({ ...entry, ...extra });
  }

  /** How long a staged entry waits for a phone to acknowledge it before it is kept without `phone`. */
  const PHONE_ACK_WAIT_MS = 3000;
  const awaitingAck = new Map<string, { entry: Extract<DayEntry, { stages?: Stages }>; timer: ReturnType<typeof setTimeout> }>();
  let stagedSeq = 0;

  /**
   * Like `record`, for a card with stage timings: stamps `sent`, and keeps it in the day's record once
   * the first phone acknowledges it (POST /seen), so the record has the delivery stage too.
   */
  function recordStaged(entry: Extract<DayEntry, { stages?: Stages }>, extra: object = {}): void {
    const id = `s${++stagedSeq}`;
    entry.stages = { ...entry.stages, sent: Date.now() };
    broadcast({ ...entry, ...extra, id });
    if (!clients.size) return void day.add(entry);
    awaitingAck.set(id, { entry, timer: setTimeout(() => keepStaged(id), PHONE_ACK_WAIT_MS) });
  }

  function keepStaged(id: string, phoneAt?: number): void {
    const waiting = awaitingAck.get(id);
    if (!waiting) return;
    awaitingAck.delete(id);
    clearTimeout(waiting.timer);
    const { entry } = waiting;
    if (phoneAt !== undefined) {
      entry.stages = { ...entry.stages, phone: phoneAt };
      broadcast({ kind: "stages", id, stages: entry.stages });
    }
    day.add(entry);
    if (entry.stages) console.log(`[stages] ${entry.kind}${"label" in entry ? ` ${entry.label}` : ""} · ${formatStages(entry.stages)} ms`);
  }

  function setStatus(patch: Partial<typeof status>): void {
    status = { ...status, ...patch };
    if (status.listening && status.clip) sessionClock.run(Date.now());
    else sessionClock.hold(Date.now());
    broadcast(statusEvent());
    console.log(`[status] clip=${status.clip ? "on" : "off"} · ${status.mode} · ${status.listening ? "listening" : "paused"} · ${status.asr}`);
  }

  // --- Muse Spark ------------------------------------------------------------------------------

  let sparkTargets = chatTargets().filter((t) => t.id.startsWith("spark-1.3"));

  /** Reply cues try Muse Spark Open first, then Spark 1.3 at minimal effort; everything else stays on Spark 1.3. */
  const cueRoutes = (): ChatTarget[] => {
    const all = chatTargets();
    return ["spark-open", "spark-1.3-minimal"].flatMap((id) => all.filter((t) => t.id === id));
  };
  const routePolicy = new RoutePolicy();

  interface SparkReply {
    text: string;
    /** Wall-clock time the answering request was sent, and its first token if it was streamed. */
    askedAt: number;
    firstTokenAt?: number;
    /** The model and provider that answered. */
    model: string;
    provider: string;
  }

  /**
   * One Spark call; the phone/eval see a `usage` event per call. Cards (`stream`) stream over the
   * Responses API so their first token is timed; structured calls (`extra` with a JSON schema) use
   * Chat Completions and wait for the whole answer.
   */
  async function callSpark(messages: ChatMessage[], opts: { label: string; extra?: Record<string, unknown>; maxTokens?: number; stream?: boolean; job?: "cue" }): Promise<SparkReply> {
    let lastError: unknown;
    const job = opts.job;
    // Cue routes keep their order and a cool-down; the other jobs reorder to stick with what answered last.
    const targets = job ? routePolicy.pick(job, cueRoutes().map((t) => Object.assign(t, { configured: Boolean(t.apiKey) }))) : sparkTargets;
    for (const [i, target] of targets.entries()) {
      try {
        const askedAt = Date.now();
        const maxTokens = opts.maxTokens ?? 400;
        // The last resort has nobody to fall back to, so it gets no first-token deadline.
        const firstTokenTimeoutMs = job && i < targets.length - 1 ? CUE_FIRST_TOKEN_TIMEOUT_MS : undefined;
        const done = opts.stream ? await streamReply(target, messages, { maxTokens, firstTokenTimeoutMs }) : { ...(await completeChat(target, messages, { maxTokens, extra: opts.extra })), ttftMs: undefined };
        health.ok("model");
        if (job) routePolicy.succeeded(job, target.id);
        else sparkTargets = [target, ...sparkTargets.filter((t) => t !== target)];
        broadcast({ kind: "usage", label: opts.label, model: target.id, provider: target.provider, ms: Math.round(done.totalMs), promptTokens: done.promptTokens, cachedTokens: done.cachedTokens, completionTokens: done.completionTokens });
        usage.addCall(target.model, { input: done.promptTokens, cached: done.cachedTokens, output: done.completionTokens });
        usageChanged = true;
        broadcast(spendEvent());
        return { text: done.text, askedAt, firstTokenAt: done.ttftMs === undefined ? undefined : askedAt + Math.round(done.ttftMs), model: target.model, provider: target.provider };
      } catch (error) {
        lastError = error;
        if (job) routePolicy.failed(job, target.id);
        console.error(`[spark] ${target.id} failed: ${(error as Error).message.slice(0, 200)}`);
      }
    }
    health.failed("model", lastError instanceof Error ? lastError.message : "is not set");
    broadcast(statusEvent());
    throw lastError ?? new Error(`no provider is configured for ${job ?? "this job"}`);
  }

  const askSpark = async (messages: ChatMessage[], opts: Parameters<typeof callSpark>[1]): Promise<string> => (await callSpark(messages, opts)).text;

  const recentTurns = () =>
    day.entries
      .filter((e): e is Extract<DayEntry, { kind: "turn" }> => e.kind === "turn")
      .slice(-12)
      .map((t) => `${t.speaker ?? "?"}: ${t.text}`)
      .join("\n");

  let cueSeq = 0;

  async function sayThis(turn: AsrTurn, asker: string | undefined, why: string, stages: Stages): Promise<void> {
    const seq = ++cueSeq;
    const started = performance.now();
    try {
      const reply = await callSpark(replyMessages(memoryText(), recentTurns(), turn.text), { label: "cue", stream: true, job: "cue" });
      if (seq !== cueSeq) return; // a newer question already took the card
      if (profile.assistMode !== "assist") return; // switched to Solo grabar while the reply was on its way
      const ms = Math.round(performance.now() - started);
      const { text, meaning } = parseReply(reply.text, turn.text);
      if (!text) return;
      const timed = { ...stages, asked: reply.askedAt, firstToken: reply.firstTokenAt, done: Date.now() };
      recordStaged({ at: Date.now(), kind: "cue", label: "DILO", text, meaning, ms, asker, why, model: reply.model, provider: reply.provider, stages: timed }, { turnId: turn.turnId });
      device?.write("B");
      console.log(`[cue] ${ms} ms · ${reply.provider} ${reply.model} · ${said(text)}${meaning ? ` (${said(meaning)})` : ""}`);
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

  /** Mark the meeting turn as a question aimed at the wearer, for asked versus answered. */
  function flagAddressed(turnId: string): void {
    const kept = meetingTurns.get(turnId);
    if (kept && current?.turns.includes(kept)) {
      kept.addressed = true;
      meetings.save(current);
    }
  }

  /** The cue is for the wearer only when the question was aimed at them (or the testing switch is on). */
  async function cueIfAddressed(turn: AsrTurn, earlier: AddressTurn[], spokeAt: number | undefined, stages: Stages): Promise<void> {
    const speaker = await labelOf(turn);
    const now = spokeAt ?? Date.now();
    const asked: AddressTurn = { speaker, text: turn.text, startMs: now, endMs: now + ((turn.endMs ?? 0) - (turn.startMs ?? 0)) };
    if (profile.assistMode === "record") {
      // Solo grabar: the free rules still mark questions for the wearer; no model check, no cue.
      const d = isAddressed(asked, earlier, wearerTracker.wearer(), profile.names);
      const verdict = d.verdict === "addressed" ? "addressed" : "not-addressed";
      console.log(`[address] ${verdict} · ${d.rule} · record only`);
      broadcast({ kind: "address", turnId: turn.turnId, verdict, rule: d.rule });
      if (verdict === "addressed") flagAddressed(turn.turnId);
      return;
    }
    if (profile.everyQuestion) {
      console.log("[address] addressed · testing (every question)");
      broadcast({ kind: "address", turnId: turn.turnId, verdict: "addressed", rule: "testing" });
      return void sayThis(turn, speaker, "testing", stages);
    }
    const d = await decideAddressed(asked, earlier);
    console.log(`[address] ${d.verdict} · ${d.rule}${d.ms ? ` · ${d.ms} ms` : ""}`);
    broadcast({ kind: "address", turnId: turn.turnId, verdict: d.verdict, rule: d.rule, ms: d.ms });
    if (d.verdict === "addressed") {
      flagAddressed(turn.turnId);
      void sayThis(turn, speaker, d.rule, stages);
    }
  }

  /** Rules first; a model only for the ambiguous slice. `history` excludes the turn itself. */
  async function decideAddressed(turn: AddressTurn, history: AddressTurn[]): Promise<AddressDecision & { ms?: number }> {
    const wearer = wearerTracker.wearer();
    const decision = isAddressed(turn, history, wearer, profile.names);
    if (decision.verdict !== "ask") return decision;
    const started = performance.now();
    try {
      const answer = parseYesNo(await askSpark(addressMessages(turn, history, wearer, profile.names), { label: "address" }));
      const ms = Math.round(performance.now() - started);
      // An unreadable answer counts as "not aimed at the wearer": a missed cue beats a false buzz.
      return { verdict: answer ? "addressed" : "not-addressed", rule: "model", ms };
    } catch (error) {
      console.error(`[address] model check failed: ${(error as Error).message.slice(0, 200)}`);
      return { verdict: "not-addressed", rule: "none" };
    }
  }

  async function onScreen(jpeg: Buffer, heardAt: number): Promise<void> {
    const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    if (!key) {
      broadcast({ kind: "cue", label: "PHOTO", text: `${Math.round(jpeg.length / 1024)} KB from the clip`, photo });
      return;
    }
    const started = performance.now();
    try {
      const reply = await callSpark([
        { role: "system", content: ON_SCREEN_PROMPT },
        { role: "user", content: [{ type: "text", text: "What am I looking at?" }, { type: "image_url", image_url: { url: photo } }] },
      ], { label: "look", stream: true });
      const ms = Math.round(performance.now() - started);
      const text = toCue(reply.text, 110);
      const stages = { heard: heardAt, asked: reply.askedAt, firstToken: reply.firstTokenAt, done: Date.now() };
      recordStaged({ at: Date.now(), kind: "cue", label: "ON SCREEN", text, ms, stages }, { photo });
      device?.write("B");
      console.log(`[look] ${ms} ms · ${said(text)}`);
    } catch (error) {
      broadcast({ kind: "cue", label: "PHOTO", text: "Could not read the photo", photo });
      console.error(`[look] failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  // --- Help on demand: Aportar, Pregunta, ¿De qué hablan? ----------------------------------------------

  /** One Spark call on the turns of this listening session; the card goes to every phone, the outcome back to the asker. */
  async function help(kind: unknown): Promise<HelpOutcome> {
    const since = sessionClock.view(Date.now())?.startedAt;
    const turns = since === undefined ? [] : day.entries.filter((e): e is Extract<DayEntry, { kind: "turn" }> => e.kind === "turn" && e.at >= since);
    let reply: SparkReply | undefined;
    const out = await requestHelp({ kind, assistMode: profile.assistMode, turns, memory: memoryText() }, async (messages) => {
      reply = await callSpark(messages, { label: "help", stream: true });
      return reply.text;
    });
    if (!out.ok) {
      console.log(`[help] ${String(kind)} refused: ${out.reason}`);
      return out;
    }
    // Switched to Solo grabar while the answer was on its way: no card.
    if (profile.assistMode !== "assist") return { ok: false, reason: "record-only", message: HELP_REFUSALS["record-only"] };
    const stages = reply && { asked: reply.askedAt, firstToken: reply.firstTokenAt, done: Date.now() };
    recordStaged({ at: Date.now(), kind: "cue", label: out.label, text: out.text, meaning: out.meaning, ms: out.ms, stages });
    console.log(`[help] ${out.label} · ${out.ms} ms · ${said(out.text)}${out.meaning ? ` (${said(out.meaning)})` : ""}`);
    return out;
  }

  // --- Meetings: start and end from the phone, notes extracted at the end ----------------------------

  /** Which speaker label is the wearer; declared before the restart recovery below ends a meeting with it. */
  const wearerTracker = new WearerTracker();
  let current: Meeting | undefined;
  /** ASR turn id → the meeting turn it became, so a late addressing decision can flag it. */
  const meetingTurns = new Map<string, MeetingTurn>();
  /** Deleted while their notes were still being written: the late result must not bring them back. */
  const deletedMeetings = new Set<string>();
  let lastSpeechAt = 0;

  const meetingSummary = (m: Meeting) => ({
    id: m.id,
    title: m.title,
    topic: m.topic,
    auto: m.auto === true,
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
      language: { glossary: viewGlossary(language.glossary), phrases: wearerPhrases(finishedMeetings()), ...totalAskedAnswered(all.map((m) => m.stats)) },
    };
  }

  /** Pending action cards and the task list, for the Acciones page. Nothing in it runs anything. */
  function actionsEvent() {
    const titles = new Map(meetings.list().map((m) => [m.id, m.title || m.topic || ""]));
    const turnText = (meetingId: string, id: string) => {
      const t = meetings.list().find((m) => m.id === meetingId)?.turns.find((x) => x.id === id);
      return t ? { id, at: t.at, speaker: t.speaker, text: t.text } : { id, text: "" };
    };
    return {
      kind: "actions",
      pending: actions.list().filter((a) => a.status === "pending").map((a) => ({ ...a, meetingTitle: titles.get(a.meetingId) ?? "", quotes: a.evidence.map((id) => turnText(a.meetingId, id)) })),
      decided: actions.list().filter((a) => a.status !== "pending").slice(-10).reverse().map((a) => ({ id: a.id, tool: a.tool, status: a.status, meetingId: a.meetingId })),
      tasks: taskStore.list().map((t) => ({ ...t, meetingTitle: titles.get(t.meetingId) ?? "" })),
    };
  }

  const broadcastActions = (): void => broadcast(actionsEvent());

  /** Runs one approved action with the arguments it was approved with, and traces it. */
  async function runDecided(body: unknown): Promise<{ status: number; body: unknown }> {
    const parsed = parseDecision(body);
    if (!parsed) return { status: 400, body: { error: "need id and decision (approve or reject)" } };
    const found = actions.get(parsed.id);
    const verdict = decide(found, parsed.decision, Date.now());
    if (!verdict.ok) return { status: verdict.status, body: { error: verdict.error } };
    const a = verdict.action;
    const edited = JSON.stringify(a.args) !== JSON.stringify(a.proposedArgs);
    actions.save(a);
    traces.append(a.meetingId, [{ kind: "approval", at: Date.now(), actionId: a.id, tool: a.tool, decision: a.status === "approved" ? "approved" : "rejected", edited }]);
    let outcome: unknown;
    if (verdict.run) {
      const meeting = meetings.list().find((m) => m.id === a.meetingId);
      const result = meeting
        ? await runApproved(meetingTools({ meeting, tasks: taskStore, remindersFile: REMINDERS_FILE }), a.tool, a.args)
        : ({ ok: false, error: "the meeting is gone" } as const);
      outcome = result.ok ? result.result : result.error;
      actions.save({ ...a, status: result.ok ? "approved" : "failed", outcome });
      traces.append(a.meetingId, [{ kind: "action", at: Date.now(), actionId: a.id, tool: a.tool, ok: result.ok, result: outcome }]);
    }
    broadcastActions();
    return { status: 200, body: { status: actions.get(a.id)?.status, outcome } };
  }

  /** Meetings that are over: a running one would change the phrases (and the cached prefix) mid-meeting. */
  const finishedMeetings = (): Meeting[] => meetings.list().filter((m) => m.status !== "running" && m.status !== "extracting");

  /** The memory prefix, rebuilt only after meetings or the glossary change. */
  let memoryCache: string | undefined;
  const memoryText = (): string =>
    (memoryCache ??= memoryPrefix({ phrases: wearerPhrases(finishedMeetings()), glossary: language.glossary, meetings: meetings.list(), facts: facts.list() }));

  function broadcastMeetings(): void {
    memoryCache = undefined;
    broadcast(meetingsEvent());
  }

  function syncMeeting(): void {
    const m = current;
    setStatus({ meeting: m ? { id: m.id, title: m.title, startedAt: m.startedAt, turns: m.turns.length, auto: m.auto === true } : null });
  }

  /** `auto`: an episode Solo grabar opened on its own. A meeting started by hand while one runs replaces it. */
  function startMeeting(title: string, auto = false): void {
    if (current?.auto && !auto) void endMeeting("manual");
    if (current) return;
    const draft = newMeeting(title, Date.now());
    current = { ...draft, id: meetings.uniqueId(draft.id), ...(auto ? { auto: true } : {}) };
    lastSpeechAt = Date.now();
    meetings.save(current);
    syncMeeting();
    broadcastMeetings();
    console.log(`[meeting] started ${current.id}${current.title ? ` "${said(current.title)}"` : ""}${auto ? " (episode)" : ""}`);
  }

  async function endMeeting(reason: EndReason): Promise<void> {
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
        label: "notes",
        extra: { response_format: { type: "json_schema", json_schema: { name: "meeting_notes", strict: true, schema: notesSchema(turnIds) } } },
        maxTokens: 3000,
      });
      const { notes, dropped, facts: proposedFacts } = validateNotes(JSON.parse(text), turnIds);
      m.notes = notes;
      applyTitleAndTopic(m, notes);
      m.droppedItems = dropped;
      m.status = "done";
      if (!deletedMeetings.has(m.id)) {
        const found = (notes.glossary ?? []).map((g) => ({ term: g.term, meaning: g.meaning, example: m.turns.find((t) => t.id === g.evidence[0])?.text ?? "" }));
        language.set(mergeGlossary(language.glossary, found, m.id, m.endedAt ?? Date.now()));
        facts.propose(m.id, proposedFacts, Date.now());
        if (sealed && key) void rewriteProfile(m);
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

  // --- Briefing: what to know before a meeting, only from what is remembered ----------------------------

  async function makeBriefing(title: string, names: string[]): Promise<Briefing> {
    const started = performance.now();
    const all = meetings.list().filter((m) => m.id !== current?.id);
    const ids = rememberedMeetings(all).map((m) => m.id);
    const text = await askSpark(briefingMessages(memoryText(), title, names), {
      label: "briefing",
      extra: { response_format: { type: "json_schema", json_schema: { name: "briefing", strict: true, schema: briefingSchema(ids) } } },
      maxTokens: 1500,
    });
    const { items, dropped } = validateBriefing(JSON.parse(text), all, language.glossary);
    console.log(`[briefing] "${said(title)}" in ${Math.round(performance.now() - started)} ms · ${items.length} items from ${ids.length} meeting(s) · ${dropped} dropped`);
    return { title, names, at: Date.now(), remembered: ids.length > 0, items, sources: citedSources(items, all), dropped };
  }

  // --- The whole memory (accounts): the profile, nightly digests and tiered answers (tasks 5.1 to 5.3) ---

  /** One structured Muse Spark call for a digest or a lookup plan. */
  const structured: DigestCall = (messages, schema, name) =>
    askSpark(messages, { label: name, maxTokens: 1500, extra: { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } });

  /** After a meeting's notes: the profile rewritten from the last one, the new notes and the kept facts. */
  async function rewriteProfile(m: Meeting): Promise<void> {
    if (!sealed) return;
    try {
      const [previous] = await sealed.digests.latest("profile", 1);
      const digest = await writeProfile({ previous, meetings: [m], keptFacts: keptFacts(facts.list()), day: localDay(Date.now(), TIME_ZONE) }, structured, Date.now());
      await sealed.digests.put(digest);
      console.log(`[digests] profile rewritten · ${digest.text.length} chars · ${digest.sources.length} sources`);
    } catch (error) {
      console.error(`[digests] profile rewrite failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  /** The nightly digests and the catch-up when this runtime opens. */
  async function runDigests(): Promise<void> {
    if (!sealed) return;
    const now = Date.now();
    const instants = [...meetings.list().map((m) => m.startedAt), ...(await sealed.sealed.day.instantsSince(now - 32 * 24 * 3600 * 1000))];
    const written = await catchUp(
      { today: localDay(now, TIME_ZONE), daysWithData: instants.map((at) => localDay(at, TIME_ZONE)) },
      {
        digests: sealed.digests,
        loadDay: async (d) => {
          const from = localDayStart(d, TIME_ZONE);
          const to = from + 24 * 3600 * 1000;
          return { meetings: meetings.list().filter((m) => m.startedAt >= from && m.startedAt < to), entries: await sealed.sealed.day.entriesBetween(from, to) };
        },
        call: structured,
        now: Date.now,
      },
    );
    if (written.length) console.log(`[digests] wrote ${written.length} digest(s)`);
  }
  if (sealed && key) nightly.start(userId, TIME_ZONE, runDigests);

  /** Ask over the whole history in tiers (accounts); the laptop keeps the 7-day window. */
  async function askWhole(body: { question?: unknown; history?: unknown }) {
    const digests = sealed!.digests;
    const [[profileDigest], days, weeks, months] = await Promise.all([digests.latest("profile", 1), digests.latest("day", 14), digests.latest("week", 8), digests.latest("month", 24)]);
    const finished = finishedMeetings();
    const byIds = (ids: string[]) => meetings.list().filter((m) => ids.includes(m.id));
    return askTiers(
      { profile: profileDigest, days, weeks, months, recentMeetings: finished.slice(-5), keptFacts: keptFacts(facts.list()), question: body.question, history: body.history, now: Date.now() },
      {
        meetings: async (ids) => byIds(ids),
        meetingsBetween: async (from, to, limit) => meetings.list().filter((m) => m.startedAt >= from && m.startedAt < to).reverse().slice(0, limit),
        days: async (list) => (await Promise.all(list.map((d) => sealed!.sealed.day.entriesBetween(localDayStart(d, TIME_ZONE), localDayStart(d, TIME_ZONE) + 24 * 3600 * 1000)))).flat(),
      },
      structured,
    );
  }

  /** A hub that stopped mid-meeting finishes it on the next start. */
  for (const m of meetings.list().filter((x) => x.status === "running" || x.status === "extracting")) {
    current = m;
    m.status = "running";
    void endMeeting("restart");
  }

  every(() => {
    if (!current) return;
    const why = current.auto ? episodeEnd({ startedAt: current.startedAt, lastSpeechAt }, Date.now(), EPISODES) : silenceExpired(lastSpeechAt, Date.now(), MEETING_SILENCE_MS) ? "silence" : undefined;
    if (why) void endMeeting(why);
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
      ], { label: "summary" });
      lastSummaryAt = Date.now();
      const text = reply.trim().replace(/\s+/g, " ").slice(0, 400);
      record({ at: Date.now(), kind: "summary", text }, { ms: Math.round(performance.now() - started) });
      console.log(`[summary] ${said(text)}`);
    } catch (error) {
      console.error(`[summary] failed: ${(error as Error).message.slice(0, 200)}`);
    } finally {
      summarizing = false;
    }
  }

  every(() => {
    const due = Date.now() - lastSummaryAt >= SUMMARY_EVERY_MS;
    const heardSomething = day.since(lastSummaryAt).some((e) => e.kind === "turn");
    // Solo grabar is quiet: no unasked summaries (Resumen still works on demand).
    if (due && heardSomething && status.listening && device && profile.assistMode === "assist") void summarize(false);
  }, 30_000);

  // --- Live view: frames flow at the device's pace and show as they arrive; the model describes the newest --

  let liveBusySince = 0;
  let lastLive = "";
  let liveDescribing = false;
  let liveFrameAt = 0;
  /** The newest frame that came in while the model was busy; older ones are dropped. */
  let liveNext: { jpeg: Buffer; at: number } | undefined;

  /** A live frame from the device: shown at once, the next one asked for, described when the model is free. */
  function onLiveFrame(jpeg: Buffer, at: number): void {
    liveFrameAt = Date.now();
    broadcast({ kind: "frame", photo: `data:image/jpeg;base64,${jpeg.toString("base64")}` });
    liveBusySince = 0;
    setTimeout(requestLiveFrame, LIVE_FRAME_GAP_MS);
    if (liveDescribing) liveNext = { jpeg, at };
    else void describeLive(jpeg, at);
  }

  function requestLiveFrame(): void {
    // At most one frame in flight, and the gap after the last one kept (timers may fire a few ms early).
    if (!status.live || !device || liveBusySince || Date.now() - liveFrameAt < LIVE_FRAME_GAP_MS - 10) return;
    liveBusySince = Date.now();
    device.write("P");
  }

  every(() => {
    if (status.live && liveBusySince && Date.now() - liveBusySince > 10_000) liveBusySince = 0;
    requestLiveFrame();
  }, 1000);

  async function describeLive(jpeg: Buffer, heardAt: number): Promise<void> {
    const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    liveDescribing = true;
    const started = performance.now();
    try {
      if (!key) return; // the frame is already on the phones; nothing describes it
      const reply = await callSpark([
        { role: "system", content: LIVE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: lastLive ? `Previous description: ${lastLive}` : "First frame." },
            { type: "image_url", image_url: { url: photo } },
          ],
        },
      ], { label: "live", stream: true });
      const ms = Math.round(performance.now() - started);
      const text = toCue(reply.text, 120);
      if (text && text !== lastLive) {
        lastLive = text;
        const stages = { heard: heardAt, asked: reply.askedAt, firstToken: reply.firstTokenAt, done: Date.now() };
        recordStaged({ at: Date.now(), kind: "live", text, stages }, { ms, photo });
      }
      console.log(`[live] ${ms} ms · ${Math.round(jpeg.length / 1024)} KB · ${said(text)}`);
    } catch (error) {
      console.error(`[live] failed: ${(error as Error).message.slice(0, 200)}`);
    } finally {
      liveDescribing = false;
      const next = liveNext;
      liveNext = undefined;
      if (next && status.live) void describeLive(next.jpeg, next.at);
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
    liveNext = undefined;
    setStatus({ live: on });
    if (on) requestLiveFrame();
  }

  function setAssistMode(mode: AssistMode): void {
    if (mode === profile.assistMode) return;
    profile.setAssistMode(mode);
    setStatus({ assistMode: mode });
    if (mode === "assist" && current?.auto) void endMeeting("mode");
    console.log(`[mode] ${mode === "assist" ? "Asistir" : "Solo grabar"}`);
  }

  function setEveryQuestion(on: boolean): void {
    profile.setEveryQuestion(on);
    setStatus({ everyQuestion: on });
  }

  function setListening(on: boolean, pause: Pause = { reason: "manual" }): void {
    if (on && !status.listening) idle.start(Date.now());
    setStatus({ listening: on, pause: on ? null : pause });
    device?.write(on ? "M" : "m");
    if (!on) {
      saveRecorded();
      broadcast(recordedEvent());
      saveUsage();
      broadcast(spendEvent());
    }
    if (on) startAsr();
    else {
      stopAsr();
      setStatus({ asr: "paused" });
    }
  }

  /** Stop on the phone: listening pauses, an open meeting ends with its notes, the next start is a new session. */
  function stopSession(): void {
    sessionClock.end(Date.now());
    setListening(false);
    void endMeeting("manual");
  }

  // --- Idle auto-pause: the wearer silent for IDLE_MS with no meeting open --------------------------

  const idle = new IdleWatch(IDLE_MS);
  /** When each speaker label of this transcription session last spoke, for a wearer identified late. */
  const lastSpokeBy = new Map<string, number>();

  function heard(speaker: string | undefined, at: number): void {
    if (speaker !== undefined) lastSpokeBy.set(speaker, Math.max(lastSpokeBy.get(speaker) ?? 0, at));
    idle.heard(at, speaker !== undefined && speaker === wearerTracker.wearer());
  }

  every(() => {
    if (!status.listening || !device) return;
    const why = idle.check(Date.now(), { wearerKnown: wearerTracker.wearer() !== undefined, meetingOpen: current !== undefined && !current.auto });
    if (!why) return;
    const min = IDLE_MS / 60_000;
    console.log(`[idle] paused: ${Math.round(why.silentMs / 1000)} s without ${why.basis === "wearer" ? "the wearer speaking" : "anyone speaking"}`);
    setListening(false, { reason: "idle", at: Date.now(), basis: why.basis, min });
  }, IDLE_CHECK_MS);

  // --- The clip ------------------------------------------------------------------------------------

  let device: Duplex | undefined;
  /** Devices that came in over the WebSocket door (the phone page, the desktop app). */
  const webDevices = new WeakSet<Duplex>();
  let asr: AsrSession | undefined;
  let pacer: ReturnType<typeof setInterval> | undefined;
  let jitter = new JitterBuffer(FRAME_BYTES, FRAME_BYTES * 25);
  let conditioner = new AudioConditioner(MIC_GAIN);
  let timeline = new AudioTimeline(FRAME_BYTES);
  /** Wall-clock time of the first audio frame of this connection: session audio 0 ms. */
  let audioOrigin = 0;
  let loudness = new LoudnessRing(FRAME_MS);
  /** When each stretch of session audio reached the hub: a turn's `heard` stage. */
  let arrivals = new ArrivalClock();
  const BYTES_PER_MS = FRAME_BYTES / FRAME_MS;

  /** Announce the wearer's label to the phone whenever it changes. */
  function syncWearer(): void {
    const label = wearerTracker.wearer() ?? "";
    if (label !== status.wearer) {
      if (label) idle.wearerIdentified();
      const spoke = lastSpokeBy.get(label);
      if (spoke !== undefined) idle.heard(spoke, true);
      setStatus({ wearer: label });
      console.log(`[wearer] ${label ? `speaker ${label} is the wearer` : "not identified"}`);
    }
  }

  function startAsr(): void {
    if (!key || !device || !status.listening || asr) return;
    setStatus({ asr: "listening · nothing sent in silence" });
    const gate = new SilenceGate<{ pcm: Buffer; sessionMs: number }>({ frameMs: FRAME_MS, ...GATE });
    const session = new AsrSession(key, {
      onStatus: (s) => {
        if (/^transcription (error|connection error)/.test(s)) health.failed("transcription", s);
        setStatus({ asr: s });
      },
      onIdleClose: () => gate.closed(),
      onPartial: (text) => {
        latestPartial = text;
        broadcast({ kind: "partial", text });
      },
      onSessionStart: () => {
        speakerOfTurn.clear();
        lastSpokeBy.clear();
        meetingTurns.clear();
        wearerTracker.reset();
        syncWearer();
      },
      onSpeaker: (turnId, speaker) => {
        speakerOfTurn.set(turnId, speaker);
        broadcast({ kind: "speaker", turnId, speaker });
        wearerTracker.noteSpeaker(turnId, speaker);
        syncWearer();
        heard(speaker, Date.now());
      },
      onTurn: (turn) => {
        health.ok("transcription");
        latestPartial = "";
        if (narration.repeats(turn.text, Date.now())) {
          console.log(`[self-voice] dropped a turn that repeats Lente's own voice: ${said(turn.text)}`);
          return;
        }
        const stages: Stages = { heard: turn.endMs === undefined ? undefined : arrivals.at(turn.endMs), turn: Date.now() };
        const earlier = day.entries.filter((e): e is Extract<DayEntry, { kind: "turn" }> => e.kind === "turn").slice(-ADDRESS_HISTORY_TURNS).map(toAddressTurn);
        if (turn.startMs !== undefined && turn.endMs !== undefined) wearerTracker.noteLoudness(turn.turnId, loudness.medianBetween(turn.startMs, turn.endMs));
        if (isEnrollment(turn.text, profile.names)) wearerTracker.noteEnrollment(turn.turnId);
        if (turn.speaker !== undefined) wearerTracker.noteSpeaker(turn.turnId, turn.speaker);
        syncWearer();
        heard(turn.speaker ?? speakerOfTurn.get(turn.turnId), Date.now());
        const question = isQuestion(turn.text);
        if (profile.assistMode === "record" && !current) startMeeting("", true);
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
        record({ at: Date.now(), kind: "turn", turnId: turn.turnId, speaker: turn.speaker, text: turn.text, question, ...anchor });
        const where = anchor.audioStartMs === undefined ? "" : ` [${anchor.audioStartMs}–${anchor.audioEndMs} ms]`;
        console.log(`[turn] ${turn.speaker ?? "?"}: ${said(turn.text)}${where}${question ? "  ← question" : ""}`);
        if (question && key) void cueIfAddressed(turn, earlier, anchor.spokeAt, stages);
      },
    });
    asr = session;
    // Take audio on a steady clock so Wi-Fi bursts never look like a stall; the gate passes only
    // what is around speech, and opens a session on the first speech (again after an idle close).
    pacer = setInterval(() => {
      const sessionMs = jitter.consumedMs;
      const pcm = jitter.take();
      const step = gate.push({ pcm, sessionMs }, rms(pcm));
      if (step.reopen) session.resume();
      for (const f of step.send) session.send(f.pcm, f.sessionMs);
      if (step.send.length) {
        usage.addAudio((step.send.length * FRAME_MS) / 1000);
        usageChanged = true;
      }
    }, FRAME_MS);
  }

  function stopAsr(): void {
    if (pacer) clearInterval(pacer);
    pacer = undefined;
    asr?.stop();
    asr = undefined;
    latestPartial = "";
  }

  /** The one device the hub listens to: the clip over TCP, or the phone or desktop over a WebSocket. */
  function serveDevice(socket: Duplex, remote: string | undefined): void {
    const previous = device;
    device = socket;
    // A phone that is replaced is told why, so its page says the clip took over instead of "connection lost".
    if (previous && webDevices.has(previous)) previous.write(COMMANDS.takeover, () => previous.destroy());
    else previous?.destroy();
    const parser = new ClipFrameParser();
    conditioner = new AudioConditioner(MIC_GAIN);
    jitter = new JitterBuffer(FRAME_BYTES, FRAME_BYTES * 25);
    timeline = new AudioTimeline(FRAME_BYTES);
    audioOrigin = 0;
    loudness = new LoudnessRing(FRAME_MS);
    arrivals = new ArrivalClock();
    let helloSeen = false;
    let lastLevel = 0;
    let lastRecordedPush = 0;
    console.log(`[clip] connected from ${remote}`);
    // The hub owns the settings: a clip that reconnects picks them up again.
    socket.write(status.mode === "camera" ? "C" : "c");
    socket.write(status.listening ? "M" : "m");
    setStatus({ clip: true, device: "", audioLost: 0, audioLate: 0, asr: key ? (status.listening ? status.asr : "paused") : status.asr });
    startAsr();

    socket.on("data", (chunk) => {
      if (device !== socket) return; // replaced by another device while its last bytes were in flight
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
          setStatus({ device: h.device === PHONE_DEVICE ? "phone" : "clip" });
          console.log(`[clip] hello v${h.proto} fw=${h.fw} ${h.device ?? ""} ${h.codec} ${h.rate} Hz`);
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
          arrivals.note(jitter.consumedMs + jitter.bufferedBytes / BYTES_PER_MS, now);
          // Only audio that arrived counts: silence filled in for loss, late duplicates and frames still in flight after a pause do not.
          if (status.listening) recorded.add((aligned.length - lost * FRAME_BYTES) / BYTES_PER_MS, now);
          if (now - lastRecordedPush >= RECORDED_PUSH_MS) {
            lastRecordedPush = now;
            broadcast(recordedEvent());
          }
          if (now - recordedSavedAt >= RECORDED_SAVE_MS) saveRecorded();
          if (now - lastLevel > 200) {
            lastLevel = now;
            broadcast({ kind: "level", rms: Math.round(rms(clean)) });
          }
        } else if (frame.type === "J") {
          const jpeg = Buffer.from(frame.payload);
          if (status.live) onLiveFrame(jpeg, Date.now());
          else {
            console.log(`[clip] photo ${Math.round(jpeg.length / 1024)} KB`);
            void onScreen(jpeg, Date.now());
          }
        }
      }
    });

    socket.on("close", () => {
      if (device !== socket) return;
      stopAsr();
      device = undefined;
      liveBusySince = 0;
      saveRecorded();
      saveUsage();
      setStatus({ clip: false, device: "", asr: key ? "waiting for the clip…" : status.asr });
      console.log("[clip] disconnected");
    });
    socket.on("error", (error) => console.error(`[clip] ${error.message}`));
  }

  const ACTIONS: Record<string, () => void> = {
    "/look": () => device?.write("P"),
    "/live/on": () => setLive(true),
    "/live/off": () => setLive(false),
    "/mode/camera": () => setMode("camera"),
    "/mode/mic": () => setMode("mic"),
    "/listen/on": () => setListening(true),
    "/listen/off": () => setListening(false),
    "/session/stop": () => stopSession(),
    "/summary": () => void summarize(true),
    "/cues/all": () => setEveryQuestion(true),
    "/cues/addressed": () => setEveryQuestion(false),
    "/assist-mode/assist": () => setAssistMode("assist"),
    "/assist-mode/record": () => setAssistMode("record"),
  };

  every(() => {
    for (const res of clients) res.write(": keep-alive\n\n");
  }, 15_000);

  /** The routes that act on this wearer's state; answers 404 for anything else. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "POST" && req.url === "/listen/on" && !status.listening && !mayListen()) {
      // LENTE_MAX_LISTENING: past the cap, starting to listen answers busy instead of overloading the hub.
      res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return void res.end(JSON.stringify({ error: "busy", message: BUSY_MESSAGE }));
    }
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
    } else if (req.method === "GET" && req.url === "/desktop") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(DESKTOP_PAGE);
    } else if (req.method === "GET" && req.url === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      const events = connectEvents({ status: statusEvent(), history: day.entries.slice(-80), partial: latestPartial, listening: status.listening, rest: [meetingsEvent(), actionsEvent(), recordedEvent(), spendEvent()] });
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else if (req.method === "GET" && req.url?.startsWith("/meetings/search")) {
      const q = new URL(req.url, "http://hub").searchParams.get("q") ?? "";
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ results: searchMeetings(meetings.list(), q.slice(0, 200)) }));
    } else if (req.method === "GET" && req.url?.startsWith("/meetings/get")) {
      const id = new URL(req.url, "http://hub").searchParams.get("id") ?? "";
      const m = meetings.list().find((x) => x.id === id);
      res.writeHead(m ? 200 : 404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(m ? { ...meetingSummary(m), share: notesAsText(m, new Date(m.startedAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })), turnList: m.turns.map((t) => ({ id: t.id, at: t.at, speaker: t.speaker, wearer: t.wearer === true, text: t.text })) } : { error: "no such meeting" }));
    } else if (req.method === "GET" && req.url?.startsWith("/traces/get")) {
      const id = new URL(req.url, "http://hub").searchParams.get("id") ?? "";
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ steps: (await traces.read(id)).map((e) => ({ at: e.at, kind: e.kind, ...traceLine(e) })) }));
    } else if (req.method === "GET" && req.url === "/facts") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ facts: facts.list() }));
    } else if (req.method === "POST" && (req.url === "/facts/keep" || req.url === "/facts/discard")) {
      const { id } = JSON.parse((await readBody(req)) || "{}") as { id?: string };
      const ok = typeof id === "string" && (req.url === "/facts/keep" ? facts.keep(id) : facts.remove(id));
      if (ok) memoryCache = undefined;
      res.writeHead(ok ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/actions/decide") {
      const out = await runDecided(JSON.parse((await readBody(req)) || "{}"));
      res.writeHead(out.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out.body));
    } else if (req.method === "POST" && req.url === "/tasks/done") {
      const { id, done } = JSON.parse((await readBody(req)) || "{}") as { id?: string; done?: boolean };
      const task = typeof id === "string" && typeof done === "boolean" ? taskStore.setDone(id, done) : undefined;
      if (task) broadcastActions();
      res.writeHead(task ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/meeting/start") {
      const { title } = JSON.parse((await readBody(req)) || "{}") as { title?: string };
      startMeeting(typeof title === "string" ? title : "");
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/meeting/end") {
      void endMeeting("manual");
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/briefing") {
      const { title, names } = JSON.parse((await readBody(req)) || "{}") as { title?: string; names?: string };
      const briefing = await makeBriefing(typeof title === "string" ? title.trim().slice(0, 80) : "", parseNames(typeof names === "string" ? names : ""));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(briefing));
    } else if (req.method === "POST" && req.url === "/meetings/delete") {
      const { id } = JSON.parse((await readBody(req)) || "{}") as { id?: string };
      const removed = typeof id === "string" && id !== current?.id && meetings.delete(id);
      if (removed) {
        deletedMeetings.add(id as string);
        traces.delete(id as string);
        actions.removeMeeting(id as string);
        facts.removeMeeting(id as string);
        broadcastActions();
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
      traces.deleteAll();
      actions.removeAll();
      facts.removeAll();
      broadcastActions();
      language.set([]);
      console.log(`[meeting] deleted ${meetings.deleteAll()} meeting(s)`);
      broadcastMeetings();
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/profile") {
      const { names } = JSON.parse((await readBody(req)) || "{}") as { names?: string };
      setStatus({ names: profile.setNames(typeof names === "string" ? names : "") });
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/seen") {
      const phoneAt = Date.now();
      const { id } = JSON.parse((await readBody(req)) || "{}") as { id?: string };
      if (typeof id === "string") keepStaged(id, phoneAt);
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/help") {
      const { kind } = JSON.parse((await readBody(req)) || "{}") as { kind?: unknown };
      const out = await help(kind).catch((error: Error) => {
        console.error(`[help] failed: ${error.message.slice(0, 200)}`);
        return { ok: false as const, reason: "failed", message: "No se pudo pedir la ayuda; prueba otra vez." };
      });
      const code = out.ok ? 200 : out.reason === "unknown-kind" ? 400 : out.reason === "record-only" || out.reason === "no-turns" ? 409 : 502;
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
    } else if (req.method === "POST" && req.url === "/ask") {
      // Chat with Lente: one question with the conversation so far, answered from the memory with its sources.
      const body = JSON.parse((await readBody(req)) || "{}") as { question?: unknown; history?: unknown };
      const out = key && sealed
        ? await askWhole(body).catch((error: Error) => {
            console.error(`[ask] failed: ${error.message.slice(0, 200)}`);
            return { ok: false as const, reason: "failed", message: "No pude responder ahora; prueba otra vez." };
          })
        : key
        ? await ask(
            { question: body.question, history: body.history, meetings: meetings.list(), day: await day.recent(ASK_DAYS), facts: keptFacts(facts.list()), now: Date.now() },
            async (messages) => (await callSpark(messages, { label: "ask", maxTokens: 500, extra: { response_format: { type: "json_schema", json_schema: { name: "ask", strict: true, schema: askSchema } } } })).text,
          ).catch((error: Error) => {
            console.error(`[ask] failed: ${error.message.slice(0, 200)}`);
            return { ok: false as const, reason: "failed", message: "No pude responder ahora; prueba otra vez." };
          })
        : { ok: false as const, reason: "no-key", message: "Lente no tiene un modelo configurado." };
      if (out.ok) console.log(`[ask] ${out.ms} ms · ${out.found ? out.sources.length + " fuentes" : "no encontrado"}`);
      res.writeHead(out.ok ? 200 : out.reason === "empty-question" ? 400 : 502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
    } else if (req.method === "POST" && req.url === "/narrated") {
      const { text } = JSON.parse((await readBody(req)) || "{}") as { text?: string };
      if (typeof text === "string") narration.narrated(text, Date.now());
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
  }

  return {
    userId,
    handle,
    serveDevice,
    /** A clip or phone on the `/device` WebSocket, once its upgrade was admitted. */
    serveWebDevice(socket: Duplex, remote: string): void {
      webDevices.add(socket);
      serveDevice(socket, remote);
    },
    pushStatus: (): void => broadcast(statusEvent()),
    listening: (): boolean => status.listening,
    /** A phone follows, a device is connected, listening is on, or a meeting is open. */
    busy: (): boolean => clients.size > 0 || device !== undefined || status.listening || current !== undefined,
    /** Eviction: stop transcribing, flush usage and recorded time, end the streams, clear the timers. */
    async close(): Promise<void> {
      stopAsr();
      device?.destroy();
      saveUsage();
      saveRecorded();
      for (const res of clients) res.end();
      clients.clear();
      for (const t of timers) clearInterval(t);
      nightly.stop(userId);
      if (sealed) {
        const failed = await sealed.flush();
        if (failed) console.error(`[wearers] ${failed} write(s) for an evicted runtime did not reach the database`);
        rmSync(dirname(REMINDERS_FILE), { recursive: true, force: true });
      }
    },
  };
}

type WearerRuntime = ReturnType<typeof createWearerRuntime>;
/** What the hub needs of a runtime; an account's runtime is opened asynchronously behind it. */
type Wearer = Pick<WearerRuntime, "pushStatus" | "listening" | "busy" | "close"> & {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  serveDevice(socket: Duplex, remote: string | undefined): void;
  serveWebDevice(socket: Duplex, remote: string): void;
};

/**
 * An account's runtime on the sealed stores: its data key is unwrapped and its stores loaded once,
 * and everything sent before that waits for it. A runtime that cannot open is dropped, so the next
 * request tries again.
 */
function openAccountWearer(userId: string, mayListen: () => boolean): Wearer {
  const ready = (async () => createWearerRuntime(userId, runtimeDir(userId), mayListen, await openCachedStores(supabase!, userId, await accounts!.dek(userId))))();
  let open: WearerRuntime | undefined;
  ready.then(
    (rt) => (open = rt),
    (error: Error) => {
      console.error(`[wearers] could not open a runtime: ${error.message}`);
      wearers.drop(userId);
    },
  );
  return {
    handle: async (req, res) => (await ready).handle(req, res),
    serveDevice: (socket, remote) => void ready.then((rt) => rt.serveDevice(socket, remote), () => socket.destroy()),
    serveWebDevice: (socket, remote) => void ready.then((rt) => rt.serveWebDevice(socket, remote), () => socket.destroy()),
    pushStatus: () => open?.pushStatus(),
    listening: () => open?.listening() ?? false,
    busy: () => (open ? open.busy() : true),
    close: async () => (await ready).close(),
  };
}

/** Accounts mode keeps each user's files apart until their runtime runs on the Supabase stores. */
const runtimeDir = (userId: string): string => {
  if (userId === LOCAL_OWNER) return DATA_DIR;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error(`user id ${userId.slice(0, 40)} is not a uuid`);
  return join(DATA_DIR, "users", userId);
};
/** The users' local time zone for digests until accounts carry their own (accounts.time_zone). */
const TIME_ZONE = process.env.LENTE_TIME_ZONE ?? "America/Bogota";
/** Each account's nightly digests, started with its runtime (task 5.2). */
const nightly = new NightlyDigests();

/** Users listening at once on this hub; unset means no cap (the laptop). Set from the capacity measured in task 6.4. */
const LISTENING_CAP = parseListeningCap(process.env.LENTE_MAX_LISTENING);
const othersListening = (userId: string): number => wearers.count((rt, id) => id !== userId && rt.listening());
const wearers: WearerRegistry<Wearer> = new WearerRegistry<Wearer>((userId) => {
  const mayListen = () => mayStartListening(othersListening(userId), LISTENING_CAP);
  return supabase && accounts && userId !== LOCAL_OWNER ? openAccountWearer(userId, mayListen) : createWearerRuntime(userId, runtimeDir(userId), mayListen);
}, { pinned: [LOCAL_OWNER], onEvict: (userId) => accounts?.forget(userId) });
// The laptop and a pairing hub have one wearer from the start, as before.
if (AUTH_MODE !== "accounts") wearers.get(LOCAL_OWNER);
setInterval(() => {
  void wearers.evictIdle().then((gone) => {
    if (gone.length) console.log(`[wearers] evicted ${gone.length} idle runtime(s); ${wearers.size} active`);
  });
}, EVICT_CHECK_MS);

const tcp = createTcpServer((socket) => {
  socket.setNoDelay(true);
  wearers.get(LOCAL_OWNER).serveDevice(socket, socket.remoteAddress);
});

const handleWeb = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    if (await gateWeb(req, res)) return;
    const who = requestIdentity.get(req);
    const devicesPath = req.url?.split("?")[0];
    const devicesAnswer = userDevices && who && (devicesPath === "/devices" || devicesPath === "/devices/revoke") ? await deviceRoute(userDevices, who.userId, req.method ?? "GET", devicesPath, req.method === "POST" ? await readBody(req) : "") : undefined;
    if (devicesAnswer) {
      res.writeHead(devicesAnswer.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(devicesAnswer.json === undefined ? undefined : JSON.stringify(devicesAnswer.json));
      return;
    }
    await wearers.get(who?.userId ?? LOCAL_OWNER).handle(req, res);
  } catch (error) {
    console.error(`[web] ${(error as Error).message}`);
    if (!res.headersSent) res.writeHead(500).end();
  }
};

// Browsers open the microphone only in a secure context: with a certificate and key the page is served over HTTPS.
const TLS_CERT = process.env.PILOT_TLS_CERT;
const TLS_KEY = process.env.PILOT_TLS_KEY;
if (Boolean(TLS_CERT) !== Boolean(TLS_KEY)) {
  console.error("PILOT_TLS_CERT and PILOT_TLS_KEY go together: set both to serve the page over HTTPS, or neither.");
  process.exit(1);
}
const web = TLS_CERT && TLS_KEY ? createHttpsServer({ cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) }, handleWeb) : createHttpServer(handleWeb);
web.on("upgrade", async (req, raw, head) => {
  let who: Identity | undefined;
  try {
    who = await identify({ authorization: req.headers.authorization, cookie: req.headers.cookie, url: req.url }, identitySources, "device");
  } catch (error) {
    console.error(`[device] could not check the connection's credentials: ${(error as Error).message}`);
    return void raw.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
  }
  if (await refusal(who).catch(() => "unavailable")) return void raw.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  if (who) requestIdentity.set(req, who);
  const status = decideUpgrade({ path: req.url?.split("?")[0], plainHttp: plainHttp(req), identified: Boolean(who) }, DEVICE_WS_PATH, AUTH_MODE);
  const refusals: Record<number, string> = { 401: "Unauthorized", 404: "Not Found", 426: "Upgrade Required" };
  if (status !== 200) return void raw.end(`HTTP/1.1 ${status} ${refusals[status]}\r\nConnection: close\r\n\r\n`);
  const socket = acceptDevice(req, raw, head);
  if (!socket) return;
  wearers.get(who?.userId ?? LOCAL_OWNER).serveWebDevice(socket, `${req.socket.remoteAddress} (WebSocket)`);
});
if (dbHealth) {
  const checkDatabase = async () => {
    const before = databaseDown();
    const db = await dbHealth.check();
    if (dbFailing(db.state) && !before) console.error(`[database] ${db.state}; memory writes will fail until it answers`);
    if (databaseDown() !== before) wearers.each((rt) => rt.pushStatus());
  };
  void checkDatabase();
  setInterval(() => void checkDatabase(), DB_CHECK_EVERY_MS);
}

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

// A cloud hub and a hub with accounts take clips over the WebSocket only: raw TCP carries no device token.
if (AUTH_MODE === "open") tcp.listen(DEVICE_PORT, () => console.log(`Clip port ${DEVICE_PORT} (set HUB_HOST to ${lanAddresses.join(" or ")})`));
// A clip whose HUB_HOST went stale (new DHCP address) finds this hub by broadcast.
if (AUTH_MODE === "open") {
  const discovery = createSocket("udp4");
  discovery.on("message", (msg, from) => {
    const reply = discoveryReply(msg, DEVICE_PORT);
    if (reply) discovery.send(reply, from.port, from.address);
  });
  discovery.on("error", (error) => console.error(`[discovery] UDP ${DISCOVERY_PORT} unavailable: ${error.message}; clips need the right HUB_HOST`));
  discovery.bind(DISCOVERY_PORT);
}
web.listen(WEB_PORT, () => {
  for (const ip of lanAddresses) console.log(`Phone: ${TLS_CERT ? "https" : "http"}://${ip}:${WEB_PORT}`);
  if (auth) console.log(`Cloud hub: pairing code ${auth.newPairingCode()} (valid 10 minutes; enter it on the phone's pairing screen). Clip tokens: node scripts/hub-token.ts add <name>`);
  console.log(`Voice: ${elevenKey ? "ElevenLabs" : "the phone's own voice (set ELEVENLABS_API_KEY for ElevenLabs)"}`);
  if (!key) console.log("MODEL_API_KEY is not set: the page shows connection, audio level and photos only.");
});
