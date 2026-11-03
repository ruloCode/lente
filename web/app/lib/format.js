// @ts-check
// Dates, times, durations and money as the wearer reads them, in Spanish. Pure: every function
// takes the clock as an argument, so the tests pin it.

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAY_MS = 86_400_000;

const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");

/** «10:24», local time. */
export function hhmm(/** @type {number} */ at) {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local midnight of the day `at` falls in. */
export function startOfDay(/** @type {number} */ at) {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Monday 00:00 of the week `at` falls in (weeks start on Monday). */
export function startOfWeek(/** @type {number} */ at) {
  const d = new Date(startOfDay(at));
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

/** Whole calendar days between two instants, by local date (DST-safe). */
export function daysBetween(/** @type {number} */ from, /** @type {number} */ to) {
  const a = new Date(from), b = new Date(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

/** «Hoy», «Ayer», «lun 3 nov», or «lun 3 nov 2025» outside this year. */
export function dayLabel(/** @type {number} */ at, /** @type {number} */ now) {
  const days = daysBetween(at, now);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  const d = new Date(at);
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «Hoy, 10:24», «Ayer, 16:37», «lun 3 nov, 09:00». */
export function dayTime(/** @type {number} */ at, /** @type {number} */ now) {
  return `${dayLabel(at, now)}, ${hhmm(at)}`;
}

/** «12 min», «1 h 05 min», «menos de 1 min». */
export function duration(/** @type {number} */ ms) {
  if (!Number.isFinite(ms) || ms < 60_000) return "menos de 1 min";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${pad(rest)} min` : `${h} h`;
}

/** «10:24 – 10:36»; just the start while it runs. */
export function timeRange(/** @type {number} */ start, /** @type {number | null | undefined} */ end) {
  return end ? `${hhmm(start)} – ${hhmm(end)}` : hhmm(start);
}

/** A running clock: «4:07», «1:02:09». */
export function clock(/** @type {number} */ ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** «hace un momento», «hace 5 min», «hace 3 h», «ayer», «hace 4 días», then the date. */
export function ago(/** @type {number} */ at, /** @type {number} */ now) {
  const ms = now - at;
  if (ms < 60_000) return "hace un momento";
  if (ms < 3_600_000) return `hace ${Math.floor(ms / 60_000)} min`;
  const days = daysBetween(at, now);
  if (days === 0) return `hace ${Math.floor(ms / 3_600_000)} h`;
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return dayLabel(at, now);
}

/** «US$ 0,42», with a Spanish decimal comma; small amounts keep two decimals. */
export function money(/** @type {number} */ usd) {
  const value = Number.isFinite(usd) ? usd : 0;
  const [whole, cents] = value.toFixed(2).split(".");
  return `US$ ${Number(whole).toLocaleString("es-CO")},${cents}`;
}

/** «12 abr 2025», for facts and records. */
export function shortDate(/** @type {number} */ at) {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
