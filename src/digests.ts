// The whole memory in tiers (add-accounts 5.1, design decision 8): a profile of the user and
// digests per day, week and month, each written by Muse Spark with structured output, each within a
// fixed size and keeping the ids of the records it came from. Pure: the model call is injected.
// The facts the user kept win over anything the model writes: they are appended verbatim, with
// their room reserved inside the profile's budget.

import type { ChatMessage } from "./chat.ts";
import type { DayEntry } from "./day-log.ts";
import type { Fact } from "./fact-store.ts";
import type { Meeting } from "./meetings.ts";

/** `brief` and `person` (add-memory-engine 6.5): a project's brief, keyed by project id, and a person's card, keyed by the folded name. */
export type DigestScope = "profile" | "day" | "week" | "month" | "brief" | "person";

/** Size of each tier, in characters (design decision 8). */
export const DIGEST_BUDGET: Record<DigestScope, number> = { profile: 4000, day: 1500, week: 2000, month: 2000, brief: 2000, person: 600 };
/** How much of a day's record goes into its digest call, in characters. */
export const DAY_INPUT_CHARS = 24_000;
/** The heading the kept facts go under in the profile. */
export const KEPT_HEADING = "Confirmado por el usuario:";

export interface Digest {
  scope: DigestScope;
  /**
   * `YYYY-MM-DD`: the day, the Monday of the week, the 1st of the month; the profile uses the day it was
   * written. A brief uses its project's id and a person card the person's folded name.
   */
  periodStart: string;
  text: string;
  /** Ids of what it came from: meetings (`m…`), days (`d2026-11-01`), digests (`day:2026-11-01`), kept facts (`fact:<id>`). */
  sources: string[];
  createdAt: number;
}

/** One structured-output call to the model; returns the raw JSON text. */
export type DigestCall = (messages: ChatMessage[], schema: object, name: string) => Promise<string>;

export const digestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sources"],
  properties: {
    text: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
  },
} as const;

/** The id a digest is cited by. */
export const digestId = (d: Pick<Digest, "scope" | "periodStart">): string => `${d.scope}:${d.periodStart}`;
export const dayId = (day: string): string => `d${day}`;

/** The Monday of a `YYYY-MM-DD` day's week, and the 1st of its month. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;

/** Cuts text to a budget at the last sentence end that fits (or the last space). */
export function fitBudget(text: string, budget: number): string {
  const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= budget) return clean;
  const cut = clean.slice(0, budget);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("\n"));
  if (sentence > budget * 0.6) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : budget - 1).trim()}…`;
}

/** The model's JSON, with sources limited to the ids it was shown. */
function parse(raw: string, shown: Set<string>, budget: number): { text: string; sources: string[] } {
  let out: { text?: unknown; sources?: unknown };
  try {
    out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    throw new Error("the digest model answered with no JSON");
  }
  const text = typeof out.text === "string" ? fitBudget(out.text, budget) : "";
  const sources = Array.isArray(out.sources) ? [...new Set(out.sources.filter((s): s is string => typeof s === "string" && shown.has(s)))] : [];
  return { text, sources };
}

const RULES = [
  "Escribe en español, en prosa breve y concreta, en tercera persona sobre el usuario.",
  "Usa solo lo que está abajo. No inventes nombres, fechas, cifras ni compromisos.",
  "Pon en `sources` los ids entre corchetes de lo que usaste, y solo esos.",
].join("\n");

const meetingBlock = (m: Meeting): string => {
  const n = m.notes;
  const lines = [`[${m.id}] ${new Date(m.startedAt).toISOString().slice(0, 16).replace("T", " ")} · ${m.title}`];
  if (n) {
    lines.push(`Resumen: ${n.summary}`);
    for (const d of n.decisions) lines.push(`Decisión: ${d.text}`);
    for (const c of n.commitments) lines.push(`Compromiso: ${JSON.stringify(c)}`);
    for (const q of n.openQuestions) lines.push(`Pregunta abierta: ${q.text}`);
  }
  return lines.join("\n");
};

/** The profile, rewritten from the last one and the new meeting notes; kept facts win. */
export async function writeProfile(
  input: { previous?: Digest; meetings: Meeting[]; keptFacts: Fact[]; day: string },
  call: DigestCall,
  now: number,
): Promise<Digest> {
  const kept = input.keptFacts.map((f) => `- ${f.text}`).join("\n");
  const keptBlock = kept ? `\n\n${KEPT_HEADING}\n${kept}` : "";
  const room = Math.max(0, DIGEST_BUDGET.profile - keptBlock.length);
  const shown = new Set(input.meetings.map((m) => m.id));
  if (input.previous) shown.add(digestId(input.previous));
  const material = [
    input.previous ? `[${digestId(input.previous)}] Perfil anterior:\n${input.previous.text}` : "Perfil anterior: (ninguno)",
    kept ? `Hechos que el usuario confirmó (mandan sobre todo lo demás; no los contradigas):\n${kept}` : "",
    "Reuniones nuevas:",
    ...input.meetings.map(meetingBlock),
  ].filter(Boolean).join("\n\n");
  const raw = await call(
    [
      { role: "system", content: `Mantienes el perfil del usuario de Lente: quién es, con qué personas y proyectos trata, sus preferencias y sus compromisos vigentes. Reescríbelo con lo nuevo, conserva lo que sigue vigente y quita lo que ya no aplica. Máximo ${room} caracteres.\n${RULES}` },
      { role: "user", content: material },
    ],
    digestSchema,
    "profile",
  );
  const parsed = parse(raw, shown, room);
  const sources = [...parsed.sources, ...input.keptFacts.map((f) => `fact:${f.id}`)];
  return { scope: "profile", periodStart: input.day, text: `${parsed.text}${keptBlock}`.trim(), sources, createdAt: now };
}

/** What happened on one day, from its meetings' notes and its record. */
export async function writeDayDigest(input: { day: string; meetings: Meeting[]; entries: DayEntry[] }, call: DigestCall, now: number): Promise<Digest> {
  const shown = new Set([dayId(input.day), ...input.meetings.map((m) => m.id)]);
  const record: string[] = [];
  let used = 0;
  // Summaries and cues first, then what was heard, until the input budget is spent.
  const ordered = [...input.entries.filter((e) => e.kind === "summary"), ...input.entries.filter((e) => e.kind === "cue" || e.kind === "live"), ...input.entries.filter((e) => e.kind === "turn")];
  for (const e of ordered) {
    const line = `${new Date(e.at).toISOString().slice(11, 16)} ${e.kind === "turn" && e.speaker ? `${e.speaker}: ` : ""}${"text" in e ? e.text : ""}`;
    if (used + line.length > DAY_INPUT_CHARS) break;
    record.push(line);
    used += line.length;
  }
  const material = [`Reuniones del ${input.day}:`, ...input.meetings.map(meetingBlock), `[${dayId(input.day)}] Registro del día:`, record.join("\n") || "(vacío)"].join("\n\n");
  const raw = await call(
    [
      { role: "system", content: `Escribe el resumen del día ${input.day} del usuario de Lente: qué pasó, con quién, qué se decidió y qué quedó pendiente. Máximo ${DIGEST_BUDGET.day} caracteres.\n${RULES}` },
      { role: "user", content: material },
    ],
    digestSchema,
    "day_digest",
  );
  const parsed = parse(raw, shown, DIGEST_BUDGET.day);
  return { scope: "day", periodStart: input.day, ...parsed, createdAt: now };
}

/** A week or a month, built from the digests below it. */
export async function writeRollup(input: { scope: "week" | "month"; periodStart: string; parts: Digest[] }, call: DigestCall, now: number): Promise<Digest> {
  const shown = new Set(input.parts.map(digestId));
  const label = input.scope === "week" ? `la semana que empieza el ${input.periodStart}` : `el mes ${input.periodStart.slice(0, 7)}`;
  const raw = await call(
    [
      { role: "system", content: `Escribe el resumen de ${label} del usuario de Lente a partir de los resúmenes de abajo: lo importante, lo decidido y lo que sigue abierto. Máximo ${DIGEST_BUDGET[input.scope]} caracteres.\n${RULES}` },
      { role: "user", content: input.parts.map((p) => `[${digestId(p)}]\n${p.text}`).join("\n\n") || "(sin resúmenes)" },
    ],
    digestSchema,
    `${input.scope}_digest`,
  );
  return { scope: input.scope, periodStart: input.periodStart, ...parse(raw, shown, DIGEST_BUDGET[input.scope]), createdAt: now };
}

// --- Briefs and people cards (add-memory-engine 6.5) ---------------------------------------------

/** A project's brief is rewritten at most this often, and in the nightly run. */
export const BRIEF_EVERY_MS = 30 * 60_000;
/** A person gets a card once seen in this many episodes. */
export const PERSON_MIN_EPISODES = 2;

const cardBlock = (m: Meeting): string =>
  [meetingBlock(m), ...(m.cards ?? []).flatMap((c) => [...c.facts.filter((f) => f.validTo === undefined).map((f) => `Hecho [${f.id}]: ${f.text}`), c.people.length ? `Personas: ${c.people.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", ")}` : ""])].filter(Boolean).join("\n");

/** A project's brief: what it is, who is in it, its state, open commitments and recent decisions, with sources. */
export async function writeBrief(input: { previous?: Digest; project: { id: string; name: string }; meetings: Meeting[] }, call: DigestCall, now: number): Promise<Digest> {
  const shown = new Set(input.meetings.flatMap((m) => [m.id, ...(m.cards ?? []).flatMap((c) => c.facts.map((f) => f.id))]));
  if (input.previous) shown.add(digestId(input.previous));
  const material = [input.previous ? `[${digestId(input.previous)}] Resumen anterior:\n${input.previous.text}` : "Resumen anterior: (ninguno)", "Lo nuevo:", ...input.meetings.map(cardBlock)].join("\n\n");
  const raw = await call(
    [
      { role: "system", content: `Mantienes el resumen del proyecto «${input.project.name}» del usuario de Lente: qué es, quién participa, en qué estado está, los compromisos abiertos y las decisiones recientes. Reescríbelo con lo nuevo; un hecho nuevo reemplaza al que cambia. Máximo ${DIGEST_BUDGET.brief} caracteres.\n${RULES}` },
      { role: "user", content: material },
    ],
    digestSchema,
    "project_brief",
  );
  return { scope: "brief", periodStart: input.project.id, ...parse(raw, shown, DIGEST_BUDGET.brief), createdAt: now };
}

/** A person's card: who they are to the wearer, what they own and the commitments between them, with sources. */
export async function writePersonCard(input: { previous?: Digest; person: string; meetings: Meeting[] }, call: DigestCall, now: number): Promise<Digest> {
  const shown = new Set(input.meetings.map((m) => m.id));
  if (input.previous) shown.add(digestId(input.previous));
  const material = [input.previous ? `[${digestId(input.previous)}] Ficha anterior:\n${input.previous.text}` : "Ficha anterior: (ninguna)", `Reuniones donde aparece ${input.person}:`, ...input.meetings.map(cardBlock)].join("\n\n");
  const raw = await call(
    [
      { role: "system", content: `Escribe la ficha de ${input.person} para el usuario de Lente: quién es para el usuario, de qué se encarga y los compromisos entre los dos. Máximo ${DIGEST_BUDGET.person} caracteres.\n${RULES}` },
      { role: "user", content: material },
    ],
    digestSchema,
    "person_card",
  );
  return { scope: "person", periodStart: personKey(input.person), ...parse(raw, shown, DIGEST_BUDGET.person), createdAt: now };
}

/** A person's card key: the folded name without the PROBE- tag of synthetic data. */
export const personKey = (name: string): string => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The projects whose brief is due: they changed, and their last brief is older than `BRIEF_EVERY_MS`. */
export function briefsDue(changed: ReadonlySet<string>, lastWritten: ReadonlyMap<string, number>, now: number): string[] {
  return [...changed].filter((p) => now - (lastWritten.get(p) ?? 0) >= BRIEF_EVERY_MS);
}

/** People seen in at least `PERSON_MIN_EPISODES` episodes (speakers with a name, or card people), with those episodes. */
export function recurringPeople(meetings: readonly Meeting[], isName: (s: string) => boolean): Map<string, Meeting[]> {
  const seen = new Map<string, { name: string; meetings: Set<Meeting> }>();
  for (const m of meetings) {
    const names = new Set([...m.turns.map((t) => t.speaker ?? ""), ...(m.cards ?? []).flatMap((c) => c.people.map((p) => p.name))].filter(isName));
    for (const n of names) {
      const k = personKey(n);
      const e = seen.get(k) ?? { name: n, meetings: new Set() };
      e.meetings.add(m);
      seen.set(k, e);
    }
  }
  return new Map([...seen.values()].filter((e) => e.meetings.size >= PERSON_MIN_EPISODES).map((e) => [e.name, [...e.meetings]]));
}
