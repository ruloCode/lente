// The wearer's own settings, kept on the hub in data/profile.json (git-ignored) so they
// survive a restart. Today that is the name and aliases other people use for them.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseNames } from "./addressing.ts";

export class ProfileStore {
  private file: string;
  names: string[] = [];
  /** Testing switch: reply to every question, not only those aimed at the wearer. */
  everyQuestion = false;

  constructor(file: string) {
    this.file = file;
    if (!existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { names?: unknown; everyQuestion?: unknown };
      this.everyQuestion = saved.everyQuestion === true;
      if (Array.isArray(saved.names)) this.names = parseNames(saved.names.filter((n) => typeof n === "string").join(","));
    } catch (error) {
      console.error(`[profile] could not read ${file}: ${(error as Error).message}`);
    }
  }

  setNames(input: string): string[] {
    this.names = parseNames(input);
    this.save();
    return this.names;
  }

  setEveryQuestion(on: boolean): void {
    this.everyQuestion = on;
    this.save();
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ names: this.names, everyQuestion: this.everyQuestion }, null, 2) + "\n");
  }
}
