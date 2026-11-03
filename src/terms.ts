// Words as the memory index and the planned blind index (add-accounts decision 7) both see them:
// lowercase, no accents, ES/EN stopwords dropped, a light plural fold, and numbers with thousands
// separators joined ("18,000" and "18.000" are both `18000`). Pure.

/** Lowercase, no accents. */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const STOPWORDS = new Set(
  (
    // Spanish
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada como con contra cual cuales cuando cuanto da de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estado estan estar estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o otra otras otro otros para pero poco por porque que quien quienes se sea segun ser si sido sin sobre solo son su sus tambien te tengo tiene tienen todo todos tu tus un una unas uno unos usted ustedes va vamos y ya yo " +
    "dijo dijeron dije hablamos hable hablo hablaron dice decir paso pasa quedamos quede quedo cosa cosas " +
    // English
    "a about after all also am an and any are as at be been before being but by can could did do does doing for from had has have he her here him his how i if in into is it its just me my no not of on or our out over said say she so some than that the their them then there these they this those to too up us was we were what when where which who whom why will with would you your"
  ).split(" "),
);

/** One token in its index form; "" when it should not be indexed. */
export function normalizeTerm(token: string): string {
  const t = fold(token).replace(/[^a-z0-9ñ]/g, "");
  if (!t || STOPWORDS.has(t)) return "";
  if (/^\d+$/.test(t)) return t;
  // Light plural fold, the same in both languages: "presupuestos" → "presupuesto", "budgets" → "budget".
  if (t.length > 5 && /(?:ion|dad|al)es$/.test(t)) return t.slice(0, -2); // reuniones, ciudades, finales
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** The index terms of a text, in order, repeats kept (BM25 counts them). */
export function terms(text: string): string[] {
  const joined = text.replace(/(\d)[.,   ](?=\d{3}(?!\d))/g, "$1");
  const out: string[] = [];
  for (const raw of joined.split(/[^\p{L}\p{N}]+/u)) {
    const t = normalizeTerm(raw);
    if (t) out.push(t);
  }
  return out;
}
