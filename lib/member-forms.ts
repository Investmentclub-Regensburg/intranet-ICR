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
  pruefeHandy,
  pruefeVorstandskorrektur,
  repariereHandy,
  type Feld,
  type Mitgliederdaten,
  type Pruefergebnis,
} from "./member-rules";
import type { MemberSecretValues } from "./member-secrets-server";
import { gleicheHandyEingabe } from "./member-inputs";

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
  const geteilt = teileE164(roh) ?? (() => {
    // Altnummer, die sich sicher bereinigen lässt (`+49 0176…`, `0176…`, `0049…`): bereinigt anzeigen.
    // „vorschlag“/„offen“ bleiben roh (Nachtrag PR 2, Punkt 4). Nur Anzeige: gilt als unverändert.
    const bereinigt = handyBereinigt(roh);
    return bereinigt ? teileE164(bereinigt) : null;
  })();
  return geteilt ?? { land: DEFAULT_COUNTRY, nummer: roh };
}

/** Gültige E.164-Nummer → Land + Nummer ohne Vorwahl (international formatiert), sonst null. */
function teileE164(roh: string): { land: string; nummer: string } | null {
  if (!/^\+\d+$/.test(roh)) return null;
  const nummer = parsePhoneNumberFromString(roh);
  const land = nummer?.country;
  if (!nummer || !nummer.isValid() || !land || !findCountry(land)) return null;
  const international = nummer.formatInternational();
  const prefix = `+${nummer.countryCallingCode}`;
  return {
    land,
    nummer: international.startsWith(prefix) ? international.slice(prefix.length).trim() : international,
  };
}

/** E.164 einer Altnummer, wenn `repariereHandy` sie als „sicher“ bereinigt; sonst null. */
export function handyBereinigt(gespeichert: string | null | undefined): string | null {
  const roh = text(gespeichert).trim();
  if (!roh || /^\+\d+$/.test(roh)) return null;
  const r = repariereHandy(roh, DEFAULT_COUNTRY);
  return r.status === "sicher" ? r.wert : null;
}

/**
 * Anzeige einer gespeicherten Handynummer: international formatiert; eine Altnummer, die `repariereHandy` sicher
 * bereinigt, genauso bereinigt wie im Formular; sonst roh.
 */
export function handyAnzeige(gespeichert: string | null | undefined): string {
  const roh = text(gespeichert).trim();
  if (!roh) return "";
  if (/^\+\d+$/.test(roh)) return formatiereHandyAnzeige(roh);
  const bereinigt = handyBereinigt(roh);
  return bereinigt ? formatiereHandyAnzeige(bereinigt) : roh;
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

/** PLZ-Formatfehler in Deutschland: Land nennen (bei Auslandsadressen steht das Land evtl. noch auf DE). */
export const PLZ_DE_MELDUNG = "In Deutschland hat die PLZ 5 Ziffern.";

/**
 * Meldungen je Feld aus einem Prüfergebnis, optional auf `felder` beschränkt. `land_unbekannt` steht in den
 * Regeln an `land` UND `plz`; angezeigt wird es nur am Land (Regeln für Aufrufer, Punkt 4). `land` = Land der
 * Anschrift, gegen das geprüft wurde.
 */
function fehlerJeFeld(r: Pruefergebnis, land: unknown, felder?: readonly Feld[]): FeldFehler {
  const fehler: FeldFehler = {};
  const l = text(land).trim().toUpperCase();
  const de = l === "" || l === DEFAULT_COUNTRY;
  for (const m of r.maengel) {
    if (felder && !felder.includes(m.feld)) continue;
    if (m.code === "land_unbekannt" && m.feld !== "land") continue;
    fehler[m.feld] = m.feld === "plz" && m.code === "format" && de ? PLZ_DE_MELDUNG : (r.fehler[m.feld] ?? "");
  }
  return fehler;
}

function ersterFehler(fehler: FeldFehler): string | null {
  return FELD_REIHENFOLGE.map((f) => fehler[f]).find((f) => f !== undefined) ?? null;
}

/**
 * Hat jemand die Handynummer (Länderauswahl oder Nummer) gegenüber der Anzeige des Bestands geändert?
 * Verglichen wird nach der Eingabe-Formatierung: Hat das Feld eine Altnummer nur umformatiert
 * (`0176 12` → `176 12`), gilt sie als unverändert.
 */
function handyGeaendert(land: unknown, nummer: unknown, gespeichert: string | null | undefined): boolean {
  return !gleicheHandyEingabe({ land: text(land), nummer: text(nummer) }, handyFuerEingabe(gespeichert));
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
  const fehler = fehlerJeFeld(r, eingabe.land);
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

/** Felder je Schritt der Registrierung (Prüfung bei „Weiter“). */
export const REGISTRIERUNG_SCHRITTE = {
  person: ["vorname", "nachname", "geburtsdatum"],
  address: ["strasse", "hausnummer", "plz", "ort", "land"],
  contact: ["email", "handynummer"],
  bank: ["iban", "bic"],
} as const satisfies Record<string, readonly Feld[]>;
export type RegistrierungSchritt = keyof typeof REGISTRIERUNG_SCHRITTE;

export function istRegistrierungSchritt(schritt: unknown): schritt is RegistrierungSchritt {
  return typeof schritt === "string" && Object.prototype.hasOwnProperty.call(REGISTRIERUNG_SCHRITTE, schritt);
}

/**
 * Prüfung eines Schritts der Registrierung (bei „Weiter“): dieselben Regeln wie beim Absenden, gemeldet werden
 * nur die Felder des Schritts. Querbezüge liegen im selben Schritt (Land → PLZ, IBAN → BIC).
 */
export function pruefeRegistrierungSchritt(
  schritt: RegistrierungSchritt,
  eingabe: Partial<RegistrierungEingabe>,
  heute?: string
): FeldFehler {
  const leer: RegistrierungEingabe = {
    vorname: "",
    nachname: "",
    email: "",
    geburtsdatum: "",
    strasse: "",
    hausnummer: "",
    plz: "",
    ort: "",
    land: "",
    handyLand: "",
    handynummer: "",
    iban: "",
    bic: "",
  };
  const daten = { ...leer };
  const erlaubt: readonly string[] = [...REGISTRIERUNG_SCHRITTE[schritt], ...(schritt === "contact" ? ["handyLand"] : [])];
  for (const key of erlaubt) {
    if (Object.prototype.hasOwnProperty.call(eingabe, key)) daten[key as keyof RegistrierungEingabe] = eingabe[key as keyof RegistrierungEingabe];
  }
  const { fehler } = pruefeRegistrierung(daten, heute);
  const out: FeldFehler = {};
  for (const feld of REGISTRIERUNG_SCHRITTE[schritt]) if (fehler[feld]) out[feld] = fehler[feld];
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Profil (Mitglied)
// ---------------------------------------------------------------------------------------------------

export type ProfilAbschnitt = "personal" | "bank";

/** Name im Klartext (profiles.Vorname/Nachname). */
export type Namen = { vorname?: string | null; nachname?: string | null };

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
  bestand: MemberSecretValues & Namen,
  alumni: boolean,
  heute?: string,
  /** Formular wurde ohne bekanntes Land geladen (Übergang vor der Migration): Land nicht speichern. */
  landUnbekannt = false
): FormularErgebnis & { namen: { vorname?: string; nachname?: string } } {
  const istAlumni = alumni === true;
  // Name (Klartext in profiles) gehört zu „Persönliches“, wenn das Formular ihn schickt (Entscheidung 11).
  const namensFelder: Feld[] =
    abschnitt === "personal" ? (["vorname", "nachname"] as const).filter((f) => f in eingabe) : [];
  const felder = [...namensFelder, ...ABSCHNITT_FELDER[abschnitt]].filter((feld) => {
    // Name und Geburtsdatum: ein unveränderter gespeicherter Wert wird nicht neu bewertet (Altdaten aus dem
    // Import sollen das Speichern der Adresse nicht blockieren); leer ist immer ein Fehler (Pflicht).
    if (feld === "vorname" || feld === "nachname" || feld === "geburtsdatum") {
      const alt = text(bestand[feld]).trim();
      return !alt || text(eingabe[feld]).trim() !== alt;
    }
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
  const fehler = fehlerJeFeld(r, daten.land, felder);
  const gueltig = Object.keys(fehler).length === 0;

  const namen: { vorname?: string; nachname?: string } = {};
  if (gueltig) {
    for (const feld of namensFelder) {
      if (!felder.includes(feld)) continue;
      const neu = r.werte[feld] ?? "";
      if (neu !== text(bestand[feld as "vorname" | "nachname"]).trim()) namen[feld as "vorname" | "nachname"] = neu;
    }
  }

  // Nur echte Änderungen speichern: ohne Änderung wird nichts geschrieben (keine neue Version, kein Protokoll).
  // Das Land kommt mit, sobald sich irgendetwas ändert (Altdaten ohne Land bekommen so ihr Land).
  const aenderungen: Partial<MemberSecretValues> = {};
  if (gueltig) {
    for (const feld of felder) {
      const neu = leerZuNull(r.werte[feld]);
      if (feld === "vorname" || feld === "nachname") continue;
      if (feld !== "land" && neu !== (bestand[feld as keyof MemberSecretValues] ?? null)) {
        aenderungen[feld as keyof MemberSecretValues] = neu;
      }
    }
    if (felder.includes("land") && !landUnbekannt) {
      const land = leerZuNull(r.werte.land);
      if (land !== (bestand.land ?? null) && (Object.keys(aenderungen).length > 0 || land !== landAusBestand(bestand.land))) {
        aenderungen.land = land;
      }
    }
    // Sicher bereinigbare Altnummer (nur angezeigt, nicht angefasst): mitspeichern, wenn der Abschnitt ohnehin
    // gespeichert wird – geprüft, als E.164 ohne angenommene Länderauswahl.
    const bereinigt = abschnitt === "personal" && !felder.includes("handynummer") ? handyBereinigt(bestand.handynummer) : null;
    if (bereinigt && Object.keys(aenderungen).length > 0) {
      const h = pruefeHandy(bereinigt, undefined, { alumni: istAlumni, wer: "mitglied", heute });
      if (!h.code) aenderungen.handynummer = h.wert;
    }
  }
  return { gueltig, fehler, ersterFehler: ersterFehler(fehler), aenderungen, namen };
}

// ---------------------------------------------------------------------------------------------------
// Korrektur durch den Vorstand
// ---------------------------------------------------------------------------------------------------

/** Felder des Korrekturdialogs, wie sie angezeigt werden (Handy aufgeteilt, Land mit Standard DE). */
export type KorrekturWerte = {
  vorname: string;
  nachname: string;
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
  "vorname",
  "nachname",
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
export function korrekturWerte(bestand: MemberSecretValues & Namen): KorrekturWerte {
  const handy = handyFuerEingabe(bestand.handynummer);
  return {
    vorname: text(bestand.vorname).trim(),
    nachname: text(bestand.nachname).trim(),
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

/**
 * Felder, die der Vorstand gegenüber den Ausgangswerten geändert hat. Handy = Land oder Nummer geändert,
 * verglichen nach der Eingabe-Formatierung (nur umformatiert = unverändert).
 */
export function geaenderteKorrekturFelder(eingabe: Partial<Record<keyof KorrekturWerte, unknown>>, basis: KorrekturWerte) {
  const geaendert = new Set<keyof KorrekturWerte>();
  for (const feld of KORREKTUR_FELDER) {
    if (feld === "handyLand" || feld === "handynummer") continue;
    if (vergleich(feld, eingabe[feld]) !== vergleich(feld, basis[feld])) geaendert.add(feld);
  }
  const handyNeu = { land: text(eingabe.handyLand), nummer: text(eingabe.handynummer) };
  if (!gleicheHandyEingabe(handyNeu, { land: basis.handyLand, nummer: basis.handynummer })) geaendert.add("handynummer");
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
  bestand: MemberSecretValues & Namen,
  heute?: string,
  /** Dialog wurde ohne bekanntes Land geladen (Übergang vor der Migration): übermitteltes Land ignorieren. */
  landUnbekannt = false
): FormularErgebnis & { felder: (keyof MemberSecretValues)[]; namen: { vorname?: string; nachname?: string } } {
  const geaendert = geaenderteKorrekturFelder(eingabe, basis);
  if (landUnbekannt) geaendert.delete("land");
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
  const alleFelder = Object.keys(r.werte) as Feld[];
  const felder = alleFelder.filter((f) => f !== "vorname" && f !== "nachname") as (keyof MemberSecretValues)[];
  const fehler = fehlerJeFeld(r, aenderungen.land ?? bestehend.land);
  const out: Partial<MemberSecretValues> = {};
  const namen: { vorname?: string; nachname?: string } = {};
  if (r.gueltig) {
    for (const feld of felder) out[feld] = leerZuNull(r.werte[feld as Feld]);
    if (r.werte.vorname !== undefined) namen.vorname = r.werte.vorname;
    if (r.werte.nachname !== undefined) namen.nachname = r.werte.nachname;
  }
  return { gueltig: r.gueltig, fehler, ersterFehler: ersterFehler(fehler), aenderungen: out, felder, namen };
}
