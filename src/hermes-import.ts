// Mapping the owner's hermes-os history into Lente (add-hermes-import, design decisions 2 and 3).
// hermes meetings become Lente meetings with turns and notes; hermes memories become facts to review
// and material for the day digest of the day they were written.
// Pure: rows in, Lente records out. Reading hermes and writing Lente happen in scripts/import-hermes.ts.

import type { Fact } from "./fact-store.ts";
import type { Meeting, MeetingTurn } from "./meetings.ts";

/** The hermes `meetings` columns the import reads. */
export interface HermesMeeting {
  id: number;
  meeting_id: string;
  title: string | null;
  meeting_date: string;
  duration_sec: number | null;
  transcript: string | null;
  summary: string | null;
}

/** The hermes `memories` columns the import reads. */
export interface HermesMemory {
  id: string;
  content: string;
  summary: string | null;
  created_at: string;
}

/** Imported records carry this prefix (meetings) or meeting id (facts), so they are never taken for something Lente captured. */
export const HERMES_PREFIX = "hermes-";
export const HERMES_FACT_SOURCE = "hermes";
/** A name before `:` longer than this is taken as part of the sentence, not as a speaker. */
export const MAX_SPEAKER_CHARS = 40;
export const MAX_FACT_CHARS = 500;
/** When hermes stored no length, the turns are spread over this much time. */
export const DEFAULT_MEETING_MS = 30 * 60 * 1000;
const MAX_TITLE_CHARS = 80;

/** `hermes-2026-07-07-1830-kickoff`: stable across runs, safe in ids and URLs. */
export function hermesMeetingId(meetingId: string): string {
  const slug = meetingId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return `${HERMES_PREFIX}${slug || "sin-id"}`;
}

/** `Ana: vale` → speaker Ana; a line whose head is not a short name stays whole. */
export function splitSpeaker(line: string): { speaker?: string; text: string } {
  const colon = line.indexOf(":");
  if (colon > 0) {
    const name = line.slice(0, colon).trim();
    const text = line.slice(colon + 1).trim();
    if (name.length <= MAX_SPEAKER_CHARS && !/[.!?¿¡,;"«»\[\]]|https?$/i.test(name) && text) return { speaker: name, text };
  }
  return { text: line.trim() };
}

/** One hermes meeting as a finished Lente meeting, or undefined when it holds nothing to ask about. */
export function meetingFromHermes(row: HermesMeeting): Meeting | undefined {
  const lines = (row.transcript ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const summary = (row.summary ?? "").trim();
  if (lines.length === 0 && !summary) return undefined;
  const startedAt = Date.parse(row.meeting_date);
  if (!Number.isFinite(startedAt)) throw new Error(`hermes meeting ${row.id} has no valid date`);
  const length = row.duration_sec && row.duration_sec > 0 ? row.duration_sec * 1000 : DEFAULT_MEETING_MS;
  const step = lines.length > 0 ? length / lines.length : 0;
  const turns: MeetingTurn[] = lines.map((line, i) => {
    const { speaker, text } = splitSpeaker(line);
    return { id: `t${i + 1}`, at: Math.round(startedAt + step * (i + 1)), ...(speaker ? { speaker } : {}), text };
  });
  const title = (row.title ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS) || "Reunión de hermes";
  return {
    id: hermesMeetingId(row.meeting_id || String(row.id)),
    title,
    startedAt,
    endedAt: startedAt + length,
    endReason: "manual",
    status: "done",
    turns,
    ...(summary ? { notes: { summary, decisions: [], commitments: [], openQuestions: [] } } : {}),
  };
}

/** The text a memory keeps as a fact: its summary when it has one, else its content, cut. */
export function factText(row: HermesMemory): string {
  const text = ((row.summary ?? "").trim() || row.content.trim()).replace(/\s+/g, " ");
  return text.length > MAX_FACT_CHARS ? `${text.slice(0, MAX_FACT_CHARS - 1)}…` : text;
}

/**
 * hermes memories as facts to review in Memoria (219 of them, kept, would fill the profile 25 times
 * over), skipping any whose text the account already has (case-insensitive), so a second run adds
 * nothing. `newId` gives each fact its row id.
 */
export function factsFromHermes(rows: HermesMemory[], existing: readonly { text: string }[], newId: () => string): Fact[] {
  const seen = new Set(existing.map((f) => f.text.toLowerCase()));
  const out: Fact[] = [];
  for (const row of rows) {
    const text = factText(row);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const createdAt = Date.parse(row.created_at);
    out.push({ id: newId(), text, status: "proposed", meetingId: HERMES_FACT_SOURCE, evidence: [], createdAt: Number.isFinite(createdAt) ? createdAt : 0 });
  }
  return out;
}

/** A memory as a line of its day's record, for the day digest only (it is not stored in the record). */
export function memoryEntry(row: HermesMemory): { at: number; kind: "summary"; text: string } | undefined {
  const at = Date.parse(row.created_at);
  const text = factText(row);
  return Number.isFinite(at) && text ? { at, kind: "summary", text: `Recuerdo (hermes): ${text}` } : undefined;
}
