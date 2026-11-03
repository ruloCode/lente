// Text encoders for the memory index's vectors (add-memory-engine decision 7, task 8.3). One interface,
// two implementations: a small multilingual encoder run in the hub (B), and a Meta open-weights encoder
// served by a Modal function in Lente's own Modal app (C). Vectors are content: they go only into the
// index (and its sealed snapshots), never to a log. Quantizing to int8 is pure and tested here; the
// encoders themselves are the edge.

/** What an encoder is asked to embed: the question, or a unit of memory (e5-style prefixes). */
export type EmbedKind = "query" | "passage";

export interface Encoder {
  /** Stored with every snapshot; a different id rebuilds the shards (decision 3). */
  readonly id: string;
  readonly dim: number;
  embed(texts: readonly string[], kind: EmbedKind): Promise<Int8Array[]>;
}

/** A float vector as int8, scaled so its largest component is ±127 (cosine does not care about scale). */
export function quantize(v: ArrayLike<number>): Int8Array {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]!));
  const out = new Int8Array(v.length);
  if (max === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = Math.round((v[i]! / max) * 127);
  return out;
}

/** Texts longer than this are cut before embedding (the small encoders read 512 tokens at most). */
export const EMBED_MAX_CHARS = 1_500;

/** The hub's encoder model (B): multilingual-e5-small, MIT, 384 dimensions, 93 languages, int8 ONNX. */
export const HUB_ENCODER_MODEL = "Xenova/multilingual-e5-small";
export const HUB_ENCODER_ID = "e5-small-q8";

type FeatureExtractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

/**
 * Candidate B: the encoder runs inside the hub on CPU through transformers.js (ONNX). The package is
 * loaded from `module` (a path or a package name) only when this encoder is chosen, so the hub carries
 * no new dependency until the bake-off picks it.
 */
export class HubEncoder implements Encoder {
  readonly id = HUB_ENCODER_ID;
  readonly dim = 384;
  private extractor: Promise<FeatureExtractor> | undefined;
  private readonly module: string;

  constructor(module = process.env.LENTE_ENCODER_MODULE ?? "@huggingface/transformers") {
    this.module = module;
  }

  private load(): Promise<FeatureExtractor> {
    this.extractor ??= import(this.module).then(
      (m: { pipeline: (task: string, model: string, opts: object) => Promise<FeatureExtractor> }) => m.pipeline("feature-extraction", HUB_ENCODER_MODEL, { dtype: "q8" }),
      (error: Error) => {
        throw new Error(`the hub encoder needs ${this.module}, which did not load: ${error.message.slice(0, 120)}`);
      },
    );
    return this.extractor;
  }

  async embed(texts: readonly string[], kind: EmbedKind): Promise<Int8Array[]> {
    if (!texts.length) return [];
    const extract = await this.load();
    const out = await extract(texts.map((t) => `${kind}: ${t.slice(0, EMBED_MAX_CHARS)}`), { pooling: "mean", normalize: true });
    return out.tolist().map(quantize);
  }
}

/**
 * Candidate C: a Modal function in Lente's own Modal app (deploy/modal/encoder.py) that receives texts and
 * returns vectors, logging neither. The hub's token authorizes the call.
 */
export class ModalEncoder implements Encoder {
  readonly id: string;
  readonly dim: number;
  private readonly url: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: { url: string; token: string; id: string; dim: number; fetcher?: typeof fetch }) {
    this.url = opts.url;
    this.token = opts.token;
    this.id = opts.id;
    this.dim = opts.dim;
    this.fetcher = opts.fetcher ?? fetch;
  }

  async embed(texts: readonly string[], kind: EmbedKind): Promise<Int8Array[]> {
    if (!texts.length) return [];
    const res = await this.fetcher(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ texts: texts.map((t) => t.slice(0, EMBED_MAX_CHARS)), kind }) });
    // The body may echo the request on errors: only the status goes into the message.
    if (!res.ok) throw new Error(`the Modal encoder answered ${res.status}`);
    const body = (await res.json()) as { vectors?: unknown };
    if (!Array.isArray(body.vectors) || body.vectors.length !== texts.length) throw new Error(`the Modal encoder returned ${Array.isArray(body.vectors) ? body.vectors.length : "no"} vectors for ${texts.length} texts`);
    return body.vectors.map((v, i) => {
      if (!Array.isArray(v) || v.length !== this.dim) throw new Error(`the Modal encoder's vector ${i} has ${Array.isArray(v) ? v.length : "no"} dimensions, not ${this.dim}`);
      return quantize(v as number[]);
    });
  }
}
