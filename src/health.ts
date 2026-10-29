// What GET /health reports: whether transcription, the models and storage work, and never content.
// Model and transcription results come from the calls the hub makes anyway (no extra spend); a
// component with no call yet is "unknown", and a failure keeps only a short reason class.

export type CheckState = "ok" | "failing" | "unknown";

export interface Check {
  state: CheckState;
  /** Why it fails, as a class (`key rejected`, `unreachable`, …), never text from a call. */
  reason?: string;
  /** When the last call finished, ms since epoch. */
  at?: number;
}

export type Component = "transcription" | "model" | "storage";

/** Turns an error message from a model or transcription call into a reason class without echoing it. */
export function reasonClass(message: string): string {
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|invalid.*key|api key/i.test(message)) return "key rejected";
  if (/\b429\b|rate limit|quota/i.test(message)) return "rate limited";
  if (/ENOTFOUND|ECONN|fetch failed|timed? ?out|unreachable|connection error/i.test(message)) return "unreachable";
  if (/is not set/i.test(message)) return "key missing";
  return "error";
}

export class HealthTracker {
  private checks = new Map<Component, Check>();

  ok(component: Component, now = Date.now()): void {
    this.checks.set(component, { state: "ok", at: now });
  }

  failed(component: Component, message: string, now = Date.now()): void {
    this.checks.set(component, { state: "failing", reason: reasonClass(message), at: now });
  }

  /** The three checks and the overall verdict: ok only when none is failing. */
  snapshot(): { ok: boolean } & Record<Component, Check> {
    const get = (c: Component): Check => this.checks.get(c) ?? { state: "unknown" };
    const out = { transcription: get("transcription"), model: get("model"), storage: get("storage") };
    return { ok: Object.values(out).every((c) => c.state !== "failing"), ...out };
  }
}
