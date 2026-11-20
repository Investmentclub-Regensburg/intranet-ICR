/**
 * Einordnung eines Profils im Beitragseinzug und Debitor-BIC fürs SEPA-XML. Rein und ohne I/O, damit die Regeln
 * als Unit-Tests laufen (tests/finance-category.test.mjs); genutzt von app/(intranet)/admin/actions/finance.ts.
 * Browser-tauglich (nur lib/iban.ts).
 */
import { istNichtEwrIban, validateBICFormat, validateIBAN } from "./iban";

/** Manuelle Anpassung je Semester (Tabelle finance_export_overrides). */
export type FinanceOverrideAction = "include" | "exclude" | "free_semester";

/**
 * Wohin ein Profil im Export fällt.
 *   cancelled  Kündigungsdatum vor dem Stichtag, oder Status „gekündigt“ ohne Kündigungsdatum
 *   applicant  offener Antrag (Status „applicant“): noch kein Mitglied, nie eingezogen (Klickrunde 20.11.2026)
 *   non_eea  Konto in einem SEPA-Land außerhalb des EWR (lib/iban.ts NICHT_EWR_SEPA_LAENDER): nicht in die
 *            Lastschriftdatei, bis der Export Anschrift und BIC für diese Konten liefert (Entscheidung Hannes,
 *            Review Pflichtfelder M2); der Vorstand zieht den Beitrag manuell ein.
 */
export type FinanceCategory =
  | "debit"
  | "alumni"
  | "cancelled"
  | "applicant"
  | "free_semester"
  | "no_iban"
  | "invalid"
  | "non_eea"
  | "removed";

export const FINANCE_CATEGORIES: readonly FinanceCategory[] = [
  "debit",
  "alumni",
  "cancelled",
  "applicant",
  "free_semester",
  "no_iban",
  "invalid",
  "non_eea",
  "removed",
];

export type FinanceKategorieEingabe = {
  override: FinanceOverrideAction | null;
  /** Kleinbuchstaben (profiles.Status). */
  status: string;
  /** Kleinbuchstaben (profiles.Rolle). */
  role: string;
  /** YYYY-MM-DD oder null. */
  joinedAt: string | null;
  cancelledAt: string | null;
  /** Semesterbeginn YYYY-MM-DD. */
  periodStartDay: string;
  /** IBAN ohne Leerzeichen, Großbuchstaben (leer = keine). */
  iban: string;
};

/**
 * Regeln je Profil (Reihenfolge):
 *   0. Nie eingezogen, auch nicht mit Anpassung „aufnehmen“ (Klickrunde 20.11.2026, betrifft Geld):
 *      - offener Antrag (Status „applicant“): noch kein Mitglied, kein Mandat;
 *      - Status „gekündigt“ ohne Kündigungsdatum (unklar, seit wann: lieber nicht einziehen);
 *      - Status „gekündigt“ mit Kündigungsdatum vor dem Stichtag.
 *      Status „gekündigt“ mit Datum am oder nach dem Stichtag: Das laufende Semester wird noch eingezogen, wie
 *      Kündigungsmail (`cancel_membership`) und Profil (`nextFeeStop`) es ankündigen („ab dem nächsten Stichtag
 *      kein Beitrag mehr“); danach gelten die übrigen Regeln. Bis dahin (origin/dev) liefen offene Anträge und
 *      Gekündigte ohne Datum durch, und „aufnehmen“ hob die Kündigung vor dem Stichtag auf.
 *   1. Manuelle Anpassung „entfernen“ / „Freisemester“ gewinnt immer.
 *   2. Ohne Anpassung „aufnehmen“: Alumni, gekündigt vor dem Stichtag, Eintritt ab dem Stichtag (Freisemester)
 *      fallen heraus.
 *   3. Ohne IBAN, mit ungültiger IBAN oder mit Konto außerhalb des EWR: nicht im Export (auch bei „aufnehmen“).
 *   4. Sonst Lastschrift.
 */
export function financeKategorie(e: FinanceKategorieEingabe): FinanceCategory {
  if (e.status === "applicant") return "applicant";
  if (e.status === "cancelled" && (!e.cancelledAt || e.cancelledAt < e.periodStartDay)) return "cancelled";
  if (e.override === "exclude") return "removed";
  if (e.override === "free_semester") return "free_semester";
  if (e.override !== "include" && (e.role === "alumni" || e.status === "alumni")) return "alumni";
  if (e.override !== "include" && e.cancelledAt && e.cancelledAt < e.periodStartDay) return "cancelled";
  if (e.override !== "include" && e.joinedAt && e.joinedAt >= e.periodStartDay) return "free_semester";
  if (!e.iban) return "no_iban";
  if (!validateIBAN(e.iban)) return "invalid";
  if (istNichtEwrIban(e.iban)) return "non_eea";
  return "debit";
}

/**
 * BIC des Zahlers für CSV und SEPA-XML (`DbtrAgt`). Leer heißt: im XML `DbtrAgt/FinInstnId/Othr/Id` =
 * „NOTPROVIDED“.
 *
 * Quelle: EPC130-08 „SEPA Core Direct Debit Customer-to-Bank Implementation Guidelines“ Version 7.0 vom
 * 30.11.2012 (Format pain.008.001.02, wie components/admin/FinanceExport.tsx), Index 2.70 Debtor Agent:
 * „Either BIC or ‚Other/Identification‘ must be used“, unter Other/Identification „Only ‚NOTPROVIDED‘ is
 * allowed“; die BIC ist für Inlandszahlungen und seit 1.2.2016 im EU/EWR-Grenzverkehr optional und bleibt für
 * Zahlungen mit Nicht-EU/EWR-SEPA-Ländern Pflicht (Art. 5 Abs. 7 VO (EU) 260/2012).
 * https://www.sepaesp.es/f/websepa/secciones/Instrumentos/EPC130-08_SDD_core_C2B_IG.pdf (abgerufen 19.11.2026).
 *
 * Bei EWR-IBANs geht deshalb nie eine gespeicherte BIC mit (Review Pflichtfelder M1, Entscheidung Hannes): Die BIC
 * fragt seit 20.11.2026 niemand mehr ab, gespeicherte Altwerte können veraltet sein (alte Bank) und zu einer
 * Rückweisung führen. Bei Nicht-EWR-IBANs nur eine BIC im gültigen Format (diese Konten nimmt
 * `financeKategorie` derzeit ohnehin aus der Lastschriftdatei).
 */
export function debitorBic(iban: string, bic: string | null | undefined): string {
  if (!istNichtEwrIban(iban)) return "";
  const b = String(bic ?? "").replace(/\s/g, "").toUpperCase();
  return b && validateBICFormat(b) ? b : "";
}

// ---------------------------------------------------------------------------------------------------
// Einordnung direkt aus einer profiles-Zeile (eine Stelle für Finanzexport und Insights, Klickrunde 20.11.2026)
// ---------------------------------------------------------------------------------------------------

export type FinanceSemester = "SoSe" | "WiSe";

/** Semesterbeginn = Stichtag des Einzugs (YYYY-MM-DD): SoSe 15.03., WiSe 01.10. */
export function financeStichtag(semester: FinanceSemester, year: number): string {
  return semester === "SoSe" ? `${year}-03-15` : `${year}-10-01`;
}

function textWert(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Datumsspalte als YYYY-MM-DD (UTC-Tag wie bisher im Export) oder null. */
export function financeDatum(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** IBAN wie im Export: ohne Leerraum, Großbuchstaben (leer = keine). */
export function financeIban(value: unknown): string {
  return textWert(value).replace(/\s/g, "").toUpperCase();
}

/** Spalten einer profiles-Zeile, die die Einordnung braucht. */
export type FinanceProfilZeile = {
  Status?: unknown;
  Rolle?: unknown;
  Datum_Antrag?: unknown;
  "Datum_Kündigung"?: unknown;
};

/**
 * `financeKategorie` für eine profiles-Zeile („Status“, „Rolle“, „Datum_Antrag“, „Datum_Kündigung“) und die
 * entschlüsselte IBAN. Genau so ordnet der Finanzexport (Vorschau und SEPA) ein; die Insights-Kachel „Nächster
 * Einzug“ nutzt dieselbe Funktion.
 */
export function financeKategorieFuerProfil(
  profil: FinanceProfilZeile,
  iban: unknown,
  override: FinanceOverrideAction | null,
  periodStartDay: string,
): FinanceCategory {
  return financeKategorie({
    override,
    status: textWert(profil.Status).toLowerCase(),
    role: textWert(profil.Rolle).toLowerCase(),
    joinedAt: financeDatum(profil.Datum_Antrag),
    cancelledAt: financeDatum(profil["Datum_Kündigung"]),
    periodStartDay,
    iban: financeIban(iban),
  });
}

/**
 * Hängt die Einordnung von der IBAN ab? Nur dann muss sie entschlüsselt werden (Anpassung, Alumni, Kündigung und
 * Freisemester entscheiden vorher).
 */
export function financeBrauchtIban(
  profil: FinanceProfilZeile,
  override: FinanceOverrideAction | null,
  periodStartDay: string,
): boolean {
  return financeKategorieFuerProfil(profil, "", override, periodStartDay) === "no_iban";
}
