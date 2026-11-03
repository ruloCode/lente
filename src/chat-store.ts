// The chat with Lente as threads of lines (add-voice-mode keeps each voice session as one thread).
// The file store is the laptop's `chat.json`; the sealed Supabase store is `SupabaseChats` in
// src/supabase-stores.ts. Grouping lines into threads is pure and shared by both.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Awaitable } from "./stores.ts";
import type { VoiceSource } from "./voice-agent.ts";

/** Lines a file store keeps; older ones are dropped first. */
export const MAX_FILE_CHAT_LINES = 2000;
/** Threads `GET /chat/voice` returns, newest first. */
export const RECENT_THREADS = 5;
/** Threads `GET /chat/threads` returns for the chat's history (add-home-dock), newest first. */
export const HISTORY_THREADS = 30;
/** Characters of a thread's first question kept as its title in the history. */
export const THREAD_TITLE_CHARS = 80;

export interface ChatLine {
  /** A uuid, so the same id works as `chat_messages.thread_id`. */
  threadId: string;
  role: "user" | "lente";
  text: string;
  sources: VoiceSource[];
  via: "voice" | "text";
  at: number;
}

export interface ChatThread {
  threadId: string;
  via: ChatLine["via"];
  /** The thread's last line. */
  at: number;
  lines: ChatLine[];
}

export interface Chats {
  add(lines: ChatLine[]): Awaitable<void>;
  /** The newest `limit` threads, newest first, each with its lines oldest first, from at most `maxLines` newest lines. */
  recent(limit: number, maxLines?: number): Awaitable<ChatThread[]>;
}

/** Lines (any order) into threads, newest thread first. */
export function groupThreads(lines: readonly ChatLine[], limit: number): ChatThread[] {
  const byThread = new Map<string, ChatLine[]>();
  for (const l of [...lines].sort((a, b) => a.at - b.at)) {
    const list = byThread.get(l.threadId) ?? [];
    list.push(l);
    byThread.set(l.threadId, list);
  }
  return [...byThread]
    .map(([threadId, list]) => ({ threadId, via: list[0].via, at: list.at(-1)!.at, lines: list }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A thread id the phone sent: a uuid, so it can be `chat_messages.thread_id`; anything else is not kept. */
export function isThreadId(v: unknown): v is string {
  return typeof v === "string" && THREAD_ID.test(v);
}

/** A typed question and Lente's answer as two lines of one thread (add-home-dock): sources keep kind, label and ids. */
export function askLines(
  threadId: string,
  question: string,
  answer: { answer: string; sources: readonly { kind: VoiceSource["kind"]; label: string; meetingId?: string; turnId?: string }[] },
  askedAt: number,
  answeredAt: number,
): ChatLine[] {
  const sources = answer.sources.map((s): VoiceSource => ({ kind: s.kind, label: s.label, ...(s.meetingId ? { meetingId: s.meetingId } : {}), ...(s.turnId ? { turnId: s.turnId } : {}) }));
  return [
    { threadId, role: "user", text: question, sources: [], via: "text", at: askedAt },
    { threadId, role: "lente", text: answer.answer, sources, via: "text", at: Math.max(answeredAt, askedAt + 1) },
  ];
}

/** A thread for the history: its first question as the title, cut to `THREAD_TITLE_CHARS`. */
export function threadTitle(thread: ChatThread): string {
  const first = (thread.lines.find((l) => l.role === "user") ?? thread.lines[0])?.text.replace(/\s+/g, " ").trim() ?? "";
  return first.length > THREAD_TITLE_CHARS ? first.slice(0, THREAD_TITLE_CHARS - 1).trimEnd() + "…" : first;
}

/** References as the database keeps them in the clear: kinds and ids only, never labels, text or URLs. */
export function plainRefs(sources: readonly VoiceSource[]): { kind: VoiceSource["kind"]; meetingId?: string; turnId?: string }[] {
  return sources.map((s) => ({ kind: s.kind, ...(s.meetingId ? { meetingId: s.meetingId } : {}), ...(s.turnId ? { turnId: s.turnId } : {}) }));
}

export class FileChats implements Chats {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  private read(): ChatLine[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as ChatLine[]) : [];
    } catch (error) {
      console.error(`[chat] could not read ${this.file}: ${(error as Error).message}`);
      return [];
    }
  }

  add(lines: ChatLine[]): void {
    if (!lines.length) return;
    const all = [...this.read(), ...lines].slice(-MAX_FILE_CHAT_LINES);
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(all) + "\n");
    renameSync(tmp, this.file);
  }

  recent(limit: number): ChatThread[] {
    return groupThreads(this.read(), limit);
  }
}
