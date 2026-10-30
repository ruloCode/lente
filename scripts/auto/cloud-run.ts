// The cloud builder's calls: a session per node, the event stream with reconnect and dedupe, the
// outputs download with retry and the checked patch. `fetch` and the sleep are injected so tests
// script the API; the key is read per request through `getKey` and goes only in a header.
import { API_BASE, OUTPUTS_DIR, PATCH_FILE, RESULT_FILE, type SessionEvent, type SessionState, type SessionInput, checkPatch, headers, initialState, messageBody, outcome, reduceEvents, sessionBody } from "./cloud.ts";

export const ROUND_TIMEOUT_MS = 45 * 60_000;
const OUTPUT_TRIES = 6;
const OUTPUT_RETRY_MS = 2_000;
const DOWNLOAD_TRIES = 3;
const RECONNECT_MS = 3_000;
const MAX_RECONNECTS = 20;

export type Deps = { fetch: typeof fetch; getKey: () => string; sleep?: (ms: number) => Promise<void> };
type FileInfo = { id: string; filename?: string; name?: string; created_at?: string };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function cloudApi(d: Deps) {
  const sleep = d.sleep ?? wait;
  async function req(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const res = await d.fetch(`${API_BASE}${path}`, { method, headers: headers(d.getKey()), body: body === undefined ? undefined : JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
  }
  return {
    sleep,
    async createSession(i: SessionInput): Promise<string> {
      const j = (await (await req("POST", "/sessions", sessionBody(i))).json()) as { id?: string };
      if (!j.id) throw new Error("POST /sessions returned no session id");
      return j.id;
    },
    send: (id: string, text: string) => req("POST", `/sessions/${id}/events`, messageBody(text)),
    interrupt: (id: string) => req("POST", `/sessions/${id}/events`, { events: [{ type: "user.interrupt" }] }),
    async listEvents(id: string): Promise<SessionEvent[]> {
      const j = (await (await req("GET", `/sessions/${id}/events`)).json()) as { data?: SessionEvent[]; events?: SessionEvent[] };
      return j.data ?? j.events ?? [];
    },
    /** Resolves once the stream is open, then yields one event per SSE `data:` line group. */
    async openStream(id: string, signal: AbortSignal): Promise<AsyncIterable<SessionEvent>> {
      const res = await req("GET", `/sessions/${id}/events/stream`, undefined, signal);
      return sse(res);
    },
    async listFiles(id: string): Promise<FileInfo[]> {
      const j = (await (await req("GET", `/files?scope_id=${encodeURIComponent(id)}`)).json()) as { data?: FileInfo[]; files?: FileInfo[] };
      return j.data ?? j.files ?? [];
    },
    async download(fileId: string): Promise<string> {
      for (let n = 1; ; n++) {
        try {
          return await (await req("GET", `/files/${fileId}/content`)).text();
        } catch (e) {
          if (n >= DOWNLOAD_TRIES) throw e;
          await sleep(OUTPUT_RETRY_MS);
        }
      }
    },
  };
}
export type CloudApi = ReturnType<typeof cloudApi>;

async function* sse(res: Response): AsyncIterable<SessionEvent> {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let end: number;
    while ((end = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end).replace(/^\r?\n\r?\n/, "");
      const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data) as SessionEvent;
      } catch {}
    }
  }
}

export type Round = { state: SessionState; error?: string };

/** Follow one round to its outcome: reopen a dropped stream, catch up from the event list, dedupe by id. */
export async function watchRound(api: CloudApi, id: string, start: SessionState, o: { timeoutMs?: number; onState?: (s: SessionState) => void } = {}): Promise<Round> {
  let st = start;
  const deadline = Date.now() + (o.timeoutMs ?? ROUND_TIMEOUT_MS);
  const settle = async (): Promise<string | undefined> => {
    const out = outcome(st);
    if (out.kind === "fail") {
      if (st.phase === "idle" && st.stopReason === "requires_action") await api.interrupt(id).catch(() => {});
      return out.reason;
    }
    return undefined;
  };
  const fold = (events: SessionEvent[]) => {
    st = reduceEvents(st, events);
    o.onState?.(st);
  };
  for (let attempt = 0; attempt <= MAX_RECONNECTS; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const events = await api.openStream(id, ctrl.signal); // open first, then list: nothing falls between
      fold(await api.listEvents(id));
      if (outcome(st).kind !== "wait") return { state: st, error: await settle() };
      for await (const ev of events) {
        fold([ev]);
        if (outcome(st).kind !== "wait") return { state: st, error: await settle() };
      }
    } catch (e) {
      if (ctrl.signal.aborted) break;
      if (attempt === MAX_RECONNECTS) return { state: st, error: `cloud stream kept failing: ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
    await api.sleep(RECONNECT_MS);
  }
  await api.interrupt(id).catch(() => {});
  return { state: st, error: `cloud round timed out after ${Math.round((o.timeoutMs ?? ROUND_TIMEOUT_MS) / 60_000)} min` };
}

const fileName = (f: FileInfo) => f.filename ?? f.name ?? "";
const newest = (files: FileInfo[]) => files.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")).at(-1);

/** The patch and result the agent wrote in /mnt/session/outputs/; files from earlier rounds don't count. */
export async function fetchOutputs(api: CloudApi, id: string, known: Set<string>): Promise<{ patch?: string; result?: unknown; error?: string }> {
  for (let n = 1; n <= OUTPUT_TRIES; n++) {
    const files = (await api.listFiles(id)).filter((f) => !known.has(f.id));
    const patch = newest(files.filter((f) => fileName(f).endsWith(PATCH_FILE)));
    const result = newest(files.filter((f) => fileName(f).endsWith(RESULT_FILE)));
    if (patch && (result || n === OUTPUT_TRIES)) {
      known.add(patch.id);
      let parsed: unknown;
      if (result) {
        known.add(result.id);
        try {
          parsed = JSON.parse(await api.download(result.id));
        } catch {}
      }
      return { patch: await api.download(patch.id), result: parsed };
    }
    await api.sleep(OUTPUT_RETRY_MS); // the index lags 1–3 s behind the agent going idle
  }
  return { error: `the cloud agent left no new ${OUTPUTS_DIR}/${PATCH_FILE}` };
}

export type CloudSession = { id: string; state: SessionState; known: Set<string> };

/** One round: send the message, follow the session, download and check what came back. */
export async function cloudRound(api: CloudApi, s: CloudSession, text: string, root: string, onState?: (st: SessionState) => void): Promise<{ patch?: string; result?: unknown; error?: string }> {
  s.state = { ...s.state, phase: "pending", stopReason: undefined }; // the previous round's idle must not end this one
  await api.send(s.id, text);
  const round = await watchRound(api, s.id, s.state, { onState: (st) => { s.state = st; onState?.(st); } });
  s.state = round.state;
  if (round.error) return { error: round.error };
  const out = await fetchOutputs(api, s.id, s.known);
  if (out.error || !out.patch) return { error: out.error };
  const bad = checkPatch(out.patch, root);
  return bad ? { error: bad } : out;
}

export async function startSession(api: CloudApi, input: SessionInput): Promise<CloudSession> {
  return { id: await api.createSession(input), state: initialState(), known: new Set() };
}
