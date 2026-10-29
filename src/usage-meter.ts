// Today's spend: the seconds of audio sent to transcription and the tokens each model call
// reported, per local day, priced with the list prices. Pure: the hub loads and saves the
// snapshot in data/usage.json, which holds numbers only (model names as keys, no text).

import { dayKey } from "./day-log.ts";

/** Muse Voice Transcribe, standard mode: $0.18 per audio hour, billed per second (docs/kb/meta-api.md, "Prices and limits"). */
export const TRANSCRIBE_USD_PER_HOUR = 0.18;

/** US$ per million tokens, standard mode (docs/kb/meta-api.md, "Prices and limits"). Models not listed are counted but not priced. */
export const TOKEN_USD_PER_M: Record<string, { input: number; cached: number; output: number }> = {
  "muse-spark-1.3": { input: 1.25, cached: 0.15, output: 4.25 },
  "muse-wonder-1.0": { input: 4.0, cached: 0.2, output: 20.0 },
};

export interface ModelTokens {
  calls: number;
  /** Input tokens, cached ones included (the API reports cached as a part of the input). */
  input: number;
  cached: number;
  output: number;
}

export interface UsageSnapshot {
  day: string;
  audioSeconds: number;
  models: Record<string, ModelTokens>;
}

export interface UsageToday extends UsageSnapshot {
  usd: number;
  /** Models with tokens but no list price: their cost is not in `usd`. */
  unpriced: string[];
}

const count = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

export function priceTokens(model: string, t: ModelTokens): number | undefined {
  const p = TOKEN_USD_PER_M[model];
  if (!p) return undefined;
  const cached = Math.min(t.cached, t.input);
  return ((t.input - cached) * p.input + cached * p.cached + t.output * p.output) / 1e6;
}

export class UsageMeter {
  private day: string;
  private audioSeconds = 0;
  private models: Record<string, ModelTokens> = {};

  constructor(saved: Partial<UsageSnapshot> | undefined, now = Date.now()) {
    this.day = dayKey(now);
    if (!saved || saved.day !== this.day) return;
    this.audioSeconds = count(saved.audioSeconds);
    for (const [model, t] of Object.entries(saved.models ?? {})) {
      this.models[model] = { calls: count(t?.calls), input: count(t?.input), cached: count(t?.cached), output: count(t?.output) };
    }
  }

  /** Audio sent to transcription. */
  addAudio(seconds: number, now = Date.now()): void {
    this.rollOver(now);
    this.audioSeconds += count(seconds);
  }

  /** One model call with the tokens it reported; missing counts add nothing. */
  addCall(model: string, tokens: { input?: number; cached?: number; output?: number }, now = Date.now()): void {
    this.rollOver(now);
    const t = (this.models[model] ??= { calls: 0, input: 0, cached: 0, output: 0 });
    t.calls += 1;
    t.input += count(tokens.input);
    t.cached += count(tokens.cached);
    t.output += count(tokens.output);
  }

  snapshot(now = Date.now()): UsageSnapshot {
    this.rollOver(now);
    const models: Record<string, ModelTokens> = {};
    for (const [model, t] of Object.entries(this.models)) models[model] = { ...t };
    return { day: this.day, audioSeconds: Math.round(this.audioSeconds * 1000) / 1000, models };
  }

  /** Today's totals with the approximate cost in US$. */
  today(now = Date.now()): UsageToday {
    const snap = this.snapshot(now);
    let usd = (snap.audioSeconds / 3600) * TRANSCRIBE_USD_PER_HOUR;
    const unpriced: string[] = [];
    for (const [model, t] of Object.entries(snap.models)) {
      const cost = priceTokens(model, t);
      if (cost === undefined) unpriced.push(model);
      else usd += cost;
    }
    return { ...snap, usd, unpriced };
  }

  private rollOver(now: number): void {
    const today = dayKey(now);
    if (today === this.day) return;
    this.day = today;
    this.audioSeconds = 0;
    this.models = {};
  }
}
