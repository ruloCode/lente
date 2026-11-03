// The wearer's own settings, kept on the hub in data/profile.json (git-ignored) so they
// survive a restart: the name and aliases other people use for them, and the assist mode.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseNames } from "./addressing.ts";

/** Asistir: cues on. Solo grabar: record the day as text and learn from it, no real-time cues. */
export type AssistMode = "assist" | "record";

export const MEDIA_RETENTIONS = [7, 30, 90] as const;
export type MediaRetention = (typeof MEDIA_RETENTIONS)[number];

export class ProfileStore {
  private file: string;
  names: string[] = [];
  /** Testing switch: reply to every question, not only those aimed at the wearer. */
  everyQuestion = false;
  assistMode: AssistMode = "assist";
  /** «Guardar audio» and «Guardar fotos» (add-media-archive decision 1): on by default. */
  media = { audio: true, photos: true };
  /** Days media is kept (add-media-archive 3.1): 7, 30 (default) or 90. */
  mediaRetentionDays: MediaRetention = 30;

  constructor(file: string) {
    this.file = file;
    if (!existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { names?: unknown; everyQuestion?: unknown; assistMode?: unknown; media?: { audio?: unknown; photos?: unknown }; mediaRetentionDays?: unknown };
      this.media = { audio: saved.media?.audio !== false, photos: saved.media?.photos !== false };
      this.mediaRetentionDays = MEDIA_RETENTIONS.includes(saved.mediaRetentionDays as MediaRetention) ? (saved.mediaRetentionDays as MediaRetention) : 30;
      this.everyQuestion = saved.everyQuestion === true;
      this.assistMode = saved.assistMode === "record" ? "record" : "assist";
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

  setMedia(kind: "audio" | "photos", on: boolean): void {
    this.media = { ...this.media, [kind]: on };
    this.save();
  }

  setMediaRetention(days: MediaRetention): void {
    this.mediaRetentionDays = days;
    this.save();
  }

  setAssistMode(mode: AssistMode): void {
    this.assistMode = mode;
    this.save();
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ names: this.names, everyQuestion: this.everyQuestion, assistMode: this.assistMode, media: this.media, mediaRetentionDays: this.mediaRetentionDays }, null, 2) + "\n");
  }
}
