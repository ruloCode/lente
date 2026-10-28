// The wearer's personal glossary and track record. A term is kept with one sighting per
// meeting (the sentence it was heard in), so counting it again, updating its example and
// forgetting a deleted meeting are all just edits to that list. Pure: the hub reads and
// writes the file and feeds this what the notes found.

import type { AskedAnswered, MeetingTurn } from "./meetings.ts";

/** A question counts as answered if the wearer starts speaking within this long of it. */
export const ANSWER_WINDOW_MS = 20_000;
const MAX_EXAMPLE_CHARS = 200;

export interface Sighting {
  meeting: string;
  /** The sentence where the term was heard. */
  example: string;
  at: number;
}

export interface GlossaryEntry {
  term: string;
  /** One line, in the wearer's language. */
  meaning: string;
  sightings: Sighting[];
}

export interface TermSighting {
  term: string;
  meaning: string;
  example: string;
}

export const termKey = (term: string) => term.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Adds what one meeting found. A term already known is counted again (once per meeting), not duplicated. */
export function mergeGlossary(entries: GlossaryEntry[], found: TermSighting[], meeting: string, at: number): GlossaryEntry[] {
  const next = entries.map((e) => ({ ...e, sightings: [...e.sightings] }));
  for (const item of found) {
    const example = item.example.trim().slice(0, MAX_EXAMPLE_CHARS);
    const known = next.find((e) => termKey(e.term) === termKey(item.term));
    if (!known) {
      next.push({ term: item.term.trim(), meaning: item.meaning.trim(), sightings: [{ meeting, example, at }] });
      continue;
    }
    const same = known.sightings.find((s) => s.meeting === meeting);
    if (same) Object.assign(same, { example, at });
    else known.sightings.push({ meeting, example, at });
    if (!known.meaning && item.meaning.trim()) known.meaning = item.meaning.trim();
  }
  return next;
}

/** Removes everything a deleted meeting contributed; terms with no sighting left disappear. */
export function forgetMeeting(entries: GlossaryEntry[], meeting: string): GlossaryEntry[] {
  return entries
    .map((e) => ({ ...e, sightings: e.sightings.filter((s) => s.meeting !== meeting) }))
    .filter((e) => e.sightings.length > 0);
}

export interface GlossaryView {
  term: string;
  meaning: string;
  count: number;
  example: string;
}

/** Most seen first, then most recent; the example is the latest sighting's. */
export function viewGlossary(entries: GlossaryEntry[]): GlossaryView[] {
  const latest = (e: GlossaryEntry) => e.sightings.reduce((a, b) => (b.at >= a.at ? b : a));
  return entries
    .map((e) => ({ term: e.term, meaning: e.meaning, count: e.sightings.length, example: latest(e).example, at: latest(e).at }))
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .map(({ at: _at, ...view }) => view);
}

/**
 * Questions aimed at the wearer, and how many got a turn from the wearer within 20 s.
 * A wearer turn that is itself flagged as addressed is never counted as a question.
 */
export function countAskedAnswered(turns: MeetingTurn[]): AskedAnswered {
  const wearerStarts = turns.filter((t) => t.wearer).map((t) => t.startAt ?? t.at);
  let asked = 0;
  let answered = 0;
  for (const t of turns) {
    if (!t.addressed || t.wearer) continue;
    asked++;
    // The answer starts after the question starts (turns do not overlap) and within 20 s of it ending.
    // Both clocks come from the same stream, so comparing starts avoids drift against `at`.
    const asksFrom = t.startAt ?? t.at;
    if (wearerStarts.some((s) => s > asksFrom && s <= t.at + ANSWER_WINDOW_MS)) answered++;
  }
  return { asked, answered };
}

export function totalAskedAnswered(stats: (AskedAnswered | undefined)[]): AskedAnswered {
  return stats.reduce<AskedAnswered>((sum, s) => ({ asked: sum.asked + (s?.asked ?? 0), answered: sum.answered + (s?.answered ?? 0) }), { asked: 0, answered: 0 });
}

// --- Words the wearer uses ------------------------------------------------------------------------

const MIN_PHRASE_WORDS = 3;
const MAX_PHRASE_WORDS = 8;
const PHRASE_LIMIT = 8;
/** Little words that, alone, are not a phrasing worth keeping. */
const FILLER = new Set(
  ("i you he she it we they the a an and or but so then to of in on at for with is are was be do did can will this that there what " +
    "yo tu el la los las un una y o pero que de en es son por con para se lo mi si no ya").split(" "),
);

/**
 * Phrases the wearer repeats (three to eight words, in at least two of their turns), longest first
 * when the count ties. A phrase inside a longer one that is as frequent is dropped.
 */
export function wearerPhrases(meetings: { turns: MeetingTurn[] }[], limit = PHRASE_LIMIT): string[] {
  const counts = new Map<string, number>();
  for (const meeting of meetings) {
    for (const turn of meeting.turns.filter((t) => t.wearer)) {
      const seen = new Set<string>();
      for (const sentence of turn.text.toLowerCase().split(/[.!?¡¿;:\n]+/)) {
        const words = sentence.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
        for (let n = MIN_PHRASE_WORDS; n <= MAX_PHRASE_WORDS; n++) {
          for (let i = 0; i + n <= words.length; i++) {
            const gram = words.slice(i, i + n);
            if (gram.every((w) => FILLER.has(w))) continue;
            seen.add(gram.join(" "));
          }
        }
      }
      for (const gram of seen) counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  const repeated = [...counts].filter(([, n]) => n >= 2);
  const kept = repeated.filter(([gram, n]) => !repeated.some(([other, m]) => other !== gram && m >= n && ` ${other} `.includes(` ${gram} `)));
  return kept
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([gram]) => gram);
}
