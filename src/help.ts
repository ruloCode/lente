// Help on demand in Asistir: Aportar, Pregunta and ¿De qué hablan?, one model call each on the last
// turns of the session. Pure apart from the model call, which the hub passes in.

import { HELP_LABELS, type HelpKind, helpMessages, parseHelp } from "./briefing.ts";
import type { ChatMessage } from "./chat.ts";
import type { AssistMode } from "./profile.ts";

/** Turns the model reads, newest last. */
export const HELP_TURNS = 12;
/** Turns whose language decides whether the card needs a Spanish meaning. */
const LANGUAGE_TURNS = 3;

export type HelpRefusal = "unknown-kind" | "record-only" | "no-turns" | "empty";

export type HelpOutcome =
  | { ok: true; kind: HelpKind; label: string; text: string; meaning?: string; ms: number }
  | { ok: false; reason: HelpRefusal; message: string };

/** What the phone shows when there is no card; phone copy is Spanish. */
export const HELP_REFUSALS: Record<HelpRefusal, string> = {
  "unknown-kind": "Ese tipo de ayuda no existe.",
  "record-only": "La ayuda está apagada en Solo grabar.",
  "no-turns": "Aún no hay nada de qué partir: espera a que alguien hable.",
  empty: "No salió nada útil; prueba otra vez.",
};

export const isHelpKind = (kind: unknown): kind is HelpKind => typeof kind === "string" && Object.hasOwn(HELP_LABELS, kind);

const refuse = (reason: HelpRefusal): HelpOutcome => ({ ok: false, reason, message: HELP_REFUSALS[reason] });

/**
 * Refuses without a model call in Solo grabar, for an unknown kind and before anything was said;
 * otherwise one call, timed from the request to the parsed answer. A failed call throws.
 */
export async function requestHelp(
  input: { kind: unknown; assistMode: AssistMode; turns: Array<{ speaker?: string; text: string }>; memory: string },
  ask: (messages: ChatMessage[]) => Promise<string>,
  clock: () => number = () => performance.now(),
): Promise<HelpOutcome> {
  if (!isHelpKind(input.kind)) return refuse("unknown-kind");
  if (input.assistMode !== "assist") return refuse("record-only");
  const turns = input.turns.filter((t) => t.text.trim()).slice(-HELP_TURNS);
  if (!turns.length) return refuse("no-turns");
  const kind = input.kind;
  const conversation = turns.map((t) => `${t.speaker ?? "?"}: ${t.text}`).join("\n");
  const lastSaid = turns.slice(-LANGUAGE_TURNS).map((t) => t.text).join(" ");
  const started = clock();
  const raw = await ask(helpMessages(input.memory, conversation, kind));
  const { text, meaning } = parseHelp(kind, raw, lastSaid);
  const ms = Math.round(clock() - started);
  if (!text) return refuse("empty");
  return { ok: true, kind, label: HELP_LABELS[kind], text, ...(meaning ? { meaning } : {}), ms };
}
