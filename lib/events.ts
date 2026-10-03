/**
 * Gemeinsame Helfer für Events (Server und Client).
 *
 * Datum und Uhrzeit liegen in der DB als Wanduhrzeit (date + time, ohne Zeitzone) und
 * meinen immer Europe/Berlin. Formatiert wird daher rein aus den Strings, ohne die
 * Zeitzone des Servers (Vercel: UTC) oder Browsers ins Spiel zu bringen.
 */

export const EVENT_TIME_ZONE = "Europe/Berlin";

export const EVENT_IMAGE_BUCKET = "event-images";
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Max. Anzahl einzeln eingegebener Empfänger für eine Event-Mail. */
export const MAX_CUSTOM_RECIPIENTS = 50;

export type EventCore = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  organizer: string | null;
  image_url: string | null;
  requires_registration: boolean;
};

export type AnnouncementTarget =
  | { mode: "all" }
  | { mode: "custom"; emails: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** "19:00:00" → "19:00" */
export function shortTime(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}

function parseDate(date: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function parseTime(time: string): [number, number] {
  const [h, min] = time.split(":").map(Number);
  return [h || 0, min || 0];
}

/** Datum ohne Zeitzonen-Effekte formatieren, z. B. "Fr., 17. Oktober 2026". */
export function formatEventDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long", year: "numeric" }
): string {
  const parts = parseDate(date);
  if (!parts) return date;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("de-DE", { ...options, timeZone: "UTC" });
}

/** "19:00 – 22:00 Uhr", "19:00 Uhr" oder "" */
export function formatTimeRange(start: string | null, end: string | null): string {
  const s = shortTime(start);
  const e = shortTime(end);
  if (!s) return "";
  if (!e) return `${s} Uhr`;
  return `${s} – ${e} Uhr${e <= s ? " (Folgetag)" : ""}`;
}

/** "Fr., 17. Oktober 2026 · 19:00 – 22:00 Uhr" */
export function formatEventWhen(event: Pick<EventCore, "event_date" | "event_time" | "end_time">): string {
  const time = formatTimeRange(event.event_time, event.end_time);
  return [formatEventDate(event.event_date), time].filter(Boolean).join(" · ");
}

/** Offset von Europe/Berlin gegenüber UTC zu einem Zeitpunkt in ms. */
function berlinOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

/** Berliner Wanduhrzeit → Unix-Timestamp (ms). */
function berlinToTimestamp(date: string, time: string, addDays = 0): number {
  const parts = parseDate(date);
  if (!parts) return Number.NaN;
  const [y, m, d] = parts;
  const [h, min] = parseTime(time);
  const naive = Date.UTC(y, m - 1, d + addDays, h, min);
  return naive - berlinOffsetMs(naive);
}

export function eventStartTimestamp(event: Pick<EventCore, "event_date" | "event_time">): number {
  return berlinToTimestamp(event.event_date, event.event_time || "00:00");
}

/**
 * Ende des Events. Ohne Endzeit gilt das Event bis Tagesende als laufend
 * (ein Abendevent soll nicht um 19:01 als "vorbei" gelten).
 */
export function eventEndTimestamp(event: Pick<EventCore, "event_date" | "event_time" | "end_time">): number {
  const start = shortTime(event.event_time);
  const end = shortTime(event.end_time);
  if (start && end) return berlinToTimestamp(event.event_date, end, end <= start ? 1 : 0);
  return berlinToTimestamp(event.event_date, "23:59");
}

export function isEventPast(event: Pick<EventCore, "event_date" | "event_time" | "end_time">, now = Date.now()): boolean {
  return eventEndTimestamp(event) < now;
}

export function eventPath(id: string): string {
  return `/events/${id}`;
}

/** Aufsteigend sortierte Events in anstehend (aufsteigend) und vergangen (neueste zuerst) teilen. */
export function splitUpcomingPast<T extends Pick<EventCore, "event_date" | "event_time" | "end_time">>(
  events: T[],
  now = Date.now()
): { upcoming: T[]; past: T[] } {
  const upcoming = events.filter((e) => !isEventPast(e, now));
  const past = events.filter((e) => isEventPast(e, now)).reverse();
  return { upcoming, past };
}
