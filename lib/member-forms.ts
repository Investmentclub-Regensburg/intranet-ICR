/**
 * Formular-Logik für Mitgliederdaten (Paket „Mitgliederdaten“, PR 2): Registrierung, Profil und
 * Korrektur durch den Vorstand prüfen AUSSCHLIESSLICH über lib/member-rules.ts und speichern deren
 * normalisierte Werte. Rein und ohne I/O (Datenbank und Verschlüsselung machen die Server-Actions), damit
 * die Fälle als Unit-Tests laufen. Nur Server (`server-only`, `libphonenumber-js/max`).
 */
import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { DEFAULT_COUNTRY, findCountry } from "./country-codes";
import { normalizeIban } from "./member-crypto";
import {
  formatiereHandyAnzeige,
  normalisiereBic,
  pruefeBic,
  pruefeFormular,
  pruefeVorstandskorrektur,
  type Feld,
  type Mitgliederdaten,
  type Pruefergebnis,
} from "./member-rules";
import type { MemberSecretValues } from "./member-secrets-server";

export type FeldFehler = Partial<Record<Feld, string>>;

/** Ergebnis einer Formularprüfung: Meldungen je Feld und die zu speichernden (normalisierten) Werte. */
export type FormularErgebnis = {
  gueltig: boolean;
  fehler: FeldFehler;
  ersterFehler: string | null;
  /** Nur bei `gueltig`: geänderte bzw. zu speichernde Felder mit normalisierten Werten. */
  aenderungen: Partial<MemberSecretValues>;
};

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Land der Anschrift aus dem Bestand: leer (Altdaten) oder unbekannt = Deutschland. Nur Anzeige/Prüfung. */
export function landAusBestand(gespeichert: string | null | undefined): string {
  return findCountry(gespeichert)?.code ?? DEFAULT_COUNTRY;
}

/**
 * Gespeicherte Handynummer für die Eingabe aufteilen: E.164 → Land der Nummer + Nummer ohne Vorwahl
 * (international formatiert, z. B. DE „176 12345678“). Altwerte, die keine gültige E.164-Nummer sind,
 * kommen unverändert mit Land DE zurück (das Mitglied bzw. der Vorstand korrigiert sie).
 */
export function handyFuerEingabe(gespeichert: string | null | undefined): { land: string; nummer: string } {
  const roh = text(gespeichert).trim();
  if (!roh) return { land: DEFAULT_COUNTRY, nummer: "" };
  if (/^\+\d+$/.test(roh)) {
    const nummer = parsePhoneNumberFromString(roh);
    const land = nummer?.country;
    if (nummer && nummer.isValid() && land && findCountry(land)) {
      const international = nummer.formatInternational();
      const prefix = `+${nummer.countryCallingCode}`;
      return {
        land,
        nummer: international.startsWith(prefix) ? international.slice(prefix.length).trim() : international,
      };
    }
  }
  return { land: DEFAULT_COUNTRY, nummer: roh };
}

/** Anzeige einer gespeicherten Handynummer (international formatiert; Altwerte roh). */
export function handyAnzeige(gespeichert: string | null | undefined): string {
  const roh = text(gespeichert).trim();
  if (!roh) return "";
  return /^\+\d+$/.test(roh) ? formatiereHandyAnzeige(roh) : roh;
}

/** Nicht blockierender Hinweis zur BIC (Land weicht vom Land der IBAN ab), sonst null. Nur Anzeige. */
export function bicHinweis(bic: string | null | undefined, iban: string | null | undefined): string | null {
  if (!text(bic).trim()) return null;
  const r = pruefeBic(bic, iban ?? "", { alumni: false, wer: "mitglied" });
  return r.hinweis === "bic_land" ? "Die BIC gehört zu einem anderen Land als die IBAN." : null;
}

function leerZuNull(wert: string | undefined): string | null {
  return wert ? wert : null;
}

const FELD_REIHENFOLGE: readonly Feld[] = [
  "vorname",
  "nachname",
  "email",
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

/**
 * Meldungen je Feld aus einem Prüfergebnis, optional auf `felder` beschränkt. `land_unbekannt` steht in den
 * Regeln an `land` UND `plz`; angezeigt wird es nur am Land (Regeln für Aufrufer, Punkt 4).
 */
function fehlerJeFeld(r: Pruefergebnis, felder?: readonly Feld[]): FeldFehler {
  const fehler: FeldFehler = {};
  for (const m of r.maengel) {
    if (felder && !felder.includes(m.feld)) continue;
    if (m.code === "land_unbekannt" && m.feld !== "land") continue;
    fehler[m.feld] = r.fehler[m.feld] ?? "";
  }
  return fehler;
}

function ersterFehler(fehler: FeldFehler): string | null {
  return FELD_REIHENFOLGE.map((f) => fehler[f]).find((f) => f !== undefined) ?? null;
}

/** Hat jemand die Handynummer (Länderauswahl oder Nummer) gegenüber der Anzeige des Bestands geändert? */
function handyGeaendert(land: unknown, nummer: unknown, gespeichert: string | null | undefined): boolean {
  const vorher = handyFuerEingabe(gespeichert);
  return text(land).trim().toUpperCase() !== vorher.land || text(nummer).trim() !== vorher.nummer;
}

// ---------------------------------------------------------------------------------------------------
// Registrierung
// ---------------------------------------------------------------------------------------------------

export type RegistrierungEingabe = {
  vorname: unknown;
  nachname: unknown;
  email: unknown;
  geburtsdatum: unknown;
  strasse: unknown;
  hausnummer: unknown;
  plz: unknown;
  ort: unknown;
  land: unknown;
  handyLand: unknown;
  handynummer: unknown;
  iban: unknown;
  bic: unknown;
};

/**
 * Mitgliedsantrag: alle Felder nach den Regeln (Kontext `registrierung`). `werte` enthält Name und E-Mail
 * normalisiert, `aenderungen` die verschlüsselten Felder (inkl. Land).
 */
export function pruefeRegistrierung(
  eingabe: RegistrierungEingabe,
  heute?: string
): FormularErgebnis & { werte: { vorname: string; nachname: string; email: string } } {
  const r = pruefeFormular({ ...eingabe }, { alumni: false, wer: "registrierung", heute });
  const w = r.werte;
  const fehler = fehlerJeFeld(r);
  return {
    gueltig: r.gueltig,
    fehler,
    ersterFehler: ersterFehler(fehler),
    werte: { vorname: w.vorname ?? "", nachname: w.nachname ?? "", email: w.email ?? "" },
    aenderungen: r.gueltig
      ? {
          strasse: leerZuNull(w.strasse),
          hausnummer: leerZuNull(w.hausnummer),
          plz: leerZuNull(w.plz),
          ort: leerZuNull(w.ort),
          land: leerZuNull(w.land),
          handynummer: leerZuNull(w.handynummer),
          iban: leerZuNull(w.iban),
          bic: leerZuNull(w.bic),
          geburtsdatum: leerZuNull(w.geburtsdatum),
        }
      : {},
  };
}

// ---------------------------------------------------------------------------------------------------
// Profil (Mitglied)
// ---------------------------------------------------------------------------------------------------

export type ProfilAbschnitt = "personal" | "bank";

/** Felder je Abschnitt des Profils (das Geburtsdatum nur, solange keins gespeichert ist). */
const ABSCHNITT_FELDER: Record<ProfilAbschnitt, readonly Feld[]> = {
  personal: ["strasse", "hausnummer", "plz", "ort", "land", "handynummer", "geburtsdatum"],
  bank: ["iban", "bic"],
};

/**
 * Profil speichern (Mitglied, Kontext `mitglied`): geprüft und gespeichert werden nur die Felder des
 * bearbeiteten Abschnitts, mit vollen Regeln (Pflichtfelder lassen sich nicht leeren). Fehler in Feldern
 * des anderen Abschnitts blockieren nicht.
 *  - Geburtsdatum: nur, solange keins gespeichert ist (einmal selbst nachtragen); sonst wird die Eingabe
 *    ignoriert und das gespeicherte Datum nicht geprüft (das Mitglied kann es nicht ändern).
 *  - Alumni: IBAN/BIC werden nur geprüft und gespeichert, wenn sie geändert wurden (eine alte ungültige
 *    IBAN blockiert sonst das Speichern; Alumni haben nie einen Bank-Mangel). Leeren ist erlaubt.
 */
export function pruefeProfil(
  abschnitt: ProfilAbschnitt,
  eingabe: Record<string, unknown>,
  bestand: MemberSecretValues,
  alumni: boolean,
  heute?: string
): FormularErgebnis {
  const istAlumni = alumni === true;
  const felder = ABSCHNITT_FELDER[abschnitt].filter((feld) => {
    if (feld === "geburtsdatum") return !text(bestand.geburtsdatum).trim();
    // Unveränderte gespeicherte Nummer weder prüfen noch speichern: Die Länderauswahl gilt nur für eine neu
    // eingegebene Nummer (Regeln für Aufrufer, Punkt 1); Altnummern bestätigt das Abfrage-Fenster.
    if (feld === "handynummer" && text(bestand.handynummer).trim()) {
      return handyGeaendert(eingabe.handyLand, eingabe.handynummer, bestand.handynummer);
    }
    if (istAlumni && feld === "iban") return normalizeIban(text(eingabe.iban)) !== normalizeIban(text(bestand.iban));
    if (istAlumni && feld === "bic") return normalisiereBic(eingabe.bic) !== normalisiereBic(bestand.bic);
    return true;
  });

  const daten: Mitgliederdaten = {};
  for (const feld of felder) daten[feld] = eingabe[feld] ?? null;
  if (felder.includes("handynummer")) daten.handyLand = text(eingabe.handyLand) || DEFAULT_COUNTRY;
  // Querbezüge (Land für PLZ/Hausnummer/Ort, IBAN für die BIC) aus dem Abschnitt bzw. dem Bestand.
  if (!felder.includes("land")) daten.land = bestand.land ?? "";
  if (!felder.includes("iban")) daten.iban = bestand.iban ?? "";

  const r = pruefeFormular(daten, { alumni: istAlumni, wer: "mitglied", heute });
  const fehler = fehlerJeFeld(r, felder);
  const gueltig = Object.keys(fehler).length === 0;

  const aenderungen: Partial<MemberSecretValues> = {};
  if (gueltig) for (const feld of felder) aenderungen[feld as keyof MemberSecretValues] = leerZuNull(r.werte[feld]);
  return { gueltig, fehler, ersterFehler: ersterFehler(fehler), aenderungen };
}

// ---------------------------------------------------------------------------------------------------
// Korrektur durch den Vorstand
// ---------------------------------------------------------------------------------------------------

/** Felder des Korrekturdialogs, wie sie angezeigt werden (Handy aufgeteilt, Land mit Standard DE). */
export type KorrekturWerte = {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  land: string;
  handyLand: string;
  handynummer: string;
  geburtsdatum: string;
  bic: string;
};

export const KORREKTUR_FELDER = [
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "land",
  "handyLand",
  "handynummer",
  "geburtsdatum",
  "bic",
] as const satisfies readonly (keyof KorrekturWerte)[];

/** Bestand → Anzeige im Korrekturdialog (Ausgangswerte für den Vergleich „geändert?“). */
export function korrekturWerte(bestand: MemberSecretValues): KorrekturWerte {
  const handy = handyFuerEingabe(bestand.handynummer);
  return {
    strasse: bestand.strasse ?? "",
    hausnummer: bestand.hausnummer ?? "",
    plz: bestand.plz ?? "",
    ort: bestand.ort ?? "",
    land: landAusBestand(bestand.land),
    handyLand: handy.land,
    handynummer: handy.nummer,
    geburtsdatum: bestand.geburtsdatum ?? "",
    bic: bestand.bic ?? "",
  };
}

/** Vergleichsform für „hat der Vorstand das Feld geändert?“ (Leerraum außen egal, BIC ohne Leerzeichen). */
function vergleich(feld: keyof KorrekturWerte, wert: unknown): string {
  const t = text(wert).trim();
  if (feld === "bic") return normalisiereBic(t);
  if (feld === "land" || feld === "handyLand") return t.toUpperCase();
  return t;
}

/** Felder, die der Vorstand gegenüber den Ausgangswerten geändert hat. Handy = Land oder Nummer geändert. */
export function geaenderteKorrekturFelder(eingabe: Partial<Record<keyof KorrekturWerte, unknown>>, basis: KorrekturWerte) {
  const geaendert = new Set<keyof KorrekturWerte>();
  for (const feld of KORREKTUR_FELDER) {
    if (vergleich(feld, eingabe[feld]) !== vergleich(feld, basis[feld])) geaendert.add(feld);
  }
  if (geaendert.has("handyLand")) {
    geaendert.delete("handyLand");
    geaendert.add("handynummer");
  }
  return geaendert;
}

/**
 * Korrektur durch den Vorstand: nur geänderte Felder werden geprüft (`pruefeVorstandskorrektur`) und
 * gespeichert, alte Fehler in anderen Feldern blockieren nicht. Leeren ist erlaubt außer beim Geburtsdatum.
 * `iban`: neue IBAN, leer = unverändert. Die Querbezüge kommen aus dem Bestand.
 */
export function pruefeKorrektur(
  eingabe: Partial<Record<keyof KorrekturWerte | "iban", unknown>>,
  basis: KorrekturWerte,
  bestand: MemberSecretValues,
  heute?: string
): FormularErgebnis & { felder: (keyof MemberSecretValues)[] } {
  const geaendert = geaenderteKorrekturFelder(eingabe, basis);
  const aenderungen: Mitgliederdaten = {};
  for (const feld of geaendert) if (feld !== "handyLand") aenderungen[feld as Feld] = text(eingabe[feld]);
  if (geaendert.has("handynummer")) aenderungen.handyLand = text(eingabe.handyLand) || DEFAULT_COUNTRY;
  const neueIban = normalizeIban(text(eingabe.iban));
  if (neueIban && neueIban !== normalizeIban(text(bestand.iban))) aenderungen.iban = neueIban;

  // Bestand ohne handyLand (Regeln für Aufrufer, Punkt 1): die Auswahl gilt nur für eine neue Nummer.
  const bestehend: Mitgliederdaten = {
    ...Object.fromEntries(Object.entries(bestand).map(([k, v]) => [k, v ?? ""])),
    land: landAusBestand(bestand.land),
  };
  const r = pruefeVorstandskorrektur(aenderungen, bestehend, heute);
  const felder = Object.keys(r.werte) as (keyof MemberSecretValues)[];
  const fehler = fehlerJeFeld(r);
  const out: Partial<MemberSecretValues> = {};
  if (r.gueltig) for (const feld of felder) out[feld] = leerZuNull(r.werte[feld as Feld]);
  return { gueltig: r.gueltig, fehler, ersterFehler: ersterFehler(fehler), aenderungen: out, felder };
}
