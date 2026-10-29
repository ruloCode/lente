// Lente never transcribes itself: remembers what the phone read out loud lately and recognises a
// turn that is only that speech coming back through a microphone. Pure: callers pass the clock.

/** How long after being read out a line can still come back as a turn: speech time plus transcription lag. */
export const NARRATION_WINDOW_MS = 30_000;
/** Share of a turn's words that must come from one narration to call it an echo. */
const ECHO_SHARE = 0.75;
/** Shorter turns are echoes only when they are the narration's words in the same order, in full. */
const MIN_FUZZY_WORDS = 3;

/** Lowercase words without accents or punctuation, so ASR spelling differences don't matter. */
export function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
}

export class NarrationGuard {
  private lines: { at: number; words: string[] }[] = [];

  private windowMs: number;

  constructor(windowMs = NARRATION_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /** Lente read this out loud at `at`. */
  narrated(text: string, at: number): void {
    const w = words(text);
    if (w.length) this.lines.push({ at, words: w });
  }

  /** True when the turn repeats something narrated within the window before `at`. */
  repeats(text: string, at: number): boolean {
    this.lines = this.lines.filter((l) => at - l.at <= this.windowMs);
    const t = words(text);
    if (!t.length) return false;
    return this.lines.some((l) => {
      const joined = ` ${l.words.join(" ")} `;
      if (joined.includes(` ${t.join(" ")} `)) return true;
      if (t.length < MIN_FUZZY_WORDS) return false;
      const pool = new Map<string, number>();
      for (const w of l.words) pool.set(w, (pool.get(w) ?? 0) + 1);
      let hit = 0;
      for (const w of t) {
        const n = pool.get(w) ?? 0;
        if (n > 0) { hit++; pool.set(w, n - 1); }
      }
      return hit / t.length >= ECHO_SHARE;
    });
  }
}
