// One voice session (add-voice-mode): transcription events in, the phone's events out. A completed
// turn runs the voice agent; speech while Lente thinks or speaks cancels it (barge-in) unless it is
// only Lente's own voice coming back (the runtime's NarrationGuard). A pending "¿lo marco?" is
// answered here, before any model call. Pure: the agent turn, the clock and the transport are injected.

import type { CoachMode, SpokenLang } from "./coach.ts";
import { words } from "./self-voice.ts";
import { type VoiceItem, type VoiceSource, type VoiceTurnEvent, type VoiceTurnResult, confirmation } from "./voice-agent.ts";

/** Words a partial needs before it can interrupt Lente: one word is too often a cough or a "mm". */
export const BARGE_IN_MIN_WORDS = 2;
/**
 * The coach (add-language-coach): a turn that repeats the phrase Lente just said is the wearer's try,
 * not Lente's echo, once this long has passed since the phone finished speaking.
 */
export const REPEAT_ECHO_TAIL_MS = 1_200;

export type VoiceState = "listening" | "thinking" | "speaking" | "paused";

export type VoiceEvent =
  | { type: "listening"; source: "phone" | "clip" }
  | { type: "state"; state: VoiceState; turn: number }
  | { type: "partial"; text: string }
  | { type: "heard"; turn: number; text: string }
  | { type: "thinking"; turn: number }
  /** `lang`: in a coach session only, the language the sentence is spoken in. */
  | { type: "reply"; turn: number; text: string; commentary: boolean; lang?: SpokenLang }
  /** The coach: a phrase shown large with its meaning; the phone does not speak it, the next `reply` is it. */
  | { type: "pronounce"; turn: number; text: string; meaning: string; lang: SpokenLang }
  | { type: "tool"; turn: number; name: string; label: string }
  | { type: "sources"; turn: number; sources: VoiceSource[] }
  | { type: "confirm"; turn: number; text: string }
  | { type: "bargeIn"; turn: number }
  | { type: "done"; turn: number; stopped: string; firstTextMs?: number; firstSentenceMs?: number; usage?: VoiceTurnResult["usage"] }
  | { type: "recordSheet"; projectId?: string; projectName?: string; camera: boolean }
  /** Ver (add-sight-mode): the agent turned the spoken narration on or off. */
  | { type: "narration"; on: boolean }
  /** Ver: record quietly (audio and memories, nothing spoken) until the person talks again. */
  | { type: "quiet"; on: boolean }
  /** Ver: the hub asks the phone where it is, for «¿dónde estoy?». */
  | { type: "locate"; id: string }
  | { type: "error"; message: string }
  | { type: "end" };

/** What the phone sends as JSON text. */
export type PhoneMessage =
  /** The phone finished speaking `count` sentences of `turn`. */
  | { type: "spoken"; turn: number; count: number }
  | { type: "bargeIn" }
  | { type: "pause" }
  | { type: "resume" }
  /** Ver (add-sight-mode): who Lente is in this session, and whether it speaks first (the welcome). */
  /** The coach (add-language-coach): also the target language as sent (checked by the hub) and the mode. */
  | { type: "start"; persona: "sight" | "default" | "coach"; intro: boolean; lang?: string; mode?: CoachMode }
  /** Ver: the phone's answer to `locate`; never stored or logged. */
  | { type: "location"; id: string; ok: boolean; lat?: number; lon?: number; accuracy?: number; address?: string; place?: string; reason?: string }
  | { type: "end" };

export function parsePhoneMessage(raw: string): PhoneMessage | undefined {
  let m: { type?: unknown; turn?: unknown };
  try {
    m = JSON.parse(raw);
  } catch {
    return undefined;
  }
  switch (m?.type) {
    case "spoken":
      return typeof m.turn === "number" ? { type: "spoken", turn: m.turn, count: typeof (m as { count?: unknown }).count === "number" ? (m as { count: number }).count : Number.MAX_SAFE_INTEGER } : undefined;
    case "bargeIn":
    case "pause":
    case "resume":
    case "end":
      return { type: m.type };
    case "location": {
      const l = m as Record<string, unknown>;
      if (typeof l.id !== "string") return undefined;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
      const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
      const out: Extract<PhoneMessage, { type: "location" }> = { type: "location", id: l.id, ok: l.ok === true };
      for (const [k, v] of [["lat", num(l.lat)], ["lon", num(l.lon)], ["accuracy", num(l.accuracy)], ["address", text(l.address, 200)], ["place", text(l.place, 100)], ["reason", text(l.reason, 120)]] as const) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
      return out;
    }
    case "start": {
      const s = m as { persona?: unknown; intro?: unknown; lang?: unknown; mode?: unknown };
      if (s.persona === "coach") {
        const mode: CoachMode = s.mode === "placement" || s.mode === "review" ? s.mode : "tutor";
        return { type: "start", persona: "coach", intro: s.intro === true, mode, ...(typeof s.lang === "string" ? { lang: s.lang.trim().toLowerCase().slice(0, 8) } : {}) };
      }
      return { type: "start", persona: s.persona === "sight" ? "sight" : "default", intro: s.intro === true };
    }
    default:
      return undefined;
  }
}

/** A line of the session as the chat keeps it. */
export interface VoiceLine {
  role: "user" | "lente";
  text: string;
  sources: VoiceSource[];
}

export interface Confirmations {
  readonly pending: unknown;
  confirmPending(): Promise<string>;
  cancelPending(): string;
}

export interface VoiceSessionDeps {
  send(event: VoiceEvent): void;
  runTurn(utterance: string, history: VoiceItem[], signal: AbortSignal, emit: (e: VoiceTurnEvent) => void): Promise<VoiceTurnResult>;
  confirmations: Confirmations;
  narration: { narrated(text: string, at: number): void; repeats(text: string, at: number): boolean };
  save(lines: VoiceLine[]): void;
  now(): number;
  /** The coach: true for a turn that repeats the phrase just taught, which is not dropped as an echo after the tail. */
  repeatOf?(text: string): boolean;
  log?(line: string): void;
}

export class VoiceSession {
  state: VoiceState = "listening";
  private turn = 0;
  private active: { turn: number; controller: AbortController } | undefined;
  private history: VoiceItem[] = [];
  /** Sentences sent for the current turn, and how many the phone said it has spoken. */
  private sent = 0;
  private spoken = 0;
  /** When the state last became listening, for the coach's echo tail. */
  private listeningSince = 0;
  private deps: VoiceSessionDeps;
  /** Each turn's run, so tests and the hub's close can wait for it. */
  running: Promise<void> = Promise.resolve();

  constructor(deps: VoiceSessionDeps) {
    this.deps = deps;
  }

  private setState(state: VoiceState): void {
    if (this.state === state) return;
    this.state = state;
    if (state === "listening") this.listeningSince = this.deps.now();
    this.deps.send({ type: "state", state, turn: this.turn });
  }

  /** Lente is busy with a turn the wearer could interrupt. */
  private get busy(): boolean {
    return this.state === "thinking" || this.state === "speaking";
  }

  /** Cancels the turn in progress and tells the phone to stop speaking. */
  bargeIn(why: string): void {
    if (!this.busy) return;
    this.active?.controller.abort();
    this.active = undefined;
    this.deps.send({ type: "bargeIn", turn: this.turn });
    this.deps.log?.(`[voice] barge-in on turn ${this.turn} (${why})`);
    this.setState("listening");
  }

  heardPartial(text: string): void {
    if (this.state === "paused") return;
    const at = this.deps.now();
    if (this.busy && this.deps.narration.repeats(text, at)) return; // Lente hearing itself
    this.deps.send({ type: "partial", text });
    if (this.busy && words(text).length >= BARGE_IN_MIN_WORDS) this.bargeIn("the wearer spoke");
  }

  heardTurn(text: string): void {
    if (this.state === "paused" || !text.trim()) return;
    const at = this.deps.now();
    const tried = this.state === "listening" && at - this.listeningSince >= REPEAT_ECHO_TAIL_MS && this.deps.repeatOf?.(text) === true;
    if (!tried && this.deps.narration.repeats(text, at)) {
      this.deps.log?.(`[voice] dropped a turn that repeats Lente's own voice (${text.length} chars)`);
      return;
    }
    if (this.busy) this.bargeIn("a new turn");
    this.running = this.startTurn(text.trim());
  }

  phone(message: PhoneMessage): void {
    switch (message.type) {
      case "spoken":
        if (message.turn !== this.turn) break;
        this.spoken = Math.max(this.spoken, message.count);
        if (this.state === "speaking" && !this.active && this.spoken >= this.sent) this.setState("listening");
        break;
      case "bargeIn":
        this.bargeIn("the phone asked");
        break;
      case "pause":
        this.bargeIn("paused");
        this.setState("paused");
        break;
      case "resume":
        if (this.state === "paused") this.setState("listening");
        break;
      case "end":
        this.close();
        break;
    }
  }

  close(): void {
    this.active?.controller.abort();
    this.active = undefined;
    this.deps.send({ type: "end" });
  }

  /**
   * A turn Lente starts itself (the welcome in Ver): `cue` reaches the model as the person's turn, but is
   * not shown, heard or kept as something they said.
   */
  begin(cue: string): void {
    if (this.state === "paused" || this.busy) return;
    this.running = this.startTurn(cue, true);
  }

  private async startTurn(text: string, hidden = false): Promise<void> {
    const turn = ++this.turn;
    this.sent = 0;
    this.spoken = 0;
    const controller = new AbortController();
    this.active = { turn, controller };
    const live = () => this.active?.turn === turn && !controller.signal.aborted;
    if (!hidden) this.deps.send({ type: "heard", turn, text });
    this.deps.send({ type: "thinking", turn });
    // The wearer's words are kept at once, so the chat stays in order even if this turn is cancelled.
    const prior = [...this.history];
    this.history.push({ type: "message", role: "user", text });
    if (!hidden) this.deps.save([{ role: "user", text, sources: [] }]);
    this.setState("thinking");

    const speak = (line: string, commentary: boolean, lang?: SpokenLang) => {
      if (!live()) return;
      this.deps.narration.narrated(line, this.deps.now());
      this.sent++;
      this.deps.send({ type: "reply", turn, text: line, commentary, ...(lang ? { lang } : {}) });
      this.setState("speaking");
    };

    // A pending completion or deletion is answered by the wearer's yes or no, never by the model.
    if (this.deps.confirmations.pending) {
      const answer = confirmation(text);
      if (answer) {
        const line = answer === "yes" ? await this.deps.confirmations.confirmPending() : this.deps.confirmations.cancelPending();
        speak(line, false);
        this.finish(turn, line, [], { stopped: answer === "yes" ? "confirmed" : "declined" });
        return;
      }
      this.deps.confirmations.cancelPending();
    }

    const sources: VoiceSource[] = [];
    let result: VoiceTurnResult;
    try {
      result = await this.deps.runTurn(text, prior, controller.signal, (e) => {
        if (!live()) return;
        if (e.kind === "sentence") speak(e.text, e.commentary, e.lang);
        else if (e.kind === "pronounce") this.deps.send({ type: "pronounce", turn, text: e.text, meaning: e.meaning, lang: e.lang });
        else if (e.kind === "tool") this.deps.send({ type: "tool", turn, name: e.name, label: e.label });
        else {
          sources.push(...e.sources);
          this.deps.send({ type: "sources", turn, sources: e.sources });
        }
      });
    } catch (error) {
      if (!live()) return;
      this.deps.send({ type: "error", message: "No pude responder ahora; prueba otra vez." });
      this.deps.log?.(`[voice] turn ${turn} failed: ${(error as Error).message.slice(0, 200)}`);
      this.active = undefined;
      this.setState("listening");
      return;
    }
    // Cancelled: the wearer's words stay in the chat, the unfinished reply does not.
    if (!live()) return;
    if (this.deps.confirmations.pending) this.deps.send({ type: "confirm", turn, text: result.text });
    this.finish(turn, result.text, sources, { stopped: result.stopped, firstTextMs: result.firstTextMs, firstSentenceMs: result.firstSentenceMs, usage: result.usage });
  }

  private finish(turn: number, reply: string, sources: VoiceSource[], done: Omit<Extract<VoiceEvent, { type: "done" }>, "type" | "turn">): void {
    this.active = undefined;
    this.history.push({ type: "message", role: "assistant", text: reply });
    this.deps.save([{ role: "lente", text: reply, sources }]);
    this.deps.send({ type: "done", turn, ...done });
    // Nothing to speak, or the phone already spoke it all: back to listening.
    if (this.state === "thinking" || (this.state === "speaking" && this.spoken >= this.sent)) this.setState("listening");
  }
}
