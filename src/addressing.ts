// Is a question aimed at the wearer? Cheap rules decide the common cases (the wearer
// is named, the wearer just spoke, the wearer asked it themself); only a two-person
// exchange with neither sign goes to a model. Pure: the hub supplies turns and calls
// the model, and every decision says which rule made it so it can be shown and evaluated.

export const REPLY_WINDOW_MS = 20_000;
/** How many recent turns say whether this is a two-person exchange. */
const EXCHANGE_TURNS = 6;
export const MAX_NAMES = 8;
const MAX_NAME_CHARS = 30;

export interface AddressTurn {
  speaker?: string;
  text: string;
  /** Same clock for every turn (ms); only differences are used. */
  startMs: number;
  endMs: number;
}

export type AddressRule = "name" | "reply" | "wearer" | "model" | "none";

/** `ask` means the rules cannot decide and a model should be asked. */
export interface AddressDecision {
  verdict: "addressed" | "not-addressed" | "ask";
  rule: AddressRule | "ambiguous";
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "Rulo, Andrés" → ["Rulo", "Andrés"]: the wearer's name and aliases as typed on the phone. */
export function parseNames(input: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of input.split(/[,\n;]/)) {
    const name = part.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_CHARS);
    if (name && !seen.has(fold(name))) {
      seen.add(fold(name));
      names.push(name);
    }
  }
  return names.slice(0, MAX_NAMES);
}

/** Whole-word, accent- and case-insensitive mention of any of the names. */
export function mentionsName(text: string, names: string[]): boolean {
  const words = new Set(fold(text).split(/[^\p{L}\p{N}']+/u).filter(Boolean));
  return names.some((n) => fold(n).split(" ").every((w) => words.has(w)));
}

/**
 * `history` is the turns before this one, oldest first. `wearer` is the wearer's speaker
 * label, or undefined while it is not known.
 */
export function isAddressed(turn: AddressTurn, history: AddressTurn[], wearer: string | undefined, names: string[]): AddressDecision {
  if (wearer !== undefined && turn.speaker === wearer) return { verdict: "not-addressed", rule: "wearer" };
  if (mentionsName(turn.text, names)) return { verdict: "addressed", rule: "name" };
  const previous = history[history.length - 1];
  if (wearer !== undefined && previous?.speaker === wearer && turn.startMs - previous.endMs <= REPLY_WINDOW_MS) {
    return { verdict: "addressed", rule: "reply" };
  }
  const speakers = new Set([...history.slice(-EXCHANGE_TURNS), turn].map((t) => t.speaker).filter((s) => s !== undefined));
  // Three or more voices and no name: it is probably for someone else.
  if (speakers.size > 2) return { verdict: "not-addressed", rule: "none" };
  return { verdict: "ask", rule: "ambiguous" };
}

export const ADDRESS_PROMPT =
  "You listen to a live conversation for one participant (the wearer of a pair of glasses). Decide whether " +
  "the LAST question was aimed at the wearer, as opposed to the wearer's conversation partner, the whole " +
  "room or someone else. Answer with exactly one word: yes or no.";

export function addressMessages(turn: AddressTurn, history: AddressTurn[], wearer: string | undefined, names: string[]) {
  const label = (t: AddressTurn) => (wearer !== undefined && t.speaker === wearer ? "WEARER" : (t.speaker ?? "?"));
  const lines = [...history.slice(-EXCHANGE_TURNS), turn].map((t) => `${label(t)}: ${t.text}`).join("\n");
  const who = names.length ? `The wearer is called ${names.join(" / ")}. ` : "";
  return [
    { role: "system" as const, content: ADDRESS_PROMPT },
    { role: "user" as const, content: `${who}Conversation:\n${lines}\n\nWas the last question aimed at the wearer?` },
  ];
}

/** True for "yes", false for "no", undefined when the reply is neither. */
export function parseYesNo(reply: string): boolean | undefined {
  const word = /^[^\p{L}]*([\p{L}]+)/u.exec(reply.trim())?.[1]?.toLowerCase();
  if (word === "yes" || word === "sí" || word === "si") return true;
  if (word === "no") return false;
  return undefined;
}
