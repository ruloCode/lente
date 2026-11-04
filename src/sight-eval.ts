// The sight eval's set and scoring (add-sight-mode 5.1). Pure: which objects are shown, what a right answer
// must say, and the summary. The run itself (scripts/eval/sight-set.ts) shows each object to the real clip,
// taps «Mirar» on the phone and reads the answer off the screen. No image is ever saved.

export interface SightItem {
  id: string;
  kind: "billete" | "texto" | "objeto";
  /** What the owner puts in front of the clip, said aloud and printed. */
  show: string;
  /** A right answer matches this (accents and case ignored). */
  expect: RegExp;
  /** A right answer must not match this (e.g. the wrong denomination). */
  reject?: RegExp;
}

const BILL_WORDS: Record<string, string> = { "2": "dos", "5": "cinco", "10": "diez", "20": "veinte", "50": "cincuenta", "100": "cien" };

function bill(thousands: string): SightItem {
  const others = Object.keys(BILL_WORDS).filter((k) => k !== thousands);
  return {
    id: `billete-${thousands}000`,
    kind: "billete",
    show: `el billete de ${thousands}.000 pesos, de frente, a un palmo del clip`,
    expect: new RegExp(`\\b${thousands}[.,\\s]?000\\b|\\b${BILL_WORDS[thousands]} mil\\b`),
    reject: new RegExp(others.map((k) => `\\b${k}[.,\\s]?000\\b|\\b${BILL_WORDS[k]} mil\\b`).join("|")),
  };
}

/** The set: the six current Colombian banknotes, a sign, a printed page, and three objects in hand. */
export function sightSet(pageWord: string): SightItem[] {
  return [
    ...["2", "5", "10", "20", "50", "100"].map(bill),
    { id: "letrero-salida", kind: "texto", show: "el letrero impreso que dice SALIDA", expect: /\bsalida\b/ },
    { id: "hoja", kind: "texto", show: `la hoja impresa (debe leer la palabra «${pageWord}»)`, expect: new RegExp(`\\b${fold(pageWord)}\\b`) },
    { id: "taza", kind: "objeto", show: "una taza o un vaso en la mano", expect: /\b(taza|vaso|pocillo|jarra|mug)\b/ },
    { id: "llaves", kind: "objeto", show: "unas llaves en la mano", expect: /\bllaves?\b/ },
    { id: "celular", kind: "objeto", show: "un celular en la mano", expect: /\b(celular|telefono|movil|smartphone)\b/ },
  ];
}

/** Lowercase, no accents, so «Teléfono» and «telefono» match the same. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function scoreAnswer(item: SightItem, answer: string): boolean {
  const a = fold(answer);
  return item.expect.test(a) && !(item.reject?.test(a) ?? false);
}

export interface SightResult {
  id: string;
  kind: SightItem["kind"];
  right: boolean;
  /** Tap on the phone → the answer on its screen, in ms; undefined when no answer came. */
  ms?: number;
  /** The owner changed the automatic score. */
  overridden?: boolean;
}

export function summarizeEval(results: SightResult[]): { kind: string; right: number; of: number; p50?: number }[] {
  const kinds = [...new Set(results.map((r) => r.kind))];
  const rows = kinds.map((kind) => {
    const rs = results.filter((r) => r.kind === kind);
    return { kind, right: rs.filter((r) => r.right).length, of: rs.length, p50: median(rs.map((r) => r.ms).filter((m): m is number => m !== undefined)) };
  });
  const all = results.map((r) => r.ms).filter((m): m is number => m !== undefined);
  return [...rows, { kind: "todo", right: results.filter((r) => r.right).length, of: results.length, p50: median(all) }];
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.ceil(s.length / 2) - 1];
}
