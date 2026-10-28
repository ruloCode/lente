// The glossary on disk: data/language.json (git-ignored), plain JSON.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GlossaryEntry } from "./language-profile.ts";

export class LanguageStore {
  private file: string;
  glossary: GlossaryEntry[] = [];

  constructor(file: string) {
    this.file = file;
    if (!existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { glossary?: GlossaryEntry[] };
      if (Array.isArray(saved.glossary)) this.glossary = saved.glossary;
    } catch (error) {
      console.error(`[language] could not read ${file}: ${(error as Error).message}`);
    }
  }

  set(glossary: GlossaryEntry[]): void {
    this.glossary = glossary;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ glossary }, null, 2) + "\n");
  }
}
