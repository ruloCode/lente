// The language coach (add-language-coach): a Spanish speaker learning Portuguese or French on the
// glasses. Pure: the target languages and which passed their checks, which language a sentence is in,
// the tutor's instructions, the look's prompt and how its names are read, and whether a repeat was
// understood. The hub owns the calls, the voice session and the camera.

export type CoachLang = "pt" | "fr";
export type SpokenLang = "es" | "pt" | "fr" | "en";
export type CoachMode = "tutor" | "placement" | "review";
export type Band = "A1" | "A2" | "B1" | "B2" | "C1";

export interface CoachLanguage {
  code: CoachLang;
  /** The phone's text-to-speech locale. */
  locale: string;
  /** The name Muse Voice Transcribe's `languageBias` takes (dev.meta.ai/docs/speech-to-text). */
  asr: string;
  /** How the tutor names it in Spanish. */
  name: string;
  /** Passed task 1.1 (`docs/kb/meta-api.md` «Languages»): only these are offered; the rest are «Pronto». */
  verified: boolean;
}

export const COACH_LANGUAGES: Readonly<Record<CoachLang, CoachLanguage>> = {
  pt: { code: "pt", locale: "pt-BR", asr: "Portuguese", name: "portugués", verified: true },
  fr: { code: "fr", locale: "fr-FR", asr: "French", name: "francés", verified: false },
};

/** The wearer's base language: the tutor explains in it. */
export const BASE_LANGUAGE: SpokenLang = "es";
/** The band the tutor keeps to before any placement. */
export const DEFAULT_BAND: Band = "A1";

/** A verified target language from the phone's `lang`, or undefined. */
export function coachLanguage(raw: unknown): CoachLanguage | undefined {
  if (raw !== "pt" && raw !== "fr") return undefined;
  const lang = COACH_LANGUAGES[raw];
  return lang.verified ? lang : undefined;
}

/** The transcription bias for a coach session: the target first, then Spanish. */
export const coachLanguageBias = (lang: CoachLanguage): string[] => [lang.asr, "Spanish"];

// --- Which language a sentence is in -------------------------------------------------------------

/**
 * Short words that mark each language, written for this repo. Words two of these languages share
 * («de», «que», «se», «a», «la», «no», «en», «como», «este», «está») are left out, so each hit is evidence.
 */
const FUNCTION_WORDS: Readonly<Record<SpokenLang, ReadonlySet<string>>> = {
  es: new Set(["el", "los", "las", "un", "una", "unos", "unas", "y", "es", "del", "al", "con", "pero", "muy", "más", "qué", "cómo", "dónde", "cuándo", "yo", "usted", "mi", "su", "eso", "esto", "hay", "también", "gracias", "sí", "hola", "bueno", "quiero", "tengo", "puedo", "ahora", "dice", "dime", "nosotros", "ustedes", "ya"]),
  pt: new Set(["o", "os", "as", "um", "uma", "e", "é", "não", "do", "da", "dos", "das", "na", "nas", "nos", "em", "com", "mas", "muito", "mais", "você", "eu", "meu", "minha", "seu", "sua", "isso", "isto", "obrigado", "obrigada", "sim", "olá", "também", "onde", "quando", "agora", "quero", "tenho", "posso", "bom", "boa", "bem", "ao", "pelo", "pela", "então", "aqui", "tudo"]),
  fr: new Set(["le", "les", "des", "du", "une", "et", "est", "je", "il", "elle", "nous", "vous", "ils", "ce", "cette", "pas", "ne", "avec", "pour", "sur", "dans", "très", "bien", "merci", "bonjour", "oui", "au", "aux", "suis", "sont", "ça", "où", "voilà", "aussi", "comment", "pourquoi", "chez", "c", "j", "l", "qu"]),
  en: new Set(["the", "an", "and", "is", "are", "was", "of", "to", "in", "it", "this", "that", "you", "i", "my", "your", "what", "how", "where", "with", "for", "not", "does", "can", "have", "please", "thanks", "thank", "hello", "yes", "be", "will", "would"]),
};

/** Letters only one of the languages writes: each word that holds one counts once more. */
const MARK_LETTERS: ReadonlyArray<[SpokenLang, RegExp]> = [
  ["pt", /[ãõ]/],
  ["es", /ñ/],
  ["fr", /[èœû]/],
];

/** The winner needs this many times the runner-up's hits, or the sentence is «unsure». */
const LANGUAGE_MARGIN = 2;

const tokens = (text: string): string[] => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/** Which language a sentence is in, by counts of function words; «unsure» with no clear winner. */
export function likelyLanguage(text: string): SpokenLang | "unsure" {
  const score: Record<SpokenLang, number> = { es: 0, pt: 0, fr: 0, en: 0 };
  for (const word of tokens(text)) {
    for (const lang of Object.keys(score) as SpokenLang[]) if (FUNCTION_WORDS[lang].has(word)) score[lang]++;
    for (const [lang, re] of MARK_LETTERS) if (re.test(word)) score[lang]++;
  }
  if (/[¿¡]/.test(text)) score.es++;
  const ranked = (Object.entries(score) as [SpokenLang, number][]).sort((a, b) => b[1] - a[1]);
  const [first, second] = [ranked[0]!, ranked[1]!];
  if (first[1] === 0 || first[1] < second[1] * LANGUAGE_MARGIN) return "unsure";
  return first[0];
}

/** The language a sentence of the tutor is spoken in: the target when it is clearly in it, else Spanish. */
export function sentenceLanguage(text: string, target: CoachLang): SpokenLang {
  const lang = likelyLanguage(text);
  if (lang === target || lang === "en") return lang;
  return BASE_LANGUAGE;
}

// --- The tutor -----------------------------------------------------------------------------------

export interface CoachContext {
  lang: CoachLanguage;
  mode: CoachMode;
  /** The wearer's latest estimated band; A1 when there is none. */
  band?: Band;
  names: string[];
  now: number;
  timeZone: string;
}

/** What each band means for the tutor's own target-language sentences. */
const BAND_STYLE: Readonly<Record<Band, string>> = {
  A1: "palabras muy comunes, frases de tres a seis palabras, presente",
  A2: "palabras comunes, frases cortas, presente y pasado simple",
  B1: "frases completas del día a día, pasado y futuro, conectores simples",
  B2: "frases naturales con algo de matiz, expresiones comunes",
  C1: "lenguaje natural y variado, como con un colega",
};

/**
 * The tutor's developer message: a warm Colombian tutor who explains in Spanish and practices the
 * target language at the wearer's band. It does not change within a session, so the prefix stays cached.
 */
export function coachInstructions(ctx: CoachContext): string {
  const band = ctx.band ?? DEFAULT_BAND;
  const name = ctx.lang.name;
  const today = new Date(ctx.now).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: ctx.timeZone });
  return [
    `Eres Lente, un tutor de ${name} colombiano, cálido y paciente. Hablas en voz alta con quien te lleva puesto en sus gafas: lo que escribes se lee con una voz sintética, y cada frase se dice con la voz de su idioma.`,
    `Hoy es ${today}. ${ctx.names.length ? `La persona se llama ${ctx.names.join(" o ")}; háblale de tú.` : "Háblale de tú."}`,
    `Explicas en español de Colombia y practicas en ${name} sencillo de nivel ${band} (${BAND_STYLE[band]}). Es un estimado de su nivel, no un examen.`,
    "Di de una a tres frases cortas por turno, una sola cosa a la vez, sin listas, sin markdown y sin emojis. No des clases de gramática si no te las piden.",
    `Cada frase va entera en un solo idioma: nunca mezcles español y ${name} en la misma frase. Si citas una palabra en ${name}, dila con pronounce.`,
    `Cuando pregunte cómo se dice algo, o le enseñes una palabra o frase útil, llama pronounce con la frase en ${name} (con su artículo) y su significado en español. pronounce ya la dice en voz alta: no la repitas en tu respuesta. Después dile en español una frase corta, por ejemplo «Repítelo conmigo».`,
    "Cuando la persona intente repetir la frase, llama check_repeat con la frase esperada. Si responde understood, celébralo en una frase. Si responde missed, dile con cariño que no la alcanzaste a entender y ofrece decirla más despacio. Nunca hables de puntajes ni de pronunciación perfecta: solo dices si la entendiste.",
    `Si comete un error al hablar ${name}, corrige solo uno, con calidez («Casi: se dice …») y con pronounce para la forma correcta.`,
    `Cuando pregunte qué es algo, qué tiene enfrente o en la mano, usa look: los nombres en ${name} ya se dicen en voz alta. Luego di en español, en una frase, qué significan o invita a repetir el primero.`,
    "Lo que la persona vivió antes (reuniones, palabras que aprendió) se consulta con ask_memory; no lo inventes.",
    "Reglas que siempre se cumplen: nunca le digas que se mueva, cruce, avance o espere, ni que un camino es seguro; nunca identifiques a nadie por su cara ni adivines su edad, salud o emociones; no das consejos médicos.",
    ctx.mode === "tutor" ? `Si es el primer turno, saluda en español en una frase y pregúntale qué quiere practicar en ${name}.` : "",
  ].filter(Boolean).join("\n");
}

/** The tutor's opening, a hidden first turn: the model sees it, the wearer never does. */
export const COACH_INTRO_CUE = "(La persona acaba de abrir Idiomas. Salúdala y pregúntale qué quiere practicar.)";

// --- «Nombra lo que veo» -------------------------------------------------------------------------

/** Names a coach look keeps, most prominent first. */
export const LOOK_NAMES_MAX = 3;
/** Longest side of a name line («o garfo», «el tenedor»). */
const NAME_MAX_CHARS = 60;

const LOOK_LANGUAGE: Readonly<Record<CoachLang, string>> = { pt: "Brazilian Portuguese", fr: "French (France)" };

/** The look's system prompt in the coach: up to three names in the target language with their Spanish. */
export function coachLookPrompt(lang: CoachLang, band: Band = DEFAULT_BAND): string {
  const example = lang === "pt" ? "o garfo = el tenedor\na xícara = la taza" : "la fourchette = el tenedor\nla tasse = la taza";
  return (
    `You are a language tutor naming things for a Spanish speaker learning ${LOOK_LANGUAGE[lang]} at level ${band}, seen through a small camera on their glasses. ` +
    `Name at most ${LOOK_NAMES_MAX} things in view, the most prominent first (what is in their hand, or in the middle of the view). ` +
    `Answer only with lines, one per thing, each exactly «<definite article + noun in ${LOOK_LANGUAGE[lang]}> = <Spanish definite article + noun>», the simplest common word for it. No other text. Example:\n${example}\n` +
    "Never name a person or say who they are, and never guess anyone's identity, age, health or feelings; if asked about people, write one line with how many there are. " +
    "If nothing is clear (blur, darkness), answer exactly ? and nothing else."
  );
}

export interface SeenName {
  /** In the target language, with its article («o garfo»). */
  text: string;
  /** In Spanish («el tenedor»). */
  meaning: string;
}

/** The well-formed name lines of a coach look, at most LOOK_NAMES_MAX, once each. */
export function parseNames(reply: string): SeenName[] {
  const out: SeenName[] = [];
  for (const raw of reply.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").replace(/[*_`]/g, "").trim();
    const m = /^([^=]+?)\s*=\s*([^=]+?)[.;]?$/.exec(line);
    if (!m) continue;
    const [text, meaning] = [m[1]!.trim(), m[2]!.trim()];
    if (!text || !meaning || text.length > NAME_MAX_CHARS || meaning.length > NAME_MAX_CHARS) continue;
    if (!/\p{L}/u.test(text) || !/\p{L}/u.test(meaning)) continue;
    if (out.some((n) => n.text.toLowerCase() === text.toLowerCase())) continue;
    out.push({ text, meaning });
    if (out.length === LOOK_NAMES_MAX) break;
  }
  return out;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Portuguese definite articles and the indefinite each becomes in «Isso é um …». */
const PT_INDEFINITE: Readonly<Record<string, string>> = { o: "um", a: "uma" };

/**
 * What Lente says for a name it saw: in Portuguese, the first one as «Isso é um garfo. O garfo.» (the
 * word in a sentence, then alone), the others as the name alone.
 */
export function seenLine(name: SeenName, lang: CoachLang, first: boolean): string {
  const [article, ...rest] = name.text.split(/\s+/);
  const noun = rest.join(" ");
  const indefinite = lang === "pt" && article ? PT_INDEFINITE[article.toLowerCase()] : undefined;
  if (first && indefinite && noun) return `Isso é ${indefinite} ${noun}. ${capitalize(name.text)}.`;
  return `${capitalize(name.text)}.`;
}

// --- Repeat and be understood ----------------------------------------------------------------------

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The words of a phrase that must be heard: all but the target language's function words. */
export function keyWords(phrase: string, lang: CoachLang): string[] {
  const all = tokens(phrase);
  const keys = all.filter((w) => !FUNCTION_WORDS[lang].has(w));
  return (keys.length ? keys : all).map(fold);
}

/** Share of key words a repeat of three or more key words must hold; shorter phrases need them all. */
const REPEAT_SHARE = 0.75;

/** Whether the transcription of a repeat holds the phrase's key words. Not a pronunciation score. */
export function checkRepeat(expected: string, heard: string, lang: CoachLang): { result: "understood" | "missed"; missing: string[] } {
  const keys = keyWords(expected, lang);
  const said = new Set(tokens(heard).map(fold));
  const missing = keys.filter((w) => !said.has(w));
  const needed = keys.length < 3 ? keys.length : Math.ceil(keys.length * REPEAT_SHARE);
  return { result: keys.length > 0 && keys.length - missing.length >= needed ? "understood" : "missed", missing };
}
