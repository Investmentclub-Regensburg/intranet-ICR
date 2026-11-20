// Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4): reine Stichtag-Logik ohne I/O.
// Stichtage 1.3. und 15.9. (Berliner Datum), je etwa zwei Wochen vor dem Beitragseinzug (Entscheidung 5).
// Auch die Vorstandsübersicht (PR 5, Filter „Nicht bestätigt“) nutzt istBestaetigungOffen.
import { berlinToday } from "./berlin-date";
import { DEFAULT_REDIRECT_PATH, safeNextPath } from "./safe-redirect";

export { RUECKKEHR_HEADER } from "./safe-redirect";

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

/**
 * Felder, deren Mängel (`pruefeBestand`, ohne handyLand, Alumni ohne Bankmangel) die Daten „ungültig“ machen:
 * die verschlüsselten Felder ohne BIC (seit 20.11.2026 weder abgefragt noch geprüft, Entscheidung Hannes). Name
 * und E-Mail zählen nicht als Bestandsmangel (gleiche Liste in Abfrage-Fenster, Vorstandsübersicht und
 * Skript-Zählung). Ein Mangel entsteht nur an Pflichtfeldern (`istPflichtImBestand` in lib/member-rules.ts,
 * Klickrunde 20.11.2026): Handy nie, Anschrift nur, wenn sie wegen einer IBAN außerhalb des EWR Pflicht ist.
 * Handy und Anschrift stehen trotzdem in der Liste: für den Querbezug (IBAN ↔ Anschrift), den Hinweis
 * `vorwahl_ergaenzt` und die Zählung ungültiger freiwilliger Angaben im Skript.
 */
export const BESTANDS_FELDER = [
  "iban",
  "geburtsdatum",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "handynummer",
  "land",
] as const;

// ---------------------------------------------------------------------------------------------------
// Fälligkeit und „Später“ (Teil B)
// ---------------------------------------------------------------------------------------------------

/** „Später“ verschiebt die Abfrage um so viele Tage … */
export const SPAETER_TAGE = 7;
/** … höchstens bis so viele Tage nach dem letzten Stichtag bzw. nach dem Einschalten (DATA_CHECK_START). */
export const SPAETER_GRENZE_TAGE = 28;

const TAG_MS = 24 * 60 * 60 * 1000;

/** Kalendertage zu einem Datum YYYY-MM-DD addieren. */
export function plusTage(ymd: string, tage: number): string {
  const [j, m, t] = ymd.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}

/** Gültiges Kalenderdatum YYYY-MM-DD, sonst null (z. B. für DATA_CHECK_START). */
export function alsDatum(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const s = wert.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return plusTage(s, 0) === s ? s : null;
}

export type DatenCheckEinstellungen = {
  /** DATA_CHECK_ENABLED = "true" (sonst ist die Abfrage nie fällig). */
  eingeschaltet: boolean;
  /** DATA_CHECK_START (YYYY-MM-DD, Berliner Datum des Einschaltens) oder null. */
  start: string | null;
};

/** Schalter aus den Umgebungsvariablen (nur genau „true“ schaltet ein). */
export function leseDatenCheckEinstellungen(env: Record<string, string | undefined>): DatenCheckEinstellungen {
  return {
    eingeschaltet: String(env.DATA_CHECK_ENABLED ?? "").trim().toLowerCase() === "true",
    start: alsDatum(env.DATA_CHECK_START),
  };
}

/**
 * Ist die Abfrage für dieses Profil jetzt fällig? Nur bei eingeschaltetem Schalter, aktivem Profil (inkl.
 * Vorstand und Alumni; `aktiv` = isActiveMemberProfile), offener Bestätigung und ohne laufendes „Später“.
 *
 * `pflichtLuecke`: Ein Pflichtfeld im Klartext fehlt (der Studiengang, Pflicht seit 20.11.2026). Dann ist die
 * Abfrage immer fällig, auch nach einer Bestätigung und während „Später“ (bei einem Mangel gibt es kein „Später“).
 * So erreicht die neue Regel auch Mitglieder, die schon bestätigt haben, ohne daten_bestaetigt_am per Migration
 * zurückzusetzen; der Wert steht ohnehin in der Profilzeile, die getCachedAuth liest (keine Entschlüsselung).
 */
export function istAbfrageFaellig({
  eingeschaltet,
  aktiv,
  bestaetigtAm,
  erinnernAb,
  pflichtLuecke = false,
  jetzt = new Date(),
}: {
  eingeschaltet: boolean;
  aktiv: boolean;
  bestaetigtAm: Date | string | null | undefined;
  erinnernAb: Date | string | null | undefined;
  pflichtLuecke?: boolean;
  jetzt?: Date;
}): boolean {
  if (!eingeschaltet || !aktiv) return false;
  if (pflichtLuecke) return true;
  if (!istBestaetigungOffen({ bestaetigtAm, jetzt })) return false;
  const erinnern = alsZeitpunkt(erinnernAb);
  return !erinnern || erinnern.getTime() <= jetzt.getTime();
}

/**
 * Bis wann „Später“ höchstens verschieben darf: 4 Wochen nach dem letzten Stichtag bzw. nach dem Einschalten
 * (`start`), je nachdem, was später liegt (Beginn des Tages, Berliner Zeit).
 */
export function spaeterGrenze({ jetzt = new Date(), start }: { jetzt?: Date; start: string | null }): Date {
  const stichtag = letzterStichtag(jetzt);
  const basis = start && start > stichtag ? start : stichtag;
  return berlinTagesbeginn(plusTage(basis, SPAETER_GRENZE_TAGE));
}

/**
 * Neuer Wert für daten_erinnern_ab nach „Später“: jetzt + 7 Tage, höchstens bis zur Grenze. null = „Später“ geht
 * nicht mehr (Grenze erreicht). Ob die Daten gültig sind, prüft der Aufrufer (bei Mängeln nie „Später“).
 */
export function spaeterBis({ jetzt = new Date(), start }: { jetzt?: Date; start: string | null }): Date | null {
  const grenze = spaeterGrenze({ jetzt, start });
  if (grenze.getTime() <= jetzt.getTime()) return null;
  return new Date(Math.min(jetzt.getTime() + SPAETER_TAGE * TAG_MS, grenze.getTime()));
}

// ---------------------------------------------------------------------------------------------------
// Anzeige im Fenster (vom Server berechnet, an die Client-Komponente gegeben)
// ---------------------------------------------------------------------------------------------------

export type DatenCheckZeilenSchluessel =
  | "name"
  | "anschrift"
  | "handy"
  | "email"
  | "iban"
  | "geburtsdatum"
  | "studiengang";

export type DatenCheckZeile = {
  key: DatenCheckZeilenSchluessel;
  label: string;
  /** Anzeige in Zeilen (z. B. Anschrift: Straße, Ort, Land); leer = nichts gespeichert („Fehlt“ bzw. „Keine Angabe“). */
  wert: string[];
  /** Mangel: eine Zeile Hinweis (blockiert). */
  fehler?: string;
  /** Hinweis (blockiert nicht), z. B. ergänzte Vorwahl. */
  hinweis?: string;
};

/** Ausgangswerte des Formulars „Ändern“ (eigene Daten, wie im Profil). */
export type DatenCheckFormular = {
  vorname: string;
  nachname: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  land: string;
  handyLand: string;
  handyNummer: string;
  geburtsdatum: string;
  /** Studiengang als Auswahl (auswahlAusWert): Listenname, „Sonstiges“ oder leer. */
  studiengang: string;
  /** Freitext bei „Sonstiges“. */
  studiengangSonstiges: string;
  iban: string;
  alumni: boolean;
  /** Version der verschlüsselten Zeile (0 = keine): Sperre beim Speichern. */
  version: number;
  /** Ohne Spalte land gelesen (Übergang): Land wird nicht gespeichert. */
  landUnbekannt: boolean;
};

export type DatenCheckAnsicht = {
  zeilen: DatenCheckZeile[];
  /** Keine Mängel: „Stimmt alles“ (und ggf. „Später“) möglich. */
  gueltig: boolean;
  spaeterErlaubt: boolean;
  formular: DatenCheckFormular;
  /** Mängel je Formularfeld (beim Wechsel zu „Ändern“ gleich am Feld). */
  formularFehler: Partial<Record<string, string>>;
};

/**
 * Eigene Seite der Abfrage (außerhalb des Intranet-Layouts, ohne Seitenleiste, in middleware.ts geschützt). Seit der
 * Design-Runde 19.11.2026 für jede fällige Abfrage, auch bei gültigen Daten (vorher: Fenster über der Seite).
 */
export const DATEN_CHECK_PFAD = "/daten-bestaetigen";

/** Nach der Abfrage ohne gültiges Ziel. */
export const RUECKKEHR_STANDARD = DEFAULT_REDIRECT_PATH;

/**
 * Wohin es nach der Abfrage geht: ein sicherer relativer Pfad (`safeNextPath`), nie die Abfrage selbst (sonst
 * Schleife), sonst das Dashboard.
 */
export function rueckkehrZiel(wert: unknown): string {
  const pfad = safeNextPath(wert);
  if (!pfad) return RUECKKEHR_STANDARD;
  const ohneQuery = pfad.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "");
  if (ohneQuery === DATEN_CHECK_PFAD) return RUECKKEHR_STANDARD;
  return pfad;
}

/** Adresse der Abfrage mit Rückkehrziel (`?weiter=`, beim Standardziel ohne). */
export function datenCheckAdresse(rueckkehr: unknown): string {
  const ziel = rueckkehrZiel(rueckkehr);
  return ziel === RUECKKEHR_STANDARD ? DATEN_CHECK_PFAD : `${DATEN_CHECK_PFAD}?weiter=${encodeURIComponent(ziel)}`;
}
