// A stand-in for the Meta API, for the CI smoke test: no key, no network, same wire formats as
// the real one (docs/kb/meta-api.md). Realtime transcription hears one scripted question once
// enough audio has arrived, whatever the audio is, and closes a session that stops getting audio
// (the real one closes below real time with 1008); Spark answers with a fixed streamed line.

import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { OPCODE, WsFrameParser, acceptKey, encodeFrame } from "../src/websocket.ts";

export const STUB_QUESTION = "Rulo, can we ship the beta on Friday?";
export const STUB_REPLY = "Yes, Friday works if QA signs off Thursday.";
const BYTES_PER_MS = 32; // 16 kHz PCM16 mono
const SPEECH_START_MS = 400;
const SPEECH_END_MS = 2400;
/** A session with no audio for this long is closed with 1008, as the real service does below real time. */
const IDLE_CLOSE_MS = 2000;

function sse(res: import("node:http").ServerResponse, events: object[]): void {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const e of events) res.write(`event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end("data: [DONE]\n\n");
}

/** Above this RMS a 16 kHz PCM16 frame is speech for the stub's endpointing (synthetic tones are far above it). */
const STUB_SPEECH_RMS = 1000;
/** Quiet after speech that ends an endpointing turn. */
const STUB_ENDPOINT_MS = 480;
/** How often a partial is sent while speech goes on. */
const STUB_PARTIAL_MS = 320;

function frameRms(pcm: Buffer): number {
  let sum = 0;
  const n = Math.floor(pcm.length / 2);
  for (let i = 0; i < n; i++) sum += pcm.readInt16LE(i * 2) ** 2;
  return n ? Math.sqrt(sum / n) : 0;
}

/**
 * Endpointing (add-voice-mode): each stretch of loud audio is one turn whose words are the next
 * line of `utterances` (the stub cannot hear words). Partials show its first words while it lasts.
 */
function endpointing(send: (msg: object) => void, utterances: string[]) {
  let turnId = 0;
  let speaking = false;
  let quietMs = 0;
  let spokenMs = 0;
  let lastPartialMs = 0;
  let processedMs = 0;
  let line = "";
  return (pcm: Buffer) => {
    const ms = pcm.length / BYTES_PER_MS;
    processedMs += ms;
    const loud = frameRms(pcm) > STUB_SPEECH_RMS;
    if (loud && !speaking) {
      speaking = true;
      spokenMs = 0;
      lastPartialMs = 0;
      line = utterances.shift() ?? "PROBE hola";
      send({ type: "speechStart", turnId, audioProcessedMs: processedMs });
    }
    if (!speaking) return;
    if (loud) {
      quietMs = 0;
      spokenMs += ms;
      if (spokenMs - lastPartialMs >= STUB_PARTIAL_MS) {
        lastPartialMs = spokenMs;
        const words = line.split(/\s+/);
        send({ type: "transcript", transcript: words.slice(0, Math.max(2, Math.ceil(spokenMs / STUB_PARTIAL_MS))).join(" "), final: false, audioProcessedMs: processedMs });
      }
      return;
    }
    quietMs += ms;
    if (quietMs >= STUB_ENDPOINT_MS) {
      speaking = false;
      send({ type: "speechEnd", turnId, audioProcessedMs: processedMs });
      send({ type: "speechComplete", turnId, transcript: line, audioProcessedMs: processedMs });
      turnId++;
    }
  };
}

/** One realtime session: hello, then speechStart → speaker → speechComplete as the audio passes the marks. */
function transcribe(socket: Duplex, utterances: string[] = [], sessions: StubMeta["asrSessions"] = []): void {
  const parser = new WsFrameParser();
  const send = (msg: object) => socket.write(encodeFrame(OPCODE.text, JSON.stringify(msg)));
  let configured = false;
  let endpoint: ((pcm: Buffer) => void) | undefined;
  let processedMs = 0;
  let stage = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const closeIdle = () => socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xf0])));
  socket.on("close", () => clearTimeout(idle));
  socket.on("data", (chunk: Buffer) => {
    let messages;
    try {
      messages = parser.push(chunk);
    } catch {
      return void socket.destroy();
    }
    for (const m of messages) {
      if (m.opcode === OPCODE.close) return void socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xe8])));
      if (m.opcode === OPCODE.ping) socket.write(encodeFrame(OPCODE.pong, m.payload));
      if (m.opcode === OPCODE.text) {
        const msg = JSON.parse(m.payload.toString()) as { authorization?: unknown; type?: string; mode?: string; languageBias?: string[] };
        if (!configured) {
          if (!msg.authorization) return void socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xf0])));
          configured = true;
          sessions.push({ mode: msg.mode, languageBias: msg.languageBias });
          if (msg.mode === "ENDPOINTING") endpoint = endpointing(send, utterances);
          send({ sessionId: "stub-session" });
        } else if (msg.type === "endStream") socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xe8])));
      }
      if (m.opcode === OPCODE.binary && configured) {
        clearTimeout(idle);
        idle = setTimeout(closeIdle, IDLE_CLOSE_MS);
        if (endpoint) {
          endpoint(m.payload);
          continue;
        }
        processedMs += m.payload.length / BYTES_PER_MS;
        if (stage === 0 && processedMs >= SPEECH_START_MS) {
          stage = 1;
          send({ type: "speechStart", turnId: 0, audioProcessedMs: SPEECH_START_MS });
          send({ type: "speaker", turnId: 0, label: "B", audioProcessedMs: processedMs });
          send({ type: "transcript", turnId: 0, transcript: "Rulo, can we", final: false, audioProcessedMs: processedMs });
        } else if (stage === 1 && processedMs >= SPEECH_END_MS) {
          stage = 2;
          send({ type: "speechComplete", turnId: 0, transcript: STUB_QUESTION, audioProcessedMs: SPEECH_END_MS });
        }
      }
    }
  });
  socket.on("error", () => {});
}

export interface StubMeta {
  server: Server;
  port: number;
  requests: string[];
  /** Lines the endpointing sessions hear next, one per stretch of loud audio. */
  utterances: string[];
  /** How many coach replies stop at the token cap before one answers (add-practice-mode). */
  coachCutOffs: number;
  /** Each coach request's token cap and reasoning effort. */
  coachCalls: { maxTokens?: number; effort?: string }[];
  /** Each realtime session's handshake: its mode and language bias (add-language-coach). */
  asrSessions: { mode?: string; languageBias?: string[] }[];
}

export function startStubMeta(): Promise<StubMeta> {
  const requests: string[] = [];
  const utterances: string[] = [];
  const coachCalls: StubMeta["coachCalls"] = [];
  const asrSessions: StubMeta["asrSessions"] = [];
  const stub = { coachCutOffs: 0 };
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/v1/responses" && isVoiceRequest(body)) {
        void voiceReply(res, body);
      } else if (req.url === "/v1/responses" && body.includes("RECUPERADO:")) {
        // Fast recall (add-memory-engine): cite the first retrieved line, with the marker split across deltas.
        const id = /RECUPERADO:\\n\[([^\]]+)\]/.exec(body)?.[1];
        const usage = { input_tokens: 900, input_tokens_details: { cached_tokens: 0 }, output_tokens: 30 };
        const text = id ? `@answer\n${STUB_ASK_ANSWER} [[${id}]]` : "@none";
        const cut = text.length - (id ? id.length + 3 : 2);
        sse(res, [{ type: "response.created" }, { type: "response.output_text.delta", delta: text.slice(0, 9) }, { type: "response.output_text.delta", delta: text.slice(9, cut) }, { type: "response.output_text.delta", delta: text.slice(cut) }, { type: "response.completed", response: { usage } }]);
      } else if (req.url === "/v1/responses" && body.includes("You are a language tutor naming things")) {
        // The language coach's look (add-language-coach): two name lines.
        const usage = { input_tokens: 900, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20 };
        sse(res, [{ type: "response.created" }, { type: "response.output_text.delta", delta: STUB_COACH_NAMES }, { type: "response.completed", response: { usage } }]);
      } else if (req.url === "/v1/responses" && /eyes of a person who is blind|You read aloud for a person|what a blind person has in front/.test(body)) {
        // Ver (add-sight-mode): a description for the first live frame, "=" once a previous one exists, a reading, or a look.
        const text = body.includes("You read aloud") ? STUB_SIGHT_READ : body.includes("Previous description") ? "=" : body.includes("Answer their question") ? STUB_SIGHT_LOOK : STUB_SIGHT_LIVE;
        const usage = { input_tokens: 900, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20 };
        sse(res, [{ type: "response.created" }, { type: "response.output_text.delta", delta: text }, { type: "response.completed", response: { usage } }]);
      } else if (req.url === "/v1/responses" && body.includes("piano teacher from Colombia coaching a beginner")) {
        // The practice coach (add-practice-mode): a fixed line, another when it sees an earlier attempt today;
        // `coachCutOffs` replies stop at the token cap first, as Spark does when it reasons past it.
        const req = JSON.parse(body) as { max_output_tokens?: number; reasoning?: { effort?: string } };
        coachCalls.push({ maxTokens: req.max_output_tokens, effort: req.reasoning?.effort });
        if (stub.coachCutOffs > 0) {
          stub.coachCutOffs--;
          const usage = { input_tokens: 300, input_tokens_details: { cached_tokens: 0 }, output_tokens: req.max_output_tokens };
          return sse(res, [{ type: "response.created" }, { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" }, usage } }]);
        }
        const text = body.includes("Antes, hoy:") ? STUB_COACH_BETTER : STUB_COACH;
        const usage = { input_tokens: 300, input_tokens_details: { cached_tokens: 0 }, output_tokens: 25 };
        sse(res, [{ type: "response.created" }, { type: "response.output_text.delta", delta: text }, { type: "response.completed", response: { usage } }]);
      } else if (req.url === "/v1/responses") {
        const usage = { input_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens: 12 };
        sse(res, [
          { type: "response.created" },
          { type: "response.output_text.delta", delta: STUB_REPLY.slice(0, 12) },
          { type: "response.output_text.delta", delta: STUB_REPLY.slice(12) },
          { type: "response.completed", response: { usage } },
        ]);
      } else if (req.url === "/v1/chat/completions") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: chatReply(body) } }], usage: { prompt_tokens: 50, completion_tokens: 1 } }));
      } else res.writeHead(404).end();
    });
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex) => {
    requests.push(`UPGRADE ${req.url}`);
    const key = req.headers["sec-websocket-key"];
    if (req.url !== "/v1/asr/realtime" || typeof key !== "string") return void socket.destroy();
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
    transcribe(socket, utterances, asrSessions);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(Object.assign(stub, { server, port: (server.address() as AddressInfo).port, requests, utterances, coachCalls, asrSessions }))));
}

/** "no" for the yes/no checks; for the chat with Lente, an answer citing the first line of its memory (or not found). */
function chatReply(body: string): string {
  let req: { response_format?: { json_schema?: { name?: string } }; messages?: Array<{ content?: unknown }> } = {};
  try {
    req = JSON.parse(body);
  } catch {
    return "no";
  }
  if (req.response_format?.json_schema?.name !== "ask") return "no";
  const id = String(req.messages?.[0]?.content ?? "").match(/\n\[([A-Z]\d+(?:\.t\d+)?)\]/)?.[1];
  return JSON.stringify(id ? { found: true, answer: STUB_ASK_ANSWER, sources: [id] } : { found: false, answer: "", sources: [] });
}

export const STUB_SIGHT_LIVE = "Al frente hay una hoja que dice PROBE salida. A tu derecha, una taza.";
export const STUB_SIGHT_LOOK = "Tienes en la mano una tarjeta PROBE de color azul.";
export const STUB_SIGHT_READ = "PROBE título. Este es el primer párrafo de prueba. Este es el segundo.";

export const STUB_COACH = "PROBE muy bien; repite la cuarta nota, Fa, más despacio.";
export const STUB_COACH_BETTER = "PROBE mejoraste desde el intento anterior.";

export const STUB_ASK_ANSWER = "Te preguntaron si la beta sale el viernes; respondiste que sí, si QA aprueba el jueves.";

// --- The voice agent (add-voice-mode) -----------------------------------------------------------

export const STUB_WEB_URL = "https://example.org/probe";
export const STUB_LONG_REPLY = ["Esta es la primera frase larga de prueba.", "Esta es la segunda frase larga de prueba.", "Esta es la tercera frase larga de prueba."];
/** Pause between the long reply's sentences, so a test can interrupt it. */
export const STUB_LONG_GAP_MS = 900;

type VoiceInput = { role?: string; type?: string; content?: unknown; name?: string; call_id?: string; output?: string; arguments?: string }[];

function isVoiceRequest(body: string): boolean {
  try {
    const req = JSON.parse(body) as { tools?: { name?: string }[] };
    return Boolean(req.tools?.some((t) => t.name === "add_task" || t.name === "pronounce"));
  } catch {
    return false;
  }
}

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** What the scripted agent does next: a tool call, or text. */
function voiceDecision(input: VoiceInput): { commentary?: string; call?: { name: string; args: object }; text?: string[]; search?: string } {
  const last = input.at(-1);
  const user = fold(String([...input].reverse().find((i) => i.role === "user")?.content ?? ""));
  if (last?.type === "function_call_output") {
    const name = input.find((i) => i.type === "function_call" && i.call_id === last.call_id)?.name;
    const out = JSON.parse(last.output ?? "{}") as Record<string, any>;
    if (name === "list_tasks" && /hecha|completa|borra/.test(user)) {
      const id = out.tasks?.[0]?.id;
      if (id) return { call: { name: /borra/.test(user) ? "delete_task" : "complete_task", args: { id } } };
      return { text: ["No tienes tareas abiertas."] };
    }
    if (name === "complete_task" || name === "delete_task") return { text: [String(out.ask ?? out.error ?? "No la encontré.")] };
    if (name === "ask_memory") return { text: [out.found ? String(out.answer) : "No lo encuentro en tus reuniones."] };
    if (name === "add_task") return { text: [`Listo, agregué «${out.title}».`] };
    if (name === "delegate") return { text: ["Lo dejé en Tareas, esperando tu aprobación."] };
    if (name === "start_recording") return { text: ["Te abrí la hoja de grabación; toca Grabar cuando quieras."] };
    if (name === "list_tasks") return { text: [`Tienes ${out.total ?? 0} tareas abiertas.`] };
    if (name === "look") return { text: [String(out.seen ?? out.error ?? "No pude ver.")] };
    if (name === "where_am_i") return { text: [out.address ? `Estás en ${out.address}.` : `No pude saberlo: ${out.error}.`] };
    return { text: ["Listo."] };
  }
  if (/empieza la bienvenida/.test(user)) return { text: ["Hola, soy Lente. ¿Cómo te llamas?"] };
  if (/donde estoy/.test(user)) return { commentary: "Déjame ver dónde estás.", call: { name: "where_am_i", args: {} } };
  if (/en la mano|leeme|que hay frente/.test(user)) return { commentary: "Déjame ver.", call: { name: "look", args: { question: user, mode: /leeme/.test(user) ? "read" : "describe" } } };
  if (/agrega|anota/.test(user)) {
    const args = /llame a ana/.test(user) ? { title: "Llamar a Ana", who: "me", due: "viernes" } : { title: user.replace(/^.*?(agrega|anota)( que)?\s*/, "").slice(0, 60) || "PROBE tarea", who: "me" };
    return { commentary: "Lo anoto en tu lista.", call: { name: "add_task", args } };
  }
  if (/hecha|completa|borra/.test(user)) return { commentary: "Lo busco en tus tareas.", call: { name: "list_tasks", args: {} } };
  if (/delega|agente/.test(user)) return { call: { name: "delegate", args: { instruction: "Preparar el resumen para el cliente", agent: "PROBE" } } };
  if (/graba/.test(user)) return { call: { name: "start_recording", args: { camera: /camara/.test(user) } } };
  if (/internet|en la web/.test(user)) return { search: "PROBE capital", text: ["Según example.org, la capital de PROBE es PROBE City."] };
  if (/larga|cuentame/.test(user)) return { text: STUB_LONG_REPLY };
  return { commentary: "Lo busco en tus reuniones.", call: { name: "ask_memory", args: { question: user } } };
}

export const STUB_COACH_NAMES = "o garfo = el tenedor\na xícara = la taza";

/** The language coach (add-language-coach): «¿cómo se dice tenedor?», a look, and a repeat of «o garfo». */
function coachDecision(input: VoiceInput): ReturnType<typeof voiceDecision> {
  const last = input.at(-1);
  const user = fold(String([...input].reverse().find((i) => i.role === "user")?.content ?? ""));
  if (last?.type === "function_call_output") {
    const name = input.find((i) => i.type === "function_call" && i.call_id === last.call_id)?.name;
    const out = JSON.parse(last.output ?? "{}") as Record<string, any>;
    if (name === "pronounce") return { text: ["Repítelo conmigo, despacio."] };
    if (name === "look") return { text: [out.names?.length ? "Son el tenedor y la taza; repite el primero." : "No veo nada claro."] };
    if (name === "check_repeat") return { text: [out.result === "understood" ? "¡Muy bien, te entendí perfecto!" : "No te alcancé a entender; ¿lo digo más despacio?"] };
    return { text: ["Listo, sigamos practicando."] };
  }
  if (/abrir idiomas/.test(user)) return { text: ["¡Hola! Soy tu tutor de portugués. ¿Qué quieres practicar hoy?"] };
  if (/como se dice tenedor/.test(user)) return { call: { name: "pronounce", args: { text: "o garfo", meaning: "el tenedor" } } };
  if (/que es esto/.test(user)) return { call: { name: "look", args: { question: "¿Qué es esto?" } } };
  if (/garfo/.test(user)) return { call: { name: "check_repeat", args: { expected: "o garfo" } } };
  return { text: ["Muito bem! Você está aprendendo muito."] };
}

let stubCallSeq = 0;

/** Streams the decision in the Responses API's event shapes (docs/kb/meta-api.md). */
async function voiceReply(res: import("node:http").ServerResponse, body: string): Promise<void> {
  const req = JSON.parse(body) as { input?: VoiceInput; tools?: { name?: string }[] };
  const d = req.tools?.some((t) => t.name === "pronounce") ? coachDecision(req.input ?? []) : voiceDecision(req.input ?? []);
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const write = (e: object) => res.write(`event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`);
  let index = 0;
  const message = async (texts: string[], phase?: "commentary") => {
    const at = index++;
    write({ type: "response.output_item.added", output_index: at, item: { type: "message", role: "assistant", content: [], ...(phase ? { phase } : {}) } });
    for (const [i, t] of texts.entries()) {
      if (i > 0 && texts === STUB_LONG_REPLY) await new Promise((r) => setTimeout(r, STUB_LONG_GAP_MS));
      if (res.destroyed) return;
      write({ type: "response.output_text.delta", output_index: at, delta: (i ? " " : "") + t });
    }
    write({ type: "response.output_item.done", output_index: at, item: { type: "message", role: "assistant", content: [{ type: "output_text", text: texts.join(" "), annotations: [] }], ...(phase ? { phase } : {}) } });
  };
  write({ type: "response.created" });
  if (d.search) {
    const at = index++;
    write({ type: "response.output_item.added", output_index: at, item: { type: "web_search_call", action: { type: "search", query: d.search } } });
    write({ type: "response.output_item.done", output_index: at, item: { type: "web_search_call", action: { type: "search", query: d.search }, results: [{ type: "text_result", title: "PROBE City", url: STUB_WEB_URL, snippet: "" }] } });
  }
  if (d.commentary) await message([d.commentary], "commentary");
  if (d.call) {
    const callId = `call_stub_${++stubCallSeq}`;
    write({ type: "response.output_item.done", output_index: index++, item: { type: "function_call", call_id: callId, name: d.call.name, arguments: JSON.stringify(d.call.args), status: "completed" } });
  }
  if (d.text) await message(d.text);
  if (res.destroyed) return;
  write({ type: "response.completed", response: { usage: { input_tokens: 1800, input_tokens_details: { cached_tokens: 1600 }, output_tokens: 40 } } });
  res.end("data: [DONE]\n\n");
}
