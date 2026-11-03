// The activity feed (add-notifications): what happened in Lente and what waits for the wearer, derived
// from what the hub already keeps (meetings and their notes, actions, agent jobs, memories to review).
// Nothing is stored but a read mark and the wearer's settings, sealed in the profile. Pure.

/** What an item is about, for the phone's glyph and the wearer's per-kind settings. */
export type NotificationGroup = "recordings" | "approvals" | "memories" | "agents";

export type NotificationKind =
  | "notes-writing"
  | "notes-ready"
  | "notes-failed"
  | "notes-short"
  | "approval"
  | "memory-review"
  | "job-done"
  | "job-failed";

export interface NotificationItem {
  /** Stable across calls (`kind:ref`), so a device alerts once per item. */
  id: string;
  kind: NotificationKind;
  group: NotificationGroup;
  at: number;
  title: string;
  body: string;
  urgent: boolean;
  meetingId?: string;
  actionId?: string;
}

export interface NotificationPrefs {
  /** Alerts on the phone at all. */
  phone: boolean;
  groups: Record<NotificationGroup, boolean>;
  /** Quiet hours, in minutes from midnight; `from > to` crosses midnight. */
  quiet: { on: boolean; from: number; to: number };
  /** During a meeting, only urgent items alert. */
  meetingsUrgentOnly: boolean;
  /** Lock-screen alerts without the item's text. */
  hideContent: boolean;
  /** The clip's cue signal for urgent items. */
  clipBuzz: boolean;
}

export interface NotificationSettings {
  /** Items at or before this time are read. */
  readAt: number;
  prefs: NotificationPrefs;
}

export const GROUPS: NotificationGroup[] = ["recordings", "approvals", "memories", "agents"];

export const DEFAULT_PREFS: NotificationPrefs = {
  phone: true,
  groups: { recordings: true, approvals: true, memories: true, agents: true },
  quiet: { on: false, from: 22 * 60, to: 7 * 60 },
  meetingsUrgentOnly: true,
  hideContent: false,
  clipBuzz: false,
};

export const DEFAULT_SETTINGS: NotificationSettings = { readAt: 0, prefs: DEFAULT_PREFS };

/** How far back the feed looks, and how many items it keeps. */
export const FEED_WINDOW_MS = 14 * 24 * 3600_000;
export const FEED_MAX_ITEMS = 60;
/** Characters of an instruction, a title or a memory an item quotes. */
export const QUOTE_CHARS = 90;

/** What the feed reads from a meeting. */
export interface FeedMeeting {
  id: string;
  title?: string;
  topic?: string;
  status: string;
  startedAt: number;
  endedAt?: number;
}

/** What the feed reads from an action (and, for `run_agent`, its job outcome). */
export interface FeedAction {
  id: string;
  tool: string;
  meetingId: string;
  args: Record<string, unknown>;
  status: string;
  createdAt: number;
  decidedAt?: number;
  outcome?: unknown;
}

export interface FeedFact {
  id: string;
  text: string;
  status: string;
  meetingId: string;
  createdAt: number;
}

const quote = (s: unknown): string => {
  const text = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return text.length > QUOTE_CHARS ? text.slice(0, QUOTE_CHARS - 1).trimEnd() + "…" : text;
};

const meetingTitle = (m: FeedMeeting): string => quote(m.title) || quote(m.topic) || "Tu grabación";

const AGENT_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex" };

/** What an approval is about, in a few words, by its tool. */
function approvalLine(a: FeedAction): { title: string; body: string; group: NotificationGroup } {
  switch (a.tool) {
    case "run_agent": {
      const name = AGENT_NAMES[String(a.args.agent)] ?? "Un agente";
      return { title: `${name} espera tu aprobación`, body: quote(a.args.instruction), group: "agents" };
    }
    case "draft_email":
      return { title: "Un correo por aprobar", body: quote(a.args.subject) || quote(a.args.to), group: "approvals" };
    case "create_reminder":
      return { title: "Un recordatorio por aprobar", body: quote(a.args.text) || quote(a.args.title), group: "approvals" };
    default:
      return { title: "Una tarea por aprobar", body: quote(a.args.title) || quote(a.args.text), group: "approvals" };
  }
}

/**
 * The feed: every item from the last FEED_WINDOW_MS, newest first, at most FEED_MAX_ITEMS. Memories to
 * review collapse into one item, dated by the newest of them.
 */
export function buildFeed(src: { meetings: FeedMeeting[]; actions: FeedAction[]; facts: FeedFact[] }, now: number): NotificationItem[] {
  const since = now - FEED_WINDOW_MS;
  const items: NotificationItem[] = [];
  for (const m of src.meetings) {
    const at = m.endedAt ?? m.startedAt;
    if (at < since) continue;
    const title = meetingTitle(m);
    const base = { at, meetingId: m.id, group: "recordings" as const };
    if (m.status === "extracting") items.push({ ...base, id: `notes-writing:${m.id}`, kind: "notes-writing", title: "Procesando tu grabación", body: `${title} · Lente escribe las notas`, urgent: false });
    else if (m.status === "done") items.push({ ...base, id: `notes-ready:${m.id}`, kind: "notes-ready", title: `Notas listas: ${title}`, body: "Notas, tareas y decisiones", urgent: false });
    else if (m.status === "failed") items.push({ ...base, id: `notes-failed:${m.id}`, kind: "notes-failed", title: "No pude escribir las notas", body: `${title} · la transcripción quedó guardada`, urgent: false });
    else if (m.status === "too-short") items.push({ ...base, id: `notes-short:${m.id}`, kind: "notes-short", title: "Grabación muy corta para notas", body: `${title} · se guardó el texto`, urgent: false });
  }
  for (const a of src.actions) {
    if (a.status === "pending" && a.createdAt >= since) {
      const line = approvalLine(a);
      items.push({ id: `approval:${a.id}`, kind: "approval", group: line.group, at: a.createdAt, title: line.title, body: line.body, urgent: true, actionId: a.id, meetingId: a.meetingId || undefined });
      continue;
    }
    const outcome = a.tool === "run_agent" && typeof a.outcome === "object" && a.outcome !== null ? (a.outcome as { state?: string; finishedAt?: number; summary?: string }) : undefined;
    if (!outcome || (outcome.state !== "done" && outcome.state !== "failed")) continue;
    const at = outcome.finishedAt ?? a.decidedAt ?? a.createdAt;
    if (at < since) continue;
    const name = AGENT_NAMES[String(a.args.agent)] ?? "El agente";
    const done = outcome.state === "done";
    items.push({
      id: `${done ? "job-done" : "job-failed"}:${a.id}`, kind: done ? "job-done" : "job-failed", group: "agents", at,
      title: done ? `${name} terminó` : `${name} no pudo terminar`, body: quote(a.args.instruction), urgent: !done, actionId: a.id,
    });
  }
  const review = src.facts.filter((f) => f.status === "proposed" && f.createdAt >= since);
  if (review.length) {
    const newest = review.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    items.push({
      id: `memory-review:${newest.id}`, kind: "memory-review", group: "memories", at: newest.createdAt,
      title: review.length === 1 ? "Un recuerdo por revisar" : `${review.length} recuerdos por revisar`, body: quote(newest.text), urgent: false,
    });
  }
  return items.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, FEED_MAX_ITEMS);
}

/** Items after the read mark. */
export function unreadCount(items: NotificationItem[], readAt: number): number {
  return items.filter((i) => i.at > readAt).length;
}

const minutes = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 24 * 60 ? v : fallback);
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/** The settings a device sent, checked field by field; anything missing or wrong keeps its default. */
export function parsePrefs(input: unknown, base: NotificationPrefs = DEFAULT_PREFS): NotificationPrefs {
  const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const g = typeof o.groups === "object" && o.groups !== null ? (o.groups as Record<string, unknown>) : {};
  const q = typeof o.quiet === "object" && o.quiet !== null ? (o.quiet as Record<string, unknown>) : {};
  return {
    phone: flag(o.phone, base.phone),
    groups: Object.fromEntries(GROUPS.map((k) => [k, flag(g[k], base.groups[k])])) as Record<NotificationGroup, boolean>,
    quiet: { on: flag(q.on, base.quiet.on), from: minutes(q.from, base.quiet.from), to: minutes(q.to, base.quiet.to) },
    meetingsUrgentOnly: flag(o.meetingsUrgentOnly, base.meetingsUrgentOnly),
    hideContent: flag(o.hideContent, base.hideContent),
    clipBuzz: flag(o.clipBuzz, base.clipBuzz),
  };
}

/** Saved settings as the profile keeps them, tolerant of anything older or broken. */
export function parseSettings(input: unknown): NotificationSettings {
  const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const readAt = typeof o.readAt === "number" && o.readAt >= 0 ? o.readAt : 0;
  return { readAt, prefs: parsePrefs(o.prefs) };
}

/** The minute of the day of a time, in a time zone (quiet hours are the wearer's local hours). */
export function minuteOfDay(at: number, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Whether a minute of the day falls in quiet hours (which may cross midnight). */
export function isQuiet(prefs: NotificationPrefs, minuteOfDay: number): boolean {
  const { on, from, to } = prefs.quiet;
  if (!on || from === to) return false;
  return from < to ? minuteOfDay >= from && minuteOfDay < to : minuteOfDay >= from || minuteOfDay < to;
}

/** Whether an item may alert: its kind is on, outside quiet hours, and during a meeting only when urgent (if so set). */
export function mayAlert(item: NotificationItem, prefs: NotificationPrefs, minuteOfDay: number, inMeeting: boolean): boolean {
  if (!prefs.groups[item.group]) return false;
  if (isQuiet(prefs, minuteOfDay)) return false;
  if (inMeeting && prefs.meetingsUrgentOnly && !item.urgent) return false;
  return true;
}

/** Whether the clip should signal for an item: urgent, the wearer asked for it, and it may alert. */
export function shouldBuzz(item: NotificationItem, prefs: NotificationPrefs, minuteOfDay: number, inMeeting: boolean): boolean {
  return prefs.clipBuzz && item.urgent && mayAlert(item, prefs, minuteOfDay, inMeeting);
}
