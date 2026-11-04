// The sample a new account starts with (ship-hackathon decision 5): one PROBE project with two
// synthetic meetings, one in Spanish and one in English, their notes, three open tasks and two kept
// facts, so a judge can ask Lente something in the first minute. Written fresh in the shape of the
// eval set's planted meetings (scripts/eval/memory-set.ts), which the hub image does not carry.
// Every name is PROBE-; nothing here is a real person or meeting. Pure: the hub writes it through the
// account's own sealed stores after the terms are accepted, and «Borrar ejemplo» removes it.

import type { Meeting, MeetingTurn, Notes } from "./meetings.ts";

/** The sample's project, and the mark on its meetings' titles: both together say "sample". */
export const SAMPLE_PROJECT_NAME = "PROBE · Proyecto de ejemplo";
export const SAMPLE_TITLE_PREFIX = "PROBE · ";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const TURN_GAP_MS = 40_000;
/** Bogotá, UTC−5 all year. */
const TZ_OFFSET_MS = -5 * HOUR_MS;

const ANA = "PROBE-Ana Ruiz";
const SOFIA = "PROBE-Sofía Herrera";
const MARCO = "PROBE-Marco Díaz";
const TOM = "PROBE-Tom Becker";
const YOU = "Tú";

export interface SampleTask {
  title: string;
  due?: string;
  /** Index of the sample meeting it came from. */
  meeting: number;
  evidence: string[];
}

export interface SampleFact {
  text: string;
  meeting: number;
  evidence: string[];
}

export interface SampleMemory {
  meetings: Meeting[];
  tasks: SampleTask[];
  facts: SampleFact[];
}

type Line = [speaker: string, text: string, wearer?: boolean];

function meeting(start: number, title: string, lines: Line[], notes: Notes): Meeting {
  const turns: MeetingTurn[] = lines.map(([speaker, text, wearer], i) => ({ id: `t${i + 1}`, at: start + (i + 1) * TURN_GAP_MS, startAt: start + (i + 1) * TURN_GAP_MS - 6_000, speaker, text, ...(wearer ? { wearer: true } : {}) }));
  const stamp = new Date(start).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return { id: `m${stamp}`, title: `${SAMPLE_TITLE_PREFIX}${title}`, startedAt: start, endedAt: start + (lines.length + 1) * TURN_GAP_MS, endReason: "manual", status: "done", turns, notes };
}

/** `hour` o'clock in Bogotá, `daysAgo` days before `now`'s day there. */
function localAt(now: number, daysAgo: number, hour: number): number {
  const dayStart = Math.floor((now + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
  return dayStart - daysAgo * DAY_MS + hour * HOUR_MS;
}

/** The sample, dated relative to `now`: the Spanish meeting two days ago at 9:00, the English one yesterday at 15:00 (Bogotá). */
export function sampleMemory(now: number): SampleMemory {
  const beta = meeting(localAt(now, 2, 9), "Planificación de la beta", [
    [SOFIA, "Buenos días. Hoy tenemos que cerrar la fecha de la beta."],
    [MARCO, "El cliente quiere verla antes de fin de mes."],
    [SOFIA, "Con las pruebas de carga listas, podemos abrir con un grupo pequeño."],
    [YOU, "¿Cuántos usuarios podemos atender sin problema?", true],
    [SOFIA, "Cincuenta sin riesgo. Más que eso necesita otro servidor."],
    [MARCO, "Cincuenta está bien para empezar."],
    [SOFIA, "Entonces decidimos abrir la beta el 20 de noviembre con 50 usuarios."],
    [MARCO, "De acuerdo. Yo aviso al equipo del cliente."],
    [YOU, "Yo preparo la demo del piloto para PROBE-Marco el jueves.", true],
    [SOFIA, "Y alguien tiene que escribir la guía de inicio para los usuarios de la beta."],
    [YOU, "La escribo yo, la tengo lista el lunes.", true],
    [MARCO, "Queda pendiente quién da soporte el fin de semana."],
  ], {
    summary: "Se cerró la fecha de la beta de PROBE · Proyecto de ejemplo y quién prepara la demo y la guía.",
    decisions: [{ text: "Abrir la beta el 20 de noviembre con 50 usuarios", evidence: ["t7"] }],
    commitments: [
      { what: "Preparar la demo del piloto para PROBE-Marco", owner: "you", due: "jueves", evidence: ["t9"] },
      { what: "Escribir la guía de inicio de la beta", owner: "you", due: "lunes", evidence: ["t11"] },
    ],
    openQuestions: [{ text: "¿Quién da soporte el fin de semana?", evidence: ["t12"] }],
  });
  const launch = meeting(localAt(now, 1, 15), "Launch marketing sync", [
    [ANA, "Thanks for joining. Let's settle the launch budget."],
    [TOM, "We have the numbers from the last campaign."],
    [ANA, "The marketing budget for the launch is 18,000 dollars, and half of it goes to ads."],
    [TOM, "Good, that covers the referral campaign too."],
    [YOU, "What do you need from me before the launch?", true],
    [ANA, "The ad calendar, so we can book the slots."],
    [YOU, "I'll send Ana the ad calendar by Friday.", true],
    [TOM, "We still don't know who approves the final copy."],
  ], {
    summary: "The team set the launch marketing budget and who sends the ad calendar.",
    decisions: [{ text: "Half of the 18,000-dollar launch budget goes to ads", evidence: ["t3"] }],
    commitments: [{ what: "Send Ana the ad calendar", owner: "you", due: "Friday", evidence: ["t7"] }],
    openQuestions: [{ text: "Who approves the final copy?", evidence: ["t8"] }],
  });
  return {
    meetings: [beta, launch],
    tasks: [
      { title: "Preparar la demo del piloto para PROBE-Marco", due: "jueves", meeting: 0, evidence: ["t9"] },
      { title: "Escribir la guía de inicio de la beta", due: "lunes", meeting: 0, evidence: ["t11"] },
      { title: "Send Ana the ad calendar", due: "Friday", meeting: 1, evidence: ["t7"] },
    ],
    facts: [
      { text: "La beta abre el 20 de noviembre con 50 usuarios.", meeting: 0, evidence: ["t7"] },
      { text: "The launch marketing budget is 18,000 dollars, half for ads.", meeting: 1, evidence: ["t3"] },
    ],
  };
}

/** A sample meeting: its title carries the mark and it sits in a sample project. Nothing else is touched by «Borrar ejemplo». */
export function isSampleMeeting(m: Pick<Meeting, "title">, projectId: string | undefined, sampleProjects: ReadonlySet<string>): boolean {
  return m.title.startsWith(SAMPLE_TITLE_PREFIX) && projectId !== undefined && sampleProjects.has(projectId);
}
