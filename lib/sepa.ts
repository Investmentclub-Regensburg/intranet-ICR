/** Datum im Format YYYY-MM-DD (für SEPA-Felder wie DtOfSgntr), sonst Fallback. */
export function sepaDate(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function sanitizeForSEPA(text: string | null | undefined): string {
  if (!text) return "";

  let sanitized = text
    // 1. Deutsche Umlaute sicher umwandeln
    .replace(/Ä/g, "Ae")
    .replace(/ä/g, "ae")
    .replace(/Ö/g, "Oe")
    .replace(/ö/g, "oe")
    .replace(/Ü/g, "Ue")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  // 2. Akzente (é, à, ô etc.) radikal entfernen
  sanitized = sanitized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3. Alles löschen, was nicht dem offiziellen SEPA-Zeichensatz entspricht
  // Erlaubt sind A-Z, a-z, 0-9, Leerzeichen und / - ? : ( ) . , ' +
  sanitized = sanitized.replace(/[^a-zA-Z0-9 \/\-\?\:\(\)\.,'\+]/g, " ");

  // 4. Doppelte Leerzeichen, die durch das Löschen entstanden sind, bereinigen
  return sanitized.replace(/\s+/g, " ").trim();
}

/**
 * Strikte Namensbereinigung für bankseitig sensible Felder.
 * Entfernt zusätzlich Bindestriche und Apostrophe.
 */
export function sanitizeNameForBank(text: string | null | undefined): string {
  return sanitizeForSEPA(text).replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Erzeugt konservative Kennungen (A-Z, 0-9) mit fixer Maximallänge.
 */
export function buildSepaIdentifier(
  text: string | null | undefined,
  maxLength = 35
): string {
  const safe = sanitizeForSEPA(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return safe.slice(0, maxLength);
}

/**
 * Erzeugt rein numerische Kennungen mit fixer Maximallänge.
 */
export function buildNumericIdentifier(
  text: string | null | undefined,
  maxLength = 35
): string {
  const safe = (text ?? "").replace(/\D/g, "");
  return safe.slice(0, maxLength);
}

/**
 * Escaped XML-Sonderzeichen in dynamischen Inhalten und entfernt Zeichen,
 * die in XML 1.0 nicht erlaubt sind (Steuerzeichen außer Tab/LF/CR).
 */
export function escapeXml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


// ---------------------------------------------------------------------------
// Fälligkeitstag (ReqdColltnDt)
// ---------------------------------------------------------------------------
// SEPA-Lastschriften werden nur an TARGET2-Geschäftstagen gebucht (Mo–Fr ohne Neujahr,
// Karfreitag, Ostermontag, 1. Mai, 25. und 26.12.). Die Bank braucht die Datei spätestens einen
// Geschäftstag vor Fälligkeit; mit Puffer verlangen wir mindestens SEPA_MIN_LEAD_BUSINESS_DAYS.
// Die Mitglieder müssen den Einzug vorab angekündigt bekommen (Standard 14 Kalendertage).

export const SEPA_MIN_LEAD_BUSINESS_DAYS = 2;
export const SEPA_PRENOTIFICATION_DAYS = 14;

/** Heutiges Datum in Europe/Berlin als YYYY-MM-DD. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Datum und Uhrzeit in Europe/Berlin als YYYY-MM-DDTHH:MM:SS (für CreDtTm). */
export function berlinDateTime(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Ostersonntag (gregorianisch, Anonymer Algorithmus). */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** TARGET2-Geschäftstag? */
export function isSepaBusinessDay(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = toUtcDate(iso);
  if (Number.isNaN(date.getTime()) || toIso(date) !== iso) return false;
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const year = date.getUTCFullYear();
  const easter = easterSunday(year);
  const holidays = [
    `${year}-01-01`,
    addDays(easter, -2),
    addDays(easter, 1),
    `${year}-05-01`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
  return !holidays.includes(iso);
}

/** Nächster Geschäftstag ab (einschließlich) iso. */
export function nextSepaBusinessDay(iso: string): string {
  let day = iso;
  while (!isSepaBusinessDay(day)) day = addDays(day, 1);
  return day;
}

/** Frühester zulässiger Fälligkeitstag: heute + SEPA_MIN_LEAD_BUSINESS_DAYS Geschäftstage. */
export function earliestCollectionDate(today: string = berlinToday()): string {
  let day = today;
  for (let n = 0; n < SEPA_MIN_LEAD_BUSINESS_DAYS; n++) day = nextSepaBusinessDay(addDays(day, 1));
  return day;
}

/** Vorschlag: erster Geschäftstag nach Ablauf der Vorabankündigung. */
export function suggestedCollectionDate(today: string = berlinToday()): string {
  const afterNotice = nextSepaBusinessDay(addDays(today, SEPA_PRENOTIFICATION_DAYS));
  const earliest = earliestCollectionDate(today);
  return afterNotice > earliest ? afterNotice : earliest;
}

/** Fehlermeldung, falls der Fälligkeitstag nicht zulässig ist, sonst null. */
export function checkCollectionDate(iso: string, today: string = berlinToday()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(toUtcDate(iso).getTime())) {
    return "Bitte einen gültigen Fälligkeitstag wählen.";
  }
  if (iso < earliestCollectionDate(today)) {
    return "Der Fälligkeitstag muss mindestens zwei Geschäftstage in der Zukunft liegen.";
  }
  if (!isSepaBusinessDay(iso)) {
    return "Der Fälligkeitstag muss ein Bankgeschäftstag sein (kein Wochenende, kein Feiertag).";
  }
  if (iso > addDays(today, 365)) {
    return "Der Fälligkeitstag darf höchstens ein Jahr in der Zukunft liegen.";
  }
  return null;
}
