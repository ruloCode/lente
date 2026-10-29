// Traces of the closing agent: one JSON line per step in data/traces/<meetingId>.jsonl, appended
// as the run goes (the same pattern as the day record). Text only, deleted with the meeting.

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { TraceStep } from "./agent-loop.ts";

/** Steps the loop produces plus what the wearer decides afterwards. */
export type TraceEntry =
  | (TraceStep & { at: number })
  | { kind: "approval"; at: number; actionId: string; tool: string; decision: "approved" | "rejected"; edited: boolean }
  | { kind: "action"; at: number; actionId: string; tool: string; ok: boolean; result: unknown };

const SAFE_ID = /^m\d{14}(-\d+)?$/;

export class TraceWriter {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  append(meetingId: string, entries: TraceEntry[]): void {
    if (!SAFE_ID.test(meetingId) || entries.length === 0) return;
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.file(meetingId), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }

  /** Stamps a loop's steps with the time the run finished, spacing nothing: order is the file order. */
  appendRun(meetingId: string, steps: TraceStep[], at: number): void {
    this.append(meetingId, steps.map((s) => ({ ...s, at })));
  }

  /** Entries in the order they were written. A line that cannot be parsed is skipped. */
  read(meetingId: string): TraceEntry[] {
    if (!SAFE_ID.test(meetingId) || !existsSync(this.file(meetingId))) return [];
    const entries: TraceEntry[] = [];
    for (const line of readFileSync(this.file(meetingId), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as TraceEntry);
      } catch {
        console.error(`[trace] skipped a damaged line in ${meetingId}`);
      }
    }
    return entries;
  }

  delete(meetingId: string): void {
    if (SAFE_ID.test(meetingId)) rmSync(this.file(meetingId), { force: true });
  }

  deleteAll(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }

  private file(id: string): string {
    return join(this.dir, `${id}.jsonl`);
  }
}

const short = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

/** One readable line per entry for the trace viewer. Pure. */
export function traceLine(e: TraceEntry): { label: string; detail: string } {
  switch (e.kind) {
    case "model": {
      const tokens = e.usage ? ` · ${e.usage.inputTokens ?? "?"} in / ${e.usage.outputTokens ?? "?"} out` : "";
      return { label: `Modelo, paso ${e.step}`, detail: `${e.ms} ms${tokens}${e.calls.length ? ` · llama ${e.calls.join(", ")}` : ""}` };
    }
    case "tool":
      return { label: `${e.ok ? "Herramienta" : "Herramienta con error"}: ${e.name}`, detail: `${short(e.args)} → ${short(e.result)}` };
    case "queued":
      return { label: `En cola: ${e.tool}`, detail: e.reason };
    case "dropped":
      return { label: `Descartada: ${e.tool}`, detail: e.reason };
    case "end":
      return { label: "Fin", detail: `${e.reason} tras ${e.steps} paso(s)${e.detail ? ` · ${e.detail}` : ""}` };
    case "approval":
      return { label: `${e.decision === "approved" ? "Aprobada" : "Rechazada"}: ${e.tool}`, detail: e.edited ? "con cambios del usuario" : "sin cambios" };
    case "action":
      return { label: `${e.ok ? "Ejecutada" : "Falló"}: ${e.tool}`, detail: short(e.result) };
  }
}
