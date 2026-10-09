"use server";

import { EXPORT_ROLES, requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { sanitizeForSEPA } from "@/lib/sepa";
import { validateIBAN, validateBICFormat } from "@/lib/iban";

export type Semester = "SoSe" | "WiSe";

export type FinanceMemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  iban: string;
  bic: string;
  status: string;
  joinedAt: string | null;
  mandateDate: string | null;
  amount: number;
};

/** Manuelle Anpassung je Semester (Tabelle finance_export_overrides). */
export type FinanceOverrideAction = "include" | "exclude" | "free_semester";

/** Wohin ein Profil im Export fällt. */
export type FinanceCategory =
  | "debit"
  | "alumni"
  | "cancelled"
  | "free_semester"
  | "no_iban"
  | "invalid"
  | "removed";

/** Eine Zeile der Vorschau (alle Profile, IBAN gekürzt). */
export type FinancePreviewRow = {
  id: string;
  firstName: string;
  lastName: string;
  category: FinanceCategory;
  /** Manuelle Anpassung für dieses Semester, sonst null (automatische Regel). */
  override: FinanceOverrideAction | null;
  iban: string;
  bic: string;
  /** Nur bei fehlenden/ungültigen Bankdaten, damit der Vorstand nachfragen kann. */
  email: string;
  joinedAt: string | null;
  cancelledAt: string | null;
  amount: number;
};

export type FilterStats = Record<FinanceCategory, number> & { total: number };

export type SepaCreditor = {
  name: string;
  iban: string;
  bic: string;
  creditorId: string;
};

export type FinanceExportResult = {
  /** Lastschriften (im Export-Modus mit vollständiger IBAN). */
  validMembers: FinanceMemberRow[];
  /** Alle Profile mit Kategorie, nur im Vorschau-Modus gefüllt. */
  rows: FinancePreviewRow[];
  stats: FilterStats;
  /** false, solange die Tabelle finance_export_overrides fehlt (Migration nicht ausgeführt). */
  overridesAvailable: boolean;
  /** Nur im Export-Modus und nur, wenn die SEPA_CREDITOR_*-Variablen gültig gesetzt sind. */
  creditor: SepaCreditor | null;
};

const CREDITOR_ID_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/;

/**
 * Gläubigerdaten des Vereins für das SEPA-XML aus der Server-Umgebung
 * (nicht im Repository und nicht im Browser-Bundle).
 */
function getSepaCreditor(): SepaCreditor | null {
  const name = (process.env.SEPA_CREDITOR_NAME ?? "").trim() || "Investmentclub Regensburg e.V.";
  const iban = (process.env.SEPA_CREDITOR_IBAN ?? "").replace(/\s/g, "").toUpperCase();
  const bic = (process.env.SEPA_CREDITOR_BIC ?? "").replace(/\s/g, "").toUpperCase();
  const creditorId = (process.env.SEPA_CREDITOR_ID ?? "").replace(/\s/g, "").toUpperCase();
  if (!validateIBAN(iban) || !validateBICFormat(bic) || !CREDITOR_ID_RE.test(creditorId)) {
    return null;
  }
  return { name, iban, bic, creditorId };
}

/** IBAN für die Vorschau kürzen (Ländercode + Prüfziffer … letzte 4 Stellen). */
function maskIban(iban: string): string {
  if (iban.length <= 8) return iban ? "••••" : "";
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
}

/**
 * "preview": Vorschau im Browser, IBANs gekürzt.
 * "export": vollständige Daten, nur für den Download der Export-Datei.
 */
export type FinanceExportMode = "preview" | "export";

function getPeriodStart(semester: Semester, year: number): Date {
  if (semester === "SoSe") {
    return new Date(year, 2, 15); // 15.03.YYYY (Monat 2, 0-basiert)
  }
  return new Date(year, 9, 1); // 01.10.YYYY (Monat 9, 0-basiert)
}

const FEE_PER_SEMESTER = 15.0;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OVERRIDE_ACTIONS: readonly FinanceOverrideAction[] = ["include", "exclude", "free_semester"];

function checkPeriod(semester: Semester, year: number) {
  const maxYear = new Date().getFullYear() + 1;
  if (semester !== "SoSe" && semester !== "WiSe") {
    throw new Error("Ungültiges Semester.");
  }
  if (!Number.isInteger(year) || year < 2000 || year > maxYear) {
    throw new Error("Ungültiges Jahr.");
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Datum als YYYY-MM-DD oder null. */
function day(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Regeln je Profil (Reihenfolge):
 *   1. Manuelle Anpassung „entfernen“ / „Freisemester“ gewinnt immer.
 *   2. Ohne Anpassung „aufnehmen“: Alumni, gekündigt vor dem Stichtag, Eintritt ab dem
 *      Stichtag (Freisemester) fallen heraus.
 *   3. Ohne IBAN bzw. mit ungültiger IBAN/BIC: nicht im Export (auch bei „aufnehmen“).
 *   4. Sonst Lastschrift über FEE_PER_SEMESTER.
 */
export async function getFinanceExportData(
  semester: Semester,
  year: number,
  mode: FinanceExportMode = "preview"
): Promise<FinanceExportResult> {
  const auth = await requireRole(EXPORT_ROLES, "Keine Berechtigung für den Finanzexport.");
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  checkPeriod(semester, year);
  const showFullIban = mode === "export";

  const supabase = createServiceClient();
  const periodStart = getPeriodStart(semester, year);

  const [{ data: profiles, error }, overridesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select('"id", "Vorname", "Nachname", "IBAN", "BIC", "Status", "Rolle", "Datum_Kündigung", "Datum_Antrag", "E-Mail"')
      .range(0, 9999),
    supabase
      .from("finance_export_overrides")
      .select("profile_id, action")
      .eq("semester", semester)
      .eq("year", year),
  ]);

  if (error || !profiles) {
    throw new Error("Fehler beim Laden der Profile aus der Datenbank.");
  }
  // Fehlt die Tabelle noch (Migration nicht ausgeführt), läuft der Export ohne Anpassungen.
  const overridesAvailable = !overridesRes.error;
  const overrides = new Map<string, FinanceOverrideAction>();
  for (const o of overridesRes.data ?? []) {
    if (OVERRIDE_ACTIONS.includes(o.action as FinanceOverrideAction)) {
      overrides.set(String(o.profile_id), o.action as FinanceOverrideAction);
    }
  }

  const validMembers: FinanceMemberRow[] = [];
  const rows: FinancePreviewRow[] = [];
  const stats: FilterStats = {
    total: profiles.length,
    debit: 0,
    alumni: 0,
    cancelled: 0,
    free_semester: 0,
    no_iban: 0,
    invalid: 0,
    removed: 0,
  };

  for (const profile of profiles as { [key: string]: unknown }[]) {
    const id = String(profile["id"] ?? "");
    const override = overrides.get(id) ?? null;
    const status = text(profile["Status"]).toLowerCase();
    const role = text(profile["Rolle"]).toLowerCase();
    const ibanClean = text(profile["IBAN"]).replace(/\s/g, "").toUpperCase();
    const bicClean = text(profile["BIC"]).replace(/\s/g, "").toUpperCase();
    const joinedAt = day(profile["Datum_Antrag"]);
    const cancelledAt = day(profile["Datum_Kündigung"]);

    let category: FinanceCategory;
    if (override === "exclude") {
      category = "removed";
    } else if (override === "free_semester") {
      category = "free_semester";
    } else if (override !== "include" && (role === "alumni" || status === "alumni")) {
      category = "alumni";
    } else if (override !== "include" && cancelledAt && new Date(cancelledAt) < periodStart) {
      category = "cancelled";
    } else if (override !== "include" && joinedAt && new Date(joinedAt) >= periodStart) {
      category = "free_semester";
    } else if (!ibanClean) {
      category = "no_iban";
    } else if (!validateIBAN(ibanClean) || (bicClean && !validateBICFormat(bicClean))) {
      category = "invalid";
    } else {
      category = "debit";
    }
    stats[category]++;

    const firstName = sanitizeForSEPA(text(profile["Vorname"]));
    const lastName = sanitizeForSEPA(text(profile["Nachname"]));
    const iban = showFullIban ? ibanClean : maskIban(ibanClean);
    const amount = category === "debit" ? FEE_PER_SEMESTER : 0;

    if (category === "debit") {
      validMembers.push({
        id,
        firstName,
        lastName,
        iban,
        bic: bicClean,
        status,
        joinedAt,
        mandateDate: joinedAt ?? new Date().toISOString().slice(0, 10),
        amount,
      });
    }
    if (!showFullIban) {
      rows.push({
        id,
        firstName,
        lastName,
        category,
        override,
        iban,
        bic: bicClean,
        email: category === "no_iban" || category === "invalid" ? text(profile["E-Mail"]) : "",
        joinedAt,
        cancelledAt,
        amount,
      });
    }
  }

  rows.sort((a, b) => a.lastName.localeCompare(b.lastName, "de") || a.firstName.localeCompare(b.firstName, "de"));

  return {
    validMembers,
    rows,
    stats,
    overridesAvailable,
    creditor: showFullIban ? getSepaCreditor() : null,
  };
}

/**
 * Manuelle Anpassung für ein Profil in einem Semester setzen (action) oder aufheben (null).
 */
export async function setFinanceOverride(
  semester: Semester,
  year: number,
  profileId: string,
  action: FinanceOverrideAction | null
): Promise<{ error?: string }> {
  const auth = await requireRole(EXPORT_ROLES, "Keine Berechtigung für den Finanzexport.");
  if (!auth.ok) return { error: auth.error };
  try {
    checkPeriod(semester, year);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ungültiger Zeitraum." };
  }
  if (!UUID_RE.test(profileId)) return { error: "Ungültiges Mitglied." };
  if (action !== null && !OVERRIDE_ACTIONS.includes(action)) return { error: "Ungültige Aktion." };

  const supabase = createServiceClient();
  if (action === null) {
    const { error } = await supabase
      .from("finance_export_overrides")
      .delete()
      .eq("semester", semester)
      .eq("year", year)
      .eq("profile_id", profileId);
    return error ? { error: "Anpassung konnte nicht entfernt werden." } : {};
  }

  const { error } = await supabase.from("finance_export_overrides").upsert(
    {
      semester,
      year,
      profile_id: profileId,
      action,
      created_by: auth.user.id,
      created_at: new Date().toISOString(),
    },
    { onConflict: "semester,year,profile_id" }
  );
  return error ? { error: "Anpassung konnte nicht gespeichert werden." } : {};
}
