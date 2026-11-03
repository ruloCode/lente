// The recall set (add-memory-engine 8.2): synthetic bilingual meetings with 30 invented facts, each said
// once, in English or Spanish, inside filler that shares their words, and about 120 questions labelled
// with the segment ids that answer them:
//   - paraphrase      the fact in the same language, in other words;
//   - cross-lingual   asked in the other language;
//   - exact           a name or a number from the line;
//   - time            «¿Qué se dijo el martes sobre …?», with the day of the meeting;
//   - out of memory   nothing in the memory answers it (no label).
// Used by the encoder bake-off (8.4) and the grounding eval (9.1). Invented PROBE- people only. Pure.

import type { Meeting } from "../../src/meetings.ts";
import type { MemoryUnit } from "../../src/memory-index.ts";
import { meetingUnits } from "../../src/recall.ts";
import { ATLAS_TOPICS, EN_LINES, ES_LINES, MEMORY_NOW, ORION_TOPICS, isoLocalDay, localDayStart } from "./memory-set.ts";

const DAY_MS = 86_400_000;
/** Filler turns around each fact, and how many fact-free meetings sit between them. */
const FILLER_TURNS = 14;
const FILLER_MEETINGS = 40;

export type RecallKind = "paraphrase" | "cross-lingual" | "exact" | "time" | "out-of-memory";

export interface RecallQuestion {
  id: string;
  kind: RecallKind;
  question: string;
  /** Segment ids that answer it; empty for out-of-memory questions. */
  labels: string[];
}

interface Fact {
  lang: "en" | "es";
  speaker: string;
  line: string;
  /** Same language, other words; other language; a name or number from the line. */
  paraphrase: string;
  cross: string;
  exact: string;
  /** A short Spanish topic for the time question. */
  topic: string;
}

const FACTS: Fact[] = [
  { lang: "en", speaker: "PROBE-Ana Ruiz", line: "The marketing budget for the launch is 18,000 dollars, and half of it goes to ads.", paraphrase: "How much money do we have to promote the launch?", cross: "¿Cuánta plata hay para anuncios?", exact: "¿Qué se dijo de los 18,000 dólares?", topic: "el presupuesto" },
  { lang: "es", speaker: "PROBE-Sofía Herrera", line: "Decidimos abrir la beta el 20 de noviembre con 50 usuarios.", paraphrase: "¿Cuándo empieza la prueba con los primeros clientes?", cross: "When do we open the beta?", exact: "¿Qué pasa el 20 de noviembre?", topic: "la beta" },
  { lang: "en", speaker: "PROBE-Tom Becker", line: "We hired PROBE-Lucía Paredes as our first product designer; she starts on the first of December.", paraphrase: "Who joins the team to do design work?", cross: "¿A quién contratamos para diseño?", exact: "¿Qué sabemos de PROBE-Lucía Paredes?", topic: "la contratación" },
  { lang: "es", speaker: "PROBE-Marco Díaz", line: "El piloto arranca el lunes 9 en la sede de Chapinero.", paraphrase: "¿Dónde y cuándo comienza la prueba con el cliente?", cross: "Where does the pilot start?", exact: "¿Qué se dijo de Chapinero?", topic: "el piloto" },
  { lang: "en", speaker: "PROBE-Carla Méndez", line: "The partner contract needs a new liability clause before we sign it.", paraphrase: "What is blocking the signature of the agreement with the partner?", cross: "¿Qué le falta al contrato con el socio?", exact: "¿Qué dijo PROBE-Carla Méndez del contrato?", topic: "el contrato" },
  { lang: "es", speaker: "PROBE-Luis Ortega", line: "La migración de datos tarda unas 36 horas y la hacemos un fin de semana.", paraphrase: "¿Cuánto demora pasar la información al sistema nuevo?", cross: "How long does the data migration take?", exact: "¿Qué tarda 36 horas?", topic: "la migración" },
  { lang: "en", speaker: "PROBE-Ana Ruiz", line: "Our cost per signup on the referral campaign dropped to 4 dollars and 20 cents.", paraphrase: "How cheap is it now to get a new user through referrals?", cross: "¿Cuánto nos cuesta cada registro por referidos?", exact: "¿Qué cuesta 4 dólares con 20?", topic: "los referidos" },
  { lang: "es", speaker: "PROBE-Sofía Herrera", line: "El cliente pidió que los reportes semanales lleguen los martes a las ocho.", paraphrase: "¿Qué día quiere el cliente recibir los informes?", cross: "When does the client want the weekly reports?", exact: "¿Qué llega los martes a las ocho?", topic: "los reportes" },
  { lang: "en", speaker: "PROBE-Tom Becker", line: "The mobile release slips one week because the payment SDK failed review.", paraphrase: "Why is the app update going out later?", cross: "¿Por qué se atrasa la versión móvil?", exact: "¿Qué pasó con el SDK de pagos?", topic: "la versión móvil" },
  { lang: "es", speaker: "PROBE-Marco Díaz", line: "La sede de Medellín quiere sumarse al piloto en enero con 30 personas.", paraphrase: "¿Qué otra oficina se quiere unir a la prueba?", cross: "Which office wants to join the pilot in January?", exact: "¿Qué dijo la sede de Medellín?", topic: "Medellín" },
  { lang: "en", speaker: "PROBE-Carla Méndez", line: "Legal wants every customer record deleted within 30 days of a cancellation.", paraphrase: "How soon must we erase a client's data after they leave?", cross: "¿En cuánto tiempo hay que borrar los datos de un cliente que cancela?", exact: "¿Qué dijo legal de los 30 días?", topic: "la retención de datos" },
  { lang: "es", speaker: "PROBE-Luis Ortega", line: "Las pruebas de carga aguantaron 2.500 usuarios al mismo tiempo sin errores.", paraphrase: "¿Cuánta gente soporta el sistema a la vez?", cross: "How many concurrent users did the load test hold?", exact: "¿Qué pasó con los 2.500 usuarios?", topic: "las pruebas de carga" },
  { lang: "en", speaker: "PROBE-Ana Ruiz", line: "We will sponsor the Lisbon design conference in March for twelve thousand euros.", paraphrase: "Which event are we paying for in the spring?", cross: "¿Qué conferencia vamos a patrocinar?", exact: "¿Qué se dijo de Lisboa?", topic: "la conferencia" },
  { lang: "es", speaker: "PROBE-Sofía Herrera", line: "La capacitación del equipo del cliente será de tres sesiones de dos horas.", paraphrase: "¿Cómo se va a entrenar a la gente del cliente?", cross: "How will the client's team be trained?", exact: "¿Qué tiene tres sesiones de dos horas?", topic: "la capacitación" },
  { lang: "en", speaker: "PROBE-Tom Becker", line: "The help center search should answer in under 300 milliseconds.", paraphrase: "How fast do we want the support search to be?", cross: "¿Qué tan rápida debe ser la búsqueda del centro de ayuda?", exact: "¿Qué tiene que responder en 300 milisegundos?", topic: "el centro de ayuda" },
  { lang: "es", speaker: "PROBE-Marco Díaz", line: "El contrato de soporte se renueva cada año y cuesta 9 millones de pesos.", paraphrase: "¿Cuánto pagan por el mantenimiento anual?", cross: "How much does the support contract cost?", exact: "¿Qué cuesta 9 millones de pesos?", topic: "el soporte" },
  { lang: "en", speaker: "PROBE-Carla Méndez", line: "PROBE-Nadia Kowalski from the partner will be our single point of contact.", paraphrase: "Who is the one person we talk to on the partner's side?", cross: "¿Quién es el contacto del socio?", exact: "¿Qué rol tiene PROBE-Nadia Kowalski?", topic: "el contacto" },
  { lang: "es", speaker: "PROBE-Luis Ortega", line: "El tablero de indicadores se actualiza cada quince minutos desde el ERP.", paraphrase: "¿Cada cuánto se refrescan los números del panel?", cross: "How often does the dashboard refresh?", exact: "¿Qué se actualiza cada quince minutos?", topic: "el tablero" },
  { lang: "en", speaker: "PROBE-Ana Ruiz", line: "The pricing page test showed the annual plan converts 14 percent better.", paraphrase: "Which subscription option sold more in the experiment?", cross: "¿Qué plan funcionó mejor en la prueba de precios?", exact: "¿Qué mejoró un 14 por ciento?", topic: "los precios" },
  { lang: "es", speaker: "PROBE-Sofía Herrera", line: "Acordamos cobrar el piloto en dos pagos: la mitad al firmar y la mitad al final.", paraphrase: "¿Cómo nos va a pagar el cliente la prueba?", cross: "How will the pilot be paid?", exact: "¿Qué se paga la mitad al firmar?", topic: "el pago del piloto" },
  { lang: "en", speaker: "PROBE-Tom Becker", line: "We are moving the analytics dashboard off the old warehouse by Friday the 13th.", paraphrase: "When do the reports stop using the legacy database?", cross: "¿Cuándo dejamos el almacén de datos viejo?", exact: "¿Qué pasa el viernes 13?", topic: "el almacén de datos" },
  { lang: "es", speaker: "PROBE-Marco Díaz", line: "PROBE-Julián Rojas reemplaza a Marco como gerente del proyecto desde diciembre.", paraphrase: "¿Quién va a liderar el proyecto del lado del cliente?", cross: "Who replaces Marco as project manager?", exact: "¿Qué hace PROBE-Julián Rojas?", topic: "el nuevo gerente" },
  { lang: "en", speaker: "PROBE-Carla Méndez", line: "Invoices to the partner go out net 45, not net 30.", paraphrase: "How many days does the partner have to pay us?", cross: "¿Con qué plazo le facturamos al socio?", exact: "¿Qué se dijo de net 45?", topic: "las facturas" },
  { lang: "es", speaker: "PROBE-Luis Ortega", line: "El servidor de pruebas se apaga a las diez de la noche para ahorrar costos.", paraphrase: "¿Por qué no funciona el ambiente de pruebas de noche?", cross: "When is the test server switched off?", exact: "¿Qué se apaga a las diez de la noche?", topic: "el servidor de pruebas" },
  { lang: "en", speaker: "PROBE-Ana Ruiz", line: "Our newsletter reaches 42,000 readers and opens at 38 percent.", paraphrase: "How big is our email audience?", cross: "¿A cuántos lectores llega el boletín?", exact: "¿Qué llega a 42,000 lectores?", topic: "el boletín" },
  { lang: "es", speaker: "PROBE-Sofía Herrera", line: "La encuesta de satisfacción del piloto dio 4,6 sobre 5.", paraphrase: "¿Qué tan contentos quedaron los usuarios de la prueba?", cross: "What score did the pilot survey get?", exact: "¿Qué dio 4,6 sobre 5?", topic: "la encuesta" },
  { lang: "en", speaker: "PROBE-Tom Becker", line: "Two-factor login becomes mandatory for admins on January 15.", paraphrase: "From when must administrators use a second sign-in step?", cross: "¿Desde cuándo es obligatorio el doble factor para administradores?", exact: "¿Qué pasa el 15 de enero?", topic: "el doble factor" },
  { lang: "es", speaker: "PROBE-Marco Díaz", line: "El cliente aprobó ampliar el alcance a facturación electrónica.", paraphrase: "¿Qué nuevo módulo aceptó el cliente?", cross: "What did the client approve adding to the scope?", exact: "¿Qué se dijo de facturación electrónica?", topic: "el alcance" },
  { lang: "en", speaker: "PROBE-Carla Méndez", line: "The trademark for the product name was registered in Colombia and Mexico.", paraphrase: "Where is our brand protected?", cross: "¿En qué países registramos la marca?", exact: "¿Qué se registró en Colombia y México?", topic: "la marca" },
  { lang: "es", speaker: "PROBE-Luis Ortega", line: "Encontramos un error que duplicaba pedidos cuando la red fallaba.", paraphrase: "¿Qué problema causaba órdenes repetidas?", cross: "What bug duplicated orders?", exact: "¿Qué pasaba cuando la red fallaba?", topic: "el error de pedidos" },
];

const OUT_OF_MEMORY = [
  "¿Qué dijo PROBE-Ana sobre el viaje a Japón?",
  "¿Cuánto cuesta la licencia de Photoshop que compramos?",
  "¿Quién ganó el partido del domingo?",
  "What did we decide about the office in Berlin?",
  "¿Qué opinó Tom sobre el podcast?",
  "¿Cuándo es la boda de PROBE-Marco?",
  "How much did we pay for the coffee machine?",
  "¿Qué se dijo del concurso de robótica?",
  "¿Cuál es la contraseña del wifi de la oficina?",
  "¿Qué libro recomendó Sofía?",
  "What is the name of Carla's dog?",
  "¿Cuántos kilómetros corrió Luis el sábado?",
  "¿Qué se decidió sobre el logo nuevo de PROBE-Orion?",
  "¿A qué hora sale el vuelo a Lima?",
  "What did the auditors say about inventory?",
];

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface RecallSet {
  meetings: Meeting[];
  assignments: Map<string, string>;
  units: MemoryUnit[];
  questions: RecallQuestion[];
  now: number;
}

/** Deterministic filler, by position. */
const filler = (lang: "en" | "es", i: number, topic: number) => (lang === "es" ? ES_LINES : EN_LINES)[i % ES_LINES.length]!.replace("{t}", (lang === "es" ? ATLAS_TOPICS : ORION_TOPICS)[topic % ATLAS_TOPICS.length]!);

export function recallSet(): RecallSet {
  const today = localDayStart(MEMORY_NOW);
  const meetings: Meeting[] = [];
  const assignments = new Map<string, string>();
  const make = (index: number, back: number, hour: number, lang: "en" | "es", fact?: Fact) => {
    // A minute per index keeps every meeting id (its start, to the second) unique.
    const at = today - back * DAY_MS + hour * 3_600_000 + (index % 60) * 60_000;
    const id = `m${new Date(at).toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
    const speakers = lang === "es" ? ["PROBE-Sofía Herrera", "PROBE-Luis Ortega", "PROBE-Marco Díaz", "Tú"] : ["PROBE-Ana Ruiz", "PROBE-Tom Becker", "PROBE-Carla Méndez", "Tú"];
    // Turns about 10 s apart, each started 6 s before it ended, so segments run 30–40 s like speech.
    const turns = Array.from({ length: FILLER_TURNS }, (_, i) => ({ id: `t${i + 1}`, at: at + (i + 1) * 10_000, startAt: at + (i + 1) * 10_000 - 6_000, speaker: speakers[(i + index) % speakers.length]!, text: filler(lang, i + index, index + i) }));
    if (fact) turns[6] = { ...turns[6]!, speaker: fact.speaker, text: fact.line };
    meetings.push({ id, title: `PROBE reunión ${index + 1}`, startedAt: at, endedAt: at + (FILLER_TURNS + 1) * 10_000, status: "done", turns });
    assignments.set(id, lang === "es" ? "p-atlas" : "p-orion");
    return meetings.at(-1)!;
  };
  const questions: RecallQuestion[] = [];
  const units: MemoryUnit[] = [];
  FACTS.forEach((f, i) => {
    const back = 1 + (i % 27);
    const m = make(i, back, 9 + (i % 8), f.lang, f);
    const mu = meetingUnits(m, assignments.get(m.id));
    units.push(...mu);
    const label = mu.find((u) => u.kind === "segment" && u.text.includes(f.line))!.id;
    questions.push({ id: `f${i + 1}-paraphrase`, kind: "paraphrase", question: f.paraphrase, labels: [label] });
    questions.push({ id: `f${i + 1}-cross`, kind: "cross-lingual", question: f.cross, labels: [label] });
    questions.push({ id: `f${i + 1}-exact`, kind: "exact", question: f.exact, labels: [label] });
    if (i % 2 === 0) {
      const weekday = WEEKDAYS_ES[new Date(Date.parse(`${isoLocalDay(m.startedAt)}T12:00:00Z`)).getUTCDay()]!;
      // Only within the last six days is a bare weekday unambiguous.
      if (back <= 6) questions.push({ id: `f${i + 1}-time`, kind: "time", question: `¿Qué se dijo el ${weekday} sobre ${f.topic}?`, labels: [label] });
      else questions.push({ id: `f${i + 1}-time`, kind: "time", question: `¿Qué se dijo hace ${back} días sobre ${f.topic}?`, labels: [label] });
    }
  });
  for (let k = 0; k < FILLER_MEETINGS; k++) {
    const m = make(100 + k, 1 + (k % 28), 14 + (k % 4), k % 2 ? "en" : "es");
    units.push(...meetingUnits(m, assignments.get(m.id)));
  }
  OUT_OF_MEMORY.forEach((q, i) => questions.push({ id: `oom-${i + 1}`, kind: "out-of-memory", question: q, labels: [] }));
  return { meetings, assignments, units, questions, now: MEMORY_NOW };
}
