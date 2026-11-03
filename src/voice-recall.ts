// Speculative recall for a voice turn (add-memory-engine 5.2): while the wearer speaks, retrieval runs
// on the partial transcript, debounced; when the turn completes it runs on the final words unless the
// last partial already was them. Retrieval is local and takes milliseconds, so the lines are ready
// when the model step starts. Pure: the retrieval and the timer are injected.

import type { AttachedMemory } from "./voice-agent.ts";

/** Partials closer together than this only retrieve for the last one. */
export const SPECULATE_DEBOUNCE_MS = 150;

export interface Timer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimer: Timer = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export class SpeculativeRecall {
  private handle: unknown;
  private last: { text: string; memory: Promise<AttachedMemory | undefined> } | undefined;
  /** Retrievals run, for tests and the log. */
  runs = 0;
  private readonly attach: (text: string) => Promise<AttachedMemory | undefined>;
  private readonly timer: Timer;

  constructor(attach: (text: string) => Promise<AttachedMemory | undefined>, timer: Timer = realTimer) {
    this.attach = attach;
    this.timer = timer;
  }

  private run(text: string) {
    this.runs++;
    this.last = { text, memory: this.attach(text).catch(() => undefined) };
    return this.last.memory;
  }

  partial(text: string): void {
    if (this.handle !== undefined) this.timer.clear(this.handle);
    this.handle = this.timer.set(() => {
      this.handle = undefined;
      void this.run(text);
    }, SPECULATE_DEBOUNCE_MS);
  }

  /** The lines for the completed turn. */
  final(text: string): Promise<AttachedMemory | undefined> {
    if (this.handle !== undefined) this.timer.clear(this.handle);
    this.handle = undefined;
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
    if (this.last && norm(this.last.text) === norm(text)) return this.last.memory;
    return this.run(text);
  }
}
