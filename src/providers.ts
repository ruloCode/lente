// Where each Meta model runs. Every endpoint here is OpenAI-compatible, so one
// streaming client measures all of them the same way.

export interface ChatTarget {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string | undefined;
  keyEnv: string;
  /** Extra body fields, e.g. reasoning effort for the hosted reasoning model. */
  extra?: Record<string, unknown>;
}

const env = process.env;

/** Both overridable so the CI smoke test can point the hub at a stub (scripts/stub-meta.ts). */
export const META_BASE_URL = env.META_BASE_URL ?? "https://api.meta.ai/v1";
export const META_REALTIME_URL = env.META_REALTIME_URL ?? "wss://api.meta.ai/v1/asr/realtime";
export const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";

export function chatTargets(): ChatTarget[] {
  return [
    {
      id: "spark-1.3-minimal",
      label: "Muse Spark 1.3 · Meta Model API · effort minimal",
      baseUrl: META_BASE_URL,
      model: "muse-spark-1.3",
      apiKey: env.MODEL_API_KEY,
      keyEnv: "MODEL_API_KEY",
      extra: { reasoning_effort: "minimal" },
    },
    {
      id: "spark-1.3-default",
      label: "Muse Spark 1.3 · Meta Model API · default effort",
      baseUrl: META_BASE_URL,
      model: "muse-spark-1.3",
      apiKey: env.MODEL_API_KEY,
      keyEnv: "MODEL_API_KEY",
    },
    {
      id: "spark-open",
      label: "Muse Spark Open · Baseten (open weights)",
      baseUrl: env.BASETEN_BASE_URL ?? "https://inference.baseten.co/v1",
      model: env.BASETEN_MODEL ?? "meta-models/muse-spark-open-1026",
      apiKey: env.BASETEN_API_KEY,
      keyEnv: "BASETEN_API_KEY",
    },
  ];
}
