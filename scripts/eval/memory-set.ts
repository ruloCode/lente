// A synthetic, bilingual memory for the ask benchmarks (add-memory-engine 1.1, 2.4, 8.2). Two invented
// projects, invented PROBE- people, meetings in English and Spanish, what was heard outside them, camera
// descriptions, digests and kept facts, for any number of days of recording. Deterministic: the same
// arguments give the same memory. Planted lines answer the bench's questions; everything else is filler
// that shares their words, so finding the right line takes more than matching one term. Pure.

import type { DayEntry } from "../../src/day-log.ts";
import type { Digest } from "../../src/digests.ts";
import type { Fact } from "../../src/fact-store.ts";
import type { Meeting, MeetingTurn } from "../../src/meetings.ts";

/** Thursday 2026-11-05, 15:00 in Bogotá (UTC−5): "esta semana" is Monday 2 to today. */
export const MEMORY_NOW = Date.UTC(2026, 10, 5, 20, 0);
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const TZ_OFFSET_MS = -5 * 3_600_000;
/** Turns per meeting, as in the 2026-11-03 probe. */
export const MEETING_TURNS = 24;
const TURN_GAP_MS = 30_000;

export const PROJECTS = [
  { id: "p-atlas", name: "PROBE-Atlas" },
  { id: "p-orion", name: "PROBE-Orion" },
] as const;
export type ProjectId = (typeof PROJECTS)[number]["id"];

export const PEOPLE = {
  ana: "PROBE-Ana Ruiz",
  tom: "PROBE-Tom Becker",
  carla: "PROBE-Carla Méndez",
  lucia: "PROBE-Lucía Paredes",
  marco: "PROBE-Marco Díaz",
  sofia: "PROBE-Sofía Herrera",
  luis: "PROBE-Luis Ortega",
} as const;

const ATLAS_TOPICS = ["el piloto en Bogotá", "la integración con el ERP", "los reportes semanales", "el contrato de soporte", "la capacitación del equipo", "el tablero de indicadores", "la migración de datos", "las pruebas de carga"];
const ORION_TOPICS = ["the onboarding flow", "the pricing page", "the analytics dashboard", "the mobile release", "the partner program", "the referral campaign", "the help center", "the billing export"];

const ES_LINES = [
  "Revisemos {t} antes de seguir.",
  "Creo que {t} va bien, pero falta probarlo con usuarios.",
  "¿Quién se encarga de {t} esta semana?",
  "Lo de {t} lo vemos el próximo martes.",
  "Necesitamos más datos sobre {t} para decidir.",
  "El cliente preguntó otra vez por {t}.",
  "Para {t} hay que hablar con finanzas.",
  "Dejemos {t} en pausa hasta la otra semana.",
  "Ya casi está {t}, nos falta la documentación.",
  "¿Tenemos fecha para {t}?",
  "Hay un riesgo con {t} si no llega el proveedor.",
  "Me gustaría ver una demo de {t}.",
];
const EN_LINES = [
  "Let's go over {t} first.",
  "I think {t} is on track, but we still need tests.",
  "Who owns {t} this sprint?",
  "We can look at {t} again next Tuesday.",
  "We need more numbers on {t} before we decide.",
  "The partner asked about {t} again.",
  "For {t} we should loop in finance.",
  "Let's park {t} until next week.",
  "{t} is almost done, only the docs are missing.",
  "Do we have a date for {t}?",
  "There is a risk on {t} if the vendor slips.",
  "I'd like to see a demo of {t}.",
];
const AMBIENT = ["¿Vamos por un café?", "Ya llegó el pedido de la oficina.", "Hace frío hoy, ¿no?", "Se cayó el wifi otra vez.", "Can you hear me now?", "Te mando el enlace por chat.", "¿A qué hora es el almuerzo?", "The printer is jammed again.", "Mañana salgo temprano.", "Pásame el cargador, porfa."];
const SEEN = ["Una pizarra con tres columnas: Ahora, Siguiente y Después.", "Una pantalla con un tablero de ventas por semana.", "Una mesa con dos portátiles y una libreta abierta.", "Un correo abierto con el asunto «Agenda de la semana».", "Un calendario en la pared con varias fechas marcadas.", "Una hoja impresa con una tabla de costos."];

/** A small seeded generator (mulberry32): the same seed gives the same memory. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

/** Local midnight (Bogotá) of the day that contains `at`, and its `YYYY-MM-DD`. */
export const localDayStart = (at: number): number => Math.floor((at + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
export const isoLocalDay = (at: number): string => new Date(at + TZ_OFFSET_MS).toISOString().slice(0, 10);
const meetingId = (at: number) => `m${new Date(at).toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;

interface Planted {
  /** Days before MEMORY_NOW's day, and the local hour it starts. */
  daysAgo: number;
  hour: number;
  project: ProjectId;
  title: string;
  lang: "es" | "en";
  /** Lines said at these positions; the rest is filler. */
  lines: { at: number; speaker: string; text: string; wearer?: boolean }[];
  notes: NonNullable<Meeting["notes"]>;
  /** The day digest's paraphrase of it: says what was talked about, never the concrete number. */
  digest: string;
}

/** The meetings whose lines answer the bench's questions (this week, Monday 2 to Wednesday 4). */
const PLANTED: Planted[] = [
  {
    daysAgo: 3, hour: 10, project: "p-orion", title: "PROBE-Orion marketing sync", lang: "en",
    lines: [
      { at: 6, speaker: PEOPLE.ana, text: "The marketing budget for the launch is 18,000 dollars, and half of it goes to ads." },
      { at: 7, speaker: PEOPLE.tom, text: "Good, that covers the referral campaign too." },
      { at: 12, speaker: "Tú", wearer: true, text: "I'll send Ana the ad calendar by Friday." },
    ],
    notes: { summary: "The team reviewed the launch marketing plan and Ana set a budget.", decisions: [{ text: "Half of the launch budget goes to ads", evidence: ["t7"] }], commitments: [{ what: "send Ana the ad calendar", owner: "you", due: "Friday", evidence: ["t13"] }], openQuestions: [] },
    digest: "PROBE-Ana Ruiz habló del presupuesto de marketing del lanzamiento de PROBE-Orion.",
  },
  {
    daysAgo: 2, hour: 9, project: "p-atlas", title: "PROBE-Atlas planificación de la beta", lang: "es",
    lines: [
      { at: 8, speaker: PEOPLE.sofia, text: "Decidimos abrir la beta el 20 de noviembre con 50 usuarios." },
      { at: 15, speaker: "Tú", wearer: true, text: "Yo preparo la demo del piloto para PROBE-Marco el jueves." },
    ],
    notes: { summary: "Se planificó la beta de PROBE-Atlas.", decisions: [{ text: "Abrir la beta el 20 de noviembre con 50 usuarios", evidence: ["t9"] }], commitments: [{ what: "preparar la demo del piloto para PROBE-Marco", owner: "you", due: "jueves", evidence: ["t16"] }], openQuestions: [] },
    digest: "En PROBE-Atlas se habló de la beta y de una demo para el cliente.",
  },
  {
    daysAgo: 2, hour: 15, project: "p-orion", title: "PROBE-Orion contratación de diseño", lang: "es",
    lines: [
      { at: 4, speaker: PEOPLE.tom, text: "Entrevistamos a PROBE-Lucía Paredes para el puesto de diseño; tiene mucha experiencia en sistemas de diseño." },
      { at: 10, speaker: "Tú", wearer: true, text: "Le mando a PROBE-Lucía la prueba técnica mañana." },
    ],
    notes: { summary: "PROBE-Orion entrevistó a una candidata para diseño.", decisions: [], commitments: [{ what: "mandarle a PROBE-Lucía la prueba técnica", owner: "you", due: "miércoles", evidence: ["t11"] }], openQuestions: [{ text: "¿Cuándo empieza la persona de diseño?", evidence: ["t5"] }] },
    digest: "PROBE-Orion siguió con la contratación de diseño.",
  },
  {
    daysAgo: 1, hour: 11, project: "p-atlas", title: "PROBE-Atlas revisión con el cliente", lang: "es",
    lines: [
      { at: 5, speaker: PEOPLE.marco, text: "El piloto arranca el lunes 9 en la sede de Chapinero." },
      { at: 11, speaker: "Tú", wearer: true, text: "Te envío la propuesta revisada antes del viernes." },
      { at: 16, speaker: "Tú", wearer: true, text: "Y reviso el contrato de soporte con PROBE-Luis." },
    ],
    notes: { summary: "Revisión del piloto con el cliente de PROBE-Atlas.", decisions: [{ text: "El piloto arranca el lunes 9 en Chapinero", evidence: ["t6"] }], commitments: [{ what: "enviar la propuesta revisada a PROBE-Marco", owner: "you", due: "viernes", evidence: ["t12"] }, { what: "revisar el contrato de soporte con PROBE-Luis", owner: "you", evidence: ["t17"] }], openQuestions: [] },
    digest: "El cliente de PROBE-Atlas habló del arranque del piloto.",
  },
  {
    daysAgo: 1, hour: 16, project: "p-orion", title: "PROBE-Orion legal review", lang: "en",
    lines: [
      { at: 9, speaker: PEOPLE.carla, text: "The partner contract needs a new liability clause before we sign." },
      { at: 14, speaker: "Tú", wearer: true, text: "I'll send Carla the revised contract by Thursday." },
    ],
    notes: { summary: "Legal review of the partner contract.", decisions: [], commitments: [{ what: "send Carla the revised contract", owner: "you", due: "Thursday", evidence: ["t15"] }], openQuestions: [{ text: "Who signs for the partner?", evidence: ["t10"] }] },
    digest: "PROBE-Orion revisó el contrato con el socio.",
  },
];

export interface MemorySet {
  now: number;
  /** Oldest first, as the hub's meeting store lists them. */
  meetings: Meeting[];
  assignments: Map<string, ProjectId>;
  /** What was heard and seen outside meetings on a local day (`YYYY-MM-DD`), oldest first; generated on demand. */
  entriesOn(day: string): DayEntry[];
  /** Every local day with data, oldest first. */
  days: string[];
  digests: { profile: Digest; days: Digest[]; weeks: Digest[]; months: Digest[] };
  keptFacts: Fact[];
}

function fillerTurns(r: () => number, start: number, lang: "es" | "en", topics: readonly string[], speakers: readonly string[]): MeetingTurn[] {
  const lines = lang === "es" ? ES_LINES : EN_LINES;
  return Array.from({ length: MEETING_TURNS }, (_, i) => ({ id: `t${i + 1}`, at: start + (i + 1) * TURN_GAP_MS, speaker: pick(r, speakers), text: pick(r, lines).replace("{t}", pick(r, topics)) }));
}

/**
 * `days` days of recording ending on MEMORY_NOW's day: on weekdays one meeting per project; every day
 * `heardPerDay` ambient lines and `seenPerDay` camera descriptions outside meetings.
 */
export function memorySet(opts: { days: number; heardPerDay?: number; seenPerDay?: number }): MemorySet {
  const heardPerDay = opts.heardPerDay ?? 40;
  const seenPerDay = opts.seenPerDay ?? 6;
  const today = localDayStart(MEMORY_NOW);
  const meetings: Meeting[] = [];
  const assignments = new Map<string, ProjectId>();
  const dayDigests: Digest[] = [];
  const days: string[] = [];
  for (let back = opts.days - 1; back >= 0; back--) {
    const start = today - back * DAY_MS;
    const day = isoLocalDay(start);
    days.push(day);
    const weekday = new Date(start - TZ_OFFSET_MS + 12 * 3_600_000).getUTCDay();
    const r = rng(back * 7919 + 13);
    const said: string[] = [];
    const ids: string[] = [];
    if (weekday >= 1 && weekday <= 5) {
      const planted = PLANTED.filter((p) => p.daysAgo === back);
      for (const [project, hour, lang, topics, speakers] of [["p-atlas", 9, "es", ATLAS_TOPICS, [PEOPLE.sofia, PEOPLE.luis, PEOPLE.marco, "Tú"]], ["p-orion", 15, "en", ORION_TOPICS, [PEOPLE.ana, PEOPLE.tom, PEOPLE.carla, "Tú"]]] as const) {
        const plants = planted.filter((p) => p.project === project);
        const slots = plants.length ? plants : [undefined];
        for (const p of slots) {
          const at = start + (p?.hour ?? hour) * 3_600_000;
          if (at >= MEMORY_NOW) continue;
          const topic = pick(r, topics);
          const turns = fillerTurns(r, at, p?.lang ?? lang, topics, speakers);
          for (const line of p?.lines ?? []) turns[line.at] = { id: `t${line.at + 1}`, at: turns[line.at]!.at, speaker: line.speaker, text: line.text, ...(line.wearer ? { wearer: true } : {}) };
          const id = meetingId(at);
          const title = p?.title ?? `${PROJECTS.find((x) => x.id === project)!.name}: ${topic}`;
          meetings.push({ id, title, startedAt: at, endedAt: at + (MEETING_TURNS + 1) * TURN_GAP_MS, status: "done", turns, notes: p?.notes ?? { summary: lang === "es" ? `Se revisó ${topic}.` : `The team reviewed ${topic}.`, decisions: [], commitments: [], openQuestions: [] } });
          assignments.set(id, project);
          ids.push(id);
          said.push(p?.digest ?? `${PROJECTS.find((x) => x.id === project)!.name} revisó ${topic}.`);
        }
      }
    }
    dayDigests.push({ scope: "day", periodStart: day, text: said.length ? said.join(" ") : "Día sin reuniones; conversaciones sueltas en la oficina.", sources: [...ids, `d${day}`], createdAt: start + DAY_MS });
  }
  const entriesOn = (day: string): DayEntry[] => {
    const back = days.length - 1 - days.indexOf(day);
    if (back < 0 || back >= days.length) return [];
    const start = today - back * DAY_MS;
    const r = rng(back * 104_729 + 7);
    const busy = meetings.filter((m) => m.startedAt >= start && m.startedAt < start + DAY_MS);
    const out: DayEntry[] = [];
    const span = 10 * 3_600_000;
    for (let i = 0; i < heardPerDay + seenPerDay; i++) {
      const at = start + 8 * 3_600_000 + Math.floor(r() * span);
      if (at >= MEMORY_NOW || busy.some((m) => at >= m.startedAt && at <= (m.endedAt ?? at))) continue;
      out.push(i < heardPerDay ? { at, kind: "turn", speaker: pick(r, ["A", "B", "C"]), text: pick(r, AMBIENT) } : { at, kind: "live", text: pick(r, SEEN) });
    }
    return out.sort((a, b) => a.at - b.at);
  };
  const newest = (list: Digest[], n: number) => [...list].reverse().slice(0, n);
  const weeks: Digest[] = [];
  const months: Digest[] = [];
  for (const d of dayDigests) {
    const at = Date.parse(`${d.periodStart}T12:00:00Z`);
    const monday = isoLocalDay(at - ((new Date(at).getUTCDay() + 6) % 7) * DAY_MS);
    if (!weeks.some((w) => w.periodStart === monday)) weeks.push({ scope: "week", periodStart: monday, text: `Semana con reuniones de PROBE-Atlas (piloto, beta) y PROBE-Orion (lanzamiento, diseño, contratos).`, sources: [`day:${d.periodStart}`], createdAt: at });
    const month = `${d.periodStart.slice(0, 7)}-01`;
    if (!months.some((m) => m.periodStart === month)) months.push({ scope: "month", periodStart: month, text: `Mes de trabajo en PROBE-Atlas y PROBE-Orion.`, sources: [`week:${monday}`], createdAt: at });
  }
  const profile: Digest = { scope: "profile", periodStart: isoLocalDay(MEMORY_NOW), text: `Trabaja en PROBE-Atlas (cliente ${PEOPLE.marco}, con ${PEOPLE.sofia}) y PROBE-Orion (con ${PEOPLE.ana} en marketing y ${PEOPLE.carla} en legal).`, sources: [], createdAt: MEMORY_NOW - DAY_MS };
  const ofProject = (p: ProjectId) => meetings.find((m) => assignments.get(m.id) === p);
  const keptFacts: Fact[] = (
    [
      ["f-atlas", "p-atlas", "PROBE-Atlas tiene su cliente principal en Bogotá."],
      ["f-orion", "p-orion", "PROBE-Orion contrata una persona de diseño este trimestre."],
    ] as const
  ).flatMap(([id, p, text]) => {
    const m = ofProject(p);
    return m ? [{ id, text, status: "kept" as const, meetingId: m.id, evidence: ["t1"], createdAt: m.startedAt + DAY_MS }] : [];
  });
  return { now: MEMORY_NOW, meetings, assignments, entriesOn, days, digests: { profile, days: newest(dayDigests, 14), weeks: newest(weeks, 8), months: newest(months, 24) }, keptFacts };
}

/** The bench's questions. `expect` matches a right answer; `project` asks inside one; `outOfProject` must be declined. */
export interface AskScenario {
  id: string;
  question: string;
  project?: ProjectId;
  expect?: RegExp;
  outOfProject?: boolean;
  /** Text that must never reach the model for this question. */
  leak?: RegExp;
}

export const ASK_SCENARIOS: AskScenario[] = [
  { id: "budget", question: "¿Qué dijo Ana sobre el presupuesto de marketing?", expect: /18[.,  ]?000|18 mil/i },
  { id: "promised", question: "¿Qué prometí entregar esta semana?", expect: /propuesta|demo|contrat|calendar|prueba/i },
  { id: "beta", question: "¿Qué se decidió sobre la beta?", expect: /20/ },
  { id: "design-whole", question: "¿A quién entrevistamos para diseño?", expect: /Luc[ií]a/ },
  { id: "design-in-atlas", question: "¿A quién entrevistamos para diseño?", project: "p-atlas", outOfProject: true, leak: /Orion|Luc[ií]a/ },
  { id: "pilot-in-atlas", question: "¿Cuándo arranca el piloto?", project: "p-atlas", expect: /lunes|9|nueve/i, leak: /Orion|Luc[ií]a/ },
];

/** All-day recording, for the index microbench: about 150 spoken words a minute for 8 hours, in segments of about 60 words. */
export const SEGMENTS_PER_DAY = 1200;
const WORDS_PER_SEGMENT = 60;
/** Distinct content words in a year of speech (synthetic tokens, Zipf-distributed like real speech). */
const VOCABULARY = 30_000;
const FUNCTION_WORDS = ["de", "la", "que", "el", "en", "y", "a", "los", "se", "del", "the", "and", "to", "of", "is", "it", "we", "for"];

/**
 * `days` days of all-day segments, newest day ending at MEMORY_NOW: content words drawn from a Zipf
 * vocabulary, about 40% function words, two projects by the hour, the PROBE- people as speakers.
 * Yields units ready for the index; deterministic.
 */
export function* allDayUnits(days: number, segmentsPerDay = SEGMENTS_PER_DAY): Generator<import("../../src/memory-index.ts").MemoryUnit> {
  const r = rng(424_242);
  // Inverse-CDF table for Zipf(s = 1) over the vocabulary.
  const cdf = new Float64Array(VOCABULARY);
  let sum = 0;
  for (let i = 0; i < VOCABULARY; i++) cdf[i] = sum += 1 / (i + 1);
  const word = () => {
    const x = r() * sum;
    let lo = 0;
    let hi = VOCABULARY - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    return `w${lo.toString(36)}`;
  };
  const people = Object.values(PEOPLE);
  const today = localDayStart(MEMORY_NOW);
  for (let back = days - 1; back >= 0; back--) {
    const start = today - back * DAY_MS + 8 * 3_600_000;
    const day = isoLocalDay(start);
    const step = (8 * 3_600_000) / segmentsPerDay;
    for (let n = 1; n <= segmentsPerDay; n++) {
      const at = start + (n - 1) * step;
      const words = Array.from({ length: WORDS_PER_SEGMENT }, () => (r() < 0.4 ? pick(r, FUNCTION_WORDS) : word()));
      const speakers = [pick(r, people), pick(r, people)];
      yield { id: `s${day}:${n}`, kind: "segment", at, to: at + step, projectId: Math.floor(n / 150) % 2 ? "p-orion" : "p-atlas", speakers, text: `${speakers[0]}: ${words.join(" ")}` };
    }
  }
}
