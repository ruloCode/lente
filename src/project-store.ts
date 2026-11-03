// Where projects live (add-projects, design decision 1): the interface both backends implement, and
// the file version for the laptop hub (data/projects.json, git-ignored, 0600). Meetings are named by
// their app id (m20261101120000, hermes-…), as everywhere in the hub.

import { randomUUID } from "node:crypto";
import { JsonFile } from "./accounts.ts";
import type { Project } from "./projects.ts";

type Awaitable<T> = T | Promise<T>;

export interface ProjectStore {
  list(): Awaitable<Project[]>;
  create(name: string, now: number): Awaitable<Project>;
  rename(id: string, name: string): Awaitable<boolean>;
  setStatus(id: string, status: Project["status"]): Awaitable<boolean>;
  /** Meeting id → project id. */
  assignments(): Awaitable<Map<string, string>>;
  /** Puts a meeting in a project, or takes it out with null. */
  assign(meetingId: string, projectId: string | null): Awaitable<void>;
  /** Moves every meeting of `from` to `to` and archives `from`; returns how many moved. */
  merge(from: string, to: string): Awaitable<number>;
}

interface ProjectsFile {
  projects: Project[];
  assignments: Record<string, string>;
}

export class FileProjects implements ProjectStore {
  private readonly file: JsonFile<ProjectsFile>;

  constructor(path: string) {
    this.file = new JsonFile<ProjectsFile>(path, () => ({ projects: [], assignments: {} }));
  }

  list(): Project[] {
    return this.file.read().projects;
  }

  create(name: string, now: number): Project {
    const data = this.file.read();
    const project: Project = { id: randomUUID(), name, status: "active", createdAt: now };
    data.projects.push(project);
    this.file.write(data);
    return project;
  }

  rename(id: string, name: string): boolean {
    return this.change(id, (p) => (p.name = name));
  }

  setStatus(id: string, status: Project["status"]): boolean {
    return this.change(id, (p) => (p.status = status));
  }

  assignments(): Map<string, string> {
    return new Map(Object.entries(this.file.read().assignments));
  }

  assign(meetingId: string, projectId: string | null): void {
    const data = this.file.read();
    if (projectId === null) delete data.assignments[meetingId];
    else if (data.projects.some((p) => p.id === projectId)) data.assignments[meetingId] = projectId;
    else throw new Error(`no project ${projectId}`);
    this.file.write(data);
  }

  merge(from: string, to: string): number {
    const data = this.file.read();
    if (from === to || !data.projects.some((p) => p.id === from) || !data.projects.some((p) => p.id === to)) return 0;
    let moved = 0;
    for (const [m, p] of Object.entries(data.assignments)) if (p === from) (data.assignments[m] = to), moved++;
    data.projects.find((p) => p.id === from)!.status = "archived";
    this.file.write(data);
    return moved;
  }

  private change(id: string, edit: (p: Project) => void): boolean {
    const data = this.file.read();
    const project = data.projects.find((p) => p.id === id);
    if (!project) return false;
    edit(project);
    this.file.write(data);
    return true;
  }
}
