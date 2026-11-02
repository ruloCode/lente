// Text-only record of the day: turns, cues, summaries and what the camera described.
// One JSON line per entry in data/days/YYYY-MM-DD.jsonl (git-ignored). No audio, no photos.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Stages } from "./stages.ts";

export type DayEntry =
  | {
      at: number;
      kind: "turn";
      /** The transcription's id for the turn, which a late speaker label refers to. */
      turnId?: string;
      speaker?: string;
      text: string;
      question?: boolean;
      /** Position in the connection's audio, in ms, and the time of day it was spoken. */
      audioStartMs?: number;
      audioEndMs?: number;
      spokeAt?: number;
    }
  | { at: number; kind: "cue"; label: string; text: string; /** Spanish meaning of a DILO line in another language. */ meaning?: string; ms?: number; /** Speaker label of who asked and the addressing rule that let the cue through. */ asker?: string; why?: string; /** Model and provider that produced the line. */ model?: string; provider?: string; stages?: Stages }
  | { at: number; kind: "live"; text: string; stages?: Stages }
  | { at: number; kind: "summary"; text: string };

export function dayKey(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class DayLog {
  readonly entries: DayEntry[] = [];
  private dir: string;
  private day: string;

  constructor(dir: string, now = Date.now()) {
    this.dir = dir;
    this.day = dayKey(now);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${this.day}.jsonl`);
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          this.entries.push(JSON.parse(line) as DayEntry);
        } catch {
          // A half-written last line after a crash is not worth failing over.
        }
      }
    }
  }

  add(entry: DayEntry): void {
    // At midnight the log rolls over to a new file and starts empty.
    const day = dayKey(entry.at);
    if (day !== this.day) {
      this.day = day;
      this.entries.length = 0;
    }
    this.entries.push(entry);
    appendFileSync(join(this.dir, `${this.day}.jsonl`), JSON.stringify(entry) + "\n");
  }

  since(at: number): DayEntry[] {
    return this.entries.filter((e) => e.at >= at);
  }

  /** Today and the `days - 1` days before it, oldest first, read from their files. */
  recent(days: number, now = Date.now()): DayEntry[] {
    const out: DayEntry[] = [];
    for (let back = days - 1; back >= 1; back--) {
      const file = join(this.dir, `${dayKey(now - back * DAY_MS)}.jsonl`);
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line) as DayEntry);
        } catch {
          // Same as the constructor: a broken line is skipped.
        }
      }
    }
    return out.concat(this.entries);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
