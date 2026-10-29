// Durable facts about people, projects and clients as one JSON file (data/facts.json, git-ignored,
// text only). Proposed facts wait for the wearer; only kept ones are ever read into a prompt.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ProposedFact } from "./meetings.ts";

export type FactStatus = "proposed" | "kept";

export interface Fact {
  id: string;
  text: string;
  status: FactStatus;
  /** The meeting that supports the fact and the turns in it. */
  meetingId: string;
  evidence: string[];
  createdAt: number;
}

/** The facts the wearer kept, oldest first: the only ones a model call may see. */
export const keptFacts = (facts: Fact[]): Fact[] => facts.filter((f) => f.status === "kept");

export class FactStore {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  list(): Fact[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Fact[]) : [];
    } catch (error) {
      console.error(`[facts] could not read ${this.file}: ${(error as Error).message}`);
      return [];
    }
  }

  /** Queues proposals for review, skipping text already stored (any status) so a retry does not duplicate. */
  propose(meetingId: string, proposed: ProposedFact[], now: number): Fact[] {
    const all = this.list();
    const seen = new Set(all.map((f) => f.text.toLowerCase()));
    const added: Fact[] = [];
    for (const p of proposed) {
      if (seen.has(p.text.toLowerCase())) continue;
      seen.add(p.text.toLowerCase());
      added.push({ id: `f${now}-${all.length + added.length + 1}`, text: p.text, status: "proposed", meetingId, evidence: p.evidence, createdAt: now });
    }
    if (added.length) this.write([...all, ...added]);
    return added;
  }

  /** Guardar: only a proposed fact can be kept. */
  keep(id: string): boolean {
    const all = this.list();
    const fact = all.find((f) => f.id === id && f.status === "proposed");
    if (!fact) return false;
    fact.status = "kept";
    this.write(all);
    return true;
  }

  /** Descartar or delete: the fact is removed whatever its status. */
  remove(id: string): boolean {
    const all = this.list();
    const rest = all.filter((f) => f.id !== id);
    if (rest.length === all.length) return false;
    this.write(rest);
    return true;
  }

  /** Deleting a meeting deletes the facts it supports; returns how many. */
  removeMeeting(meetingId: string): number {
    const all = this.list();
    const rest = all.filter((f) => f.meetingId !== meetingId);
    if (rest.length !== all.length) this.write(rest);
    return all.length - rest.length;
  }

  removeAll(): void {
    if (this.list().length) this.write([]);
  }

  private write(facts: Fact[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(facts, null, 2) + "\n");
  }
}
