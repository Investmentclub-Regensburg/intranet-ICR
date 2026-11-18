// Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4): reine Stichtag-Logik ohne I/O.
// Stichtage 1.3. und 15.9. (Berliner Datum), je etwa zwei Wochen vor dem Beitragseinzug (Entscheidung 5).
// Auch die Vorstandsübersicht (PR 5, Filter „Nicht bestätigt“) nutzt istBestaetigungOffen.
import { berlinToday } from "./berlin-date";

/** Stichtage im Jahr (Monat 1–12, Tag), aufsteigend. */
export const STICHTAGE: ReadonlyArray<{ monat: number; tag: number }> = [
  { monat: 3, tag: 1 },
  { monat: 9, tag: 15 },
];

const zwei = (n: number) => String(n).padStart(2, "0");

/** Zeitpunkt als Date (Date, ISO-Zeichenkette aus der Datenbank); leer oder ungültig → null. */
export function alsZeitpunkt(wert: unknown): Date | null {
  if (wert instanceof Date) return Number.isNaN(wert.getTime()) ? null : wert;
  if (typeof wert !== "string" || wert.trim() === "") return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Letzter Stichtag (1.3. oder 15.9.) am oder vor dem Berliner Datum von `jetzt`, als YYYY-MM-DD. */
export function letzterStichtag(jetzt: Date = new Date()): string {
  const heute = berlinToday(jetzt);
  const jahr = Number(heute.slice(0, 4));
  for (let j = jahr; j >= jahr - 1; j--) {
    for (let i = STICHTAGE.length - 1; i >= 0; i--) {
      const s = `${j}-${zwei(STICHTAGE[i].monat)}-${zwei(STICHTAGE[i].tag)}`;
      if (s <= heute) return s;
    }
  }
  // Nicht erreichbar (jedes Jahr hat Stichtage); der Typ verlangt eine Rückgabe.
  return `${jahr - 1}-${zwei(STICHTAGE[STICHTAGE.length - 1].monat)}-${zwei(STICHTAGE[STICHTAGE.length - 1].tag)}`;
}

/** Abstand der Berliner Ortszeit zu UTC in Minuten zum Zeitpunkt `instant` (60 = MEZ, 120 = MESZ). */
function berlinOffsetMinuten(instant: Date): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const teil = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? 0);
  const alsUtc = Date.UTC(teil("year"), teil("month") - 1, teil("day"), teil("hour"), teil("minute"), teil("second"));
  const sekunden = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((alsUtc - sekunden) / 60000);
}

/** Beginn (00:00 Uhr Berliner Zeit) des Berliner Datums `ymd` (YYYY-MM-DD) als Zeitpunkt. */
export function berlinTagesbeginn(ymd: string): Date {
  const [j, m, t] = ymd.split("-").map(Number);
  const utc = Date.UTC(j, m - 1, t);
  // Zweimal: Der Abstand am geschätzten Zeitpunkt gilt (Umstellung ist nachts um 2/3 Uhr, nie um Mitternacht).
  let zeit = utc - berlinOffsetMinuten(new Date(utc)) * 60000;
  zeit = utc - berlinOffsetMinuten(new Date(zeit)) * 60000;
  return new Date(zeit);
}

/**
 * Ist eine (neue) Bestätigung offen? Ja, wenn nie bestätigt (leer/ungültig) oder die Bestätigung vor dem
 * letzten Stichtag liegt (Berliner Datum). Sagt nichts über Schalter, Status oder „Später“ (siehe istAbfrageFaellig).
 */
export function istBestaetigungOffen({
  bestaetigtAm,
  jetzt = new Date(),
}: {
  bestaetigtAm: Date | string | null | undefined;
  jetzt?: Date;
}): boolean {
  const zeitpunkt = alsZeitpunkt(bestaetigtAm);
  if (!zeitpunkt) return true;
  return berlinToday(zeitpunkt) < letzterStichtag(jetzt);
}
