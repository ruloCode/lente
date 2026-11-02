// @ts-check
// Reuniones: the library grouped by day, the imported mark, and the topics as chips.

import { dayLabel, startOfDay, startOfWeek } from "./format.js";

/** @typedef {{ id: string, title?: string, topic?: string, startedAt: number, endedAt?: number, status?: string, auto?: boolean, turns?: number, notes?: any }} MeetingSummary */

/** Meetings brought from hermes keep ids that start with `hermes-`. */
export const isImported = (/** @type {{ id: string }} */ m) => m.id.startsWith("hermes-");

/** The title to show: the meeting's, its topic, or a plain fallback. */
export const meetingTitle = (/** @type {MeetingSummary} */ m) => m.title?.trim() || m.notes?.title || m.topic || (m.auto ? "Grabación" : "Reunión sin título");

/** One group per day, newest first: «Hoy», «Ayer», «lun 3 nov». */
export function groupByDay(/** @type {MeetingSummary[]} */ meetings, /** @type {number} */ now) {
  /** @type {Map<number, MeetingSummary[]>} */
  const days = new Map();
  for (const m of [...meetings].sort((a, b) => b.startedAt - a.startedAt)) {
    const key = startOfDay(m.startedAt);
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  return [...days].map(([key, items]) => ({ key, label: dayLabel(key, now), items }));
}

/** Meetings that started this week (from Monday), for the project cards. */
export const thisWeek = (/** @type {MeetingSummary[]} */ meetings, /** @type {number} */ now) => meetings.filter((m) => m.startedAt >= startOfWeek(now));

/** The topics present, in the hub's fixed order, for the filter chips. */
export const TOPIC_ORDER = ["Proyecto", "Cliente", "Equipo", "Entrevista", "Clase", "Personal", "Otro"];
export function topicsIn(/** @type {MeetingSummary[]} */ meetings) {
  const present = new Set(meetings.map((m) => m.topic).filter(Boolean));
  return TOPIC_ORDER.filter((t) => present.has(t));
}

/** The CSS class of a topic chip (the kit has three colors; the rest are neutral). */
export function topicTone(/** @type {string | undefined} */ topic) {
  return topic === "Proyecto" ? "product" : topic === "Cliente" ? "client" : topic === "Equipo" ? "team" : "neutral";
}
