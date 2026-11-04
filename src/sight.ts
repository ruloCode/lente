// «Ver»: Lente's camera as eyes for someone who is blind or has low vision (add-sight-mode). Pure: the
// prompts, how a reply becomes something to say (or silence), and the guard that keeps Lente from ever
// telling the wearer to move. The hub owns the calls and the frames.

/** A live description longer than this is not read whole: Lente says there is a long text and offers it. */
export const SIGHT_LIVE_MAX_CHARS = 300;
/** A look asked to read returns at most this much text. */
export const LOOK_READ_MAX_CHARS = 1_500;
/** A look describing (not reading) returns at most this much. */
export const LOOK_DESCRIBE_MAX_CHARS = 400;
/** Longest piece handed to a voice at once: a sentence, or a cut at a comma or space under this. */
export const SPOKEN_CHUNK_CHARS = 200;
/**
 * A live description that took longer than this from its frame is not said: the wearer has moved on, and
 * hearing what was there seconds ago is worse than silence (the baseline on 2026-11-04 had a 12 s tail).
 */
export const SIGHT_STALE_MS = 6_000;
/** The model's whole answer when nothing changed since the previous description. */
export const UNCHANGED = "=";

const RULES =
  "Rules that always hold: " +
  "never tell the person to move, walk, cross, step, stop, wait or go anywhere, and never say a path, street or stair is safe or clear; " +
  "never name a person or guess anyone's identity, age, health or feelings from a face; " +
  "never give medical advice or read medicine doses as instructions; " +
  "when you are not sure (blur, glare, too far), say «no estoy seguro» and what would help (acercar, más luz).";

/** Live reads in Ver: what is in front of the wearer now, in the order a blind person needs it. */
export const SIGHT_LIVE_PROMPT =
  "You are the eyes of a person who is blind or has low vision, seeing through a small camera on their glasses. " +
  "Speak Spanish, directly to them (tú), as one or two short spoken sentences, no lists, no markdown, no preamble. In this order: " +
  "1) any text in view, read word for word (signs, screens, paper); if it is longer than about 250 characters, say only what kind of text it is and «pídeme que lo lea»; " +
  "2) what is held up close to the camera; for a banknote, its value in Colombian pesos when you can read it; " +
  "3) people: how many and where, nothing about who they are; " +
  "4) the rest of the scene in a few words. " +
  "Say where things are from their point of view: «al frente», «a tu izquierda», «a tu derecha», «cerca», «lejos». " +
  "Skip any step that has nothing: never say what is absent («no veo texto», «no hay personas»); start with the first thing that is there. " +
  `If the view shows nothing new compared with the previous description, answer exactly ${UNCHANGED} and nothing else. ` +
  RULES;

/** A look by voice or by tap: the wearer's own question about one fresh frame. */
export function sightLookPrompt(question: string): string {
  const guard = movementGuard(question)
    ? " The person is asking whether moving is safe: describe what you see that matters for that, then say clearly «no puedo saber si es seguro moverte; confía en tu bastón o pregunta a alguien». Do not tell them to go or to wait."
    : "";
  return (
    "You are the eyes of a person who is blind or has low vision, seeing through a small camera on their glasses. " +
    "Answer their question about this view in Spanish, spoken, directly to them (tú), in at most three short sentences, no lists, no markdown. " +
    "Read any text that answers the question word for word. For a banknote, say its value in Colombian pesos when you can read it. " +
    "Say where things are from their point of view (al frente, a tu izquierda, a tu derecha, cerca, lejos). " +
    RULES +
    guard
  );
}

/** A look asked to read: all the text in view, in reading order. */
export const SIGHT_READ_PROMPT =
  "You read aloud for a person who is blind or has low vision, from a small camera on their glasses. " +
  "Transcribe all the text you can see, word for word, in reading order (title first, then paragraphs, then small print), as plain sentences: no markdown, no lists, no commentary. " +
  "Keep the text's own language. Skip what you cannot read and say «hay una parte que no alcanzo a leer» once where it is. " +
  "If there is no text, say «no veo texto aquí» and in one sentence what you do see. " +
  "Never read medicine doses as instructions to follow.";

/** The question a tap on Ver asks. */
export const DEFAULT_LOOK_QUESTION = "¿Qué hay frente a mí?";

/** What a live reply becomes: the text to say, or nothing (unchanged, empty, or only the marker). */
export function parseSight(reply: string, max = SIGHT_LIVE_MAX_CHARS): string | undefined {
  const text = reply.replace(/\s+/g, " ").trim();
  if (!text || text === UNCHANGED || /^=+\.?$/.test(text)) return undefined;
  return trimAtSentence(text.replace(/^=\s*/, ""), max);
}

/** Cuts a text to `max` characters at the last sentence end inside it, else at the last space, with "…". */
export function trimAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "), head.lastIndexOf(".\n"));
  if (end >= max * 0.5) return head.slice(0, end + 1).trim();
  const space = head.lastIndexOf(" ");
  return `${head.slice(0, space > 0 ? space : max).trim()}…`;
}

/** Splits a text into pieces a voice can say one by one: sentences, longer ones cut at a comma or space. */
export function spokenChunks(text: string, max = SPOKEN_CHUNK_CHARS): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+["»”)]*|[^.!?…]+$/g) ?? [];
  const out: string[] = [];
  for (const raw of sentences) {
    let s = raw.trim();
    while (s.length > max) {
      const head = s.slice(0, max);
      const cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "));
      const at = cut >= max * 0.4 ? cut + 1 : head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : max;
      out.push(s.slice(0, at).trim());
      s = s.slice(at).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

const MOVEMENT = [
  /\bcruz(ar|o|amos)\b/,
  /\b(puedo|podemos|debo) (pasar|seguir|avanzar|caminar|bajar|subir|ir|salir|entrar)\b/,
  /\bes seguro\b/,
  /\bpeligro(so)?\b/,
  /\b(carros?|autos?|coches?|motos?|bus(es)?|tr[aá]fico|sem[aá]foro)\b/,
  /\b(escal(era|eras|ón|ones)|hueco|anden|andén|bordillo)\b/,
  /\bhay alguien (detr[aá]s|atr[aá]s)\b/,
  /\b(me choco|choco|chocar|tropez)/,
  /\bpor d[oó]nde (voy|sigo|camino|salgo)\b/,
];

/** True for questions about whether it is safe to move: crossing, stairs, traffic, obstacles, which way to go. */
export function movementGuard(question: string): boolean {
  const q = question.toLowerCase().normalize("NFC");
  return MOVEMENT.some((re) => re.test(q));
}
