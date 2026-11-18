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
 * Jede Feldregel liefert `{ wert, fehler, code }`:
 *   wert   normalisierter Wert (genau dieser wird gespeichert und geprüft)
 *   fehler null oder kurze Meldung (Du-Form), ohne den eingegebenen Wert
 *   code   null oder stabiler Mängel-Code (siehe `MangelCode`)
 * Ob ein leeres Feld ein Mangel ist, entscheidet die Regel selbst über den Kontext (`istPflicht`).
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
 *   format                 Wert passt nicht zum Muster (Datum, PLZ, Hausnummer, BIC, Name, E-Mail, Handy)
 *   zu_lang                länger als FIELD_LIMITS
 *   zeichen                Steuerzeichen oder Formelanfang (= + - @)
 *   keine_buchstaben       Straße/Ort ohne Buchstaben
 *   hausnummer_in_strasse  Straße endet auf eine Hausnummer, Hausnummer leer
 *   ziffern                Ziffern im Ort (Deutschland)
 *   land_unbekannt         Land nicht in lib/country-codes
 *   kein_mobil             Handy: Festnetz o. Ä. (in Deutschland nur Mobilnummern)
 *   nicht_sepa             IBAN aus einem Land außerhalb des SEPA-Raums
 *   laenge                 IBAN-Länge passt nicht zum Land
 *   pruefziffer            IBAN-Prüfsumme (mod 97) falsch
 *   bic_land               BIC-Land (Stellen 5–6) passt nicht zum Land der IBAN
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
  | "bic_land"
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
  "bic_land",
  "zukunft",
  "zu_alt",
];

export type Mangel = { feld: Feld; code: MangelCode };

export type RegelErgebnis = { wert: string; fehler: string | null; code: MangelCode | null };

/**
 * Wer prüft:
 *   registrierung  neuer Antrag (alle Pflichtfelder, IBAN Pflicht)
 *   mitglied       Profil / Abfrage-Fenster (Pflichtfelder nicht leerbar; IBAN außer bei Alumni)
 *   vorstand       Korrektur: nichts außer dem Geburtsdatum ist Pflicht, Auslands-PLZ mit lockerer Regel
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
export type Mitgliederdaten = Partial<Record<Feld, string | null>> & {
  /** Land der Handynummer (ISO), Standard DE. Eine Nummer mit +Vorwahl bestimmt ihr Land selbst. */
  handyLand?: string | null;
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

// ---------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------

const OK = (wert: string): RegelErgebnis => ({ wert, fehler: null, code: null });
const MANGEL = (wert: string, code: MangelCode, fehler: string): RegelErgebnis => ({ wert, fehler, code });

/** Trimmen und Leerraum (auch Tab/Zeilenumbruch) zu einem Leerzeichen zusammenfassen. */
export function normalisiereText(eingabe: string | null | undefined): string {
  return String(eingabe ?? "").trim().replace(/\s+/g, " ");
}

/** Land der Anschrift: leer → DE (Altdaten haben kein Land). */
function landOderStandard(land: string | null | undefined): string {
  const roh = normalisiereText(land).toUpperCase();
  return roh || DEFAULT_COUNTRY;
}

const LEER_MELDUNG: Record<Feld, string> = {
  vorname: "Bitte trag den Vornamen ein.",
  nachname: "Bitte trag den Nachnamen ein.",
  email: "Bitte trag deine E-Mail-Adresse ein.",
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
 * Ist das Feld Pflicht? Geburtsdatum immer (auch der Vorstand darf es nicht leeren). Vorstand: sonst nichts
 * (er darf leeren). Mitglied/Registrierung: alles außer BIC; IBAN nicht für Alumni; Hausnummer nur in DE.
 */
export function istPflicht(feld: Feld, kontext: Kontext, land: string = DEFAULT_COUNTRY): boolean {
  if (feld === "geburtsdatum") return true;
  if (kontext.wer === "vorstand") return false;
  if (feld === "bic") return false;
  if (feld === "iban") return !kontext.alumni;
  if (feld === "hausnummer") return landOderStandard(land) === "DE";
  return true;
}

function leer(feld: Feld, kontext: Kontext, land?: string): RegelErgebnis {
  if (!istPflicht(feld, kontext, land)) return OK("");
  if (feld === "geburtsdatum" && kontext.wer === "vorstand") {
    return MANGEL("", "fehlt", "Das Geburtsdatum kann nicht gelöscht werden. Bitte ein vollständiges Datum eingeben.");
  }
  return MANGEL("", "fehlt", LEER_MELDUNG[feld]);
}

/** checkText (Länge, Steuerzeichen, Formelanfang) mit Code. */
function textMangel(wert: string, label: string, max: number): RegelErgebnis | null {
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
const HANDY_MAX_EINGABE = FIELD_LIMITS.telefon;
/** Außerhalb Deutschlands erlaubte Typen; `undefined` = Metadaten kennen den Typ nicht. */
const HANDY_TYPEN_AUSLAND = new Set<string | undefined>(["MOBILE", "FIXED_LINE_OR_MOBILE", undefined]);

export type HandyErgebnis = RegelErgebnis & {
  /** Land der Nummer (ISO) laut Metadaten; folgt der Nummer, nicht der Auswahl (+43 bei Auswahl DE → AT). */
  land: string | null;
};

/**
 * Handynummer: Land (ISO, Standard DE) + Nummer → E.164 (`+491761234567`).
 * DE: nur Mobilnummern. Andere Länder: gültig nach Metadaten, Typ Mobil, Mobil-oder-Festnetz oder unbekannt.
 * Pflicht außer für den Vorstand.
 */
export function pruefeHandy(
  eingabe: string | null | undefined,
  land: string | null | undefined,
  kontext: Kontext
): HandyErgebnis {
  const roh = String(eingabe ?? "").trim();
  if (!roh) return { ...leer("handynummer", kontext), land: null };
  const fehlerFormat = (): HandyErgebnis => ({
    ...MANGEL(roh, "format", "Die Nummer stimmt so nicht. Vertippt?"),
    land: null,
  });
  if (roh.length > HANDY_MAX_EINGABE || !HANDY_ZEICHEN.test(roh)) return fehlerFormat();

  const auswahl = landOderStandard(land);
  const standard = (isSupportedCountry(auswahl) ? auswahl : DEFAULT_COUNTRY) as PhoneCountry;
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
  } else if (!HANDY_TYPEN_AUSLAND.has(typ)) {
    return { ...MANGEL(roh, "kein_mobil", "Bitte deine Handynummer."), land: nummernLand };
  }
  return { ...OK(nummer.number), land: nummernLand };
}

/** Anzeige einer gespeicherten Nummer international (`+49 176 1234567`); Unlesbares bleibt, wie es ist. */
export function formatiereHandyAnzeige(e164: string | null | undefined): string {
  const roh = eingabe(e164).trim();
  if (!roh) return "";
  const nummer = parsePhoneNumberFromString(roh.replace(/^00/, "+"), DEFAULT_COUNTRY as PhoneCountry);
  return nummer ? nummer.formatInternational() : roh;
}

function eingabe(v: string | null | undefined): string {
  return String(v ?? "");
}

// ---------------------------------------------------------------------------------------------------
// IBAN / BIC
// ---------------------------------------------------------------------------------------------------

/** IBAN: `normalizeIban`, nur SEPA, Länge je Land, mod 97. Pflicht außer für Alumni und Vorstand. */
export function pruefeIban(eingabeIban: string | null | undefined, kontext: Kontext): RegelErgebnis {
  const wert = normalizeIban(eingabe(eingabeIban));
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
export function normalisiereBic(eingabeBic: string | null | undefined): string {
  return eingabe(eingabeBic).replace(/\s/g, "").toUpperCase();
}

/**
 * BIC: optional für alle. Wenn angegeben: 8 oder 11 Zeichen; Stellen 5–6 = Land der IBAN (falls eine
 * IBAN mit erkennbarem Land vorliegt).
 */
export function pruefeBic(
  eingabeBic: string | null | undefined,
  iban: string | null | undefined,
  kontext: Kontext
): RegelErgebnis {
  const wert = normalisiereBic(eingabeBic);
  if (!wert) return leer("bic", kontext);
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(wert)) {
    return MANGEL(wert, "format", "Die BIC hat 8 oder 11 Zeichen.");
  }
  const ibanLand = normalizeIban(eingabe(iban)).slice(0, 2);
  if (/^[A-Z]{2}$/.test(ibanLand)) {
    const erlaubt = BIC_LAENDER_ZU_IBAN[ibanLand] ?? [ibanLand];
    if (!erlaubt.includes(wert.slice(4, 6))) {
      return MANGEL(wert, "bic_land", "Die BIC passt nicht zum Land der IBAN.");
    }
  }
  return OK(wert);
}

// ---------------------------------------------------------------------------------------------------
// Anschrift
// ---------------------------------------------------------------------------------------------------

/** Hausnummer in Deutschland: Ziffer zuerst, z. B. 12, 12a, 12 b, 12-14, 3/1, 12a-12c. */
const HAUSNUMMER_DE = /^\d+(?: ?[A-Za-z])?(?: ?[-/] ?\d+(?: ?[A-Za-z])?)?$/;
/** Hausnummer am Ende der Straße (nach Leerzeichen, Punkt oder Komma). Gruppe 1 = Hausnummer. */
const HAUSNUMMER_AM_ENDE = /(?:^|[\s.,])(\d+(?: ?[A-Za-z])?(?: ?[-/] ?\d+(?: ?[A-Za-z])?)?)$/;

/**
 * PLZ-Muster je Land (nach Normalisierung: Großbuchstaben, ein Leerzeichen). Quelle: Wikipedia „List of
 * postal codes“ (abgerufen 18.11.2026). Andere Länder: lockere Regel (3–10 Zeichen, siehe PLZ_LOCKER).
 */
const PLZ_MUSTER: Readonly<Record<string, RegExp>> = {
  DE: /^\d{5}$/,
  AT: /^\d{4}$/,
  CH: /^\d{4}$/,
  LI: /^94\d{2}$/,
  LU: /^(?:L-)?\d{4}$/,
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
  IE: /^[A-Z]\d[\dW] ?[\dA-Z]{4}$/,
  RO: /^\d{6}$/,
  BG: /^\d{4}$/,
  GR: /^\d{3} ?\d{2}$/,
  CY: /^\d{4}$/,
  MT: /^[A-Z]{3} ?\d{4}$/,
  EE: /^\d{5}$/,
  LV: /^(?:LV-)?\d{4}$/,
  LT: /^(?:LT-)?\d{5}$/,
};
/** Bisherige Regel (lib/member-fields.ts `checkPlz`): 3–10 Zeichen, Buchstaben/Ziffern/Leerzeichen/Bindestrich. */
const PLZ_LOCKER = /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/;

/** Land der Anschrift (ISO-Code aus lib/country-codes); leer = Deutschland. */
export function pruefeLand(eingabeLand: string | null | undefined): RegelErgebnis {
  const wert = landOderStandard(eingabeLand);
  return findCountry(wert) ? OK(wert) : MANGEL(wert, "land_unbekannt", "Bitte wähl ein Land aus der Liste.");
}

/** Straße: Buchstaben Pflicht; endet sie auf eine Hausnummer und ist die Hausnummer leer → Mangel. */
export function pruefeStrasse(
  eingabeStrasse: string | null | undefined,
  hausnummer: string | null | undefined,
  kontext: Kontext
): RegelErgebnis {
  const wert = normalisiereText(eingabeStrasse);
  if (!wert) return leer("strasse", kontext);
  const text = textMangel(wert, "Straße", FIELD_LIMITS.strasse);
  if (text) return text;
  if (!BUCHSTABE.test(wert)) return MANGEL(wert, "keine_buchstaben", "Die Straße braucht Buchstaben.");
  if (!normalisiereText(hausnummer) && HAUSNUMMER_AM_ENDE.test(wert)) {
    return MANGEL(wert, "hausnummer_in_strasse", "Hausnummer bitte ins eigene Feld.");
  }
  return OK(wert);
}

/** Hausnummer: in DE Pflicht und Ziffer zuerst; sonst optional, nur checkText. */
export function pruefeHausnummer(
  eingabeHausnummer: string | null | undefined,
  land: string | null | undefined,
  kontext: Kontext
): RegelErgebnis {
  const wert = normalisiereText(eingabeHausnummer);
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
 * PLZ: DE genau 5 Ziffern; Länder aus PLZ_MUSTER nach Muster; sonst lockere Regel. Der Vorstand trägt
 * Auslandsadressen immer mit der lockeren Regel ein.
 */
export function pruefePlz(
  eingabePlz: string | null | undefined,
  land: string | null | undefined,
  kontext: Kontext
): RegelErgebnis {
  const wert = normalisiereText(eingabePlz).toUpperCase();
  const l = landOderStandard(land);
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
export function pruefeOrt(
  eingabeOrt: string | null | undefined,
  land: string | null | undefined,
  kontext: Kontext
): RegelErgebnis {
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
export function pruefeGeburtsdatum(eingabeDatum: string | null | undefined, kontext: Kontext): RegelErgebnis {
  const wert = eingabe(eingabeDatum).trim();
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

export function pruefeName(eingabeName: string | null | undefined, feld: "vorname" | "nachname"): RegelErgebnis {
  const wert = normalisiereText(eingabeName);
  // Ein Name ist nie leer – auch der Vorstand kann ihn nur ändern, nicht löschen.
  if (!wert) return MANGEL("", "fehlt", LEER_MELDUNG[feld]);
  const text = textMangel(wert, feld === "vorname" ? "Vorname" : "Nachname", FIELD_LIMITS.name);
  if (text) return text;
  if (!NAME_ZEICHEN.test(wert) || !BUCHSTABE.test(wert)) {
    return MANGEL(wert, "format", "Im Namen sind nur Buchstaben, Leerzeichen, - ' und . erlaubt.");
  }
  return OK(wert);
}

/** E-Mail: `isValidEmail` aus lib/events (wie im Profil). */
export function pruefeEmail(eingabeEmail: string | null | undefined, kontext: Kontext): RegelErgebnis {
  const wert = eingabe(eingabeEmail).trim();
  if (!wert) return leer("email", kontext);
  return isValidEmail(wert) ? OK(wert) : MANGEL(wert, "format", "Bitte trag eine gültige E-Mail-Adresse ein.");
}

// ---------------------------------------------------------------------------------------------------
// Gesamtprüfung
// ---------------------------------------------------------------------------------------------------

export type Pruefergebnis = {
  /** Normalisierte Werte der geprüften Felder (bei Mangel der normalisierte Eingabewert). */
  werte: Partial<Record<Feld, string>>;
  maengel: Mangel[];
  /** Meldung je Feld mit Mangel. */
  fehler: Partial<Record<Feld, string>>;
  /** Erste Meldung in Feldreihenfolge (für Formulare mit einer Fehlerzeile), sonst null. */
  ersterFehler: string | null;
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
      const { wert, fehler, code } = pruefeHandy(daten.handynummer, daten.handyLand, kontext);
      return { wert, fehler, code };
    }
    case "iban":
      return pruefeIban(daten.iban, kontext);
    case "bic":
      return pruefeBic(daten.bic, daten.iban, kontext);
    case "geburtsdatum":
      return pruefeGeburtsdatum(daten.geburtsdatum, kontext);
  }
}

function pruefeFelder(felder: readonly Feld[], daten: Mitgliederdaten, kontext: Kontext): Pruefergebnis {
  const ergebnis: Pruefergebnis = { werte: {}, maengel: [], fehler: {}, ersterFehler: null, gueltig: true };
  for (const feld of felder) {
    const r = pruefeFeld(feld, daten, kontext);
    ergebnis.werte[feld] = r.wert;
    if (r.code) {
      ergebnis.maengel.push({ feld, code: r.code });
      ergebnis.fehler[feld] = r.fehler ?? "";
      ergebnis.ersterFehler ??= r.fehler;
    }
  }
  ergebnis.gueltig = ergebnis.maengel.length === 0;
  return ergebnis;
}

/** Reihenfolge aller Felder (Meldungen, Werte). */
const FELD_REIHENFOLGE: readonly Feld[] = [...ZUSATZFELDER, ...STAMMFELDER];

/**
 * Vollständige Prüfung eines Datensatzes (Formular, Abfrage-Fenster): alle STAMMFELDER, dazu Vorname,
 * Nachname, E-Mail, wenn übergeben. Liefert normalisierte Werte, Mängel und Meldungen.
 */
export function pruefeFormular(daten: Mitgliederdaten, kontext: Kontext): Pruefergebnis {
  const felder = FELD_REIHENFOLGE.filter((f) => STAMMFELDER.includes(f) || daten[f] !== undefined);
  return pruefeFelder(felder, daten, kontext);
}

/** Nur die Mängel (`{ feld, code }`) – für Vorstandsübersicht (Feldnamen) und Skript (Zählungen). */
export function pruefeMitgliederdaten(daten: Mitgliederdaten, kontext: Kontext): Mangel[] {
  return pruefeFormular(daten, kontext).maengel;
}

/**
 * Korrektur durch den Vorstand: geprüft werden NUR die geänderten Felder (`aenderungen`, Schlüssel nicht
 * `undefined`), damit alte fehlerhafte Felder das Speichern nicht blockieren. Querbezüge (Land, Hausnummer,
 * IBAN für die BIC) kommen aus `bestehend` + `aenderungen`. Leeren ist erlaubt außer beim Geburtsdatum;
 * Auslands-PLZ mit lockerer Regel. `werte` enthält nur die geänderten Felder.
 */
export function pruefeVorstandskorrektur(
  aenderungen: Mitgliederdaten,
  bestehend: Mitgliederdaten = {},
  heute?: string
): Pruefergebnis {
  const kontext: Kontext = { alumni: false, wer: "vorstand", heute };
  const zusammen: Mitgliederdaten = { ...bestehend };
  for (const [k, v] of Object.entries(aenderungen)) {
    if (v !== undefined) (zusammen as Record<string, unknown>)[k] = v;
  }
  const felder = FELD_REIHENFOLGE.filter((f) => aenderungen[f] !== undefined);
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
 * Handy (Altdaten, Land unbekannt → DE):
 *   mit +Vorwahl/00 oder führender 0, gültig → sicher (`+49 0176…`, `0049 176…`, `0176…` → `+49176…`)
 *   ohne Vorwahl und ohne 0: nur reine Ziffern (Leerzeichen/Trenner erlaubt), 10–11 Stellen, Beginn
 *     15/16/17 und als deutsche Mobilnummer erkannt → vorschlag (chinesische Mobilnummern sehen gleich
 *     aus, deshalb nie „sicher“)
 *   alles andere (Mailadresse, Festnetz, zu kurz) → offen
 */
export function repariereHandy(
  eingabeHandy: string | null | undefined,
  land: string | null | undefined = DEFAULT_COUNTRY,
  kontext: Kontext = MITGLIED
): Reparatur {
  const roh = eingabe(eingabeHandy);
  const t = roh.trim();
  if (!t) {
    const r = pruefeHandy("", land, kontext);
    return r.code ? { status: "offen", wert: roh, code: r.code } : { status: "gueltig", wert: "", code: null };
  }
  if (!HANDY_ZEICHEN.test(t)) return { status: "offen", wert: roh, code: "format" };

  const ohneTrenner = t.replace(/[\s()\-/.]/g, "");
  const mitVorwahl = /^(\+|00)/.test(ohneTrenner);
  const mitNull = !mitVorwahl && ohneTrenner.startsWith("0");
  if (mitVorwahl || mitNull) {
    const r = pruefeHandy(t, land, kontext);
    return r.code ? { status: "offen", wert: roh, code: r.code } : gueltigOderSicher(roh, r.wert);
  }
  if (landOderStandard(land) === "DE" && /^1[567]\d{8,9}$/.test(ohneTrenner)) {
    const r = pruefeHandy(`0${ohneTrenner}`, "DE", kontext);
    if (!r.code && r.land === "DE") return { status: "vorschlag", wert: r.wert, code: null };
  }
  const r = pruefeHandy(t, land, kontext);
  return { status: "offen", wert: roh, code: r.code ?? "format" };
}

/** IBAN: nur Schreibweise (Leerzeichen, Kleinbuchstaben) ist sicher; alles andere bleibt offen. */
export function repariereIban(eingabeIban: string | null | undefined, kontext: Kontext = MITGLIED): Reparatur {
  const roh = eingabe(eingabeIban);
  const r = pruefeIban(roh, kontext);
  return r.code ? { status: "offen", wert: roh, code: r.code } : gueltigOderSicher(roh, r.wert);
}

/** BIC: normalisieren; bleibt sie ungültig (Format oder Land), wird sie geleert (Entscheidung 6) → sicher. */
export function repariereBic(
  eingabeBic: string | null | undefined,
  iban: string | null | undefined,
  kontext: Kontext = MITGLIED
): Reparatur {
  const roh = eingabe(eingabeBic);
  const r = pruefeBic(roh, iban, kontext);
  if (!r.code) return gueltigOderSicher(roh, r.wert);
  return { status: "sicher", wert: "", code: r.code };
}

export type StrassenReparatur = { status: ReparaturStatus; strasse: string; hausnummer: string };

/**
 * Straße mit Hausnummer bei leerer Hausnummer abtrennen (`Hauptstraße 12a` → `Hauptstraße` + `12a`).
 * Sicher nur, wenn die Reststraße Buchstaben hat und die Hausnummer dem deutschen Muster folgt.
 */
export function repariereStrasse(
  eingabeStrasse: string | null | undefined,
  eingabeHausnummer: string | null | undefined
): StrassenReparatur {
  const strasse = eingabe(eingabeStrasse);
  const hausnummer = eingabe(eingabeHausnummer);
  const s = normalisiereText(strasse);
  if (normalisiereText(hausnummer) || !s) return { status: "gueltig", strasse, hausnummer };
  const treffer = HAUSNUMMER_AM_ENDE.exec(s);
  if (!treffer) return { status: "gueltig", strasse, hausnummer };
  const nummer = treffer[1];
  const rest = s.slice(0, s.length - nummer.length).replace(/[\s,]+$/, "");
  if (rest.length >= 2 && BUCHSTABE.test(rest) && HAUSNUMMER_DE.test(nummer)) {
    return { status: "sicher", strasse: rest, hausnummer: nummer };
  }
  return { status: "offen", strasse, hausnummer };
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
 * reparierte IBAN geprüft. Was danach noch fehlt, liefert `pruefeMitgliederdaten` auf den reparierten Werten.
 */
export function repariereMitgliederdaten(daten: Mitgliederdaten, kontext: Kontext = MITGLIED): Datenreparatur {
  const out: Datenreparatur = { sicher: {}, vorschlaege: {}, status: {} };
  const merke = (feld: Feld, r: Reparatur) => {
    out.status[feld] = r.status;
    if (r.status === "sicher") out.sicher[feld] = r.wert;
    if (r.status === "vorschlag") out.vorschlaege[feld] = r.wert;
  };
  merke("handynummer", repariereHandy(daten.handynummer, daten.handyLand ?? DEFAULT_COUNTRY, kontext));
  const iban = repariereIban(daten.iban, kontext);
  merke("iban", iban);
  merke("bic", repariereBic(daten.bic, iban.status === "sicher" ? iban.wert : daten.iban, kontext));
  const adresse = repariereStrasse(daten.strasse, daten.hausnummer);
  out.status.strasse = adresse.status;
  if (adresse.status === "sicher") {
    out.sicher.strasse = adresse.strasse;
    out.sicher.hausnummer = adresse.hausnummer;
  }
  return out;
}
