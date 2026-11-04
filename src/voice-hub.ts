// A voice session on the hub (add-voice-mode): the `/voice` socket, its own transcription session
// in ENDPOINTING mode, the voice agent on Muse Spark 1.3 and the tools on the wearer's runtime.
// This is the edge: sockets, timers and the model call. The decisions are in src/voice-session.ts,
// src/voice-agent.ts and src/voice-tools.ts. Logs carry lengths and counts, never what was said.

import { randomUUID } from "node:crypto";
import { AsrSession, DEFAULT_LANGUAGE_BIAS } from "./asr-session.ts";
import type { ChatLine, Chats } from "./chat-store.ts";
import { COACH_INTRO_CUE, type CoachLanguage, type CoachMode, DEFAULT_BAND, checkRepeat, coachInstructions, coachLanguage, coachLanguageBias, sentenceLanguage } from "./coach.ts";
import { type Estimate, ESTIMATE_SCHEMA, PLACEMENT_MAX_MS, type PlacementTurn, checkEvidence, closingLine, enoughForBand, estimateInput, estimatePrompt, fluency, parseEstimate } from "./placement.ts";
import type { ChatTarget } from "./providers.ts";
import { type AttachedMemory, COACH_FUNCTIONS, COACH_TAP_QUESTION, type Companion, coachTapModel, scriptedCallModel, type VoiceModel, SIGHT_FUNCTIONS, SIGHT_INTRO_CUE, VOICE_FUNCTIONS, withMemoryPrefix, type VoiceUsage, runVoiceTurn, voiceInstructions } from "./voice-agent.ts";
import { type PhoneMessage, type VoiceLine, VoiceSession, type VoiceSessionDeps, parsePhoneMessage } from "./voice-session.ts";
import { type VoiceBackend, VoiceTools } from "./voice-tools.ts";
import { SpeculativeRecall } from "./voice-recall.ts";
import { responsesVoiceModel } from "./voice-wire.ts";
import type { VoiceSocket } from "./ws-voice.ts";

/** 80 ms of PCM16 mono at 16 kHz: the frame the transcription service expects. */
const FRAME_MS = 80;
const FRAME_BYTES = (16000 * 2 * FRAME_MS) / 1000;

export interface VoiceHubDeps {
  key: string;
  target: ChatTarget;
  /** The tools' backend; `openSheet` sends the record sheet to this session's phone. */
  backend(openSheet: (choice: { projectId?: string; projectName?: string; camera: boolean }) => void, send: (event: { type: "narration"; on: boolean }) => void): VoiceBackend;
  /** Ver (add-sight-mode): what the companion already knows about the person. */
  companion?(): Companion | undefined;
  narration: { narrated(text: string, at: number): void; repeats(text: string, at: number): boolean };
  chats: Chats;
  names(): string[];
  timeZone: string;
  /**
   * The clip, when one (not the phone stand-in) is connected: `take` pauses meeting listening, turns
   * the clip's microphone on and sends its audio to `listener`; the returned function restores both.
   */
  clip(): { take(listener: (pcm: Buffer) => void): () => void } | undefined;
  /**
   * Fast recall (add-memory-engine 5.1, 5.2): the memory prefix the session opens with, and the lines
   * for what the wearer said (undefined when none should be attached). Absent on the tiers path.
   */
  recall?: { prefix(): Promise<string>; attach(text: string): Promise<AttachedMemory | undefined> };
  /** Each turn's tokens and searches, and audio seconds sent, for today's spend. */
  onUsage(turn: VoiceUsage | undefined, audioSeconds: number): void;
  log(line: string): void;
}

export function serveVoiceSession(ws: VoiceSocket, deps: VoiceHubDeps): { close(): void } {
  const threadId = randomUUID();
  // «¿Dónde estoy?» (add-sight-mode): the hub asks this session's phone and waits for its answer.
  const LOCATE_TIMEOUT_MS = 8_000;
  const locating = new Map<string, (at: Extract<PhoneMessage, { type: "location" }> | undefined) => void>();
  const backend = deps.backend((choice) => ws.send({ type: "recordSheet", ...choice }), (event) => ws.send(event));
  backend.locate = async () => {
    const id = randomUUID();
    const at = await new Promise<Extract<PhoneMessage, { type: "location" }> | undefined>((resolve) => {
      const timer = setTimeout(() => (locating.delete(id), resolve(undefined)), LOCATE_TIMEOUT_MS);
      locating.set(id, (reply) => (clearTimeout(timer), locating.delete(id), resolve(reply)));
      ws.send({ type: "locate", id });
    });
    if (!at) return { ok: false, reason: "el teléfono no respondió con su ubicación" };
    if (!at.ok || !at.address) return { ok: false, reason: at.reason ?? "no hay ubicación disponible" };
    return { ok: true, address: at.address, ...(at.place ? { place: at.place } : {}), ...(at.accuracy !== undefined ? { accuracy: at.accuracy } : {}) };
  };
  const hubQuiet = backend.setQuiet?.bind(backend);
  backend.setQuiet = (on) => {
    hubQuiet?.(on);
    ws.send({ type: "quiet", on });
  };
  const tools = new VoiceTools(backend);
  /** Ver's companion (add-sight-mode) once the phone says so; the default Lente otherwise. */
  let persona: "sight" | "default" | "coach" = "default";
  let intro = false;
  /** The language coach (add-language-coach): its verified target language and mode, once the phone asks for it. */
  let coach: { lang: CoachLanguage; mode: CoachMode } | undefined;
  /** What the wearer said in the turn being answered, and the phrase the coach last said, for check_repeat. */
  let heardNow = "";
  let lastPhrase = "";
  /** The placement (2.3): the wearer's answers with their audio spans, the tutor's questions, and the clock. */
  type Placement = { turns: PlacementTurn[]; questions: string[]; done: boolean; timer?: ReturnType<typeof setTimeout> };
  let placement: Placement | undefined;
  /** Session audio ms when the phone last finished speaking: the end of the tutor's question. */
  let promptEndMs: number | undefined;

  const finishPlacement = async (): Promise<string> => {
    const on = coach!;
    const p = placement ?? { turns: [], questions: [], done: false };
    p.done = true;
    clearTimeout(p.timer);
    // The turn that asked to stop («para») is not an answer.
    const answers = p.turns.at(-1)?.text === heardNow.trim() ? p.turns.slice(0, -1) : p.turns;
    const measured = fluency(answers);
    let estimate: Estimate | undefined;
    if (enoughForBand(measured) && backend.estimate) {
      try {
        const parsed = parseEstimate(await backend.estimate(estimatePrompt(on.lang), estimateInput(p.questions, answers, measured), ESTIMATE_SCHEMA));
        if (parsed) estimate = checkEvidence(parsed, answers);
      } catch (error) {
        deps.log(`[voice] placement estimate failed: ${(error as Error).message.slice(0, 160)}`);
      }
    }
    const line = closingLine(estimate, on.lang);
    ws.send({ type: "placement", lang: on.lang.code, line, fluency: measured, ...(estimate ?? {}) });
    deps.log(`[voice] placement · ${answers.length} answers · ${measured.words} words · ${estimate ? `${estimate.band} (${estimate.confidence})` : "no band"}`);
    return line;
  };
  let turns = 0;
  const save = (lines: VoiceLine[]) => {
    const at = Date.now();
    const rows: ChatLine[] = lines.map((l, i) => ({ threadId, role: l.role, text: l.text, sources: l.sources, via: "voice", at: at + i }));
    Promise.resolve(deps.chats.add(rows)).catch((error: Error) => deps.log(`[voice] could not keep ${rows.length} chat line(s): ${error.message.slice(0, 160)}`));
  };

  let instructions: Promise<string> | undefined;
  // One developer message for the whole session, with the memory prefix preloaded when fast recall is on
  // (5.1): it is the cached prefix, so questions about who and what is current need no lookup.
  const instructionsOnce = () =>
    (instructions ??= Promise.all([
      coach
        ? Promise.resolve(coachInstructions({ lang: coach.lang, mode: coach.mode, band: DEFAULT_BAND, names: deps.names(), now: Date.now(), timeZone: deps.timeZone }))
        : persona === "sight"
        ? Promise.resolve(voiceInstructions({ names: deps.names(), now: Date.now(), timeZone: deps.timeZone, persona, intro, ...(deps.companion?.() ? { companion: deps.companion()! } : {}) }))
        : tools.projectRefs().then(
            (projects) => voiceInstructions({ names: deps.names(), now: Date.now(), timeZone: deps.timeZone, projects }),
            () => voiceInstructions({ names: deps.names(), now: Date.now(), timeZone: deps.timeZone }),
          ),
      deps.recall?.prefix().catch(() => "") ?? Promise.resolve(""),
    ]).then(([rules, prefix]) => withMemoryPrefix(rules, prefix)));
  void instructionsOnce();

  // Speculative recall (5.2): retrieval on the partial transcript while the wearer speaks, and on the
  // final words; it takes milliseconds and calls no model.
  const speculative = deps.recall ? new SpeculativeRecall((text) => deps.recall!.attach(text)) : undefined;
  const attachFor = (utterance: string): Promise<AttachedMemory | undefined> => speculative?.final(utterance) ?? Promise.resolve(undefined);

  const session = new VoiceSession({
    send: (e) => {
      if (e.type === "state" && e.state === "listening") promptEndMs = sessionMs;
      ws.send(e);
    },
    confirmations: tools,
    narration: deps.narration,
    save,
    now: Date.now,
    log: deps.log,
    repeatOf: (text) => Boolean(coach && lastPhrase && checkRepeat(lastPhrase, text, coach.lang.code).result === "understood"),
    runTurn: (utterance, history, signal, emit) => runTurn(utterance, history, signal, emit),
  });

  /**
   * One turn. `scripted`: the hub acts without a model step to decide it, for a tap on the coach's look surface
   * (add-language-coach 2.1, design decision 13) or the placement's clock (2.3).
   */
  async function runTurn(...[utterance, history, signal, emit, scripted]: [...Parameters<VoiceSessionDeps["runTurn"]>, VoiceModel?]) {
    const [rules, attached] = await Promise.all([instructionsOnce(), scripted ? Promise.resolve(undefined) : attachFor(utterance)]);
    const on = coach;
    heardNow = utterance;
    const functions = on ? COACH_FUNCTIONS : persona === "sight" ? SIGHT_FUNCTIONS : VOICE_FUNCTIONS;
    // The coach's sentences carry the language they are spoken in; its own tools tag theirs.
    const tagged: typeof emit = on ? (e) => emit(e.kind === "sentence" && !e.lang ? { ...e, lang: sentenceLanguage(e.text, on.lang.code) } : e) : emit;
    const handlers = on ? tools.coachHandlers({ lang: on.lang.code, band: DEFAULT_BAND, heard: () => heardNow, pronounced: (text) => (lastPhrase = text), ...(placement && !placement.done ? { finishPlacement } : {}) }) : tools.handlers();
    const model = scripted && on ? scripted : responsesVoiceModel(deps.target, { instructions: rules, functions, webSearch: !on });
    const result = await runVoiceTurn({ model, tools: handlers, history, utterance, signal, emit: tagged, ...(attached ? { attached } : {}), ...(persona === "sight" ? { speakAll: true } : {}) });
    turns++;
    if (placement && !placement.done && result.text) placement.questions.push(result.text);
    deps.onUsage(result.usage, 0);
    deps.log(`[voice] turn ${turns} · ${result.stopped} · ${result.steps} step(s) · ${attached ? `${attached.citable.size} memory lines attached · ` : ""} first sentence ${result.firstSentenceMs === undefined ? "-" : Math.round(result.firstSentenceMs)} ms · tools ${result.tools.join(",") || "none"} · ‹${utterance.length} chars› → ‹${result.text.length} chars›${result.error ? ` · ${result.error.slice(0, 160)}` : ""}`);
    return result;
  }

  const asr = new AsrSession(
    deps.key,
    {
      onTurn: (turn) => {
        if (coach && placement && !placement.done) placement.turns.push({ text: turn.text, ...(turn.startMs !== undefined ? { startMs: turn.startMs } : {}), ...(turn.endMs !== undefined ? { endMs: turn.endMs } : {}), ...(promptEndMs !== undefined ? { promptEndMs } : {}) });
        session.heardTurn(turn.text);
      },
      onPartial: (text) => {
        session.heardPartial(text);
        speculative?.partial(text);
      },
      onSpeaker: () => {},
      onStatus: (s) => {
        if (/error|closed/.test(s)) deps.log(`[voice] transcription: ${s.slice(0, 120)}`);
      },
      // The service closes a session that gets no audio (paused); the next audio reopens it.
      onIdleClose: () => {},
    },
    DEFAULT_LANGUAGE_BIAS,
    "ENDPOINTING",
  );

  let pending: Buffer = Buffer.alloc(0);
  let sessionMs = 0;
  const hear = (pcm: Buffer) => {
    if (session.state === "paused" || ws.closed) return;
    pending = pending.length ? Buffer.concat([pending, pcm]) : pcm;
    let sent = 0;
    while (pending.length >= FRAME_BYTES) {
      asr.resume();
      asr.send(pending.subarray(0, FRAME_BYTES), sessionMs);
      pending = pending.subarray(FRAME_BYTES);
      sessionMs += FRAME_MS;
      sent++;
    }
    if (sent) deps.onUsage(undefined, (sent * FRAME_MS) / 1000);
  };

  const clip = deps.clip();
  const release = clip?.take(hear);
  if (!clip) ws.onAudio(hear);
  ws.send({ type: "listening", source: clip ? "clip" : "phone" });
  asr.start();
  deps.log(`[voice] session opened · ${clip ? "clip" : "phone"} microphone`);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (placement) clearTimeout(placement.timer);
    session.close();
    asr.stop();
    release?.();
    ws.close();
    deps.log(`[voice] session closed after ${turns} turn(s)`);
  };
  ws.onText((text) => {
    const message = parsePhoneMessage(text);
    if (!message) return;
    if (message.type === "end") return close();
    if (message.type === "location") return void locating.get(message.id)?.(message);
    if (message.type === "look") {
      if (!coach) return deps.log("[voice] a look tap outside the coach is ignored");
      return session.ask(COACH_TAP_QUESTION, (utterance, history, signal, emit) => runTurn(utterance, history, signal, emit, coachTapModel(utterance)));
    }
    if (message.type === "start") {
      // Ver's companion or the language coach: new instructions for the session, and with `intro` Lente speaks first.
      intro = message.intro;
      coach = undefined;
      if (placement) clearTimeout(placement.timer);
      placement = undefined;
      persona = message.persona === "sight" ? "sight" : "default";
      if (message.persona === "coach") {
        const lang = coachLanguage(message.lang);
        if (lang) {
          coach = { lang, mode: message.mode ?? "tutor" };
          persona = "coach";
        } else deps.log(`[voice] coach refused: language «${message.lang ?? "none"}» has not passed its check; the default Lente answers`);
      }
      // The placement (2.3): at PLACEMENT_MAX_MS the hub closes it and the estimate is said.
      if (coach?.mode === "placement") {
        const p: Placement = { turns: [], questions: [], done: false };
        p.timer = setTimeout(() => {
          if (!p.done && placement === p) session.ask("(Se acabó el tiempo de la conversación de nivel.)", (u, h, s, e) => runTurn(u, h, s, e, scriptedCallModel("finish_placement")), true);
        }, PLACEMENT_MAX_MS);
        placement = p;
      }
      // The transcription bias is fixed per session, so a new one restarts it (add-language-coach 2.1).
      asr.setLanguages(coach ? coachLanguageBias(coach.lang) : DEFAULT_LANGUAGE_BIAS);
      instructions = undefined;
      void instructionsOnce();
      deps.log(`[voice] persona ${persona}${coach ? ` · ${coach.lang.code} · ${coach.mode}` : ""}${intro ? " · welcome" : ""}`);
      if (intro) session.begin(coach ? COACH_INTRO_CUE : SIGHT_INTRO_CUE);
      return;
    }
    session.phone(message);
  });
  ws.onClose(close);
  return { close };
}
