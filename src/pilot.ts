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
import { type DevicePreference, mayTakeOver, AudioConditioner, AudioTimeline, COMMANDS, ClipFrameParser, DISCOVERY_PORT, JitterBuffer, discoveryReply, PHONE_DEVICE, isQuestion, parseAudioFrame, parseHello, rms, toCue } from "./clip-protocol.ts";
import { type AskMessage, type AskOutcome, type AskSource, CutOffError, ask, askSchema } from "./ask.ts";
import { DayLog, type DayEntry } from "./day-log.ts";
import { iconPng, logoSvg, webManifest } from "./brand.ts";
import { DESKTOP_PAGE } from "./desktop-page.ts";
import { PILOT_PAGE } from "./pilot-page.ts";
import { DEVICE_WS_PATH, acceptDevice } from "./ws-device.ts";
import { VOICE_WS_PATH, type VoiceSocket, acceptVoice } from "./ws-voice.ts";
import { serveVoiceSession } from "./voice-hub.ts";
import { type VoiceBackend, memorySources } from "./voice-tools.ts";
import { askLines, type Chats, FileChats, HISTORY_THREADS, isThreadId, RECENT_THREADS, threadTitle } from "./chat-store.ts";
import { DeviceAuth, SESSION_COOKIE } from "./device-auth.ts";
import { HealthTracker } from "./health.ts";
import { PAIR_PAGE } from "./pair-page.ts";
import { type AuthMode, decideUpgrade, decideWeb } from "./access-gate.ts";
import { type Identity, type IdentitySources, LOCAL_OWNER, identify } from "./identify.ts";
import { BUSY_MESSAGE, EVICT_CHECK_MS, WearerRegistry, mayStartListening, parseListeningCap } from "./wearer-registry.ts";
import { UserAuth } from "./user-auth.ts";
import { type AgentIdentity, FileDeviceStore, UserDevices, deviceRoute } from "./user-devices.ts";
import { Accounts, CLOSED_TEST_MESSAGE, FileAccountStore, JsonFile, parseAllowList } from "./accounts.ts";
import { checkKekAtStart, keksFromEnv } from "./kek-check.ts";
import { DatabaseHealth, dbFailing } from "./db-health.ts";
import { SupabaseRest } from "./supabase-rest.ts";
import { type CachedStores, openCachedStores } from "./cached-stores.ts";
import { type DigestCall, briefsDue, personKey, recurringPeople, writeBrief, writePersonCard, writeProfile } from "./digests.ts";
import { type DigestStore, FileDigestStore, FileMedia, FileSnapshots, type MediaRecord, type MediaStore } from "./stores.ts";
import { SegmentAudio, mediaAllowed } from "./media-tap.ts";
import { SupabaseStorage } from "./supabase-storage.ts";
import { decodeAdpcm, wav } from "./media-chunks.ts";
import { KeyframePicker } from "./keyframes.ts";
import { momentsOf } from "./memories.ts";
import { NightlyDigests, catchUp, localDay, localDayStart } from "./nightly.ts";
import { FileProjects, type ProjectStore } from "./project-store.ts";
import { assignMessages, assignSchema, cleanName, parseAssignment, scopeMeetings, summarize as summarizeProjects, taskInProject } from "./projects.ts";
import { MAX_TASK_CHARS, parseTasks, tasksMessages, tasksSchema } from "./task-extract.ts";
import { askTiers, entriesInSpans, scopeTierInput } from "./ask-tiers.ts";
import { type MemoryCard, type ShownFact, applySupersession, cardPrompt, cardedUntil, dueWindow, factCount, factsToShow, firstUncarded, validateCard, windowCardSchema, withCardFields } from "./cards.ts";
import { terms } from "./terms.ts";
import { type Encoder, HubEncoder, ModalEncoder } from "./encoder.ts";
import { type FastAnswer, RecallRuntime, answerRecall, isName, voiceRecall } from "./recall-runtime.ts";
import { type RecallEvent, memoryPrefix as recallPrefix } from "./recall.ts";
import { accountSummary, deleteAccount, deleteAuthUser, exportAccount } from "./account-rights.ts";
import { Sealer, SupabaseAccounts, SupabaseDevices, SupabaseSessions, supabaseCanaries } from "./supabase-stores.ts";
import { AUTH_COOKIE, FileSessionStore, PkceFlows, WebSessions, authCookie, authorizeUrl, clearCookie, exchangeCode, sessionCookie } from "./web-session.ts";
import { cookieValue } from "./device-auth.ts";
import { SIGNIN_PAGE } from "./signin-page.ts";
import { APP_CSP, APP_SHELL, NEXT_COOKIE, type GeneratedName, appSession, contentType, generatedModule, listAppFiles, resolveAppPath, safeNext } from "./web-app.ts";
import { type AddressDecision, type AddressTurn, addressMessages, isAddressed, parseNames, parseYesNo } from "./addressing.ts";
import { LanguageStore } from "./language-store.ts";
import { countAskedAnswered, forgetMeeting, mergeGlossary, totalAskedAnswered, viewGlossary, wearerPhrases } from "./language-profile.ts";
import { type Briefing, briefingMessages, briefingSchema, citedSources, memoryPrefix, parseReply, rememberedMeetings, replyMessages, validateBriefing } from "./briefing.ts";
import { FactStore, keptFacts } from "./fact-store.ts";
import { MeetingStore } from "./meeting-store.ts";
import { ActionStore, decide, parseDecision } from "./action-store.ts";
import { runApproved } from "./agent-loop.ts";
import { TraceWriter, traceLine } from "./agent-trace.ts";
import { TASK_OWNERS, type Task, type TaskOwner, TaskStore, meetingTools, ownerOf } from "./agent-tools.ts";
import { type AgentApi, CallLimiter, type TaskView, agentServer } from "./agent-mcp-tools.ts";
import { MCP_MAX_BODY_BYTES, serveMcp, unauthorizedResponse } from "./mcp.ts";
import { jobList, AGENT_NAMES, TOOL_RUN_AGENT, type JobAgent, claim as claimJob, expireLost, finish as finishJob, jobArgs, outcomeOf, parseResult, proposedAnswer, queued as queuedJob, queuedJobs } from "./agent-jobs.ts";
import { NOT_FOUND } from "./ask.ts";
import { EPISODE_MAX_MS, EPISODE_SILENCE_MS, type EndReason, type EpisodePolicy, type Meeting, type MeetingTurn, addTurn, applyTitleAndTopic, episodeEnd, extractionMessages, isTooShort, newMeeting, notesAsText, notesSchema, searchMeetings, silenceExpired, validateNotes } from "./meetings.ts";
import { type NotificationItem, buildFeed, minuteOfDay, parsePrefs, shouldBuzz, unreadCount } from "./notifications.ts";
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
import type { Companion } from "./voice-agent.ts";
import { DEFAULT_LOOK_QUESTION, LOOK_DESCRIBE_MAX_CHARS, LOOK_READ_MAX_CHARS, parseSight, SIGHT_LIVE_PROMPT, SIGHT_READ_PROMPT, SIGHT_STALE_MS, sightLookPrompt } from "./sight.ts";
import { type UsageSnapshot, UsageMeter, WEB_SEARCH_MODEL } from "./usage-meter.ts";

const DEVICE_PORT = Number(process.env.PILOT_DEVICE_PORT ?? 7070);
const WEB_PORT = Number(process.env.PILOT_WEB_PORT ?? 8080);
const MIC_GAIN = Number(process.env.PILOT_MIC_GAIN ?? 10);
const SUMMARY_EVERY_MS = Number(process.env.PILOT_SUMMARY_MIN ?? 5) * 60_000;
const LANGUAGE = process.env.PILOT_LANG ?? "Spanish";
const FRAME_MS = 80;
const FRAME_BYTES = (16000 * 2 * FRAME_MS) / 1000;
/** Live view: wait between a frame arriving and asking for the next; frames show as they come, the model describes the newest. */
const LIVE_FRAME_GAP_MS = 600;
/** Ver (add-sight-mode): a look reuses a frame this fresh instead of asking for a new one. */
const LOOK_FRESH_MS = 1_500;
/** A look gives up when no frame arrived by then. */
const LOOK_TIMEOUT_MS = 8_000;
/** «Sesión de invitado» turns itself off after this long. */
const GUEST_MS = 3 * 60 * 60 * 1000;
/** Days of the record (what was heard and seen outside meetings) the chat with Lente remembers. */
const ASK_DAYS = 7;
/**
 * `fast` (default since add-memory-engine 9.2: its grounding eval answered 90/105 against the tiers' 17/105):
 * retrieval in the runtime and one streamed answer. `LENTE_RECALL=tiers` rolls back to the two-call path.
 */
const RECALL_MODE = process.env.LENTE_RECALL === "tiers" ? "tiers" : "fast";
/**
 * The encoder for the memory index's vectors (add-memory-engine 8.5): `hub` runs it in this process,
 * `modal` calls the Modal function at LENTE_ENCODER_URL; unset, the index ranks by words only.
 */
const EMBEDDER: Encoder | undefined =
  process.env.LENTE_ENCODER === "hub"
    ? new HubEncoder()
    : process.env.LENTE_ENCODER === "modal" && process.env.LENTE_ENCODER_URL && process.env.LENTE_ENCODER_TOKEN
    ? new ModalEncoder({ url: process.env.LENTE_ENCODER_URL, token: process.env.LENTE_ENCODER_TOKEN, id: process.env.LENTE_ENCODER_ID ?? "modal-e5-small", dim: Number(process.env.LENTE_ENCODER_DIM ?? 384) })
    : undefined;
const EMBED_TICK_MS = 5_000;
const RECALL_FLUSH_MS = 5_000;
/** How often a running episode is checked for a closed 10-minute window, and the notes call's cap when it also writes the card. */
const CARD_TICK_MS = 15_000;
/** A window card call that has not answered by then is abandoned; the window stays due and is retried. */
const CARD_CALL_TIMEOUT_MS = 90_000;
const CARD_RETRY_MS = 2 * 60_000;
const CARD_WINDOW_TRIES = 3;
/** The index's changed months are written behind this often, and at eviction. */
const SNAPSHOT_EVERY_MS = 10 * 60_000;
/** Media objects expired per nightly run at most, oldest first. */
const MEDIA_EXPIRE_PER_RUN = 500;
/** While listening with «Guardar fotos» on, one of the clip's photos is kept this often: the video Recuerdos plays. */
const VIDEO_FRAME_MS = Number(process.env.LENTE_VIDEO_FRAME_MS ?? 2000);
/** After a failed media write, media pauses this long instead of failing every segment and photo meanwhile. */
const MEDIA_RETRY_MS = 5 * 60_000;
/** How many meetings Recuerdos lists. */
const MOMENTS_LIMIT = 40;
const CARD_NOTES_TOKENS = 4_500;
/** Briefs are checked every 5 minutes (each rewritten at most every 30); how many briefs and people cards are read, and how many meetings feed each. */
const BRIEF_TICK_MS = 5 * 60_000;
const MAX_BRIEFS = 100;
const MAX_PEOPLE_CARDS = 300;
const BRIEF_MEETINGS = 10;
const PERSON_MEETINGS = 8;
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
/**
 * Ver's voice (add-sight-mode): a warm Colombian woman with a neutral accent, from ElevenLabs' shared library
 * («Nathalia - Neutral, Sweet and Friendly»), chosen by the owner's ear over paisa-accented voices.
 */
const elevenSightVoice = process.env.ELEVENLABS_SIGHT_VOICE_ID ?? "tTQzD8U9VSnJgfwC6HbY";

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
/** Storage for the media archive, once its migration and bucket exist (add-media-archive 2.4): LENTE_MEDIA_STORAGE=on. */
const mediaStorage = SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.LENTE_MEDIA_STORAGE === "on" ? new SupabaseStorage({ url: SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY }) : undefined;
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

/** Accounts mode: browsers signed in with Google keep a hub session (task 3.2). */
const webSessions = accounts
  ? new WebSessions(
      supabase
        ? new SupabaseSessions(supabase, (userId) => accounts.dek(userId))
        : new FileSessionStore(async (userId, rowId, token) => new Sealer(userId, await accounts.dek(userId)).json("sessions", "refresh_enc", rowId, token), new JsonFile<unknown>(join(DATA_DIR, "sessions.json"), () => [])),
    )
  : undefined;
const pkce = new PkceFlows();
/** Supabase Auth takes the publishable key from browsers; the hub may use it, or the secret key. */
const AUTH_APIKEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

/** Where Supabase sends the browser back: the public URL when set, else this request's own origin. */
function callbackUrl(req: IncomingMessage): string {
  const proto = req.headers["x-forwarded-proto"] === "https" || TLS_CERT ? "https" : "http";
  return `${process.env.LENTE_PUBLIC_URL?.replace(/\/+$/, "") ?? `${proto}://${req.headers.host ?? "localhost"}`}/auth/callback`;
}

/** GET /auth/google and /auth/callback: the web sign-in with PKCE. */
async function signIn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://hub");
  const page = (status: number, message: string) => res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": clearCookie(AUTH_COOKIE, "/auth") }).end(SIGNIN_PAGE.replace("<!--message-->", message));
  if (!SUPABASE_URL || !AUTH_APIKEY || !webSessions || !accounts) return void page(503, "El inicio de sesión no está configurado en este hub.");
  if (url.pathname === "/auth/google") {
    const flow = pkce.start();
    // The web app (add-web-desktop) asks to come back to /app; only a path under it is kept.
    const next = safeNext(url.searchParams.get("next"));
    const cookies = [authCookie(flow.state), ...(next ? [`${NEXT_COOKIE}=${encodeURIComponent(next)}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=600`] : [])];
    res.writeHead(302, { Location: authorizeUrl(SUPABASE_URL, callbackUrl(req), flow.state, flow.challenge), "Set-Cookie": cookies, "Cache-Control": "no-store" }).end();
    return;
  }
  // The callback: the state must be the one this browser started with, and unused.
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const verifier = state && state === cookieValue(req.headers.cookie, AUTH_COOKIE) ? pkce.take(state) : undefined;
  if (!verifier || !code) return void page(400, "Ese enlace de inicio de sesión ya no sirve. Vuelve a entrar con Google.");
  try {
    const tokens = await exchangeCode(SUPABASE_URL, AUTH_APIKEY, code, verifier);
    const { userId, email } = await userAuth!.verify(tokens.accessToken);
    const admission = await accounts.admit(userId, email);
    if (!admission.ok) return void page(403, admission.reason === "closed_test" ? CLOSED_TEST_MESSAGE : "No se pudo abrir tu cuenta.");
    const token = await webSessions.create(userId, tokens.refreshToken);
    const raw = cookieValue(req.headers.cookie, NEXT_COOKIE);
    const next = safeNext(raw ? decodeURIComponent(raw) : undefined) ?? "/";
    res.writeHead(302, { Location: next, "Cache-Control": "no-store", "Set-Cookie": [sessionCookie(SESSION_COOKIE, token), clearCookie(AUTH_COOKIE, "/auth"), clearCookie(NEXT_COOKIE, "/auth")] }).end();
  } catch (error) {
    console.error(`[auth] web sign-in failed: ${(error as Error).message}`);
    page(502, "No se pudo terminar el inicio de sesión. Prueba otra vez.");
  }
}

/** GET /account/export and POST /account/delete (task 9.1): the user's own data, readable or gone. */
async function accountRights(req: IncomingMessage, res: ServerResponse, who: Identity, path: string): Promise<void> {
  const userId = who.userId;
  if (!supabase || !accounts || !SUPABASE_URL) return void res.writeHead(501, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "accounts need the Supabase stores" }));
  if (req.method === "GET" && path === "/account") {
    const cap = process.env.LENTE_USER_MONTHLY_CENTS ? Number(process.env.LENTE_USER_MONTHLY_CENTS) : undefined;
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return void res.end(JSON.stringify(await accountSummary(supabase, userId, who.email, cap)));
  }
  if (req.method === "GET" && path === "/account/export") {
    if (wearers.has(userId)) await wearers.get(userId).flush();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="lente-export.json"', "Cache-Control": "no-store" });
    await exportAccount(supabase, userId, await accounts.dek(userId), res, Date.now(), mediaStorage);
    return void res.end();
  }
  if (req.method === "POST" && path === "/account/delete") {
    const { confirm } = JSON.parse((await readBody(req)) || "{}") as { confirm?: unknown };
    if (confirm !== true) return void res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "send {\"confirm\": true} to delete the account" }));
    const steps = await deleteAccount(supabase, userId, {
      forgetInMemory: async (id) => {
        await wearers.evict(id);
        accounts.forget(id);
      },
      deleteSignIn: (id) => deleteAuthUser(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, id),
      ...(mediaStorage ? { storage: mediaStorage } : {}),
    });
    console.log(`[account] deleted an account in ${steps.length} steps`);
    return void res.writeHead(204, { "Set-Cookie": clearCookie(SESSION_COOKIE), "Cache-Control": "no-store" }).end();
  }
  res.writeHead(405).end();
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
  sessionUser: (cookie) => webSessions!.user(cookie),
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

function readBody(req: IncomingMessage, max = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > max) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function speak(res: ServerResponse, text: string, voice?: string): Promise<void> {
  if (!elevenKey) return void res.writeHead(404).end();
  const voiceId = voice === "sight" ? elevenSightVoice : elevenVoice;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
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

// --- The desktop web app (add-web-desktop): static modules from web/app/, the shell for client routes.
const APP_DIR = fileURLToPath(new URL("../web/app/", import.meta.url));
const appFiles = listAppFiles(APP_DIR);
const appGenerated = new Map<GeneratedName, string>();

function serveApp(req: IncomingMessage, res: ServerResponse, who: Identity | undefined): void {
  const asset = resolveAppPath(req.url?.split("?")[0] ?? "", appFiles);
  const base = { "Content-Security-Policy": APP_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };
  switch (asset.kind) {
    case "session":
      return void res.writeHead(200, { ...base, "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(appSession(AUTH_MODE, who)));
    case "shell":
      return void res.writeHead(200, { ...base, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(APP_SHELL);
    case "generated":
      if (!appGenerated.has(asset.name)) appGenerated.set(asset.name, generatedModule(asset.name));
      return void res.writeHead(200, { ...base, "Content-Type": contentType(asset.name), "Cache-Control": "no-cache" }).end(appGenerated.get(asset.name));
    case "file":
      try {
        return void res.writeHead(200, { ...base, "Content-Type": contentType(asset.name), "Cache-Control": "no-cache" }).end(readFileSync(join(APP_DIR, asset.name)));
      } catch {
        return void res.writeHead(404, base).end();
      }
    default:
      res.writeHead(404, base).end();
  }
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
    case "app":
      serveApp(req, res, who);
      return true;
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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(SIGNIN_PAGE);
      return true;
    case "auth":
      await signIn(req, res);
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
  const projects: ProjectStore = sealed?.sealed.projects ?? new FileProjects(join(dataDir, "projects.json"));
  const traces = sealed?.traces ?? new TraceWriter(join(dataDir, "traces"));
  /** The chat with Lente; voice sessions are kept here as threads (add-voice-mode). */
  const chats: Chats = sealed?.sealed.chats ?? new FileChats(join(dataDir, "chat.json"));
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
  /**
   * Ver (add-sight-mode) lives in this runtime only: the saved profile keeps Asistir or Solo grabar (the
   * accounts table allows only those), and a restart comes back out of Ver.
   */
  let sightOn = false;
  const assistMode = (): AssistMode => (sightOn ? "sight" : profile.assistMode);
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
    /** Asistir (cues), Solo grabar (record and learn, no cues) or Ver (describe aloud, add-sight-mode). */
    assistMode: profile.assistMode,
    /** «Sesión de invitado»: nothing is kept (no media, day entries, chat or memory) until it ends. */
    guest: false,
    /** Speaker label of the wearer in this transcription session, once known. */
    wearer: "",
    /** Why the last clip was refused (old firmware, bad hello); cleared by the next good hello. */
    clipError: "",
    asr: key ? "waiting for the clip…" : "no MODEL_API_KEY: audio level only",
  };

  const clients = new Set<ServerResponse>();
  const day = sealed?.day ?? new DayLog(join(dataDir, "days"));

  // The media archive (add-media-archive 2.2): speech audio per segment and keyframes per moment, for the
  // owner (LOCAL_OWNER, or the account LENTE_OWNER_USER_ID names); other accounts only once add-consent
  // can say their accepted terms describe media, so not yet.
  const mediaStore: MediaStore | undefined = sealed ? sealed.sealed.media : new FileMedia(join(dataDir, "media"));
  const isOwner = userId === LOCAL_OWNER || (process.env.LENTE_OWNER_USER_ID !== undefined && userId === process.env.LENTE_OWNER_USER_ID);
  /** «Sesión de invitado» (add-sight-mode): until this moment nothing is kept. */
  let guestUntil = 0;
  const guest = () => Date.now() < guestUntil;
  const mediaOn = (kind: "audio" | "photos") => !guest() && Boolean(mediaStore) && Date.now() >= mediaPausedUntil && mediaAllowed(kind, { env: process.env.LENTE_MEDIA, switches: profile.media, isOwner, acceptedMediaTerms: false });
  const segmentAudio = new SegmentAudio();
  const keyframes = new KeyframePicker();
  /** Media this runtime kept, as `kind:ref`, so chips can say what can be played. */
  const keptMedia = new Set<string>();
  let mediaPausedUntil = 0;
  async function keepMedia(record: MediaRecord, data: Uint8Array): Promise<void> {
    if (!mediaStore) return;
    try {
      await mediaStore.put(record, data);
      keptMedia.add(`${record.kind}:${record.ref}`);
    } catch (error) {
      // One failure (no table yet, Storage down) pauses media for a while instead of failing every segment and photo.
      mediaPausedUntil = Date.now() + MEDIA_RETRY_MS;
      console.error(`[media] keeping media failed, paused for ${MEDIA_RETRY_MS / 60_000} min: ${(error as Error).message.slice(0, 160)}`);
    }
  }
  /** The video Recuerdos plays: while listening, one of the clip's photos every VIDEO_FRAME_MS, named by its time. */
  let lastVideoFrameAt = 0;
  function keepVideoFrame(jpeg: Uint8Array, at: number): void {
    if (!status.listening || !mediaOn("photos") || at - lastVideoFrameAt < VIDEO_FRAME_MS || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return;
    lastVideoFrameAt = at;
    void keepMedia({ kind: "frame", ref: `v${at}`, at, ms: 0, bytes: jpeg.length, codec: "jpeg" }, jpeg);
  }
  /** The switches, and whether audio and photos are being kept right now (Ahora: «Guardando audio · fotos»). */
  function mediaStatus() {
    return { switches: profile.media, retentionDays: profile.mediaRetentionDays, keepingAudio: status.listening && mediaOn("audio"), keepingPhotos: status.listening && mediaOn("photos"), offered: isOwner && Boolean(mediaStore) };
  }
  /** A chip with the media behind it, when this runtime kept some. */
  const withMedia = <S extends AskSource>(s: S): S => {
    const audio = keptMedia.has(`audio:${s.id}`) ? `/media/audio/${encodeURIComponent(s.id)}` : undefined;
    const frame = keptMedia.has(`frame:${s.id}`) ? `/media/frame/${encodeURIComponent(s.id)}` : undefined;
    return audio || frame ? { ...s, media: { ...(audio ? { audio } : {}), ...(frame ? { frame } : {}) } } : s;
  };
  // What was kept in the last month, so chips of older answers can play too.
  if (mediaStore) void Promise.resolve(mediaStore.list(Date.now() - 31 * 86_400_000, Date.now() + 1)).then((list) => list.forEach((r) => keptMedia.add(`${r.kind}:${r.ref}`)), () => undefined);

  /** Retention (add-media-archive 3.1): media older than the wearer's setting goes, oldest first, a capped number a run. */
  async function expireMedia(): Promise<void> {
    if (!mediaStore) return;
    try {
      const gone = await mediaStore.expire(Date.now() - profile.mediaRetentionDays * 86_400_000, MEDIA_EXPIRE_PER_RUN);
      if (gone) console.log(`[media] ${gone} expired object(s) removed (keeping ${profile.mediaRetentionDays} days)`);
    } catch (error) {
      console.error(`[media] expiry failed: ${(error as Error).message.slice(0, 160)}`);
    }
  }

  /**
   * Media of what is being forgotten, removed before the records (add-media-archive 3.1): a meeting's
   * segment audio, or everything kept on a day. Forget a day (add-memory-timeline 1.8) calls it first.
   */
  async function forgetMedia(what: { meetings?: Meeting[]; day?: { from: number; to: number } }): Promise<void> {
    if (!mediaStore) return;
    for (const m of what.meetings ?? []) {
      const refs = (await mediaStore.list(m.startedAt - 1, (m.endedAt ?? Date.now()) + 1)).filter((r) => r.ref.startsWith(`s${m.id}:`)).map((r) => r.ref);
      await mediaStore.remove("audio", refs);
      for (const r of refs) keptMedia.delete(`audio:${r}`);
    }
    if (what.day) {
      for (const r of await mediaStore.list(what.day.from, what.day.to)) keptMedia.delete(`${r.kind}:${r.ref}`);
      await mediaStore.removeBetween(what.day.from, what.day.to);
    }
  }

  /** Stores the segments of the open meeting that closed (all of them when it ended). */
  function storeClosedSegments(m: Meeting, ended: boolean): void {
    for (const c of segmentAudio.closed(m, ended)) void keepMedia({ kind: "audio", ref: c.segment, at: c.at, ms: c.ms, bytes: c.bytes.length, codec: "adpcm" }, c.bytes);
  }

  /** The listening session behind the phone's elapsed time; it runs while listening with the clip on. */
  const sessionClock = new SessionClock();
  /** Text of the turn in progress, for a phone that connects mid-sentence; cleared on turn and on pause. */
  let latestPartial = "";

  /** The status as sent: the session view is taken at send time so every phone shows the same elapsed time. */
  /** The device the wearer chose to record with; see mayTakeOver. */
  let devicePreference: DevicePreference = "any";
  const statusEvent = () => ({ ...status, devicePreference, modelDown: modelDown(), databaseDown: databaseDown(), session: sessionClock.view(Date.now()), media: mediaStatus() });

  /** What the phone read out loud lately; a turn that repeats it is Lente hearing itself. */
  const narration = new NarrationGuard();

  function broadcast(event: object): void {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(line);
  }

  /** Broadcast and keep it in the day's record. */
  function record(entry: DayEntry, extra: object = {}): void {
    if (!guest()) day.add(entry);
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
    if (!clients.size) return void (guest() || day.add(entry));
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
    if (!guest()) day.add(entry);
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
    /** `length` when the reply stopped at the token cap (non-streamed calls only). */
    finishReason?: string;
  }

  /**
   * One Spark call; the phone/eval see a `usage` event per call. Cards (`stream`) stream over the
   * Responses API so their first token is timed; structured calls (`extra` with a JSON schema) use
   * Chat Completions and wait for the whole answer.
   */
  async function callSpark(messages: ChatMessage[], opts: { label: string; extra?: Record<string, unknown>; maxTokens?: number; stream?: boolean; job?: "cue"; onDelta?: (delta: string) => void; allowIncomplete?: boolean; timeoutMs?: number }): Promise<SparkReply> {
    let lastError: unknown;
    // Once text reached the phone, another model would repeat it: no fallback after the first delta.
    let streamed = false;
    const onDelta = opts.onDelta && ((d: string) => ((streamed = true), opts.onDelta!(d)));
    const job = opts.job;
    // Cue routes keep their order and a cool-down; the other jobs reorder to stick with what answered last.
    const targets = job ? routePolicy.pick(job, cueRoutes().map((t) => Object.assign(t, { configured: Boolean(t.apiKey) }))) : sparkTargets;
    for (const [i, target] of targets.entries()) {
      try {
        const askedAt = Date.now();
        const maxTokens = opts.maxTokens ?? 400;
        // The last resort has nobody to fall back to, so it gets no first-token deadline.
        const firstTokenTimeoutMs = job && i < targets.length - 1 ? CUE_FIRST_TOKEN_TIMEOUT_MS : undefined;
        const done = opts.stream ? await streamReply(target, messages, { maxTokens, firstTokenTimeoutMs, ...(onDelta ? { onDelta } : {}), ...(opts.allowIncomplete ? { allowIncomplete: true } : {}) }) : { ...(await completeChat(target, messages, { maxTokens, extra: opts.extra, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) })), ttftMs: undefined };
        health.ok("model");
        if (job) routePolicy.succeeded(job, target.id);
        else sparkTargets = [target, ...sparkTargets.filter((t) => t !== target)];
        broadcast({ kind: "usage", label: opts.label, model: target.id, provider: target.provider, ms: Math.round(done.totalMs), promptTokens: done.promptTokens, cachedTokens: done.cachedTokens, completionTokens: done.completionTokens });
        usage.addCall(target.model, { input: done.promptTokens, cached: done.cachedTokens, output: done.completionTokens });
        usageChanged = true;
        broadcast(spendEvent());
        return { text: done.text, askedAt, firstTokenAt: done.ttftMs === undefined ? undefined : askedAt + Math.round(done.ttftMs), model: target.model, provider: target.provider, ...("finishReason" in done && done.finishReason ? { finishReason: done.finishReason } : {}) };
      } catch (error) {
        lastError = error;
        if (job) routePolicy.failed(job, target.id);
        console.error(`[spark] ${target.id} failed: ${(error as Error).message.slice(0, 200)}`);
        if (streamed) break;
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
      if (assistMode() !== "assist") return; // switched to Solo grabar while the reply was on its way
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
    if (assistMode() !== "assist") {
      // Solo grabar and Ver: the free rules still mark questions for the wearer; no model check, no cue.
      const d = isAddressed(asked, earlier, wearerTracker.wearer(), profile.names);
      const verdict = d.verdict === "addressed" ? "addressed" : "not-addressed";
      console.log(`[address] ${verdict} · ${d.rule} · ${assistMode() === "sight" ? "sight" : "record only"}`);
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
    const out = await requestHelp({ kind, assistMode: assistMode(), turns, memory: memoryText() }, async (messages) => {
      reply = await callSpark(messages, { label: "help", stream: true });
      return reply.text;
    });
    if (!out.ok) {
      console.log(`[help] ${String(kind)} refused: ${out.reason}`);
      return out;
    }
    // Switched to Solo grabar while the answer was on its way: no card.
    if (assistMode() !== "assist") return { ok: false, reason: "record-only", message: HELP_REFUSALS["record-only"] };
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
      decided: actions.list().filter((a) => a.status !== "pending").slice(-10).reverse().map((a) => {
        const job = outcomeOf(a);
        return { id: a.id, tool: a.tool, status: a.status, meetingId: a.meetingId, ...(job ? { job: { state: job.state, agent: a.args.agent, instruction: a.args.instruction, summary: job.summary ?? "", exitCode: job.exitCode ?? null } } : {}) };
      }),
      tasks: taskStore.list().map((t) => ({ ...t, who: ownerOf(t), meetingTitle: titles.get(t.meetingId) ?? "", projectName: (t.projectId ? projectNames.get(t.projectId) : taskProjects.get(t.meetingId)) ?? "" })),
    };
  }

  const broadcastActions = (): void => {
    broadcast(actionsEvent());
    pushNotifications();
  };

  // --- The activity feed (add-notifications) ---------------------------------------------------
  /** The feed from what the hub keeps; nothing stored but the read mark and the settings. */
  const notificationFeed = (): NotificationItem[] => buildFeed({ meetings: meetings.list(), actions: actions.list(), facts: facts.list() }, Date.now());
  const notificationsEvent = (feed = notificationFeed()) => ({ kind: "notifications", unread: unreadCount(feed, profile.notifications.readAt), latestAt: feed[0]?.at ?? 0 });
  /** Item ids the clip already signalled for; seeded with the feed at start, so a restart never buzzes. */
  let buzzed: Set<string> | undefined;
  function pushNotifications(): void {
    const feed = notificationFeed();
    broadcast(notificationsEvent(feed));
    const seen = (buzzed ??= new Set(feed.map((i) => i.id)));
    const minute = minuteOfDay(Date.now(), TIME_ZONE);
    for (const item of feed) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      // The clip's cue signal, once per new urgent item, when the wearer asked for it (design decision 6).
      if (shouldBuzz(item, profile.notifications.prefs, minute, current !== undefined)) device?.write("B");
    }
  }

  /** Each meeting's project name, for the tasks on the phone; refreshed when projects change. */
  let taskProjects = new Map<string, string>();
  /** Project names by id, for tasks that carry their own project (added by hand or by voice). */
  let projectNames = new Map<string, string>();
  async function refreshTaskProjects(): Promise<void> {
    try {
      const [list, assigned] = await Promise.all([projects.list(), projects.assignments()]);
      const names = new Map(list.map((p) => [p.id, p.name]));
      projectNames = names;
      taskProjects = new Map([...assigned].map(([meetingId, projectId]) => [meetingId, names.get(projectId) ?? ""]));
      broadcastActions();
    } catch (error) {
      console.error(`[projects] could not read the project names: ${(error as Error).message.slice(0, 200)}`);
    }
  }
  void refreshTaskProjects();

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
    if (verdict.run && a.tool === TOOL_RUN_AGENT) {
      // An approved job only becomes visible to the bridge; nothing runs in the hub (add-agent-bridge).
      const checked = jobArgs(a.args, (id) => taskStore.list().find((t) => t.id === id)?.title);
      if (!checked.ok) {
        actions.save({ ...a, status: "failed", outcome: { state: "failed", summary: checked.error } });
      } else {
        actions.save(queuedJob({ ...a, args: checked.args as unknown as Record<string, unknown> }));
        outcome = { state: "queued" };
      }
      broadcastJobs();
    } else if (verdict.run) {
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
    pushNotifications();
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
    if (mediaOn("audio")) storeClosedSegments(m, true);
    m.status = isTooShort(m) ? "too-short" : "extracting";
    meetings.save(m);
    syncMeeting();
    broadcastMeetings();
    console.log(`[meeting] ended ${m.id} (${reason}) · ${m.turns.length} turns${m.status === "too-short" ? " · too short for notes" : ""}`);
    if (m.status === "extracting") await extractNotes(m);
  }

  // --- Memory cards (add-memory-engine 6.2 to 6.4), with fast recall only -----------------------

  /** The existing facts most like this episode, for the call to say which one a new fact replaces. */
  function factsToShowFor(m: Meeting): ShownFact[] {
    const words = new Set(terms(m.turns.map((t) => t.text).join(" ")));
    return factsToShow(meetings.list().filter((x) => x.id !== m.id), (text) => terms(text).filter((t) => words.has(t)).length);
  }

  /** A new card on its episode; the facts it supersedes are closed in their own episodes, which are saved. */
  function keepCard(m: Meeting, card: MemoryCard, dropped: number): void {
    m.cards = [...(m.cards ?? []), card];
    for (const other of applySupersession(card, meetings.list().filter((x) => x.id !== m.id))) meetings.save(other);
    // Lengths and counts only.
    console.log(`[cards] ${m.id} · ${card.window ? "window" : "episode"} card · ${card.facts.length} facts · ${card.people.length} people · ${card.keysEs.length}+${card.keysEn.length} keys · ${card.facts.filter((f) => f.supersedes).length} supersede · ${dropped} dropped`);
  }

  let windowCarding = false;
  /** Failed tries per window (by its start): retried after a pause, given up as an empty card after a few. */
  const windowFailures = new Map<number, { tries: number; at: number }>();
  /** A window card every 10 minutes of a long episode while it runs (6.3); skipped when nothing was said or the spend cap holds. */
  async function cardWindow(): Promise<void> {
    const m = current;
    if (!recall || !key || !m || windowCarding || spendCapped()) return;
    const due = dueWindow(m, cardedUntil(m), Date.now(), () => false);
    if (!due) return;
    const failed = windowFailures.get(due.from);
    if (failed && failed.tries >= CARD_WINDOW_TRIES) {
      // Given up: an empty card lets the next windows go on; the closing card still covers the episode's notes.
      keepCard(m, { from: due.from, to: due.to, window: true, people: [], facts: [], keysEs: [], keysEn: [] }, 0);
      windowFailures.delete(due.from);
      meetings.save(m);
      return;
    }
    if (failed && Date.now() - failed.at < CARD_RETRY_MS) return;
    windowCarding = true;
    const started = Date.now();
    try {
      const turns = m.turns.filter((t) => t.at >= due.from && t.at < due.to);
      const turnIds = turns.map((t) => t.id);
      const shown = factsToShowFor({ ...m, turns });
      const text = await askSpark(
        [
          { role: "system", content: `You write the memory card for ten minutes of a recording from its transcript. Lines look like \`t3 YOU: text\`; YOU wears the glasses.\n${cardPrompt(shown)}\nInclude only what was actually said; if there is nothing worth keeping, return empty lists.` },
          { role: "user", content: turns.map((t) => `${t.id} ${t.wearer ? "YOU" : (t.speaker ?? "?")}: ${t.text}`).join("\n") },
        ],
        { label: "card", extra: { response_format: { type: "json_schema", json_schema: { name: "memory_card", strict: true, schema: windowCardSchema(turnIds, shown.map((f) => f.id)) } } }, maxTokens: 2000, timeoutMs: CARD_CALL_TIMEOUT_MS },
      );
      const out = validateCard(JSON.parse(text), { episodeId: m.id, turnIds, turnAt: new Map(turns.map((t) => [t.id, t.at])), shown, from: due.from, to: due.to, window: true, firstN: factCount(m), dayStart: (d) => localDayStart(d, TIME_ZONE) });
      keepCard(m, out.card, out.dropped);
      meetings.save(m);
      console.log(`[cards] window card ${Math.round((Date.now() - due.to) / 1000)} s after its window closed, in ${Date.now() - started} ms`);
    } catch (error) {
      // The window stays due and is tried again after a pause, a few times at most.
      const tries = (windowFailures.get(due.from)?.tries ?? 0) + 1;
      windowFailures.set(due.from, { tries, at: Date.now() });
      console.error(`[cards] window card failed (try ${tries} of ${CARD_WINDOW_TRIES}): ${(error as Error).message.slice(0, 200)}`);
    } finally {
      windowCarding = false;
    }
  }
  /** The spend cap (add-accounts 6.3) pauses cards; segments keep being indexed. Not built yet: never capped. */
  const spendCapped = (): boolean => false;

  async function extractNotes(m: Meeting): Promise<void> {
    const started = performance.now();
    try {
      const turnIds = m.turns.map((t) => t.id);
      // Fast recall (add-memory-engine 6.2): the memory card's fields ride in the same call, never a second one.
      const shown = recall ? factsToShowFor(m) : [];
      const fromTurn = recall ? firstUncarded(m) : undefined;
      const messages = extractionMessages(m);
      if (recall) messages[0] = { ...messages[0]!, content: `${messages[0]!.content}\n\n${cardPrompt(shown, fromTurn)}` };
      const schema = recall ? withCardFields(notesSchema(turnIds), turnIds, shown.map((f) => f.id)) : notesSchema(turnIds);
      const text = await askSpark(messages, {
        label: "notes",
        extra: { response_format: { type: "json_schema", json_schema: { name: "meeting_notes", strict: true, schema } } },
        maxTokens: recall ? CARD_NOTES_TOKENS : 3000,
      });
      const raw = JSON.parse(text);
      const { notes, dropped, facts: proposedFacts } = validateNotes(raw, turnIds);
      // A closing card covers what no window card did: all of a short episode, the tail of a long one.
      if (recall && (fromTurn !== undefined || !(m.cards ?? []).some((c) => c.window))) {
        const out = validateCard(raw, { episodeId: m.id, turnIds, turnAt: new Map(m.turns.map((t) => [t.id, t.at])), shown, from: cardedUntil(m), to: m.endedAt ?? Date.now(), window: false, firstN: factCount(m), ...(fromTurn ? { fromTurn } : {}), dayStart: (d) => localDayStart(d, TIME_ZONE) });
        keepCard(m, out.card, out.dropped);
      }
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
    if (m.status === "done") void assignProject(m).then(() => extractTasks(m));
  }

  // --- Projects: each finished meeting goes to one of the wearer's projects (add-projects) ---------------

  async function assignProject(m: Meeting): Promise<void> {
    try {
      if ((await projects.assignments()).has(m.id)) return void console.log(`[projects] ${m.id} · chosen at start`);
      const list = await projects.list();
      const raw = await askSpark(assignMessages(list, m), {
        label: "project",
        extra: { response_format: { type: "json_schema", json_schema: { name: "project", strict: true, schema: assignSchema } } },
        maxTokens: 600,
      });
      const choice = parseAssignment(raw, list);
      if (choice.kind === "none") return void console.log(`[projects] ${m.id} · no project`);
      // The meeting row must exist before it can point to a project.
      await sealed?.flush();
      const id = choice.kind === "existing" ? choice.projectId : (await projects.create(choice.name, Date.now())).id;
      await projects.assign(m.id, id);
      console.log(`[projects] ${m.id} · ${choice.kind === "new" ? "new project" : "existing project"}`);
      await refreshTaskProjects();
    } catch (error) {
      console.error(`[projects] assigning ${m.id} failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  /** The meeting's tasks with who does each, straight into Tareas (add-task-owners). */
  async function extractTasks(m: Meeting): Promise<void> {
    try {
      const raw = await askSpark(tasksMessages(m, profile.names), {
        label: "tasks",
        extra: { response_format: { type: "json_schema", json_schema: { name: "tasks", strict: true, schema: tasksSchema } } },
        maxTokens: 1500,
      });
      const found = parseTasks(raw, (await taskStore.list()).filter((t) => t.meetingId === m.id));
      for (const t of found) await taskStore.add({ title: t.title, who: t.who, ...(t.otherName ? { otherName: t.otherName } : {}), ...(t.due ? { due: t.due } : {}), meetingId: m.id, evidence: [], source: "meeting" }, Date.now());
      console.log(`[tasks] ${m.id} · ${found.length} task(s)`);
      await refreshTaskProjects();
    } catch (error) {
      console.error(`[tasks] extracting from ${m.id} failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  async function projectSummaries() {
    return summarizeProjects(await projects.list(), await projects.assignments(), meetings.list(), await taskStore.list(), Date.now());
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
    await runMemoryNightly();
  }
  if (sealed && key) nightly.start(userId, TIME_ZONE, runDigests);

  /** The ask calls: structured, with the reason the reply stopped so a cut-off one is retried (task 1.2). */
  const askStructured = async (messages: ChatMessage[], schema: object, name: string, maxTokens: number) => {
    const reply = await callSpark(messages, { label: name, maxTokens, extra: { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } });
    return { text: reply.text, ...(reply.finishReason ? { finishReason: reply.finishReason } : {}) };
  };

  /**
   * Ask over the whole history in tiers (accounts); the laptop keeps the 7-day window. In a project
   * (`scoped`) only its meetings, the facts they support and what was heard during them are shown (task 1.3).
   */
  async function askWhole(body: { question?: unknown; history?: unknown }, inScope: (list: Meeting[]) => Meeting[] = (list) => list, scoped = false) {
    const digests = sealed!.digests;
    const [[profileDigest], days, weeks, months] = scoped ? [[], [], [], []] : await Promise.all([digests.latest("profile", 1), digests.latest("day", 14), digests.latest("week", 8), digests.latest("month", 24)]);
    const finished = inScope(finishedMeetings());
    const scopeIds = new Set(inScope(meetings.list()).map((m) => m.id));
    const byIds = (ids: string[]) => inScope(meetings.list()).filter((m) => ids.includes(m.id));
    const whole = { profile: profileDigest, days, weeks, months, recentMeetings: finished.slice(-5), keptFacts: keptFacts(facts.list()) };
    const loadDays = async (list: string[]) => (await Promise.all(list.map((d) => sealed!.sealed.day.entriesBetween(localDayStart(d, TIME_ZONE), localDayStart(d, TIME_ZONE) + 24 * 3600 * 1000)))).flat();
    return askTiers(
      { ...(scoped ? scopeTierInput(whole, scopeIds) : whole), question: body.question, history: body.history, now: Date.now() },
      {
        meetings: async (ids) => byIds(ids),
        meetingsBetween: async (from, to, limit) => inScope(meetings.list()).filter((m) => m.startedAt >= from && m.startedAt < to).reverse().slice(0, limit),
        days: async (list) => (scoped ? entriesInSpans(await loadDays(list), inScope(meetings.list()), Date.now()) : await loadDays(list)),
      },
      askStructured,
    );
  }

  // Briefs and people cards (add-memory-engine 6.5): the sealed digests, or a file on the laptop.
  const memoryDigests: DigestStore = sealed?.digests ?? new FileDigestStore(join(dataDir, "digests.json"));

  // Fast recall (add-memory-engine 3.4): the memory index in this runtime, behind LENTE_RECALL=fast.
  const recall = RECALL_MODE === "fast"
    ? new RecallRuntime(
        {
          memoryDigests: async () => ({ briefs: await memoryDigests.latest("brief", MAX_BRIEFS), people: await memoryDigests.latest("person", MAX_PEOPLE_CARDS) }),
          meetings: () => meetings.list(),
          assignments: () => projects.assignments(),
          today: () => day.entries,
          recent: (days) => day.recent(days),
          keptFacts: () => keptFacts(facts.list()),
          ...(sealed ? { between: (from: number, to: number) => sealed.sealed.day.entriesBetween(from, to) } : {}),
          ...(sealed ? { digests: async () => {
            const [[profileDigest], days, weeks] = await Promise.all([sealed.digests.latest("profile", 1), sealed.digests.latest("day", 7), sealed.digests.latest("week", 4)]);
            return { ...(profileDigest ? { profile: profileDigest } : {}), days, weeks };
          } } : {}),
        },
        TIME_ZONE,
        Date.now,
        { snapshots: sealed?.sealed.snapshots ?? new FileSnapshots(join(dataDir, "memory")), log: (line) => console.log(line), ...(EMBEDDER ? { embedder: EMBEDDER } : {}) },
      )
    : undefined;
  /** Writes the index's changed months as snapshots (sealed in the cloud); lengths and counts in the log only. */
  const persistIndex = async (why: string) => {
    if (!recall) return;
    const started = performance.now();
    const written = await recall.persist().catch((error: Error) => (console.error(`[recall] snapshot write failed: ${error.message.slice(0, 200)}`), 0));
    if (written) console.log(`[recall] ${written} snapshot(s) written (${why}) in ${Math.round(performance.now() - started)} ms`);
  };
  if (recall) {
    every(() => void persistIndex("every 10 minutes"), SNAPSHOT_EVERY_MS);
    // New segments get their vectors in batches every few seconds (add-memory-engine 8.5).
    if (EMBEDDER) every(() => void recall.embedPending(), EMBED_TICK_MS);
    void recall.ready.then(() => console.log(`[recall] index ready · ${recall.index.size} units · ${recall.opened.fromSnapshot} month(s) from snapshots, ${recall.opened.rebuilt} rebuilt, ${recall.opened.meetingsReplayed} meeting(s) and ${recall.opened.daysReplayed} day(s) replayed`), (error: Error) => console.error(`[recall] index build failed: ${error.message.slice(0, 200)}`));
    every(() => void recall.flush().catch((error: Error) => console.error(`[recall] index update failed: ${error.message.slice(0, 200)}`)), RECALL_FLUSH_MS);
    every(() => void cardWindow(), CARD_TICK_MS);
    every(() => void writeBriefs(false), BRIEF_TICK_MS);
  }
  // The laptop's nightly run: consolidation with fast recall, and media expiry (accounts run it after their digests).
  if (!sealed && (recall || mediaStore)) nightly.start(userId, TIME_ZONE, runMemoryNightly);

  /** Each project whose cards changed gets its brief rewritten, at most every 30 minutes (or now, nightly). */
  async function writeBriefs(nightlyRun: boolean): Promise<void> {
    if (!recall || !key || spendCapped()) return;
    try {
      const [assigned, list, briefs] = await Promise.all([projects.assignments(), projects.list(), memoryDigests.latest("brief", MAX_BRIEFS)]);
      const last = new Map(briefs.map((b) => [b.periodStart, b.createdAt]));
      const newer = (m: Meeting) => m.status === "done" && (m.cards ?? []).length > 0 && assigned.has(m.id) && (m.endedAt ?? m.startedAt) > (last.get(assigned.get(m.id)!) ?? 0);
      const changed = new Set(meetings.list().filter(newer).map((m) => assigned.get(m.id)!));
      for (const projectId of nightlyRun ? [...changed] : briefsDue(changed, last, Date.now())) {
        const project = list.find((p) => p.id === projectId);
        if (!project) continue;
        const fresh = meetings.list().filter((m) => assigned.get(m.id) === projectId && newer(m)).slice(-BRIEF_MEETINGS);
        const digest = await writeBrief({ previous: briefs.find((b) => b.periodStart === projectId), project: { id: project.id, name: project.name }, meetings: fresh }, structured, Date.now());
        await memoryDigests.put(digest);
        console.log(`[digests] brief rewritten · ${digest.text.length} chars · ${digest.sources.length} sources · from ${fresh.length} meeting(s)`);
      }
    } catch (error) {
      console.error(`[digests] brief failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  /** People seen in two or more episodes get a card, rewritten when they appeared since the last one. */
  async function writePeople(): Promise<void> {
    if (!recall || !key || spendCapped()) return;
    try {
      let written = 0;
      for (const [name, seenIn] of recurringPeople(meetings.list().filter((m) => m.status === "done"), isName)) {
        const previous = await memoryDigests.get("person", personKey(name));
        const newest = Math.max(...seenIn.map((m) => m.endedAt ?? m.startedAt));
        if (previous && previous.createdAt >= newest) continue;
        await memoryDigests.put(await writePersonCard({ previous, person: name, meetings: seenIn.slice(-PERSON_MEETINGS) }, structured, Date.now()));
        written++;
      }
      if (written) console.log(`[digests] ${written} people card(s) rewritten`);
    } catch (error) {
      console.error(`[digests] people cards failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  /**
   * After a forget (add-memory-engine 7.3): the briefs and people cards that drew on what was forgotten
   * are rewritten from what is left, never from their previous text, or removed when nothing is left.
   * Forget a day (add-memory-timeline 1.8) calls `forgetInMemory` with the day and its meetings.
   */
  async function forgetInMemory(what: { day?: string; meetings: Meeting[] }): Promise<void> {
    if (!recall) return;
    try {
      const affected = await recall.forget(what);
      const assigned = await projects.assignments();
      const list = await projects.list();
      const done = meetings.list().filter((m) => m.status === "done" && !what.meetings.some((x) => x.id === m.id));
      for (const projectId of affected.projects) {
        const left = done.filter((m) => assigned.get(m.id) === projectId && (m.cards ?? []).length > 0).slice(-BRIEF_MEETINGS);
        const project = list.find((p) => p.id === projectId);
        if (!left.length || !project || !key) await memoryDigests.remove("brief", projectId);
        else await memoryDigests.put(await writeBrief({ project: { id: project.id, name: project.name }, meetings: left }, structured, Date.now()));
      }
      const recurring = recurringPeople(done, isName);
      for (const name of affected.people) {
        const seenIn = [...recurring].find(([n]) => personKey(n) === personKey(name))?.[1];
        if (!seenIn || !key) await memoryDigests.remove("person", personKey(name));
        else await memoryDigests.put(await writePersonCard({ person: name, meetings: seenIn.slice(-PERSON_MEETINGS) }, structured, Date.now()));
      }
      console.log(`[recall] forgot ${what.day ? "a day and " : ""}${what.meetings.length} meeting(s) · ${affected.projects.length} brief(s) and ${affected.people.length} people card(s) rewritten or removed`);
    } catch (error) {
      console.error(`[recall] forgetting failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }

  /** The nightly part of consolidation: every changed brief, then the people cards; and media past its retention. */
  async function runMemoryNightly(): Promise<void> {
    await expireMedia();
    if (!recall) return;
    await writeBriefs(true);
    await writePeople();
  }

  /** The fast path for one question; `deep` when retrieval is not confident or the question is an aggregate. */
  async function askFast(question: string, history: AskMessage[], projectId: string | undefined, emit: (e: RecallEvent) => void): Promise<FastAnswer> {
    return answerRecall({
      runtime: recall!,
      question,
      history,
      ...(projectId ? { projectId } : {}),
      projects: (await projects.list()).map((p) => ({ id: p.id, name: p.name })),
      now: Date.now(),
      timeZone: TIME_ZONE,
      emit,
      call: async (messages, opts) => {
        const reply = await callSpark(messages, { label: "ask", stream: true, maxTokens: opts.maxTokens, onDelta: opts.onDelta, allowIncomplete: true });
        return reply.finishReason ? { finishReason: reply.finishReason } : {};
      },
    });
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
    if (due && heardSomething && status.listening && device && assistMode() === "assist") void summarize(false);
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
      const sight = sightOn;
      const reply = await callSpark([
        { role: "system", content: sight ? SIGHT_LIVE_PROMPT : LIVE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: lastLive ? `Previous description: ${lastLive}` : "First frame." },
            { type: "image_url", image_url: { url: photo } },
          ],
        },
      ], { label: "live", stream: true, ...(sight ? { maxTokens: 800, allowIncomplete: true } : {}) });
      const ms = Math.round(performance.now() - started);
      // Ver says nothing when the view did not change (the model answers "="); the meeting view keeps one short line.
      const text = sight ? parseSight(reply.text) : toCue(reply.text, 120);
      if (sight && !text) {
        console.log(`[live] ${ms} ms · ${Math.round(jpeg.length / 1024)} KB · unchanged`);
        return;
      }
      if (sight && Date.now() - heardAt > SIGHT_STALE_MS) {
        console.log(`[live] ${ms} ms · ${Math.round(jpeg.length / 1024)} KB · stale, not said (${Date.now() - heardAt} ms after its frame)`);
        return;
      }
      if (text && text !== lastLive) {
        lastLive = text;
        const stages = { heard: heardAt, asked: reply.askedAt, firstToken: reply.firstTokenAt, done: Date.now() };
        recordStaged({ at: Date.now(), kind: "live", text, stages }, { ms, photo });
        // A keyframe when the scene changed, named by the moment id the index gives this description (add-media-archive 2.2).
        const at = Date.now();
        if (keyframes.consider({ at, description: text, jpeg }, mediaOn("photos"))) {
          const today = localDay(at, TIME_ZONE);
          const n = day.entries.filter((e) => (e.kind === "live" || (e.kind === "cue" && e.label === "ON SCREEN")) && e.text.trim() && localDay(e.at, TIME_ZONE) === today).length;
          void keepMedia({ kind: "frame", ref: `d${today}:${n}`, at, ms: 0, bytes: jpeg.length, codec: "jpeg" }, jpeg);
        }
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

  // --- Ver: a look by tap or by voice (add-sight-mode) --------------------------------------------------

  /** The newest frame from the device, live or still. */
  let lastFrame: { jpeg: Buffer; at: number } | undefined;
  /** Looks waiting for the next frame. */
  const frameWaiters: ((jpeg: Buffer) => void)[] = [];

  /** A frame no older than LOOK_FRESH_MS, or a new still from the device; undefined with no device or no answer. */
  async function freshFrame(): Promise<Buffer | "no-device" | "timeout"> {
    if (lastFrame && Date.now() - lastFrame.at <= LOOK_FRESH_MS) return lastFrame.jpeg;
    if (!device) return "no-device";
    if (status.mode === "mic") setMode("camera");
    const frame = new Promise<Buffer>((resolve) => frameWaiters.push(resolve));
    // With live reads on, the next live frame comes on its own; otherwise ask for a still.
    if (!status.live) device.write("P");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), LOOK_TIMEOUT_MS)));
    const out = await Promise.race([frame, timeout]);
    clearTimeout(timer);
    return out;
  }

  /**
   * One look: the wearer's question about a fresh frame, answered by Muse Spark 1.3 with the sight prompt.
   * `read` returns the frame's text. Shown and spoken on the phone as a «VER» card; returned for the voice agent.
   */
  async function look(question: string, mode: "describe" | "read"): Promise<{ ok: boolean; text: string }> {
    if (!key) return { ok: false, text: "Lente no tiene un modelo configurado." };
    const heardAt = Date.now();
    const frame = await freshFrame();
    if (frame === "no-device") return { ok: false, text: "No hay cámara conectada." };
    if (frame === "timeout") return { ok: false, text: "No pude ver: la cámara no respondió." };
    const photo = `data:image/jpeg;base64,${frame.toString("base64")}`;
    const started = performance.now();
    try {
      const reply = await callSpark([
        { role: "system", content: mode === "read" ? SIGHT_READ_PROMPT : sightLookPrompt(question) },
        { role: "user", content: [{ type: "text", text: question }, { type: "image_url", image_url: { url: photo } }] },
      ], { label: "look", stream: true, maxTokens: mode === "read" ? 2_000 : 800, allowIncomplete: true });
      const ms = Math.round(performance.now() - started);
      const text = parseSight(reply.text, mode === "read" ? LOOK_READ_MAX_CHARS : LOOK_DESCRIBE_MAX_CHARS) ?? "No veo nada claro. Acerca la cámara o busca más luz.";
      const stages = { heard: heardAt, asked: reply.askedAt, firstToken: reply.firstTokenAt, done: Date.now() };
      recordStaged({ at: Date.now(), kind: "cue", label: "VER", text, ms, stages }, { photo });
      console.log(`[look] ${ms} ms · ${Math.round(frame.length / 1024)} KB · ${mode} · ${said(text)}`);
      return { ok: true, text };
    } catch (error) {
      console.error(`[look] failed: ${(error as Error).message.slice(0, 200)}`);
      return { ok: false, text: "No pude ver: el modelo no respondió. Intenta otra vez." };
    }
  }

  function setGuest(on: boolean): void {
    guestUntil = on ? Date.now() + GUEST_MS : 0;
    // A guest's name and age go when the guest does.
    if (!on) companion = undefined;
    setStatus({ guest: on });
    console.log(`[guest] ${on ? "on: nothing is kept" : "off"}`);
  }

  every(() => {
    if (status.guest && !guest()) setGuest(false);
  }, 60_000);

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

  /** Whether live reads were on before Ver turned them on, so leaving Ver puts them back. */
  let liveBeforeSight = false;

  function setAssistMode(mode: AssistMode): void {
    if (mode === assistMode()) return;
    const leavingSight = sightOn;
    sightOn = mode === "sight";
    if (mode !== "sight" && mode !== profile.assistMode) profile.setAssistMode(mode);
    setStatus({ assistMode: mode });
    if (mode === "assist" && current?.auto) void endMeeting("mode");
    if (mode === "sight") {
      // Ver: the camera on and live reads with the sight prompt, from a clean slate.
      liveBeforeSight = status.live;
      if (status.live) setLive(false);
      setLive(true);
    } else if (leavingSight && !liveBeforeSight) setLive(false);
    console.log(`[mode] ${mode === "assist" ? "Asistir" : mode === "record" ? "Solo grabar" : "Ver"}`);
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
  /** A voice session hearing the clip (add-voice-mode) gets its conditioned audio here. */
  let voiceTap: ((pcm: Buffer) => void) | undefined;
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
        if (assistMode() === "record" && !current) startMeeting("", true);
        const anchor =
          turn.startMs === undefined || turn.endMs === undefined || !audioOrigin
            ? {}
            : { audioStartMs: Math.round(turn.startMs), audioEndMs: Math.round(turn.endMs), spokeAt: audioOrigin + Math.round(turn.startMs) };
        if (current) {
          const added = addTurn(current, { at: Date.now(), startAt: anchor.spokeAt, speaker: turn.speaker, wearer: turn.speaker !== undefined && turn.speaker === wearerTracker.wearer(), text: turn.text });
          meetingTurns.set(turn.turnId, added);
          if (mediaOn("audio") && anchor.audioStartMs !== undefined && anchor.audioEndMs !== undefined) {
            segmentAudio.turn(current, added.id, anchor.audioStartMs, anchor.audioEndMs);
            storeClosedSegments(current, false);
          } else if (!mediaOn("audio")) segmentAudio.drop();
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
      for (const f of step.send) {
        session.send(f.pcm, f.sessionMs);
        // Speech audio for the media archive, only what passed the silence gate (add-media-archive 2.2).
        if (current && mediaOn("audio")) segmentAudio.push(f.pcm, f.sessionMs);
      }
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
    // The wearer chose the phone: a clip that reconnects while the phone listens waits, instead of taking over.
    if (!mayTakeOver(devicePreference, webDevices.has(socket), device ? webDevices.has(device) : undefined)) {
      socket.destroy();
      return;
    }
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
          voiceTap?.(clean);
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
          keepVideoFrame(jpeg, Date.now());
          lastFrame = { jpeg, at: Date.now() };
          // A look in Ver waits for this frame; it takes it instead of the meeting's «Mirar».
          const waiting = frameWaiters.splice(0);
          for (const resolve of waiting) resolve(jpeg);
          if (status.live) onLiveFrame(jpeg, Date.now());
          else if (waiting.length) console.log(`[clip] photo ${Math.round(jpeg.length / 1024)} KB for a look`);
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

  /** Chat with Lente: one question with the conversation so far, answered from the memory with its sources. */
  /** What `/ask` streams (add-memory-engine 3.4): the fast path's text and chips, or «Buscando más…» before the deep path. */
  type AskStreamEvent = RecallEvent | { type: "searching" };

  async function answerAsk(body: { question?: unknown; history?: unknown; project?: unknown }, commands = true, emit?: (e: AskStreamEvent) => void) {
    // Asking within a project (add-record-sheet): only that project's meetings can be opened or cited.
    const scope = typeof body.project === "string" ? (await projects.list()).find((p) => p.id === body.project) : undefined;
    if (typeof body.project === "string" && !scope) return "no_project" as const;
    const assigned = scope ? await projects.assignments() : new Map<string, string>();
    const inScope = (list: Meeting[]) => scopeMeetings(list, assigned, scope?.id);
    const question = scope && typeof body.question === "string" ? `(Sobre el proyecto «${scope.name}») ${body.question}` : body.question;
    const failed = (error: Error) => {
      console.error(`[ask] failed: ${error.message.slice(0, 200)}`);
      // A reply cut at the length limit twice is a failure to answer, never "not found" (task 1.2).
      if (error instanceof CutOffError) return { ok: false as const, reason: "failed", message: "La respuesta salió demasiado larga; prueba con una pregunta más concreta." };
      return { ok: false as const, reason: "failed", message: "No pude responder ahora; prueba otra vez." };
    };
    const scopeIds = new Set(inScope(meetings.list()).map((m) => m.id));
    let out: (AskOutcome & { replace?: string }) | { ok: false; reason: string; message: string } | undefined;
    if (recall && key && typeof body.question === "string" && body.question.trim()) {
      const started = performance.now();
      const history = Array.isArray(body.history) ? body.history.filter((m): m is AskMessage => Boolean(m) && (m.role === "user" || m.role === "lente") && typeof m.text === "string") : [];
      let firstAt: number | undefined;
      const fast = await askFast(body.question, history, scope?.id, (e) => {
        if (e.type === "delta" && firstAt === undefined) firstAt = performance.now();
        emit?.(e);
      }).catch(failed);
      if ("path" in fast && fast.path === "fast") {
        const r = fast.result!;
        out = { ok: true, answer: r.answer, sources: r.sources, found: r.found, ms: Math.round(performance.now() - started), ...(r.command ? { command: r.command } : {}), ...(r.replace ? { replace: r.replace } : {}) };
        // Lengths and timings only: no word of the question or the answer.
        console.log(`[ask] fast · retrieval ${fast.retrievalMs.toFixed(1)} ms · ${fast.lines} lines · first text ${firstAt === undefined ? "–" : `${Math.round(firstAt - started)} ms`} · ‹${r.answer.length} chars›${r.cut ? " · cut at length" : ""}`);
      } else if ("path" in fast) {
        console.log(`[ask] deep path · retrieval ${fast.retrievalMs.toFixed(1)} ms · ${fast.lines} lines`);
        emit?.({ type: "searching" });
      } else out = fast;
    }
    out ??= key && sealed
      ? await askWhole({ question, history: body.history }, inScope, Boolean(scope)).catch(failed)
      : key
      ? await ask(
          { question, history: body.history, meetings: inScope(meetings.list()), day: scope ? [] : await day.recent(ASK_DAYS), facts: keptFacts(facts.list()).filter((f) => !scope || scopeIds.has(f.meetingId)), now: Date.now() },
          (messages, maxTokens) => askStructured(messages, askSchema, "ask", maxTokens),
        ).catch(failed)
      : { ok: false as const, reason: "no-key", message: "Lente no tiene un modelo configurado." };
    if (out.ok && out.command) {
      // A request to have something done (add-agent-bridge): proposed as a job, never answered as done.
      // An outside agent asking through MCP cannot queue jobs.
      if (!commands) return { ...out, answer: NOT_FOUND, found: false, command: undefined };
      const job = createJob({ agent: out.command.agent, instruction: out.command.instruction });
      if (!job.ok) return { ...out, answer: NOT_FOUND, found: false, command: undefined };
      console.log(`[ask] ${out.ms} ms · command → job for ${out.command.agent}`);
      return { ...out, answer: proposedAnswer(out.command.agent, job.args.instruction), sources: [], job: { id: job.id, agent: job.args.agent, instruction: job.args.instruction } };
    }
    if (out.ok) console.log(`[ask] ${out.ms} ms · ${out.found ? out.sources.length + " fuentes" : "no encontrado"}`);
    return out;
  }

  // --- Agent jobs (add-agent-bridge): queued for approval, run only by the user's bridge ------------

  /** A job waiting in "Por aprobar". */
  function createJob(input: unknown) {
    const checked = jobArgs(input, (id) => taskStore.list().find((t) => t.id === id)?.title);
    if (!checked.ok) return checked;
    const [action] = actions.addAll("", [{ tool: TOOL_RUN_AGENT, args: checked.args as unknown as Record<string, unknown>, evidence: [] }], Date.now());
    broadcastActions();
    console.log(`[jobs] proposed a job for ${checked.args.agent}${checked.args.taskId ? " from a task" : ""}`);
    return { ok: true as const, id: action!.id, args: checked.args };
  }

  /** The bridge's streams: they get only approved jobs waiting to run, never the phone's events. */
  const jobClients = new Set<ServerResponse>();
  const jobsEvent = () => ({ kind: "jobs", items: queuedJobs(actions.list()) });
  function broadcastJobs(): void {
    const line = `data: ${JSON.stringify(jobsEvent())}\n\n`;
    for (const res of jobClients) res.write(line);
  }
  every(() => {
    for (const res of jobClients) res.write(": keep-alive\n\n");
  }, 15_000);
  /** A job whose bridge never reported back ends as failed instead of running forever. */
  const LOST_CHECK_MS = 60_000;
  every(() => {
    let lost = 0;
    for (const a of actions.list()) {
      const failed = expireLost(a, Date.now());
      if (!failed) continue;
      actions.save(failed);
      lost++;
    }
    if (!lost) return;
    console.log(`[jobs] ${lost} job(s) lost by the bridge, marked failed`);
    broadcastActions();
  }, LOST_CHECK_MS);

  /** `GET /events` and `POST /agent/jobs/<id>/claim|result` for an `agent.run` token of this user. */
  async function bridge(req: IncomingMessage, res: ServerResponse, client: string): Promise<void> {
    const path = req.url?.split("?")[0] ?? "";
    if (req.method === "GET" && path === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write(`data: ${JSON.stringify(jobsEvent())}\n\n`);
      jobClients.add(res);
      req.on("close", () => jobClients.delete(res));
      return;
    }
    const m = /^\/agent\/jobs\/([\w-]{1,64})\/(claim|result)$/.exec(path);
    if (req.method !== "POST" || !m) return void res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "no such route" }));
    const [, id, step] = m;
    const json = (status: number, body: unknown) => void res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
    const action = actions.get(id!);
    if (step === "claim") {
      const out = claimJob(action, Date.now());
      if (!out.ok) return json(out.status, { error: out.error });
      actions.save(out.action);
      broadcastJobs();
      broadcastActions();
      console.log(`[jobs] ${client ? "the bridge" : "a bridge"} started a job for ${String(out.action.args.agent)}`);
      return json(200, { id: out.action.id, ...out.action.args });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse((await readBody(req, 20_000)) || "{}");
    } catch {
      return json(400, { error: "body is not JSON" });
    }
    const result = parseResult(parsed);
    if (!result) return json(400, { error: "need exitCode (an integer) and summary" });
    const out = finishJob(action, result, Date.now());
    if (!out.ok) return json(out.status, { error: out.error });
    actions.save(out.action);
    const taskId = typeof out.action.args.taskId === "string" ? out.action.args.taskId : undefined;
    const doneTask = result.exitCode === 0 && taskId ? taskStore.setDone(taskId, true) : undefined;
    const agentName = AGENT_NAMES[out.action.args.agent as JobAgent] ?? "Un agente";
    record({ at: Date.now(), kind: "agent", tool: TOOL_RUN_AGENT, client, text: result.exitCode === 0 ? `${agentName} terminó un trabajo` : `${agentName} no pudo terminar un trabajo` });
    broadcastActions();
    console.log(`[jobs] a job for ${String(out.action.args.agent)} ended with exit ${result.exitCode}${doneTask ? "; its task is done" : ""}`);
    return json(200, { status: out.action.status, taskDone: Boolean(await doneTask) });
  }

  // --- Outside agents (add-agent-bridge): the API behind the MCP tools ----------------------------

  const AGENTS_FILE = join(dataDir, "agents.json");
  /** The wearer turned agent access off; kept across restarts (a flag, no content). */
  let agentsPaused = readJson<{ paused: boolean }>(AGENTS_FILE, "agents")?.paused === true;
  function setAgentsPaused(paused: boolean): void {
    agentsPaused = paused;
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(AGENTS_FILE, JSON.stringify({ paused }) + "\n");
    console.log(`[agents] ${paused ? "paused" : "resumed"} by the wearer`);
  }

  /** A project by id or by name (accents and case ignored), among this user's projects. */
  async function findProject(ref: string) {
    const fold = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    const list = await projects.list();
    return list.find((p) => p.id === ref) ?? list.find((p) => fold(p.name) === fold(ref));
  }

  const taskView = (t: Task): TaskView => ({
    id: t.id,
    title: t.title,
    who: ownerOf(t),
    otherName: t.otherName ?? null,
    due: t.due ?? null,
    done: t.done,
    project: taskProjects.get(t.meetingId) || null,
    meetingId: t.meetingId || null,
    createdAt: t.createdAt,
  });
  const iso = (at: number | undefined) => (at === undefined ? null : new Date(at).toISOString());

  const agentApi: AgentApi = {
    paused: () => agentsPaused,
    async ask(question, project) {
      const ref = project ? await findProject(project) : undefined;
      if (project && !ref) return "no_project";
      const out = await answerAsk({ question, history: [], ...(ref ? { project: ref.id } : {}) }, false);
      if (out === "no_project") return "no_project";
      if (!out.ok) return "unavailable";
      return { answer: out.answer, found: out.found, sources: out.sources.map((s) => ({ label: s.label, ...(s.meetingId ? { meetingId: s.meetingId } : {}) })) };
    },
    async searchMeetings(query, from, to) {
      const start = from ? localDayStart(from, TIME_ZONE) : -Infinity;
      const end = to ? localDayStart(to, TIME_ZONE) + 24 * 3600 * 1000 : Infinity;
      return searchMeetings(meetings.list(), query).filter((m) => m.startedAt >= start && m.startedAt < end).map((m) => ({ ...m, startedAt: m.startedAt }));
    },
    async getMeeting(id, maxChars) {
      const m = meetings.list().find((x) => x.id === id);
      if (!m) return undefined;
      const assigned = (await projects.assignments()).get(m.id);
      const project = assigned ? (await projects.list()).find((p) => p.id === assigned)?.name ?? null : null;
      const hhmm = (at: number) => new Date(at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
      let transcript = "";
      let truncated = false;
      for (const t of m.turns) {
        const line = `${hhmm(t.at)} ${t.wearer ? "Usuario" : t.speaker ?? "Alguien"}: ${t.text}\n`;
        if (transcript.length + line.length > maxChars) {
          truncated = true;
          break;
        }
        transcript += line;
      }
      const n = m.notes;
      return {
        id: m.id,
        title: m.title,
        startedAt: iso(m.startedAt),
        endedAt: iso(m.endedAt),
        status: m.status,
        project,
        notes: n ? { summary: n.summary, decisions: n.decisions.map((d) => d.text), commitments: n.commitments.map((c) => ({ owner: c.owner === "you" ? "usuario" : c.owner, what: c.what, due: c.due ?? null })), openQuestions: n.openQuestions.map((q) => q.text) } : null,
        transcript,
        truncated,
      };
    },
    projects: async () => projectSummaries(),
    async tasks(filter) {
      let ids: Set<string> | undefined;
      if (filter.project) {
        const ref = await findProject(filter.project);
        if (!ref) return "no_project";
        ids = new Set([...(await projects.assignments())].filter(([, p]) => p === ref.id).map(([m]) => m));
      }
      return (await taskStore.list()).filter((t) => (!filter.open || !t.done) && (!filter.who || ownerOf(t) === filter.who) && (!ids || ids.has(t.meetingId))).map(taskView);
    },
    async createTask(input) {
      const task = await taskStore.add({ title: input.title, who: input.who, ...(input.otherName ? { otherName: input.otherName } : {}), ...(input.due ? { due: input.due } : {}), meetingId: "", evidence: [], source: "agent" }, Date.now());
      broadcastActions();
      return taskView(task);
    },
    async updateTask(id, patch) {
      const task = await taskStore.update(id, patch);
      if (task) broadcastActions();
      return task && taskView(task);
    },
    async completeTask(id) {
      const task = await taskStore.setDone(id, true);
      if (task) broadcastActions();
      return task && taskView(task);
    },
    note: (tool, client, sentence) => record({ at: Date.now(), kind: "agent", tool, client, text: sentence }),
  };

  const ACTIONS: Record<string, () => void> = {
    // In Ver a tap looks with the sight prompt (and works while live reads run); otherwise «Mirar» as before.
    // A failed look is still said out loud: someone who can't see the screen needs to hear why.
    "/look": () => (sightOn ? void look(DEFAULT_LOOK_QUESTION, "describe").then((r) => r.ok || broadcast({ kind: "cue", label: "VER", text: r.text })) : device?.write("P")),
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
    "/assist-mode/sight": () => setAssistMode("sight"),
    "/guest/on": () => setGuest(true),
    "/guest/off": () => setGuest(false),
    // The recording sheet's «Con qué» (add-home-dock): the phone keeps the clip from taking over, «any» lets it.
    "/device/prefer/phone": () => { devicePreference = "phone"; broadcast(statusEvent()); },
    "/device/prefer/any": () => { devicePreference = "any"; broadcast(statusEvent()); },
  };

  every(() => {
    for (const res of clients) res.write(": keep-alive\n\n");
  }, 15_000);

  // --- Talking with Lente (add-voice-mode) -------------------------------------------------------

  let voiceSession: { close(): void } | undefined;

  /** The voice tools on this runtime's stores. */
  /** Ver's companion (add-sight-mode): what the person said in the welcome, in this runtime only. */
  let companion: Companion | undefined;

  const voiceBackend = (openSheet: VoiceBackend["openRecordSheet"], send?: (event: { type: "narration"; on: boolean }) => void): VoiceBackend => ({
    ask: async (question, projectId) => {
      // Voice only answers from the memory: a request to have something done is not queued as a job here.
      const out = await answerAsk({ question, ...(projectId ? { project: projectId } : {}) }, false);
      if (out === "no_project") return { ok: false, message: "unknown project" };
      return out.ok ? { ok: true, answer: out.answer, found: out.found, sources: out.sources } : { ok: false, message: out.message };
    },
    projects: async () => (await projectSummaries()).filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name, openTasks: p.openTasks })),
    tasks: async () => {
      const assigned = await projects.assignments();
      return (await taskStore.list()).map((t) => ({ ...t, projectIdResolved: t.projectId ?? assigned.get(t.meetingId) }));
    },
    addTask: async (t) => {
      const task = await taskStore.add({ ...t, meetingId: "", evidence: [] }, Date.now());
      broadcastActions();
      return task;
    },
    setDone: async (id) => {
      const ok = Boolean(await taskStore.setDone(id, true));
      if (ok) broadcastActions();
      return ok;
    },
    remove: async (id) => {
      const ok = await taskStore.remove(id);
      if (ok) broadcastActions();
      return ok;
    },
    reassign: async (id, who, otherName) => {
      const ok = Boolean(await taskStore.update(id, { who, ...(otherName ? { otherName } : {}) }));
      if (ok) broadcastActions();
      return ok;
    },
    openRecordSheet: openSheet,
    look: (question, mode) => look(question, mode),
    rememberPerson: (person) => {
      companion = person;
      console.log(`[sight] the companion met someone (${person.age ? "name and age" : "name"}${person.wants ? ", what they want" : ""})`);
    },
    // Narration off only stops the speaking: live reads go on, so the day still keeps what the camera saw.
    setNarration: (on) => {
      if (on && !sightOn) setAssistMode("sight");
      if (on) setLive(true);
      send?.({ type: "narration", on });
    },
    // Recording quietly: frames keep flowing for Recuerdos; the phone closes the conversation and starts listening.
    setQuiet: (on) => {
      if (!on) return;
      if (!sightOn) setAssistMode("sight");
      if (!status.live) setLive(true);
    },
    // Fast recall (add-memory-engine 5.3): ask_memory returns lines the voice model answers from.
    ...(recall ? { lines: async (question: string, projectId: string | undefined, filters: { when?: string; person?: string }) => {
      const found = await voiceRecall({ runtime: recall, text: question, ...filters, ...(projectId ? { projectId } : {}), projects: (await projects.list()).map((p) => ({ id: p.id, name: p.name })), now: Date.now(), timeZone: TIME_ZONE });
      return { lines: found.lines.length ? found.text.split("\n").slice(1) : [], citable: found.citable };
    } } : {}),
  });

  /** Voice with fast recall (add-memory-engine 5.1, 5.2): the preloaded prefix and the lines for a turn. */
  const voiceRecallDeps = recall
    ? {
        prefix: async () => recallPrefix(await recall.prefix(undefined), TIME_ZONE).text,
        attach: async (text: string) => {
          const found = await voiceRecall({ runtime: recall, text, projects: (await projects.list()).map((p) => ({ id: p.id, name: p.name })), now: Date.now(), timeZone: TIME_ZONE });
          return found.attach ? { text: found.text, citable: new Map([...found.citable].map(([id, s]) => [id, memorySources([s])[0]!])) } : undefined;
        },
      }
    : undefined;

  /** A phone on `/voice`: one session at a time per wearer; a new one replaces the old. */
  function serveVoice(ws: VoiceSocket): void {
    if (!key) {
      ws.send({ type: "error", message: "Lente no tiene un modelo configurado." });
      return void ws.close();
    }
    voiceSession?.close();
    const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;
    const session = serveVoiceSession(ws, {
      key,
      target,
      backend: voiceBackend,
      ...(voiceRecallDeps ? { recall: voiceRecallDeps } : {}),
      narration,
      // A guest session keeps no chat lines either (add-sight-mode).
      chats: { add: (lines) => (guest() ? undefined : chats.add(lines)), recent: (limit, maxLines) => chats.recent(limit, maxLines) },
      names: () => profile.names,
      companion: () => companion,
      timeZone: TIME_ZONE,
      clip: () => {
        if (!device || status.device !== "clip") return undefined;
        return {
          take(listener) {
            const wasListening = status.listening;
            if (wasListening) setListening(false, { reason: "manual" });
            voiceTap = listener;
            device?.write("M");
            return () => {
              voiceTap = undefined;
              if (wasListening) setListening(true);
              else device?.write("m");
            };
          },
        };
      },
      onUsage: (turn, audioSeconds) => {
        if (audioSeconds) usage.addAudio(audioSeconds);
        if (turn) {
          usage.addCall(target.model, { input: turn.input, cached: turn.cached, output: turn.output });
          for (let i = 0; i < turn.searches; i++) usage.addCall(WEB_SEARCH_MODEL, {});
          broadcast(spendEvent());
        }
        usageChanged = true;
      },
      log: (line) => console.log(line),
    });
    voiceSession = session;
    ws.onClose(() => {
      if (voiceSession === session) voiceSession = undefined;
    });
  }

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
      const events = connectEvents({ status: statusEvent(), history: day.entries.slice(-80), partial: latestPartial, listening: status.listening, rest: [meetingsEvent(), actionsEvent(), recordedEvent(), spendEvent(), notificationsEvent()] });
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else if (req.method === "GET" && req.url === "/memories") {
      // Recuerdos: the latest meetings as moments to relive, with the audio and photos kept for them.
      const recent = [...meetings.list()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MOMENTS_LIMIT);
      const from = Math.min(Date.now(), ...recent.map((m) => m.startedAt)) - 60_000;
      const media = mediaStore ? await Promise.resolve(mediaStore.list(from, Date.now() + 60_000)).catch(() => []) : [];
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ moments: momentsOf(recent, media, MOMENTS_LIMIT) }));
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
    } else if (req.method === "GET" && req.url === "/projects") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ projects: await projectSummaries() }));
    } else if (req.method === "GET" && req.url === "/projects/assignments") {
      // Which project each meeting is in (add-web-desktop), so a meeting shows its project without a request per project.
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ assignments: Object.fromEntries(await projects.assignments()) }));
    } else if (req.method === "GET" && req.url?.startsWith("/projects/get")) {
      const id = new URL(req.url, "http://hub").searchParams.get("id") ?? "";
      const project = (await projectSummaries()).find((p) => p.id === id);
      if (!project) return void res.writeHead(404).end();
      const assigned = await projects.assignments();
      const own = meetings.list().filter((m) => assigned.get(m.id) === id).sort((a, b) => b.startedAt - a.startedAt);
      const ids = new Set(own.map((m) => m.id));
      const tasks = (await taskStore.list()).filter((t) => !t.done && taskInProject(t, id, ids));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ project, meetings: own.map((m) => ({ id: m.id, title: m.title, startedAt: m.startedAt, endedAt: m.endedAt ?? null })), tasks: tasks.map((t) => ({ id: t.id, title: t.title, due: t.due ?? null, meetingId: t.meetingId })) }));
    } else if (req.method === "POST" && (req.url === "/projects/rename" || req.url === "/projects/archive" || req.url === "/projects/restore" || req.url === "/projects/merge")) {
      const body = JSON.parse((await readBody(req)) || "{}") as { id?: unknown; name?: unknown; into?: unknown };
      const id = typeof body.id === "string" ? body.id : "";
      let ok = false;
      if (req.url === "/projects/rename") {
        const name = typeof body.name === "string" ? cleanName(body.name) : "";
        ok = Boolean(name) && (await projects.rename(id, name));
      } else if (req.url === "/projects/merge") {
        const ids = new Set((await projects.list()).map((p) => p.id));
        ok = typeof body.into === "string" && body.into !== id && ids.has(id) && ids.has(body.into);
        if (ok) await projects.merge(id, body.into as string);
      } else ok = await projects.setStatus(id, req.url === "/projects/archive" ? "archived" : "active");
      if (ok) void refreshTaskProjects();
      res.writeHead(ok ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/meetings/project") {
      const body = JSON.parse((await readBody(req)) || "{}") as { id?: unknown; project?: unknown };
      const known = typeof body.id === "string" && meetings.list().some((m) => m.id === body.id);
      const project = body.project === null ? null : typeof body.project === "string" ? body.project : undefined;
      if (!known || project === undefined) return void res.writeHead(400).end();
      try {
        await sealed?.flush();
        await projects.assign(body.id as string, project);
        void refreshTaskProjects();
        res.writeHead(204).end();
      } catch {
        res.writeHead(404).end();
      }
    } else if (req.method === "GET" && req.url === "/tasks") {
      // The task list and the approvals without the stream (add-web-desktop): the actions event, read only.
      const { kind: _kind, ...body } = actionsEvent();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    } else if (req.method === "GET" && req.url === "/day") {
      // Today's whole record for Hoy; the stream carries only the last 80 entries.
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ entries: day.entries }));
    } else if (req.method === "GET" && req.url === "/memory/profile") {
      // The profile Lente keeps of the wearer (accounts, add-accounts 5.1); the laptop writes none.
      const [latest] = sealed ? await sealed.digests.latest("profile", 1) : [];
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ profile: latest ? { text: latest.text, at: latest.createdAt } : null }));
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
    } else if (req.method === "POST" && req.url === "/tasks/add") {
      const body = JSON.parse((await readBody(req)) || "{}") as { title?: unknown; who?: unknown; otherName?: unknown; due?: unknown };
      const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, MAX_TASK_CHARS) : "";
      const who = TASK_OWNERS.includes(body.who as TaskOwner) ? (body.who as TaskOwner) : "me";
      if (!title) return void res.writeHead(400).end();
      const otherName = who === "other" && typeof body.otherName === "string" && body.otherName.trim() ? body.otherName.trim().slice(0, 60) : undefined;
      const due = typeof body.due === "string" && body.due.trim() ? body.due.trim().slice(0, 40) : undefined;
      const task = await taskStore.add({ title, who, ...(otherName ? { otherName } : {}), ...(due ? { due } : {}), meetingId: "", evidence: [], source: "manual" }, Date.now());
      broadcastActions();
      res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ id: task.id }));
    } else if (req.method === "POST" && req.url === "/tasks/update") {
      const body = JSON.parse((await readBody(req)) || "{}") as { id?: unknown; who?: unknown; otherName?: unknown; title?: unknown };
      const who = body.who === undefined ? undefined : TASK_OWNERS.includes(body.who as TaskOwner) ? (body.who as TaskOwner) : null;
      const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, MAX_TASK_CHARS) : undefined;
      if (typeof body.id !== "string" || who === null || title === "") return void res.writeHead(400).end();
      const task = await taskStore.update(body.id, { ...(who ? { who } : {}), ...(typeof body.otherName === "string" ? { otherName: body.otherName.trim().slice(0, 60) } : {}), ...(title ? { title } : {}) });
      if (task) broadcastActions();
      res.writeHead(task ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/tasks/delete") {
      const { id } = JSON.parse((await readBody(req)) || "{}") as { id?: unknown };
      const ok = typeof id === "string" && (await taskStore.remove(id));
      if (ok) broadcastActions();
      res.writeHead(ok ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/tasks/done") {
      const { id, done } = JSON.parse((await readBody(req)) || "{}") as { id?: string; done?: boolean };
      const task = typeof id === "string" && typeof done === "boolean" ? taskStore.setDone(id, done) : undefined;
      if (task) broadcastActions();
      res.writeHead(task ? 204 : 404).end();
    } else if (req.method === "POST" && req.url === "/meeting/start") {
      const { title, project } = JSON.parse((await readBody(req)) || "{}") as { title?: string; project?: unknown };
      if (typeof project === "string" && !(await projects.list()).some((p) => p.id === project && p.status === "active")) return void res.writeHead(404).end();
      startMeeting(typeof title === "string" ? title : "");
      // A project chosen before recording wins over the automatic assignment (add-record-sheet).
      if (typeof project === "string" && current) {
        const id = current.id;
        await sealed?.flush();
        await projects.assign(id, project);
        void refreshTaskProjects();
      }
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
      const gone = meetings.list().find((m) => m.id === id);
      // Its kept audio goes before its records (add-media-archive 3.1); a failure keeps the meeting.
      if (gone && id !== current?.id) {
        try {
          await forgetMedia({ meetings: [gone] });
        } catch (error) {
          console.error(`[media] removing a meeting's media failed: ${(error as Error).message.slice(0, 160)}`);
          return void res.writeHead(502).end();
        }
      }
      const removed = typeof id === "string" && id !== current?.id && meetings.delete(id);
      if (removed && gone) void forgetInMemory({ meetings: [gone] });
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
      const all = [...meetings.list(), ...(current ? [current] : [])];
      if (mediaStore) await Promise.resolve(mediaStore.removeAll()).catch((error: Error) => console.error(`[media] removing all media failed: ${error.message.slice(0, 160)}`));
      keptMedia.clear();
      for (const m of all) deletedMeetings.add(m.id);
      setTimeout(() => void forgetInMemory({ meetings: all }), 0);
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
    } else if (req.method === "GET" && req.url === "/chat/voice") {
      // The latest voice sessions, for Inicio's chat (add-voice-mode).
      const threads = (await chats.recent(RECENT_THREADS)).filter((t) => t.via === "voice");
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ threads }));
    } else if (req.method === "GET" && req.url === "/chat/threads") {
      // The chat's history (add-home-dock): typed and voice conversations, newest first, each titled by its first question.
      const threads = (await chats.recent(HISTORY_THREADS)).map((t) => ({ ...t, title: threadTitle(t) }));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ threads }));
    } else if (req.method === "GET" && /^\/media\/(audio|frame)\/[a-zA-Z0-9:%._-]{1,120}$/.test(req.url ?? "")) {
      // Playback through the hub only (add-media-archive 2.3): opened here, never a signed URL, never logged.
      // Chips send the ref encoded (`:` as %3A); the decoded ref must still be a plain id.
      const [, , kind, raw] = req.url!.split("/") as [string, string, "audio" | "frame", string];
      const ref = (() => { try { return decodeURIComponent(raw); } catch { return ""; } })();
      if (!/^[a-zA-Z0-9:._-]{1,80}$/.test(ref)) return void res.writeHead(404).end();
      const found = mediaStore ? await Promise.resolve(mediaStore.get(kind, ref)).catch(() => undefined) : undefined;
      if (!found) return void res.writeHead(404).end();
      const body = kind === "audio" ? Buffer.from(wav(decodeAdpcm(found.data))) : Buffer.from(found.data);
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
      const type = kind === "audio" ? "audio/wav" : "image/jpeg";
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start >= body.length || start > end) return void res.writeHead(416, { "Content-Range": `bytes */${body.length}` }).end();
        res.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${body.length}`, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" });
        return void res.end(body.subarray(start, end + 1));
      }
      res.writeHead(200, { "Content-Type": type, "Content-Length": body.length, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" });
      res.end(body);
    } else if (req.method === "POST" && /^\/media\/retention\/(7|30|90)$/.test(req.url ?? "")) {
      profile.setMediaRetention(Number(req.url!.split("/")[3]) as 7 | 30 | 90);
      broadcast(statusEvent());
      res.writeHead(204).end();
    } else if (req.method === "POST" && /^\/media\/(audio|photos)\/(on|off)$/.test(req.url ?? "")) {
      // «Guardar audio» and «Guardar fotos»: off stops storage at once; on keeps media from now, not before.
      const [, , kind, state] = req.url!.split("/") as [string, string, "audio" | "photos", "on" | "off"];
      profile.setMedia(kind, state === "on");
      if (kind === "audio" && state === "off") segmentAudio.drop();
      console.log(`[media] ${kind} ${state}`);
      broadcast(statusEvent());
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/ask") {
      const body = JSON.parse((await readBody(req)) || "{}") as { question?: unknown; history?: unknown; project?: unknown; threadId?: unknown };
      const askedAt = Date.now();
      // add-memory-engine 3.4: a client that accepts an event stream gets the answer as it is written
      // (delta, source, replace, job, searching, done); older clients keep the JSON reply.
      const streaming = String(req.headers.accept ?? "").includes("text/event-stream");
      let opened = false;
      const send = (event: string, data: unknown) => {
        if (!opened) {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
          opened = true;
        }
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      let sentText = false;
      const answered = await answerAsk(body, true, streaming ? (e) => (e.type === "delta" ? ((sentText = true), send("delta", { text: e.text })) : e.type === "source" ? send("source", withMedia(e.source)) : send("searching", {})) : undefined);
      const out = answered !== "no_project" && answered.ok ? { ...answered, sources: answered.sources.map(withMedia) } : answered;
      if (out === "no_project") return void (opened ? res.end() : res.writeHead(404).end());
      // A typed conversation is kept like a voice one (sealed in the cloud) when the phone names its thread.
      if (out.ok && isThreadId(body.threadId) && typeof body.question === "string" && body.question.trim()) {
        Promise.resolve(chats.add(askLines(body.threadId, body.question.trim().slice(0, 2000), out, askedAt, Date.now())))
          .catch((error: Error) => console.error(`[ask] could not keep the chat lines: ${error.message.slice(0, 160)}`));
      }
      if (streaming) {
        // The deep and tiered paths (and a proposed job) answer at once: one delta and its chips.
        if (out.ok && !sentText) {
          send("delta", { text: out.answer });
          for (const source of out.sources) send("source", source);
        }
        if ("replace" in out && out.replace) send("replace", { text: out.replace });
        if (out.ok && "job" in out && out.job) send("job", out.job);
        send("done", out);
        return void res.end();
      }
      res.writeHead(out.ok ? 200 : out.reason === "empty-question" ? 400 : 502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
    } else if (req.method === "POST" && req.url === "/agent/jobs") {
      let body: unknown;
      try {
        body = JSON.parse((await readBody(req)) || "{}");
      } catch {
        return void res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "body is not JSON" }));
      }
      const job = createJob(body);
      res.writeHead(job.ok ? 201 : job.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(job.ok ? { id: job.id, ...job.args } : { error: job.error }));
    } else if (req.method === "GET" && req.url === "/notifications") {
      // add-notifications: the feed, its read mark, the unread count and the settings.
      const feed = notificationFeed();
      const { readAt, prefs } = profile.notifications;
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ items: feed, readAt, unread: unreadCount(feed, readAt), prefs }));
    } else if (req.method === "POST" && req.url === "/notifications/read") {
      const body = JSON.parse((await readBody(req)) || "{}") as { at?: unknown };
      const at = typeof body.at === "number" && body.at > 0 ? Math.min(body.at, Date.now()) : Date.now();
      profile.setNotifications({ ...profile.notifications, readAt: Math.max(profile.notifications.readAt, at) });
      broadcast(notificationsEvent());
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/notifications/prefs") {
      const body = JSON.parse((await readBody(req)) || "{}") as { prefs?: unknown };
      const prefs = parsePrefs(body.prefs, profile.notifications.prefs);
      profile.setNotifications({ ...profile.notifications, prefs });
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ prefs }));
    } else if (req.method === "GET" && req.url === "/agent/jobs") {
      // The jobs Conexiones lists on the phone (add-home-dock): every agent job, newest first, with its stage.
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ jobs: jobList(actions.list()) }));
    } else if (req.method === "GET" && req.url === "/agents") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ paused: agentsPaused }));
    } else if (req.method === "POST" && (req.url === "/agents/pause" || req.url === "/agents/resume")) {
      setAgentsPaused(req.url === "/agents/pause");
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/narrated") {
      const { text } = JSON.parse((await readBody(req)) || "{}") as { text?: string };
      if (typeof text === "string") narration.narrated(text, Date.now());
      res.writeHead(204).end();
    } else if (req.method === "POST" && req.url === "/tts") {
      const { text, voice } = JSON.parse((await readBody(req)) || "{}") as { text?: string; voice?: string };
      await speak(res, text ?? "", voice);
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
    /** What an outside agent may read and change for this user, through the MCP tools. */
    agentApi,
    agent: async (): Promise<AgentApi> => agentApi,
    bridge,
    /** A clip or phone on the `/device` WebSocket, once its upgrade was admitted. */
    serveWebDevice(socket: Duplex, remote: string): void {
      webDevices.add(socket);
      serveDevice(socket, remote);
    },
    serveVoice,
    pushStatus: (): void => broadcast(statusEvent()),
    listening: (): boolean => status.listening,
    /** Waits for this account's pending writes (before an export). */
    flush: async (): Promise<void> => void (await sealed?.flush()),
    /** A phone or a bridge follows, a device is connected, listening is on, a meeting is open, or a voice session runs. */
    busy: (): boolean => clients.size > 0 || jobClients.size > 0 || device !== undefined || status.listening || current !== undefined || voiceSession !== undefined,
    /** Eviction: stop transcribing, flush usage and recorded time, end the streams, clear the timers. */
    async close(): Promise<void> {
      voiceSession?.close();
      stopAsr();
      device?.destroy();
      saveUsage();
      saveRecorded();
      for (const res of [...clients, ...jobClients]) res.end();
      clients.clear();
      jobClients.clear();
      for (const t of timers) clearInterval(t);
      nightly.stop(userId);
      // The index's changed months are written while the data key is still here (add-memory-engine 7.2).
      await persistIndex("eviction");
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
type Wearer = Pick<WearerRuntime, "pushStatus" | "listening" | "busy" | "close" | "flush"> & {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  agent(): Promise<AgentApi>;
  bridge(req: IncomingMessage, res: ServerResponse, client: string): Promise<void>;
  serveDevice(socket: Duplex, remote: string | undefined): void;
  serveWebDevice(socket: Duplex, remote: string): void;
  serveVoice(socket: VoiceSocket): void;
};

/**
 * An account's runtime on the sealed stores: its data key is unwrapped and its stores loaded once,
 * and everything sent before that waits for it. A runtime that cannot open is dropped, so the next
 * request tries again.
 */
function openAccountWearer(userId: string, mayListen: () => boolean): Wearer {
  const ready = (async () => createWearerRuntime(userId, runtimeDir(userId), mayListen, await openCachedStores(supabase!, userId, await accounts!.dek(userId), Date.now(), mediaStorage)))();
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
    agent: async () => (await ready).agentApi,
    bridge: async (req, res, client) => (await ready).bridge(req, res, client),
    serveDevice: (socket, remote) => void ready.then((rt) => rt.serveDevice(socket, remote), () => socket.destroy()),
    serveWebDevice: (socket, remote) => void ready.then((rt) => rt.serveWebDevice(socket, remote), () => socket.destroy()),
    serveVoice: (socket) => void ready.then((rt) => rt.serveVoice(socket), () => socket.close()),
    pushStatus: () => open?.pushStatus(),
    listening: () => open?.listening() ?? false,
    busy: () => (open ? open.busy() : true),
    close: async () => (await ready).close(),
    flush: async () => (await ready).flush(),
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

// --- Outside agents (add-agent-bridge): MCP for any agent, the job routes for the bridge -------------

/** Agent tokens: each account's devices, or on the laptop and a pairing hub the owner's own file. */
const agentDevices = userDevices ?? new UserDevices(new FileDeviceStore(join(DATA_DIR, "agent-devices.json")));
const agentCalls = new CallLimiter();
const MCP_PATH = "/mcp";

/** The agent behind `Authorization: Bearer <agent token>`, if it is live and its user is admitted. */
async function agentOf(req: IncomingMessage): Promise<AgentIdentity | undefined> {
  const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
  // A Supabase access token (a JWT) is a person, not an agent.
  if (!bearer || bearer.split(".").length === 3) return undefined;
  const agent = await agentDevices.resolveAgent(bearer);
  if (!agent) return undefined;
  if (await refusal({ userId: agent.userId, via: "device", deviceId: agent.deviceId })) return undefined;
  return agent;
}

/** The hub's own origins: a browser page served from anywhere else may not call `/mcp`. */
function ownOrigins(req: IncomingMessage): string[] {
  const host = req.headers.host ?? "";
  const list = [`http://${host}`, `https://${host}`];
  if (process.env.LENTE_PUBLIC_URL) list.push(new URL(process.env.LENTE_PUBLIC_URL).origin);
  return list;
}

/** `/mcp`: the token's user and scopes decide everything; no cookie or session counts here. */
async function mcpRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (plainHttp(req) && AUTH_MODE !== "open") return void res.writeHead(308, { Location: `https://${req.headers.host ?? ""}${req.url}` }).end();
  const agent = await agentOf(req);
  const send = (out: { status: number; headers: Record<string, string>; body?: string }) => void res.writeHead(out.status, out.headers).end(out.body);
  if (!agent) return send(unauthorizedResponse());
  const started = Date.now();
  const body = req.method === "POST" ? await readBody(req, MCP_MAX_BODY_BYTES) : "";
  const api = await wearers.get(agent.userId).agent();
  const out = await serveMcp({ method: req.method ?? "GET", headers: req.headers, body, allowedOrigins: ownOrigins(req) }, agentServer(agent, api, agentCalls));
  // Only the method and the tool's name: never arguments or answers.
  const name = /"name"\s*:\s*"([\w.-]{1,64})"/.exec(body)?.[1];
  const method = /"method"\s*:\s*"([\w/.-]{1,64})"/.exec(body)?.[1] ?? req.method;
  console.log(`[mcp] ${method}${method === "tools/call" && name ? ` ${name}` : ""} · ${out.status} · ${Date.now() - started} ms`);
  send(out);
}

/**
 * The bridge's routes: `GET /events` with an agent token, and `/agent/jobs/<id>/claim|result`.
 * True when answered here; a person's `/events` passes through to the phone's stream.
 */
async function bridgeRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = req.url?.split("?")[0] ?? "";
  const jobStep = /^\/agent\/jobs\/[^/]+\/(claim|result)$/.test(path);
  if (!jobStep && path !== "/events") return false;
  const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
  const agentBearer = Boolean(bearer) && bearer!.split(".").length !== 3;
  if (!jobStep && !agentBearer) return false;
  if (plainHttp(req) && AUTH_MODE !== "open") return void res.writeHead(308, { Location: `https://${req.headers.host ?? ""}${req.url}` }).end(), true;
  const agent = agentBearer ? await agentOf(req) : undefined;
  if (!agent) return void res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="lente"' }).end(JSON.stringify({ error: "unauthorized" })), true;
  if (!agent.scopes.includes("agent.run")) return void res.writeHead(403, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "unauthorized", message: "this token lacks the agent.run scope" })), true;
  await wearers.get(agent.userId).bridge(req, res, agent.label);
  return true;
}

const handleWeb = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    if (req.url?.split("?")[0] === MCP_PATH) return void (await mcpRoute(req, res));
    if (await bridgeRoute(req, res)) return;
    if (await gateWeb(req, res)) return;
    const who = requestIdentity.get(req);
    const devicesPath = req.url?.split("?")[0];
    // Without accounts the hub keeps clip tokens apart (scripts/hub-token.ts); `/devices` makes agent tokens only.
    const devicesStore = userDevices ?? agentDevices;
    const isDevicesRoute = devicesPath === "/devices" || devicesPath === "/devices/revoke";
    const devicesBody = who && isDevicesRoute && req.method === "POST" ? await readBody(req) : "";
    const askedKind = (): unknown => {
      try {
        return (JSON.parse(devicesBody || "{}") as { kind?: unknown }).kind;
      } catch {
        return undefined;
      }
    };
    if (!userDevices && req.method === "POST" && devicesPath === "/devices" && askedKind() !== "mcp") {
      res.writeHead(400, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ error: "this hub makes agent (mcp) tokens only; clip tokens come from scripts/hub-token.ts" }));
      return;
    }
    const devicesAnswer = who && isDevicesRoute ? await deviceRoute(devicesStore, who.userId, req.method ?? "GET", devicesPath, devicesBody) : undefined;
    if (devicesAnswer) {
      res.writeHead(devicesAnswer.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(devicesAnswer.json === undefined ? undefined : JSON.stringify(devicesAnswer.json));
      return;
    }
    if (webSessions && req.method === "POST" && devicesPath === "/auth/signout") {
      // Signing out ends this browser's hub session; other devices and the app stay signed in.
      await webSessions.revoke(cookieValue(req.headers.cookie, SESSION_COOKIE));
      res.writeHead(204, { "Set-Cookie": clearCookie(SESSION_COOKIE), "Cache-Control": "no-store" }).end();
      return;
    }
    if (accounts && who && (devicesPath === "/account" || devicesPath === "/account/export" || devicesPath === "/account/delete")) return void (await accountRights(req, res, who, devicesPath));
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
  const path = req.url?.split("?")[0];
  // A voice session (add-voice-mode) is admitted exactly like a device, and runs in the caller's own runtime.
  const status = decideUpgrade({ path, plainHttp: plainHttp(req), identified: Boolean(who) }, path === VOICE_WS_PATH ? VOICE_WS_PATH : DEVICE_WS_PATH, AUTH_MODE);
  const refusals: Record<number, string> = { 401: "Unauthorized", 404: "Not Found", 426: "Upgrade Required" };
  if (status !== 200) return void raw.end(`HTTP/1.1 ${status} ${refusals[status]}\r\nConnection: close\r\n\r\n`);
  if (path === VOICE_WS_PATH) {
    const voice = acceptVoice(req, raw, head);
    if (voice) wearers.get(who?.userId ?? LOCAL_OWNER).serveVoice(voice);
    return;
  }
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
