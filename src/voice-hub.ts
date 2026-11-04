// A voice session on the hub (add-voice-mode): the `/voice` socket, its own transcription session
// in ENDPOINTING mode, the voice agent on Muse Spark 1.3 and the tools on the wearer's runtime.
// This is the edge: sockets, timers and the model call. The decisions are in src/voice-session.ts,
// src/voice-agent.ts and src/voice-tools.ts. Logs carry lengths and counts, never what was said.

import { randomUUID } from "node:crypto";
import { AsrSession, DEFAULT_LANGUAGE_BIAS } from "./asr-session.ts";
import type { ChatLine, Chats } from "./chat-store.ts";
import type { ChatTarget } from "./providers.ts";
import { type AttachedMemory, type Companion, SIGHT_FUNCTIONS, SIGHT_INTRO_CUE, VOICE_FUNCTIONS, withMemoryPrefix, type VoiceUsage, runVoiceTurn, voiceInstructions } from "./voice-agent.ts";
import { type PhoneMessage, type VoiceLine, VoiceSession, parsePhoneMessage } from "./voice-session.ts";
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
  let persona: "sight" | "default" = "default";
  let intro = false;
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
      persona === "sight"
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
    send: (e) => ws.send(e),
    confirmations: tools,
    narration: deps.narration,
    save,
    now: Date.now,
    log: deps.log,
    runTurn: async (utterance, history, signal, emit) => {
      const [rules, attached] = await Promise.all([instructionsOnce(), attachFor(utterance)]);
      const model = responsesVoiceModel(deps.target, { instructions: rules, functions: persona === "sight" ? SIGHT_FUNCTIONS : VOICE_FUNCTIONS, webSearch: true });
      const result = await runVoiceTurn({ model, tools: tools.handlers(), history, utterance, signal, emit, ...(attached ? { attached } : {}) });
      turns++;
      deps.onUsage(result.usage, 0);
      deps.log(`[voice] turn ${turns} · ${result.stopped} · ${result.steps} step(s) · ${attached ? `${attached.citable.size} memory lines attached · ` : ""} first sentence ${result.firstSentenceMs === undefined ? "-" : Math.round(result.firstSentenceMs)} ms · tools ${result.tools.join(",") || "none"} · ‹${utterance.length} chars› → ‹${result.text.length} chars›`);
      return result;
    },
  });

  const asr = new AsrSession(
    deps.key,
    {
      onTurn: (turn) => session.heardTurn(turn.text),
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
    if (message.type === "start") {
      // Ver's companion: new instructions for the session, and with the welcome Lente speaks first.
      persona = message.persona;
      intro = message.intro;
      instructions = undefined;
      void instructionsOnce();
      deps.log(`[voice] persona ${persona}${intro ? " · welcome" : ""}`);
      if (intro) session.begin(SIGHT_INTRO_CUE);
      return;
    }
    session.phone(message);
  });
  ws.onClose(close);
  return { close };
}
