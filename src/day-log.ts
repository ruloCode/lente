// Text-only record of the day: turns, cues, summaries and what the camera described.
// One JSON line per entry in data/days/YYYY-MM-DD.jsonl (git-ignored). No audio, no photos.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Stages } from "./stages.ts";

export type DayEntry =
  | {
      at: number;
      kind: "turn";
      speaker?: string;
      text: string;
      question?: boolean;
      /** Position in the connection's audio, in ms, and the time of day it was spoken. */
      audioStartMs?: number;
      audioEndMs?: number;
      spokeAt?: number;
    }
  | { at: number; kind: "cue"; label: string; text: string; ms?: number; /** Speaker label of who asked and the addressing rule that let the cue through. */ asker?: string; why?: string; stages?: Stages }
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
}
