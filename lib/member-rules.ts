/**
 * Regeln für Mitgliederdaten (Paket „Mitgliederdaten“, PR 1) – EINE Quelle für Registrierung, Profil,
 * Vorstandskorrektur, Abfrage „Stimmen deine Daten noch?“, Vorstandsübersicht und Bereinigungsskript.
 *
 * Rein und ohne I/O: keine Datenbank, keine Umgebungsvariablen, keine Logs. Läuft auf dem Server und in
 * Node-Skripten (`--import ./scripts/lib/ts-paths.mjs`), NICHT im Browser: Die Handy-Typprüfung („ist das
 * eine Mobilnummer?“) braucht die vollständigen Metadaten `libphonenumber-js/max` (zu groß fürs Bundle),
 * und `normalizeIban` kommt aus lib/member-crypto (node:crypto). Eingabehilfen für den Browser liegen in
 * lib/member-rules-client.ts (nur `libphonenumber-js/min`). Die Grenze sichert `import "server-only"`
 * und ein Test (tests/member-rules.test.mjs).
 *
 * Jede Feldregel liefert `{ wert, fehler, code, hinweis? }`:
 *   wert    normalisierter Wert (genau dieser wird gespeichert und geprüft)
 *   fehler  null oder kurze Meldung (Du-Form), ohne den eingegebenen Wert
 *   code    null oder stabiler Mängel-Code (siehe `MangelCode`) – blockiert
 *   hinweis optionaler Hinweis-Code (siehe `HinweisCode`) – blockiert NICHT
 * Ob ein leeres Feld ein Mangel ist, entscheidet die Regel selbst über den Kontext (`istPflicht`).
 * Eingaben, die keine Zeichenkette sind (z. B. eine Datei aus FormData), sind immer `format`, nie „leer“;
 * nur `null`/`undefined` gelten als leer.
 */
import "server-only";
import { parsePhoneNumberFromString, isSupportedCountry, type CountryCode as PhoneCountry } from "libphonenumber-js/max";
import { normalizeIban } from "./member-crypto";
import { SEPA_IBAN_LENGTHS, checkSepaIban } from "./iban";
import { FIELD_LIMITS, checkText } from "./member-fields";
import { isValidEmail } from "./events";
import { berlinToday } from "./berlin-date";
import { DEFAULT_COUNTRY, findCountry } from "./country-codes";

// ---------------------------------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------------------------------

/** Felder der Mitgliederdaten. `land` = Land der Anschrift (ISO-Code). */
export type Feld =
  | "vorname"
  | "nachname"
  | "email"
  | "strasse"
  | "hausnummer"
  | "plz"
  | "ort"
  | "land"
  | "handynummer"
  | "iban"
  | "bic"
  | "geburtsdatum";

/**
 * Stabile Mängel-Codes (Vorstandsübersicht, Abfrage-Fenster, Skript-Zählungen). Nicht umbenennen.
 *   fehlt                  Pflichtfeld leer
 *   format                 Wert passt nicht zum Muster (Datum, PLZ, Hausnummer, BIC, Name, E-Mail, Handy,
 *                          IBAN-Aufbau) oder ist keine Zeichenkette
 *   zu_lang                länger als FIELD_LIMITS
 *   zeichen                Steuerzeichen, Formelanfang (= + - @) oder Format-Zeichen (Cf: Zero-Width, Bidi …)
 *   keine_buchstaben       Straße/Ort ohne Buchstaben
 *   hausnummer_in_strasse  Straße endet auf eine Hausnummer, Hausnummer leer
 *   ziffern                Ziffern im Ort (Deutschland)
 *   land_unbekannt         Land nicht in lib/country-codes
 *   kein_mobil             Handy: Festnetz o. Ä. (in Deutschland nur Mobilnummern)
 *   nicht_sepa             IBAN aus einem Land außerhalb des SEPA-Raums
 *   laenge                 IBAN-Länge passt nicht zum Land
 *   pruefziffer            IBAN-Prüfsumme (mod 97) falsch
 *   zukunft                Geburtsdatum heute oder später
 *   zu_alt                 Geburtsdatum mehr als 120 Jahre her
 */
export type MangelCode =
  | "fehlt"
  | "format"
  | "zu_lang"
  | "zeichen"
  | "keine_buchstaben"
  | "hausnummer_in_strasse"
  | "ziffern"
  | "land_unbekannt"
  | "kein_mobil"
  | "nicht_sepa"
  | "laenge"
  | "pruefziffer"
  | "zukunft"
  | "zu_alt";

export const MANGEL_CODES: readonly MangelCode[] = [
  "fehlt",
  "format",
  "zu_lang",
  "zeichen",
  "keine_buchstaben",
  "hausnummer_in_strasse",
  "ziffern",
  "land_unbekannt",
  "kein_mobil",
  "nicht_sepa",
  "laenge",
  "pruefziffer",
  "zukunft",
  "zu_alt",
];

/**
 * Stabile Hinweis-Codes (blockieren nie; Skript zählt sie, das Abfrage-Fenster zeigt sie am Feld).
 *   vorwahl_ergaenzt  Handy wurde nur per Annahme „deutsche Nummer“ zu E.164 (ohne Vorwahl und ohne 0, oder
 *                     „+49“ direkt vor 15x/16x/17x aus der alten Vorauswahl). Nur `pruefeBestand` ohne
 *                     gewähltes Handy-Land, nie im Formular. „Stimmt alles“ bestätigt ihn.
 *   bic_land          BIC-Land (Stellen 5–6) weicht vom Land der IBAN ab (z. B. Neobanken). Kein Fehler.
 */
export type HinweisCode = "vorwahl_ergaenzt" | "bic_land";
export const HINWEIS_CODES: readonly HinweisCode[] = ["vorwahl_ergaenzt", "bic_land"];

export type Mangel = { feld: Feld; code: MangelCode };
export type Hinweis = { feld: Feld; code: HinweisCode };

export type RegelErgebnis = {
  wert: string;
  fehler: string | null;
  code: MangelCode | null;
  hinweis?: HinweisCode;
};

/**
 * Wer prüft:
 *   registrierung  neuer Antrag (alle Pflichtfelder, IBAN Pflicht)
 *   mitglied       Profil / Abfrage-Fenster (Pflichtfelder nicht leerbar; IBAN außer bei Alumni)
 *   vorstand       Korrektur: nichts außer Geburtsdatum, Name, E-Mail ist Pflicht, Auslands-PLZ locker
 */
export type Wer = "mitglied" | "vorstand" | "registrierung";

export type Kontext = {
  /** Alumni zahlen keinen Beitrag: IBAN optional (wenn angegeben, wird sie geprüft). `isAlumniProfile`. */
  alumni: boolean;
  wer: Wer;
  /** Heutiges Datum YYYY-MM-DD (nur für Tests); Standard: Berliner Datum. */
  heute?: string;
};

/** Eingabe für die Gesamtprüfung. `undefined` bei vorname/nachname/email = nicht prüfen. */
export type Mitgliederdaten = Partial<Record<Feld, unknown>> & {
  /** Land der Handynummer (ISO), Standard DE. Eine Nummer mit +Vorwahl bestimmt ihr Land selbst. */
  handyLand?: unknown;
};

/** Felder, die die Gesamtprüfung immer prüft (Reihenfolge = Reihenfolge der Meldungen). */
export const STAMMFELDER: readonly Feld[] = [
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "land",
  "handynummer",
  "iban",
  "bic",
  "geburtsdatum",
];
/** Felder, die nur geprüft werden, wenn sie übergeben werden (nicht `undefined`). */
export const ZUSATZFELDER: readonly Feld[] = ["vorname", "nachname", "email"];

/** Alle Felder in Meldungsreihenfolge. */
const FELD_REIHENFOLGE: readonly Feld[] = [...ZUSATZFELDER, ...STAMMFELDER];
/** Alle Schlüssel, die aus fremden Objekten übernommen werden (Rest wird ignoriert, auch `__proto__`). */
const BEKANNTE_SCHLUESSEL: readonly string[] = [...FELD_REIHENFOLGE, "handyLand"];

// ---------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------

const OK = (wert: string, hinweis?: HinweisCode): RegelErgebnis =>
  hinweis ? { wert, fehler: null, code: null, hinweis } : { wert, fehler: null, code: null };
const MANGEL = (wert: string, code: MangelCode, fehler: string): RegelErgebnis => ({ wert, fehler, code });
const KEIN_TEXT = (): RegelErgebnis => MANGEL("", "format", "Ungültige Eingabe.");

/** Zeichenkette oder leer (`null`/`undefined`); alles andere → null (= Fehler `format`). */
function alsText(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return null;
}

/** Für Querbezüge (z. B. IBAN bei der BIC): Nicht-Strings zählen als leer, ihr eigenes Feld meldet sie. */
function textOderLeer(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Alle Format-Zeichen (Unicode-Kategorie Cf): Zero-Width, Bidi, weiches Trennzeichen, BOM, Tags … */
const UNSICHTBAR = /\p{Cf}/u;
/** Leerraum außer U+FEFF (der zählt als unsichtbares Zeichen und wird gemeldet, nicht geschluckt). */
const LEERRAUM = /[^\S\p{Cf}]+/gu;

/** NFC, außen trimmen, Leerraum (auch Tab/Zeilenumbruch) zu einem Leerzeichen zusammenfassen. */
export function normalisiereText(eingabe: unknown): string {
  return ohneHarmloseZeichen(textOderLeer(eingabe))
    .replace(BINDESTRICHE, "-")
    .normalize("NFC")
    .trim()
    .replace(LEERRAUM, " ");
}

/** Zeichenklasse aus Codepunkten bauen (so stehen keine unsichtbaren Zeichen im Quelltext). */
function zeichenklasse(codepunkte: readonly number[]): RegExp {
  return new RegExp(`[${codepunkte.map((c) => String.fromCodePoint(c)).join("")}]`, "gu");
}

/**
 * Harmlose Format-Zeichen aus Copy-and-paste, die still entfernt werden (Abschlussrunde H1): weiches
 * Trennzeichen U+00AD, Zero-Width Space U+200B, LRM/RLM U+200E/U+200F, Word Joiner U+2060, BOM U+FEFF.
 * Alle übrigen Format-Zeichen (Bidi-Embedding/Override/Isolates usw.) meldet `textMangel` als `zeichen`.
 */
const HARMLOSE_ZEICHEN = zeichenklasse([0x00ad, 0x200b, 0x200e, 0x200f, 0x2060, 0xfeff]);
/** Bindestrich U+2010 und geschützter Bindestrich U+2011 → „-“ (Abschlussrunde M4). */
const BINDESTRICHE = zeichenklasse([0x2010, 0x2011]);

function ohneHarmloseZeichen(text: string): string {
  return text.replace(HARMLOSE_ZEICHEN, "");
}

/** Land der Anschrift: leer → DE (Altdaten haben kein Land). */
function landOderStandard(land: unknown): string {
  const roh = normalisiereText(land).toUpperCase();
  return roh || DEFAULT_COUNTRY;
}

const LEER_MELDUNG: Record<Feld, string> = {
  vorname: "Bitte trag den Vornamen ein.",
  nachname: "Bitte trag den Nachnamen ein.",
  email: "Bitte trag die E-Mail-Adresse ein.",
  strasse: "Bitte trag die Straße ein.",
  hausnummer: "Bitte trag die Hausnummer ein.",
  plz: "Bitte trag die PLZ ein.",
  ort: "Bitte trag den Ort ein.",
  land: "Bitte wähl ein Land.",
  handynummer: "Bitte trag deine Handynummer ein.",
  iban: "Bitte trag deine IBAN ein.",
  bic: "Bitte trag die BIC ein.",
  geburtsdatum: "Bitte trag dein Geburtsdatum ein.",
};

/**
 * Ist das Feld Pflicht?
 *   immer:            Geburtsdatum, Vorname, Nachname, E-Mail (auch der Vorstand darf sie nicht leeren)
 *   Vorstand:         sonst nichts (er darf leeren)
 *   Mitglied/Antrag:  alles außer BIC; IBAN nicht für Alumni; Hausnummer nur in DE; PLZ nur in Ländern mit
 *                     PLZ-Muster (sonst gibt es evtl. keine Postleitzahl)
 */
export function istPflicht(feld: Feld, kontext: Kontext, land: unknown = DEFAULT_COUNTRY): boolean {
  if (feld === "geburtsdatum" || feld === "vorname" || feld === "nachname" || feld === "email") return true;
  if (kontext.wer === "vorstand") return false;
  if (feld === "bic") return false;
  if (feld === "iban") return kontext.alumni !== true; // nur echtes `true` macht zum Alumnus (G4)
  if (feld === "hausnummer") return landOderStandard(land) === "DE";
  if (feld === "plz") return Object.prototype.hasOwnProperty.call(PLZ_MUSTER, landOderStandard(land));
  return true;
}

function leer(feld: Feld, kontext: Kontext, land?: unknown): RegelErgebnis {
  if (!istPflicht(feld, kontext, land)) return OK("");
  if (feld === "geburtsdatum" && kontext.wer === "vorstand") {
    return MANGEL("", "fehlt", "Das Geburtsdatum kann nicht gelöscht werden. Bitte ein vollständiges Datum eingeben.");
  }
  return MANGEL("", "fehlt", LEER_MELDUNG[feld]);
}

/** Unsichtbare Zeichen, dann checkText (Länge, Steuerzeichen, Formelanfang) – mit Code. */
function textMangel(wert: string, label: string, max: number): RegelErgebnis | null {
  if (UNSICHTBAR.test(wert)) return MANGEL(wert, "zeichen", `${label} enthält unsichtbare Zeichen.`);
  const fehler = checkText(wert, label, max);
  if (!fehler) return null;
  return MANGEL(wert, wert.length > max ? "zu_lang" : "zeichen", fehler);
}

const BUCHSTABE = /\p{L}/u;

// ---------------------------------------------------------------------------------------------------
// Handy
// ---------------------------------------------------------------------------------------------------

/** Erlaubte Zeichen im Handyfeld vor der Prüfung (Ziffern, +, Klammern, Trenner). */
const HANDY_ZEICHEN = /^[0-9+()\-/.\s]+$/;
const HANDY_TRENNER = /[\s()\-/.]/g;
const HANDY_MAX_EINGABE = FIELD_LIMITS.telefon;
/** Außerhalb Deutschlands erlaubte Typen; `undefined` = Metadaten kennen den Typ nicht. */
const HANDY_TYPEN_AUSLAND = new Set<string | undefined>(["MOBILE", "FIXED_LINE_OR_MOBILE", undefined]);

export type HandyErgebnis = RegelErgebnis & {
  /** Land der Nummer (ISO) laut Metadaten; folgt der Nummer, nicht der Auswahl (+43 bei Auswahl DE → AT). */
  land: string | null;
};

/**
 * Wurde die Nummer nur per Annahme „deutsch“ zu E.164? Ohne Vorwahl und ohne 0 (`176 1234…`) oder „+49“
 * direkt vor der Nummer ohne 0 (`+49 151…`, typisch aus der alten Vorauswahl der Registrierung), solange
 * die Eingabe nicht schon genau die E.164-Form ist. Chinesische Mobilnummern sehen genauso aus.
 * Deckt sich mit `repariereHandy` → „vorschlag“ für deutsche Nummern.
 */
function vorwahlNurAngenommen(roh: string, e164: string): boolean {
  const t = roh.trim();
  if (t === e164) return false;
  const kompakt = t.replace(HANDY_TRENNER, "");
  return /^[1-9]/.test(kompakt) || /^\+49[1-9]/.test(kompakt);
}

/**
 * Handynummer: Land (ISO, Standard DE) + Nummer → E.164 (`+491761234567`).
 * DE: nur Mobilnummern. Andere Länder: gültig nach Metadaten, Typ Mobil, Mobil-oder-Festnetz oder unbekannt.
 * Pflicht außer für den Vorstand. Liefert keinen Hinweis (`vorwahl_ergaenzt` setzt nur `pruefeBestand`).
 */
export function pruefeHandy(eingabe: unknown, land: unknown, kontext: Kontext): HandyErgebnis {
  const text = alsText(eingabe);
  if (text === null) return { ...KEIN_TEXT(), land: null };
  const roh = ohneHarmloseZeichen(text).trim(); // Kurzprüfung K3
  if (!roh) return { ...leer("handynummer", kontext), land: null };
  const fehlerFormat = (): HandyErgebnis => ({
    ...MANGEL(roh, "format", "Die Nummer stimmt so nicht. Vertippt?"),
    land: null,
  });
  if (roh.length > HANDY_MAX_EINGABE || !HANDY_ZEICHEN.test(roh)) return fehlerFormat();

  const auswahl = landOderStandard(land);
  // Land erst gegen die Länderliste prüfen; Unbekanntes → DE.
  const standard = (findCountry(auswahl) && isSupportedCountry(auswahl) ? auswahl : DEFAULT_COUNTRY) as PhoneCountry;
  // „0049 …“ wie „+49 …“; „+49 (0)176“ und „+49 0176“ versteht libphonenumber selbst.
  const bereinigt = roh.replace(/^00/, "+");
  const nummer = parsePhoneNumberFromString(bereinigt, standard);
  if (!nummer || !nummer.isValid()) return fehlerFormat();

  const nummernLand = nummer.country ?? null;
  const typ = nummer.getType();
  if (nummernLand === "DE" || nummer.countryCallingCode === "49") {
    if (typ !== "MOBILE") {
      const fehler =
        typ === "FIXED_LINE"
          ? "Das ist eine Festnetznummer. Bitte deine Handynummer."
          : "Bitte deine Handynummer.";
      return { ...MANGEL(roh, "kein_mobil", fehler), land: "DE" };
    }
    return { ...OK(nummer.number), land: "DE" };
  }
  if (!HANDY_TYPEN_AUSLAND.has(typ)) {
    return { ...MANGEL(roh, "kein_mobil", "Bitte deine Handynummer."), land: nummernLand };
  }
  return { ...OK(nummer.number), land: nummernLand };
}

/** Anzeige einer gespeicherten Nummer international (`+49 176 1234567`); Unlesbares bleibt, wie es ist. */
export function formatiereHandyAnzeige(e164: unknown): string {
  const roh = textOderLeer(e164).trim();
  if (!roh) return "";
  const nummer = parsePhoneNumberFromString(roh.replace(/^00/, "+"), DEFAULT_COUNTRY as PhoneCountry);
  return nummer ? nummer.formatInternational() : roh;
}

// ---------------------------------------------------------------------------------------------------
// IBAN / BIC
// ---------------------------------------------------------------------------------------------------

/** IBAN: `normalizeIban`, nur SEPA, Länge je Land, BBAN-Aufbau DE/AT, mod 97. Pflicht außer Alumni/Vorstand. */
export function pruefeIban(eingabeIban: unknown, kontext: Kontext): RegelErgebnis {
  const text = alsText(eingabeIban);
  if (text === null) return KEIN_TEXT();
  const wert = normalizeIban(text);
  if (!wert) return leer("iban", kontext);
  switch (checkSepaIban(wert)) {
    case "ok":
      return OK(wert);
    case "nicht_sepa":
      return MANGEL(wert, "nicht_sepa", "Nur Konten aus dem SEPA-Raum.");
    case "laenge": {
      const land = wert.slice(0, 2);
      const name = findCountry(land)?.name ?? land;
      return MANGEL(wert, "laenge", `Eine IBAN aus ${name} hat ${SEPA_IBAN_LENGTHS[land]} Stellen.`);
    }
    case "pruefziffer":
      return MANGEL(wert, "pruefziffer", "Prüfziffer passt nicht. Vertippt?");
    default:
      return MANGEL(wert, "format", "Das ist keine gültige IBAN.");
  }
}

/**
 * BIC-Länder, die zu einem IBAN-Land gehören, obwohl der Code abweicht (Gebiete ohne eigenes IBAN-Präfix):
 * GB-IBAN bei Banken auf Jersey/Guernsey/Isle of Man, FR-IBAN in Überseegebieten, FI-IBAN auf Åland.
 */
const BIC_LAENDER_ZU_IBAN: Readonly<Record<string, readonly string[]>> = {
  GB: ["GB", "JE", "GG", "IM"],
  FR: ["FR", "GF", "GP", "MQ", "RE", "YT", "PM", "BL", "MF", "NC", "PF", "WF"],
  FI: ["FI", "AX"],
};

/** BIC normalisieren: Großbuchstaben, ohne Leerzeichen. */
export function normalisiereBic(eingabeBic: unknown): string {
  return ohneHarmloseZeichen(textOderLeer(eingabeBic)).replace(/\s/g, "").toUpperCase();
}

/**
 * BIC: optional für alle. Wenn angegeben: 8 oder 11 Zeichen (sonst Mangel `format`). Weicht das BIC-Land
 * (Stellen 5–6) vom Land einer GÜLTIGEN IBAN ab, ist das nur der Hinweis `bic_land` (Neobanken wie N26
 * vergeben ausländische IBANs mit deutscher BIC); gegen eine ungültige IBAN wird nicht abgeglichen.
 */
export function pruefeBic(eingabeBic: unknown, iban: unknown, kontext: Kontext): RegelErgebnis {
  const text = alsText(eingabeBic);
  if (text === null) return KEIN_TEXT();
  const wert = normalisiereBic(text);
  if (!wert) return leer("bic", kontext);
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(wert)) {
    return MANGEL(wert, "format", "Die BIC hat 8 oder 11 Zeichen.");
  }
  const ibanWert = normalizeIban(textOderLeer(iban));
  if (checkSepaIban(ibanWert) === "ok") {
    const ibanLand = ibanWert.slice(0, 2);
    const erlaubt = BIC_LAENDER_ZU_IBAN[ibanLand] ?? [ibanLand];
    if (!erlaubt.includes(wert.slice(4, 6))) return OK(wert, "bic_land");
  }
  return OK(wert);
}

// ---------------------------------------------------------------------------------------------------
// Anschrift
// ---------------------------------------------------------------------------------------------------

/**
 * Hausnummer in Deutschland: Ziffer zuerst, z. B. 12, 12a, 12 b, 12-14, 3/1, 12a-12c, 12 1/2, 12½, 12a-c,
 * 12a/b. Gedankenstriche werden vorher zu „-“ normalisiert.
 */
const HAUSNUMMER_KERN = String.raw`\d+(?: ?[A-Za-z])?(?: ?(?:1/2|½))?(?: ?[-/] ?(?:\d+(?: ?[A-Za-z])?|[A-Za-z]))?`;
const HAUSNUMMER_DE = new RegExp(`^${HAUSNUMMER_KERN}$`);
/** Hausnummer am Ende der Straße (nach Leerzeichen, Punkt oder Komma). Gruppe 1 = Hausnummer. */
const HAUSNUMMER_AM_ENDE = new RegExp(`(?:^|[\\s.,])(${HAUSNUMMER_KERN})$`);
/** Gedankenstrich, Halbgeviertstrich, geschützter Bindestrich u. Ä. → „-“. */
const STRICHE = /[\p{Pd}\u2212]/gu;

/**
 * PLZ-Muster je Land (nach Normalisierung: Großbuchstaben, ein Leerzeichen, Länderpräfix entfernt). Quelle:
 * Wikipedia „List of postal codes“ (abgerufen 18.11.2026). In diesen Ländern ist die PLZ Pflicht; andere
 * Länder: optional, lockere Regel (3–10 Zeichen, siehe PLZ_LOCKER).
 */
const PLZ_MUSTER: Readonly<Record<string, RegExp>> = {
  DE: /^\d{5}$/,
  AT: /^\d{4}$/,
  CH: /^\d{4}$/,
  LI: /^94\d{2}$/,
  LU: /^\d{4}$/,
  BE: /^\d{4}$/,
  NL: /^\d{4} ?[A-Z]{2}$/,
  DK: /^\d{4}$/,
  NO: /^\d{4}$/,
  SE: /^\d{3} ?\d{2}$/,
  FI: /^\d{5}$/,
  IS: /^\d{3}$/,
  FR: /^\d{5}$/,
  MC: /^980\d{2}$/,
  IT: /^\d{5}$/,
  SM: /^4789\d$/,
  ES: /^\d{5}$/,
  PT: /^\d{4}-\d{3}$/,
  PL: /^\d{2}-\d{3}$/,
  CZ: /^\d{3} ?\d{2}$/,
  SK: /^\d{3} ?\d{2}$/,
  HU: /^\d{4}$/,
  SI: /^\d{4}$/,
  HR: /^\d{5}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/,
  RO: /^\d{6}$/,
  BG: /^\d{4}$/,
  GR: /^\d{3} ?\d{2}$/,
  CY: /^\d{4}$/,
  MT: /^[A-Z]{3} ?\d{4}$/,
  EE: /^\d{5}$/,
  LV: /^\d{4}$/,
  LT: /^\d{5}$/,
};
/** Bisherige Regel (lib/member-fields.ts `checkPlz`): 3–10 Zeichen, Buchstaben/Ziffern/Leerzeichen/Bindestrich. */
const PLZ_LOCKER = /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/;
/** Übliche Länderpräfixe vor der PLZ (Kfz-Kennzeichen), zusätzlich zum ISO-Code selbst: `D-93047`, `A-1010`. */
const PLZ_PRAEFIXE: Readonly<Record<string, readonly string[]>> = {
  DE: ["D"],
  AT: ["A"],
  LI: ["FL"],
  LU: ["L"],
  BE: ["B"],
  NO: ["N"],
  SE: ["S"],
  FI: ["FIN"],
  FR: ["F"],
  IT: ["I"],
  ES: ["E"],
  PT: ["P"],
  HU: ["H"],
  SI: ["SLO"],
};

/** Präfix des gewählten Landes vor der PLZ entfernen (`D-93047` → `93047`, `CH-8001` → `8001`). */
function ohneLaenderpraefix(plz: string, land: string): string {
  // Nur für Länder aus der Liste (Aufrufer prüft vorher) und ohne dynamischen RegExp: das Land kommt aus
  // dem Formular und könnte sonst Regex-Syntax einschleusen (Absturz, ReDoS).
  if (!findCountry(land)) return plz;
  for (const praefix of [land, ...(PLZ_PRAEFIXE[land] ?? [])]) {
    if (!plz.startsWith(praefix)) continue;
    const rest = plz.slice(praefix.length).trimStart();
    if (rest.startsWith("-")) return rest.slice(1).trimStart();
  }
  return plz;
}

/** Land der Anschrift (ISO-Code aus lib/country-codes); leer = Deutschland. */
export function pruefeLand(eingabeLand: unknown): RegelErgebnis {
  if (alsText(eingabeLand) === null) return KEIN_TEXT();
  const wert = landOderStandard(eingabeLand);
  return findCountry(wert) ? OK(wert) : MANGEL(wert, "land_unbekannt", "Bitte wähl ein Land aus der Liste.");
}

/** Straße: Buchstaben Pflicht; endet sie auf eine Hausnummer und ist die Hausnummer leer → Mangel. */
export function pruefeStrasse(eingabeStrasse: unknown, hausnummer: unknown, kontext: Kontext): RegelErgebnis {
  if (alsText(eingabeStrasse) === null) return KEIN_TEXT();
  const wert = normalisiereText(eingabeStrasse);
  if (!wert) return leer("strasse", kontext);
  const text = textMangel(wert, "Straße", FIELD_LIMITS.strasse);
  if (text) return text;
  if (!BUCHSTABE.test(wert)) return MANGEL(wert, "keine_buchstaben", "Die Straße braucht Buchstaben.");
  if (!normalisiereText(hausnummer) && HAUSNUMMER_AM_ENDE.test(wert.replace(STRICHE, "-"))) {
    return MANGEL(wert, "hausnummer_in_strasse", "Hausnummer bitte ins eigene Feld.");
  }
  return OK(wert);
}

/** Hausnummer: in DE Pflicht und Ziffer zuerst; sonst optional, nur checkText. Striche → „-“. */
export function pruefeHausnummer(eingabeHausnummer: unknown, land: unknown, kontext: Kontext): RegelErgebnis {
  if (alsText(eingabeHausnummer) === null) return KEIN_TEXT();
  const wert = normalisiereText(eingabeHausnummer).replace(STRICHE, "-");
  const l = landOderStandard(land);
  if (!wert) return leer("hausnummer", kontext, l);
  const text = textMangel(wert, "Hausnummer", FIELD_LIMITS.hausnummer);
  if (text) return text;
  if (l === "DE" && !HAUSNUMMER_DE.test(wert)) {
    return MANGEL(wert, "format", "Die Hausnummer beginnt mit einer Ziffer, z. B. 12a.");
  }
  return OK(wert);
}

/**
 * PLZ: Länderpräfix (`D-`, `A-`, `CH-` …) wird entfernt. DE genau 5 Ziffern; Länder aus PLZ_MUSTER nach
 * Muster (dort Pflicht); sonst optional mit lockerer Regel. Der Vorstand trägt Auslandsadressen immer mit
 * der lockeren Regel ein.
 */
export function pruefePlz(eingabePlz: unknown, land: unknown, kontext: Kontext): RegelErgebnis {
  if (alsText(eingabePlz) === null) return KEIN_TEXT();
  const roh = normalisiereText(eingabePlz).toUpperCase();
  // Länge, Steuer-/Format-Zeichen und Formelanfang immer zuerst (Kurzprüfung K1) – auch bei unbekanntem Land.
  const textRoh = roh ? textMangel(roh, "PLZ", FIELD_LIMITS.plz) : null;
  if (textRoh) return textRoh;
  // Unbekanntes Land: Muster und Pflicht entfallen; den Mangel `land_unbekannt` trägt nur das Feld `land`
  // (Abschlussrunde H2/M2). Speichern blockiert dann ohnehin das Land.
  const l = landOderStandard(land);
  if (!findCountry(l)) return OK(roh);
  const wert = ohneLaenderpraefix(roh, l);
  if (!wert) return leer("plz", kontext, l);
  const text = textMangel(wert, "PLZ", FIELD_LIMITS.plz);
  if (text) return text;
  if (l === "DE") {
    return /^\d{5}$/.test(wert) ? OK(wert) : MANGEL(wert, "format", "Die PLZ hat 5 Ziffern.");
  }
  const muster = kontext.wer === "vorstand" ? undefined : PLZ_MUSTER[l];
  if (muster) {
    const name = findCountry(l)?.name ?? l;
    return muster.test(wert) ? OK(wert) : MANGEL(wert, "format", `Die PLZ passt nicht zu ${name}.`);
  }
  return PLZ_LOCKER.test(wert) ? OK(wert) : MANGEL(wert, "format", "Bitte trag eine gültige PLZ ein.");
}

/** Ort: Buchstaben Pflicht; in DE keine Ziffern (`Neumarkt i.d.OPf.` ist gültig). */
export function pruefeOrt(eingabeOrt: unknown, land: unknown, kontext: Kontext): RegelErgebnis {
  if (alsText(eingabeOrt) === null) return KEIN_TEXT();
  const wert = normalisiereText(eingabeOrt);
  const l = landOderStandard(land);
  if (!wert) return leer("ort", kontext, l);
  const text = textMangel(wert, "Ort", FIELD_LIMITS.ort);
  if (text) return text;
  if (!BUCHSTABE.test(wert)) return MANGEL(wert, "keine_buchstaben", "Der Ort braucht Buchstaben.");
  if (l === "DE" && /\d/.test(wert)) return MANGEL(wert, "ziffern", "Im Ort stehen keine Ziffern.");
  return OK(wert);
}

// ---------------------------------------------------------------------------------------------------
// Geburtsdatum, Name, E-Mail
// ---------------------------------------------------------------------------------------------------

export const HOECHSTALTER = 120;

/**
 * Geburtsdatum: Pflicht (auch für den Vorstand nicht leerbar). Echtes Kalenderdatum YYYY-MM-DD, vor heute
 * (Berliner Datum) und höchstens 120 Jahre alt. Kein Mindestalter.
 */
export function pruefeGeburtsdatum(eingabeDatum: unknown, kontext: Kontext): RegelErgebnis {
  const text = alsText(eingabeDatum);
  if (text === null) return KEIN_TEXT();
  const wert = ohneHarmloseZeichen(text).trim(); // Kurzprüfung K3
  if (!wert) return leer("geburtsdatum", kontext);
  const formatFehler = MANGEL(wert, "format", "Bitte wähl ein gültiges Datum.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return formatFehler;
  const datum = new Date(`${wert}T00:00:00Z`);
  // Ungültige Tage wie 2005-02-29 rollt Date in den Folgemonat – das muss auffallen.
  if (isNaN(datum.getTime()) || datum.toISOString().slice(0, 10) !== wert) return formatFehler;

  const heute = kontext.heute ?? berlinToday();
  if (wert >= heute) return MANGEL(wert, "zukunft", "Das Geburtsdatum muss in der Vergangenheit liegen.");
  const alter = Number(heute.slice(0, 4)) - Number(wert.slice(0, 4)) - (heute.slice(5) < wert.slice(5) ? 1 : 0);
  if (alter > HOECHSTALTER) return MANGEL(wert, "zu_alt", "Das Geburtsdatum liegt zu weit zurück.");
  return OK(wert);
}

/** Name: Buchstaben inkl. Akzente, Leerzeichen, - ' ’ und Punkt; 1–100 Zeichen, keine Ziffern. */
const NAME_ZEICHEN = /^[\p{L}\p{M} '’.-]+$/u;

/** Name (nur der Vorstand ändert ihn): nie leer, auch nicht für den Vorstand. */
export function pruefeName(eingabeName: unknown, feld: "vorname" | "nachname"): RegelErgebnis {
  if (alsText(eingabeName) === null) return KEIN_TEXT();
  const wert = normalisiereText(eingabeName);
  if (!wert) return MANGEL("", "fehlt", LEER_MELDUNG[feld]);
  const text = textMangel(wert, feld === "vorname" ? "Vorname" : "Nachname", FIELD_LIMITS.name);
  if (text) return text;
  if (!NAME_ZEICHEN.test(wert) || !BUCHSTABE.test(wert)) {
    return MANGEL(wert, "format", "Bitte nur Buchstaben, Leerzeichen, - ' und .");
  }
  return OK(wert);
}

/** E-Mail: `isValidEmail` aus lib/events (wie im Profil); nie leer (Login-Adresse), auch nicht für den Vorstand. */
export function pruefeEmail(eingabeEmail: unknown, kontext: Kontext): RegelErgebnis {
  const text = alsText(eingabeEmail);
  if (text === null) return KEIN_TEXT();
  const wert = ohneHarmloseZeichen(text).normalize("NFC").trim();
  if (!wert) return leer("email", kontext);
  if (UNSICHTBAR.test(wert)) return MANGEL(wert, "zeichen", "Die E-Mail-Adresse enthält unsichtbare Zeichen.");
  return isValidEmail(wert) ? OK(wert) : MANGEL(wert, "format", "Bitte trag eine gültige E-Mail-Adresse ein.");
}

// ---------------------------------------------------------------------------------------------------
// Gesamtprüfung
// ---------------------------------------------------------------------------------------------------

export type Pruefergebnis = {
  /** Normalisierte Werte der geprüften Felder (bei Mangel der normalisierte Eingabewert). */
  werte: Partial<Record<Feld, string>>;
  maengel: Mangel[];
  /** Nicht blockierende Hinweise (`vorwahl_ergaenzt`, `bic_land`). */
  hinweise: Hinweis[];
  /** Meldung je Feld mit Mangel. */
  fehler: Partial<Record<Feld, string>>;
  /** Erste Meldung in Feldreihenfolge (für Formulare mit einer Fehlerzeile), sonst null. */
  ersterFehler: string | null;
  /** Keine Mängel (Hinweise zählen nicht). */
  gueltig: boolean;
};

/** Ein Feld mit allen Werten des Datensatzes prüfen (Querbezüge: Land, Hausnummer, IBAN). */
export function pruefeFeld(feld: Feld, daten: Mitgliederdaten, kontext: Kontext): RegelErgebnis {
  const land = daten.land;
  switch (feld) {
    case "vorname":
    case "nachname":
      return pruefeName(daten[feld], feld);
    case "email":
      return pruefeEmail(daten.email, kontext);
    case "strasse":
      return pruefeStrasse(daten.strasse, daten.hausnummer, kontext);
    case "hausnummer":
      return pruefeHausnummer(daten.hausnummer, land, kontext);
    case "plz":
      return pruefePlz(daten.plz, land, kontext);
    case "ort":
      return pruefeOrt(daten.ort, land, kontext);
    case "land":
      return pruefeLand(land);
    case "handynummer": {
      const { wert, fehler, code, hinweis } = pruefeHandy(daten.handynummer, daten.handyLand, kontext);
      return hinweis ? { wert, fehler, code, hinweis } : { wert, fehler, code };
    }
    case "iban":
      return pruefeIban(daten.iban, kontext);
    case "bic":
      return pruefeBic(daten.bic, daten.iban, kontext);
    case "geburtsdatum":
      return pruefeGeburtsdatum(daten.geburtsdatum, kontext);
  }
}

function hat(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Nur bekannte Felder als eigene Eigenschaften übernehmen (`__proto__`, `constructor` usw. fallen weg). */
function nurBekannte(daten: unknown): Mitgliederdaten {
  const out: Record<string, unknown> = {};
  if (!daten || typeof daten !== "object") return out;
  for (const key of BEKANNTE_SCHLUESSEL) {
    if (hat(daten, key)) out[key] = (daten as Record<string, unknown>)[key];
  }
  return out;
}

function pruefeFelder(felder: readonly Feld[], daten: Mitgliederdaten, kontext: Kontext): Pruefergebnis {
  const ergebnis: Pruefergebnis = {
    werte: {},
    maengel: [],
    hinweise: [],
    fehler: {},
    ersterFehler: null,
    gueltig: true,
  };
  for (const feld of felder) {
    const r = pruefeFeld(feld, daten, kontext);
    ergebnis.werte[feld] = r.wert;
    if (r.code) {
      ergebnis.maengel.push({ feld, code: r.code });
      ergebnis.fehler[feld] = r.fehler ?? "";
      ergebnis.ersterFehler ??= r.fehler;
    }
    if (r.hinweis) ergebnis.hinweise.push({ feld, code: r.hinweis });
  }
  ergebnis.gueltig = ergebnis.maengel.length === 0;
  return ergebnis;
}

/**
 * Vollständige Prüfung einer FORMULAR-Eingabe (Registrierung, Profil, „Ändern“ im Abfrage-Fenster): alle
 * STAMMFELDER, dazu Vorname, Nachname, E-Mail, wenn übergeben. Liefert normalisierte Werte (diese speichern),
 * Mängel, Hinweise und Meldungen. Gibt ein Alumnus eine IBAN ein, wird sie hier geprüft (Formularfehler).
 */
export function pruefeFormular(daten: Mitgliederdaten, kontext: Kontext): Pruefergebnis {
  const sauber = nurBekannte(daten);
  const felder = FELD_REIHENFOLGE.filter((f) => STAMMFELDER.includes(f) || sauber[f] !== undefined);
  return pruefeFelder(felder, sauber, kontext);
}

/**
 * Mängel des GESPEICHERTEN Bestands (`{ feld, code }`) – Abfrage-Fenster (gültig/ungültig),
 * Vorstandsübersicht (Feldnamen), Skript (Zählungen). Bei Alumni sind IBAN und BIC nie ein Mangel, auch
 * nicht ungültig gespeicherte (Entscheidung Hannes 3).
 */
export function pruefeMitgliederdaten(daten: Mitgliederdaten, kontext: Kontext): Mangel[] {
  return pruefeBestand(daten, kontext).maengel;
}

/** Wie `pruefeMitgliederdaten`, aber mit Werten und Hinweisen (Skript zählt Hinweise, PR 4 zeigt sie). */
export function pruefeBestand(daten: Mitgliederdaten, kontext: Kontext): Pruefergebnis {
  const r = pruefeFormular(daten, kontext);
  // `vorwahl_ergaenzt` nur im Bestand: dort gibt es kein ausdrücklich gewähltes Handy-Land. Im Formular hat
  // das Mitglied das Land gewählt, dann ist nichts angenommen (Gegenprüfung G2/N2).
  const sauber = nurBekannte(daten);
  const handyLandGewaehlt = typeof sauber.handyLand === "string" && sauber.handyLand.trim() !== "";
  const handy = typeof sauber.handynummer === "string" ? sauber.handynummer : "";
  if (
    !handyLandGewaehlt &&
    handy &&
    !r.fehler.handynummer &&
    r.werte.handynummer?.startsWith("+49") &&
    vorwahlNurAngenommen(handy, r.werte.handynummer)
  ) {
    r.hinweise = [{ feld: "handynummer", code: "vorwahl_ergaenzt" }, ...r.hinweise];
  }
  if (kontext.alumni !== true) return r;
  const bank = (feld: Feld) => feld === "iban" || feld === "bic";
  const maengel = r.maengel.filter((m) => !bank(m.feld));
  const fehler = { ...r.fehler };
  delete fehler.iban;
  delete fehler.bic;
  const ersterFehler = FELD_REIHENFOLGE.map((f) => fehler[f]).find((f) => f !== undefined) ?? null;
  return { ...r, maengel, fehler, ersterFehler, hinweise: r.hinweise.filter((h) => !bank(h.feld)), gueltig: maengel.length === 0 };
}

/**
 * Korrektur durch den Vorstand: geprüft werden NUR die geänderten Felder (`aenderungen`, eigene Schlüssel
 * aus der festen Feldliste, Wert nicht `undefined`), damit alte fehlerhafte Felder das Speichern nicht
 * blockieren. Querbezüge (Land, Hausnummer, IBAN für die BIC) kommen aus `bestehend` + `aenderungen`.
 * Leeren ist erlaubt außer bei Geburtsdatum, Name und E-Mail; Auslands-PLZ mit lockerer Regel.
 * `werte` enthält nur die geänderten Felder.
 *
 * Bewusst (Review F8): Ändert der Vorstand nur `land` oder `iban`, werden PLZ bzw. BIC NICHT neu geprüft –
 * der Vorstand soll nie durch Altdaten blockiert werden; Widersprüche zeigt die Gesamtprüfung danach.
 */
export function pruefeVorstandskorrektur(
  aenderungen: Mitgliederdaten,
  bestehend: Mitgliederdaten = {},
  heute?: string
): Pruefergebnis {
  const kontext: Kontext = { alumni: false, wer: "vorstand", heute };
  const neu = nurBekannte(aenderungen);
  const zusammen: Mitgliederdaten = nurBekannte(bestehend);
  for (const key of BEKANNTE_SCHLUESSEL) {
    if (hat(neu, key) && neu[key as Feld] !== undefined) (zusammen as Record<string, unknown>)[key] = neu[key as Feld];
  }
  const felder = FELD_REIHENFOLGE.filter((f) => hat(neu, f) && neu[f] !== undefined);
  return pruefeFelder(felder, zusammen, kontext);
}

// ---------------------------------------------------------------------------------------------------
// Reparatur (Bereinigungsskript, PR 3) – rein, idempotent
// ---------------------------------------------------------------------------------------------------

/**
 * gueltig    Wert ist schon richtig und unverändert
 * sicher     automatisch korrigiert (darf ohne Rückfrage gespeichert werden)
 * vorschlag  Korrektur wahrscheinlich, muss vom Mitglied bestätigt werden
 * offen      nicht reparierbar, Mitglied/Vorstand muss korrigieren (`code` sagt warum)
 */
export type ReparaturStatus = "gueltig" | "sicher" | "vorschlag" | "offen";
export type Reparatur = { status: ReparaturStatus; wert: string; code: MangelCode | null };

const MITGLIED: Kontext = { alumni: false, wer: "mitglied" };

function gueltigOderSicher(roh: string, wert: string): Reparatur {
  return { status: wert === roh ? "gueltig" : "sicher", wert, code: null };
}

/**
 * Handy (Altdaten, Land unbekannt → DE). „sicher“ NUR mit Beleg für eine deutsche Nummer und deutschem
 * Ergebnis bei Standardland DE:
 *   führende 0 (`0176…`), `0049…` oder `+49 0…`/`+49 (0)…` → `+49176…`
 * „vorschlag“ (Mitglied bestätigt), wenn gültig, aber nicht belegt:
 *   ohne Vorwahl und ohne 0: nur 10–11 Ziffern, Beginn 15/16/17, deutsche Mobilnummer (chinesische Nummern
 *     sehen gleich aus)
 *   `+49 151…` ohne 0 (Vorwahl stammt evtl. aus der alten Vorauswahl der Registrierung)
 *   anderes Land als das Standardland (`+43 664…`, Tippfehler `0015…` → USA)
 * Schon E.164 → gueltig. Alles andere (Mailadresse, Festnetz, zu kurz) → offen.
 */
export function repariereHandy(
  eingabeHandy: unknown,
  land: unknown = DEFAULT_COUNTRY,
  kontext: Kontext = MITGLIED
): Reparatur {
  const text = alsText(eingabeHandy);
  if (text === null) return { status: "offen", wert: "", code: "format" };
  const roh = text;
  const t = ohneHarmloseZeichen(roh).trim();
  if (!t) {
    const r = pruefeHandy("", land, kontext);
    return r.code ? { status: "offen", wert: roh, code: r.code } : { status: "gueltig", wert: "", code: null };
  }
  if (!HANDY_ZEICHEN.test(t)) return { status: "offen", wert: roh, code: "format" };

  const standardLand = landOderStandard(land);
  const kompakt = t.replace(HANDY_TRENNER, "");
  const ohnePraefix = !/^(\+|0)/.test(kompakt);
  if (ohnePraefix) {
    // Nur reine Ziffern, 10–11 Stellen, deutsche Mobilvorwahl ohne 0.
    if (standardLand === "DE" && /^1[567]\d{8,9}$/.test(kompakt)) {
      const r = pruefeHandy(`0${kompakt}`, "DE", kontext);
      if (!r.code && r.land === "DE") return { status: "vorschlag", wert: r.wert, code: null };
    }
    const r = pruefeHandy(t, land, kontext);
    return { status: "offen", wert: roh, code: r.code ?? "format" };
  }

  const r = pruefeHandy(t, land, kontext);
  if (r.code) return { status: "offen", wert: roh, code: r.code };
  if (r.wert === roh) return { status: "gueltig", wert: roh, code: null };
  if (r.wert === t) return { status: "sicher", wert: r.wert, code: null }; // nur Leerraum/harmlose Zeichen
  const deBeleg = /^0[1-9]/.test(kompakt) || /^0049/.test(kompakt) || /^\+490/.test(kompakt);
  if (deBeleg && r.land === "DE" && standardLand === "DE") return { status: "sicher", wert: r.wert, code: null };
  return { status: "vorschlag", wert: r.wert, code: null };
}

/** IBAN: nur Schreibweise (Leerzeichen, Kleinbuchstaben) ist sicher; alles andere bleibt offen. */
export function repariereIban(eingabeIban: unknown, kontext: Kontext = MITGLIED): Reparatur {
  const text = alsText(eingabeIban);
  if (text === null) return { status: "offen", wert: "", code: "format" };
  const r = pruefeIban(text, kontext);
  return r.code ? { status: "offen", wert: text, code: r.code } : gueltigOderSicher(text, r.wert);
}

/**
 * BIC: normalisieren; falsches FORMAT → geleert (Entscheidung 6) → sicher. Abweichendes Land zur IBAN ist
 * nur ein Hinweis und wird NICHT geleert; gegen eine ungültige IBAN wird nicht abgeglichen.
 */
export function repariereBic(eingabeBic: unknown, iban: unknown, kontext: Kontext = MITGLIED): Reparatur {
  const text = alsText(eingabeBic);
  if (text === null) return { status: "sicher", wert: "", code: "format" };
  const r = pruefeBic(text, iban, kontext);
  if (!r.code) return gueltigOderSicher(text, r.wert);
  return { status: "sicher", wert: "", code: r.code };
}

export type StrassenReparatur = { status: ReparaturStatus; strasse: string; hausnummer: string };

/** Reststraße für eine sichere Trennung: nur Buchstaben, Punkt, Bindestrich, Leerzeichen. */
const STRASSE_NUR_TEXT = /^[\p{L}\p{M} .-]+$/u;
/** Wörter, die auf Wohnung/Zimmer/Postfach statt Hausnummer hindeuten → nie „sicher“. */
const ZUSATZ_WOERTER = new Set([
  "app",
  "apt",
  "apartment",
  "appartement",
  "whg",
  "wohnung",
  "zi",
  "zimmer",
  "postfach",
  "pf",
  "co",
  "top",
  "stiege",
  "etage",
  "stock",
  "og",
  "eg",
  "haus",
  "gebäude",
  "gebaeude",
  "block",
  "aufgang",
  "hinterhaus",
]);

/**
 * Straße mit Hausnummer bei leerer Hausnummer abtrennen (`Hauptstraße 12a` → `Hauptstraße` + `12a`).
 * „sicher“ nur, wenn die Straße aus Buchstaben/Punkt/Bindestrich/Leerzeichen besteht und genau EIN
 * Hausnummern-Teil am Ende steht (keine weitere Ziffer, kein Komma, kein Zusatz wie App./Whg./Zi./Postfach),
 * und das Ergebnis `pruefeStrasse` + `pruefeHausnummer` (DE, inkl. Länge) besteht. Sonst „offen“.
 */
export function repariereStrasse(eingabeStrasse: unknown, eingabeHausnummer: unknown): StrassenReparatur {
  const strasse = textOderLeer(eingabeStrasse);
  const hausnummer = textOderLeer(eingabeHausnummer);
  if (alsText(eingabeStrasse) === null || alsText(eingabeHausnummer) === null) {
    return { status: "offen", strasse, hausnummer };
  }
  const s = normalisiereText(strasse).replace(STRICHE, "-");
  // Nichts abzutrennen: „gueltig“ nur, wenn die Werte schon bereinigt sind; sonst „sicher“ mit den Werten,
  // die auch `pruefeStrasse`/`pruefeHausnummer` liefern (Kurzprüfung K2: weiches Trennzeichen, NFD …).
  const unveraendert = (): StrassenReparatur => {
    const sauberStrasse = normalisiereText(strasse);
    const sauberNummer = normalisiereText(hausnummer).replace(STRICHE, "-");
    return sauberStrasse === strasse && sauberNummer === hausnummer
      ? { status: "gueltig", strasse, hausnummer }
      : { status: "sicher", strasse: sauberStrasse, hausnummer: sauberNummer };
  };
  if (normalisiereText(hausnummer) || !s) return unveraendert();
  if (s.length > FIELD_LIMITS.strasse + FIELD_LIMITS.hausnummer) return { status: "offen", strasse, hausnummer };
  if (!HAUSNUMMER_AM_ENDE.test(s)) return unveraendert();

  const offen: StrassenReparatur = { status: "offen", strasse, hausnummer };
  const ersteZiffer = s.search(/\d/);
  if (ersteZiffer < 1 || !/[\s.]/.test(s[ersteZiffer - 1])) return offen;
  const rest = s.slice(0, ersteZiffer).replace(/\s+$/, "");
  const nummer = s.slice(ersteZiffer).trim();
  if (!STRASSE_NUR_TEXT.test(rest) || !HAUSNUMMER_DE.test(nummer)) return offen;
  const woerter = rest.toLowerCase().split(/[\s.-]+/).filter(Boolean);
  if (woerter.some((w) => ZUSATZ_WOERTER.has(w))) return offen;
  if (rest.replace(/[\s.-]/g, "").length < 2) return offen;
  if (pruefeStrasse(rest, nummer, MITGLIED).code || pruefeHausnummer(nummer, "DE", MITGLIED).code) return offen;
  return { status: "sicher", strasse: rest, hausnummer: nummer };
}

export type Datenreparatur = {
  /** Felder, die sicher repariert wurden, mit neuem Wert (direkt speicherbar). */
  sicher: Partial<Record<Feld, string>>;
  /** Felder mit Vorschlag (erst nach Bestätigung durch das Mitglied speichern). */
  vorschlaege: Partial<Record<Feld, string>>;
  /** Status je reparierbarem Feld. */
  status: Partial<Record<Feld, ReparaturStatus>>;
};

/**
 * Alle Reparaturen eines Datensatzes (Handy, IBAN, BIC, Straße/Hausnummer). Die BIC wird gegen die
 * reparierte IBAN geprüft. Bei Alumni wird eine ungültige IBAN nicht als „offen“ gemeldet (kein Mangel).
 * Was danach noch fehlt, liefert `pruefeMitgliederdaten` auf den reparierten Werten.
 */
export function repariereMitgliederdaten(daten: Mitgliederdaten, kontext: Kontext = MITGLIED): Datenreparatur {
  const d = nurBekannte(daten);
  const out: Datenreparatur = { sicher: {}, vorschlaege: {}, status: {} };
  const merke = (feld: Feld, r: Reparatur) => {
    out.status[feld] = r.status;
    if (r.status === "sicher") out.sicher[feld] = r.wert;
    if (r.status === "vorschlag") out.vorschlaege[feld] = r.wert;
  };
  merke("handynummer", repariereHandy(d.handynummer, d.handyLand ?? DEFAULT_COUNTRY, kontext));
  const iban = repariereIban(d.iban, kontext);
  if (!(kontext.alumni === true && iban.status === "offen")) merke("iban", iban);
  merke("bic", repariereBic(d.bic, iban.status === "sicher" ? iban.wert : d.iban, kontext));
  const adresse = repariereStrasse(d.strasse, d.hausnummer);
  out.status.strasse = adresse.status;
  if (adresse.status === "sicher") {
    out.sicher.strasse = adresse.strasse;
    out.sicher.hausnummer = adresse.hausnummer;
  }
  return out;
}
