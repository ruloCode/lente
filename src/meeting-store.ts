// One JSON file per meeting in data/meetings/ (git-ignored). Plain files keep the memory
// readable and need no dependency; the wearer can delete one meeting or all of them.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Meeting } from "./meetings.ts";

const SAFE_ID = /^m\d{14}(-\d+)?$/;

export class MeetingStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  save(meeting: Meeting): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(meeting.id), JSON.stringify(meeting, null, 2) + "\n");
  }

  /** Oldest first. A file that cannot be read is skipped, not fatal. */
  list(): Meeting[] {
    if (!existsSync(this.dir)) return [];
    const meetings: Meeting[] = [];
    for (const name of readdirSync(this.dir).filter((n) => n.endsWith(".json"))) {
      try {
        meetings.push(JSON.parse(readFileSync(join(this.dir, name), "utf8")) as Meeting);
      } catch (error) {
        console.error(`[meetings] could not read ${name}: ${(error as Error).message}`);
      }
    }
    return meetings.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** A new id that does not clash with a meeting started in the same second. */
  uniqueId(id: string): string {
    let candidate = id;
    for (let n = 2; existsSync(this.file(candidate)); n++) candidate = `${id}-${n}`;
    return candidate;
  }

  /** Returns whether a file was removed. Ids come from HTTP, so anything odd is refused. */
  delete(id: string): boolean {
    if (!SAFE_ID.test(id) || !existsSync(this.file(id))) return false;
    rmSync(this.file(id));
    return true;
  }

  /** Removes every meeting file, readable or not; returns how many. */
  deleteAll(): number {
    if (!existsSync(this.dir)) return 0;
    const files = readdirSync(this.dir).filter((n) => n.endsWith(".json"));
    for (const name of files) rmSync(join(this.dir, name));
    return files.length;
  }

  private file(id: string): string {
    return join(this.dir, `${id}.json`);
  }
}
