// Time words in a question, turned into a range before search (add-memory-engine 3.1, shared with
// add-memory-timeline 3.1): «hoy», «ayer», «anteayer», weekdays («el martes», «el martes pasado»),
// «esta mañana/tarde/noche», «esta semana», «la semana pasada», «hace dos semanas», «hace 3 días»,
// months («en octubre», «el mes pasado», «este mes») and their English equivalents, in the wearer's
// time zone. It also picks out «la reunión de/con …» ("the meeting with/about …") for the timeline to
// match against meeting titles and projects. A bare weekday means the most recent one (today
// included): memory questions are about the past. Pure: `now` and the zone come in.

import { localDay, localDayStart } from "./nightly.ts";
import { fold } from "./terms.ts";

export interface TimeRange {
  /** [from, to), ms since the epoch. */
  from: number;
  to: number;
  /** What it was called, as it appeared in the question (folded). */
  phrase: string;
}

export interface TimeParse {
  range?: TimeRange;
  /** «la reunión con Ana» → "ana"; "the meeting about pricing" → "pricing". Folded. */
  meetingAbout?: string;
  /** The folded question without the time phrase, for term search. */
  rest: string;
}

const HOUR_MS = 3_600_000;
const PARTS = { manana: [5, 12], morning: [5, 12], tarde: [12, 19], afternoon: [12, 19], noche: [19, 24], evening: [19, 24], tonight: [19, 24] } as const;
const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
const NUMBERS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (day: string): number => new Date(`${day}T12:00:00Z`).getUTCDay();
const mondayOf = (day: string): string => addDays(day, -((weekdayOf(day) + 6) % 7));

const W = Object.keys(WEEKDAYS).join("|");
const M = Object.keys(MONTHS).join("|");
const N = `\\d+|${Object.keys(NUMBERS).join("|")}`;
const PART = Object.keys(PARTS).join("|");

/** The time phrase in `question`, if any, as a range in `timeZone`; the earliest phrase wins. */
export function parseTimePhrase(question: string, now: number, timeZone: string): TimeParse {
  const text = fold(question);
  const today = localDay(now, timeZone);
  const day = (d: string, fromHour = 0, toHour = 24) => ({ from: localDayStart(d, timeZone) + fromHour * HOUR_MS, to: toHour === 24 ? localDayStart(addDays(d, 1), timeZone) : localDayStart(d, timeZone) + toHour * HOUR_MS });
  const days = (first: string, last: string) => ({ from: localDayStart(first, timeZone), to: localDayStart(addDays(last, 1), timeZone) });
  const count = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBERS[s] ?? 1);
  const pastWeekday = (wd: number, strictlyBefore: boolean) => {
    let d = strictlyBefore ? addDays(today, -1) : today;
    while (weekdayOf(d) !== wd) d = addDays(d, -1);
    return d;
  };
  const monthRange = (year: number, month: number) => {
    const first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
    return { from: localDayStart(first, timeZone), to: localDayStart(next, timeZone) };
  };
  const [ty, tm] = today.split("-").map(Number) as [number, number];

  const rules: [RegExp, (m: RegExpExecArray) => { from: number; to: number }][] = [
    [new RegExp(`\\b(?:ayer|yesterday)\\s+(?:en la |por la |in the )?(${PART})\\b`), (m) => day(addDays(today, -1), ...PARTS[m[1] as keyof typeof PARTS])],
    [new RegExp(`\\b(?:esta|this)\\s+(${PART})\\b|\\btonight\\b`), (m) => day(today, ...PARTS[(m[1] ?? "tonight") as keyof typeof PARTS])],
    [/\b(?:anteayer|antier|day before yesterday)\b/, () => day(addDays(today, -2))],
    [/\b(?:ayer|yesterday)\b/, () => day(addDays(today, -1))],
    [/\b(?:hoy|today)\b/, () => day(today)],
    [new RegExp(`\\bhace\\s+(${N})\\s+(dia|dias|semana|semanas|mes|meses)\\b|\\b(${N})\\s+(day|days|week|weeks|month|months)\\s+ago\\b`), (m) => {
      const n = count(m[1] ?? m[3]!);
      const unit = (m[2] ?? m[4]!).replace(/e?s$/, "");
      if (unit === "dia" || unit === "day") return day(addDays(today, -n));
      if (unit === "semana" || unit === "week") {
        const monday = mondayOf(addDays(today, -7 * n));
        return days(monday, addDays(monday, 6));
      }
      return monthRange(ty, tm - 1 - n);
    }],
    [/\b(?:la semana pasada|last week|the previous week)\b/, () => {
      const monday = mondayOf(addDays(today, -7));
      return days(monday, addDays(monday, 6));
    }],
    [/\b(?:esta semana|this week)\b/, () => days(mondayOf(today), today)],
    [/\b(?:el mes pasado|last month)\b/, () => monthRange(ty, tm - 2)],
    [/\b(?:este mes|this month)\b/, () => monthRange(ty, tm - 1)],
    [new RegExp(`\\b(?:el\\s+)?(${W})\\s+(?:pasado|de la semana pasada)\\b|\\blast\\s+(${W})\\b`), (m) => day(pastWeekday(WEEKDAYS[m[1] ?? m[2]!]!, true))],
    [new RegExp(`\\b(?:el|on|del)\\s+(${W})\\b|\\b(${W})\\b`), (m) => day(pastWeekday(WEEKDAYS[m[1] ?? m[2]!]!, false))],
    [new RegExp(`\\b(?:en|in|de|of|during)\\s+(${M})\\b`), (m) => {
      const month = MONTHS[m[1]!]!;
      return monthRange(month > tm - 1 ? ty - 1 : ty, month);
    }],
  ];
  let best: { index: number; length: number; range: { from: number; to: number }; phrase: string } | undefined;
  for (const [re, toRange] of rules) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length, range: toRange(m), phrase: m[0].trim() };
  }
  const about = /\b(?:la reunion|reunion|the meeting|meeting)\s+(?:de|con|sobre|del|with|about|on)\s+([^,.;?!]+?)(?=\s+(?:de|del|el|la|on|in|from|last|this|ayer|hoy|yesterday|today)\b|[,.;?!]|$)/.exec(text);
  const rest = best ? `${text.slice(0, best.index)} ${text.slice(best.index + best.length)}`.replace(/\s+/g, " ").trim() : text;
  return {
    ...(best ? { range: { ...best.range, phrase: best.phrase } } : {}),
    ...(about ? { meetingAbout: about[1]!.trim() } : {}),
    rest,
  };
}
