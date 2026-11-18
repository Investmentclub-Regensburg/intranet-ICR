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

/**
 * Event-Bilder liefert die App selbst aus (Route app/bilder/event-images/[...pfad]); der Browser spricht nie
 * direkt mit Supabase. In der DB steht seit dem Umzug auf den eigenen Server `image_url = "/bilder/event-images/<pfad>"`,
 * ältere Zeilen enthalten noch die absolute Storage-URL `https://<ref>.supabase.co/storage/v1/object/public/event-images/<pfad>`.
 * Beide Formate verstehen die Helfer unten, damit der Umzug keine Datenänderung braucht.
 */
export const EVENT_IMAGE_ROUTE = `/bilder/${EVENT_IMAGE_BUCKET}/`;

/**
 * Erlaubte Pfade im Bucket: `<userId>/<uuid>.<ext>` (Upload über die App) und `<userId>-<ms>.<ext>`
 * (frühe Uploads aus dem Sommer 2026, Endung aus dem Dateinamen, daher auch jpeg).
 */
export const EVENT_IMAGE_PATH_RE = /^[0-9a-f-]{36}(?:\/[0-9a-f-]{36}|-\d{10,16})\.(jpg|jpeg|png|gif|webp)$/;

/** Content-Type zur Dateiendung eines Event-Bilds. */
export const EVENT_IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const LEGACY_IMAGE_MARKER = `/storage/v1/object/public/${EVENT_IMAGE_BUCKET}/`;

/**
 * Pfad im Bucket event-images aus einer gespeicherten image_url (neues App-Format oder alte Storage-URL).
 * null = kein (gültiges) Event-Bild.
 */
export function eventImageStoragePath(imageUrl: string | null | undefined): string | null {
  const value = imageUrl?.trim();
  if (!value) return null;
  let raw: string;
  if (value.startsWith(EVENT_IMAGE_ROUTE)) {
    raw = value.slice(EVENT_IMAGE_ROUTE.length);
  } else if (/^https?:\/\//i.test(value) && value.includes(LEGACY_IMAGE_MARKER)) {
    raw = value.slice(value.indexOf(LEGACY_IMAGE_MARKER) + LEGACY_IMAGE_MARKER.length);
  } else {
    return null;
  }
  let path: string;
  try {
    path = decodeURIComponent(raw.split(/[?#]/)[0] ?? "");
  } catch {
    return null;
  }
  return EVENT_IMAGE_PATH_RE.test(path) ? path : null;
}

/** App-Pfad, unter dem ein Bild aus dem Bucket ausgeliefert wird (so wird image_url neu gespeichert). */
export function eventImageAppPath(storagePath: string): string {
  return `${EVENT_IMAGE_ROUTE}${storagePath}`;
}

/** Adresse fürs <img> aus einer gespeicherten image_url (beide Formate); null = kein Bild. */
export function eventImageSrc(imageUrl: string | null | undefined): string | null {
  const path = eventImageStoragePath(imageUrl);
  return path ? eventImageAppPath(path) : null;
}

/**
 * Bildtyp am Dateiinhalt (Magic Bytes) erkennen, nicht nur an der Angabe des Browsers.
 * Liefert den Content-Type aus EVENT_IMAGE_TYPES oder null.
 */
export function detectEventImageType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "GIF87a" bzw. "GIF89a"
  if (starts([0x47, 0x49, 0x46, 0x38]) && (starts([0x37, 0x61], 4) || starts([0x39, 0x61], 4))) return "image/gif";
  // "RIFF" <Länge> "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Mehrtägige Events enden höchstens so viele Tage nach dem Start (wie Check events_end_date_range in der DB). */
export const MAX_EVENT_DAYS = 31;

/**
 * Rundmail an alle Mitglieder. Vorübergehend gesperrt (Oktober 2026): Der kostenlose Resend-Plan reicht
 * dafür nicht, ein bezahlter Plan ist noch nicht gebucht. Mails an einzelne Adressen gehen weiter.
 * Zum Freischalten auf true setzen.
 */
export const MAIL_TO_ALL_ENABLED = false;
export const MAIL_TO_ALL_DISABLED_HINT = "Vorübergehend gesperrt (Mail-Kontingent)";

/** Max. Anzahl einzeln eingegebener Empfänger für eine Event-Mail. */
export const MAX_CUSTOM_RECIPIENTS = 50;

export type EventCore = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  /** Letzter Tag bei mehrtägigen Events, sonst null. */
  end_date: string | null;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  organizer: string | null;
  image_url: string | null;
  requires_registration: boolean;
};

/** Obergrenze für max_participants (wie Check events_max_participants_range in der DB). */
export const MAX_PARTICIPANTS_LIMIT = 10000;

/** Kapazität und manuelles Schließen der Anmeldung (Spalten an events). */
export type EventCapacity = {
  /** Max. Teilnehmende, null = unbegrenzt. */
  max_participants: number | null;
  /** Vom Vorstand manuell geschlossen. */
  registration_closed: boolean;
};

/** Eigener Stand bei einem Event mit Anmeldung. */
export type RegistrationStatus = "registered" | "waitlisted" | "none";

/**
 * open: Anmelden möglich · full: ausgebucht, Warteliste möglich · closed: manuell geschlossen ·
 * ended: Anmeldeschluss vorbei (Starttag überschritten oder Event vorbei).
 */
export type RegistrationPhase = "open" | "full" | "closed" | "ended";

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

/** Felder für Datum und Uhrzeit; end_date fehlt bei Altdaten oder ist null (= eintägig). */
export type EventWhen = Pick<EventCore, "event_date" | "event_time" | "end_time"> & { end_date?: string | null };

/** Mehrtägig, wenn ein Enddatum nach dem Starttag gesetzt ist. */
export function isMultiDay(event: Pick<EventWhen, "event_date" | "end_date">): boolean {
  return !!event.end_date && event.end_date > event.event_date;
}

/**
 * Eintägig: "19:00 – 22:00 Uhr", "19:00 Uhr" oder "".
 * Mehrtägig (multiDay): "Beginn 09:00 Uhr · Ende 18:00 Uhr", "Beginn 09:00 Uhr" oder "" –
 * die Zeiten gehören zum ersten bzw. letzten Tag, daher kein "(Folgetag)".
 */
export function formatTimeRange(start: string | null, end: string | null, multiDay = false): string {
  const s = shortTime(start);
  const e = shortTime(end);
  if (!s) return "";
  if (multiDay) return e ? `Beginn ${s} Uhr · Ende ${e} Uhr` : `Beginn ${s} Uhr`;
  if (!e) return `${s} Uhr`;
  return `${s} – ${e} Uhr${e <= s ? " (Folgetag)" : ""}`;
}

/** Uhrzeiten eines Events, eintägig oder mehrtägig. */
export function formatEventTimes(event: EventWhen): string {
  return formatTimeRange(event.event_time, event.end_time, isMultiDay(event));
}

/**
 * Datum oder Zeitraum, z. B. "Fr., 17. Oktober 2026" oder
 * "Fr., 23. Oktober – So., 25. Oktober 2026" (Jahr vorn nur bei Jahreswechsel).
 */
export function formatEventDateRange(
  event: Pick<EventWhen, "event_date" | "end_date">,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long", year: "numeric" }
): string {
  if (!isMultiDay(event)) return formatEventDate(event.event_date, options);
  const end = event.end_date as string;
  const sameYear = event.event_date.slice(0, 4) === end.slice(0, 4);
  const startOptions = sameYear ? { ...options, year: undefined } : options;
  return `${formatEventDate(event.event_date, startOptions)} – ${formatEventDate(end, options)}`;
}

/** "Fr., 17. Oktober 2026 · 19:00 – 22:00 Uhr" */
export function formatEventWhen(event: EventWhen): string {
  return [formatEventDateRange(event), formatEventTimes(event)].filter(Boolean).join(" · ");
}

/** Alle Tage eines Events als "yyyy-MM-dd" (eintägig: nur event_date). */
export function eventDays(event: Pick<EventWhen, "event_date" | "end_date">): string[] {
  const start = parseDate(event.event_date);
  if (!start || !isMultiDay(event)) return [event.event_date];
  const end = parseDate(event.end_date as string);
  if (!end) return [event.event_date];
  const days: string[] = [];
  const last = Date.UTC(end[0], end[1] - 1, end[2]);
  // Obergrenze wie in der DB (max. 31 Tage nach Beginn), damit kaputte Daten keine Endlosschleife bauen.
  for (let i = 0; i <= MAX_EVENT_DAYS; i++) {
    const t = Date.UTC(start[0], start[1] - 1, start[2] + i);
    if (t > last) break;
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
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
 * (ein Abendevent soll nicht um 19:01 als "vorbei" gelten). Mehrtägig: Endzeit am letzten Tag.
 */
export function eventEndTimestamp(event: EventWhen): number {
  const start = shortTime(event.event_time);
  const end = shortTime(event.end_time);
  if (isMultiDay(event)) return berlinToTimestamp(event.end_date as string, end || "23:59");
  if (start && end) return berlinToTimestamp(event.event_date, end, end <= start ? 1 : 0);
  return berlinToTimestamp(event.event_date, "23:59");
}

export function isEventPast(event: EventWhen, now = Date.now()): boolean {
  return eventEndTimestamp(event) < now;
}

/**
 * Anmeldung möglich? Wie die RLS-Policy „selbst anmelden“: bis einschließlich Starttag (Berlin).
 * Bei mehrtägigen Events also nicht mehr ab dem zweiten Tag, obwohl sie noch laufen.
 */
export function isRegistrationOpen(event: EventWhen, now = Date.now()): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(new Date(now));
  return !isEventPast(event, now) && today <= event.event_date;
}

export function isEventFull(event: Pick<EventCapacity, "max_participants">, registrationCount: number): boolean {
  return event.max_participants !== null && registrationCount >= event.max_participants;
}

/** Anmeldephase wie in der DB (Policy „selbst anmelden“ und event_join()). */
export function registrationPhase(
  event: EventWhen & EventCapacity,
  registrationCount: number,
  now = Date.now()
): RegistrationPhase {
  if (!isRegistrationOpen(event, now)) return "ended";
  if (event.registration_closed) return "closed";
  if (isEventFull(event, registrationCount)) return "full";
  return "open";
}

/**
 * Knopf zum An-/Abmelden bzw. für die Warteliste zeigen? Nach Anmeldeschluss nie; bei manuell
 * geschlossener Anmeldung nur zum Abmelden bzw. Austragen.
 */
export function canChangeRegistration(phase: RegistrationPhase, status: RegistrationStatus): boolean {
  if (phase === "ended") return false;
  if (phase === "closed") return status !== "none";
  return true;
}

/** "Ausgebucht" oder "12 von 30 Plätzen belegt"; null ohne Begrenzung. */
export function capacityLabel(registrationCount: number, maxParticipants: number | null): string | null {
  if (maxParticipants === null) return null;
  if (registrationCount >= maxParticipants) return "Ausgebucht";
  return `${registrationCount} von ${maxParticipants} Plätzen belegt`;
}

/** Fehlertext, wenn die Teilnehmerzahl unter die bestehenden Anmeldungen gesenkt werden soll. */
export function capacityBelowRegistrationsMessage(registrationCount: number): string {
  return registrationCount === 1
    ? "Es ist bereits 1 Person angemeldet. Die Teilnehmerzahl darf nicht darunter liegen."
    : `Es sind bereits ${registrationCount} Personen angemeldet. Die Teilnehmerzahl darf nicht darunter liegen.`;
}

/** "" = leer (unbegrenzt), sonst ganze Zahl 1 … MAX_PARTICIPANTS_LIMIT. undefined = ungültig. */
export function parseMaxParticipants(value: string): number | null | undefined {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 1 && n <= MAX_PARTICIPANTS_LIMIT ? n : undefined;
}

export function eventPath(id: string): string {
  return `/events/${id}`;
}

/** Aufsteigend sortierte Events in anstehend (aufsteigend) und vergangen (neueste zuerst) teilen. */
export function splitUpcomingPast<T extends EventWhen>(
  events: T[],
  now = Date.now()
): { upcoming: T[]; past: T[] } {
  const upcoming = events.filter((e) => !isEventPast(e, now));
  const past = events.filter((e) => isEventPast(e, now)).reverse();
  return { upcoming, past };
}
