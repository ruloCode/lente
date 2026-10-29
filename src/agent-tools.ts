// The closing agent's tools for one meeting. Read-only tools feed the plan phase; the three
// action tools (task, reminder, email draft) only run through `runApproved`, after the wearer
// approves. Nothing here sends anything: the email is a draft, the reminder is a local file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentTool } from "./agent-loop.ts";
import type { Meeting } from "./meetings.ts";

export const TOOL_MEETING = "get_meeting_record";
export const TOOL_GLOSSARY = "get_glossary";
export const TOOL_TASKS = "list_tasks";
export const TOOL_CREATE_TASK = "create_task";
export const TOOL_CREATE_REMINDER = "create_reminder";
export const TOOL_DRAFT_EMAIL = "draft_email";

/** Reminders fire at this local hour when the due date has no time. */
export const REMINDER_HOUR = 9;
/** Reminder lead time before the due date, in hours. */
export const REMINDER_LEAD_HOURS = 24;

export interface Task {
  id: string;
  title: string;
  /** As the notes word it ("viernes", "2026-11-02"); a hint, not a parsed date. */
  due?: string;
  /** The meeting the task came from; the phone links back to it. */
  meetingId: string;
  evidence: string[];
  done: boolean;
  createdAt: number;
}

/** Tasks as one JSON file (data/tasks.json, git-ignored), like the meeting files. */
export class TaskStore {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  list(): Task[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch (error) {
      console.error(`[tasks] could not read ${this.file}: ${(error as Error).message}`);
      return [];
    }
  }

  add(input: Omit<Task, "id" | "done" | "createdAt">, now: number): Task {
    const tasks = this.list();
    const task: Task = { ...input, id: `k${now}-${tasks.length + 1}`, done: false, createdAt: now };
    this.write([...tasks, task]);
    return task;
  }

  setDone(id: string, done: boolean): Task | undefined {
    const tasks = this.list();
    const task = tasks.find((t) => t.id === id);
    if (!task) return undefined;
    task.done = done;
    this.write(tasks);
    return task;
  }

  private write(tasks: Task[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(tasks, null, 2) + "\n");
  }
}

export interface Reminder {
  title: string;
  /** ISO date `YYYY-MM-DD` of the due date; the alarm is set a day before. */
  date: string;
  note?: string;
  meetingId: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const icsStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const icsEscape = (s: string): string => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

/** One VEVENT with an alarm `REMINDER_LEAD_HOURS` before the due date. Pure. */
export function reminderEvent(r: Reminder, now: number): string {
  const [y, m, d] = r.date.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, REMINDER_HOUR));
  const end = new Date(start.getTime() + 30 * 60_000);
  return [
    "BEGIN:VEVENT",
    `UID:${r.meetingId}-${start.getTime()}-${Math.abs(hash(r.title))}@lente`,
    `DTSTAMP:${icsStamp(new Date(now))}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(r.title)}`,
    `DESCRIPTION:${icsEscape([r.note, `Lente meeting ${r.meetingId}`].filter(Boolean).join("\n"))}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(r.title)}`,
    `TRIGGER:-PT${REMINDER_LEAD_HOURS}H`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

export const calendarOf = (events: string[]): string =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lente//closing agent//EN", ...events, "END:VCALENDAR"].join("\r\n") + "\r\n";

/** Appends an event to the .ics file, creating it with the calendar wrapper the first time. */
export function appendReminder(file: string, r: Reminder, now: number): void {
  const events: string[] = [];
  if (existsSync(file)) {
    const body = readFileSync(file, "utf8");
    for (const m of body.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)) events.push(m[0].replace(/\r?\n/g, "\r\n"));
  }
  events.push(reminderEvent(r, now));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, calendarOf(events));
}

export interface EmailDraft {
  to: string[];
  subject: string;
  body: string;
  /** Opens the wearer's mail app with the draft filled in; the wearer sends it. */
  mailto: string;
}

/** Pure: a draft is only text and a `mailto:` link. There is no send path in the hub. */
export function emailDraft(args: Record<string, unknown>): EmailDraft {
  const body = typeof args.body === "string" ? args.body.trim() : "";
  if (!body) throw new Error("draft_email needs a body");
  const subject = typeof args.subject === "string" ? args.subject.trim() : "";
  const to = (Array.isArray(args.to) ? args.to : []).filter((a): a is string => typeof a === "string" && a.includes("@"));
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to, subject, body, mailto: `mailto:${to.map(encodeURIComponent).join(",")}?${query}` };
}

export interface ToolContext {
  meeting: Meeting;
  tasks: TaskStore;
  /** Where reminders accumulate as an iCalendar file. */
  remindersFile: string;
  now?: () => number;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The registry for one meeting. Action tools are "external": the loop queues them for approval. */
export function meetingTools(ctx: ToolContext): AgentTool[] {
  const now = ctx.now ?? Date.now;
  const { meeting } = ctx;
  const none = { type: "object", properties: {} };
  return [
    {
      name: TOOL_MEETING,
      description: "The meeting record: summary, decisions, commitments, open questions, each with its turn ids.",
      parameters: none,
      effect: "none",
      handler: () => ({ id: meeting.id, title: meeting.title, ...meeting.notes }),
    },
    {
      name: TOOL_GLOSSARY,
      description: "Terms from this meeting with their meaning.",
      parameters: none,
      effect: "none",
      handler: () => meeting.notes?.glossary ?? [],
    },
    {
      name: TOOL_TASKS,
      description: "The wearer's task list, so a task is not created twice.",
      parameters: { type: "object", properties: { open: { type: "boolean", description: "Only tasks not done" } } },
      effect: "none",
      handler: (args) => ctx.tasks.list().filter((t) => args.open !== true || !t.done).map(({ id, title, due, meetingId, done }) => ({ id, title, due, meetingId, done })),
    },
    {
      name: TOOL_CREATE_TASK,
      description: "Add a task for a commitment the wearer made. Links back to this meeting.",
      parameters: {
        type: "object",
        required: ["title"],
        properties: { title: { type: "string" }, due: { type: "string", description: "Due date as in the record" } },
      },
      effect: "external",
      handler: (args) => {
        const title = str(args.title);
        if (!title) throw new Error("create_task needs a title");
        // The meeting link is fixed here, whatever the model put in the arguments.
        return ctx.tasks.add({ title, due: str(args.due) || undefined, meetingId: meeting.id, evidence: [] }, now());
      },
    },
    {
      name: TOOL_CREATE_REMINDER,
      description: "Add a reminder a day before a due date (exported to a calendar file).",
      parameters: {
        type: "object",
        required: ["title", "date"],
        properties: { title: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, note: { type: "string" } },
      },
      effect: "external",
      handler: (args) => {
        const title = str(args.title);
        const date = str(args.date);
        if (!title) throw new Error("create_reminder needs a title");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error(`create_reminder needs date as YYYY-MM-DD, got "${date}"`);
        appendReminder(ctx.remindersFile, { title, date, note: str(args.note) || undefined, meetingId: meeting.id }, now());
        return { title, date, file: ctx.remindersFile };
      },
    },
    {
      name: TOOL_DRAFT_EMAIL,
      description: "Draft a follow-up email in clear English. Only a draft: the wearer edits, copies or opens it in their mail app.",
      parameters: {
        type: "object",
        required: ["subject", "body"],
        properties: { to: { type: "array", items: { type: "string" } }, subject: { type: "string" }, body: { type: "string" } },
      },
      effect: "external",
      handler: (args) => emailDraft(args),
    },
  ];
}
