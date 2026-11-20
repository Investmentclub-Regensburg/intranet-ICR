"use server";

import { unstable_cache } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { berlinToday } from "@/lib/berlin-date";
import { readMemberSecretFieldMany } from "@/lib/member-secrets-server";
import { altersgruppe } from "@/lib/insights-merkmale";
import type { FinanceOverrideAction } from "@/lib/finance-category";
import {
  computeInsights,
  einzugIbanBedarf,
  istMitglied,
  naechsterEinzug,
  naechstesEinzugsSemester,
  type InsightsData,
  type InsightsProfile,
  type NaechsterEinzug,
} from "@/lib/insights";

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

// Nur Zählungen im Cache (keine Namen, keine Werte): das Geburtsdatum wird hier entschlüsselt, sofort auf
// die Altersgruppe reduziert und nicht weitergegeben oder protokolliert. Ebenso die IBAN (Kachel „Nächster
// Einzug“): nur für Profile, deren Einordnung davon abhängt, nur zum Zählen der Lastschriften, danach verworfen.
// Der Berliner Tag ist Argument und damit Teil des Cache-Schlüssels (unstable_cache nimmt die Argumente in den
// Schlüssel auf): Nach einem Tages- oder Semesterwechsel wird immer neu gerechnet, statt im Hintergrund
// erneuerte alte Zahlen auszuliefern.
const getInsightsDataCached = unstable_cache(
  async (today: string): Promise<InsightsData | null> => {
    const admin = createServiceClient();
    const einzugSemester = naechstesEinzugsSemester(today);

    const [profilesRes, overridesRes] = await Promise.all([
      admin
        .from("profiles")
        .select('id, "Status", "Rolle", "Datum_Antrag", "Datum_Kündigung", "Studiengang / Fach", "Hochschulart", "Abschluss"')
        .range(0, 9999),
      admin
        .from("finance_export_overrides")
        .select("profile_id, action")
        .eq("semester", einzugSemester.semester)
        .eq("year", einzugSemester.year),
    ]);

    if (profilesRes.error || !profilesRes.data) {
      console.error("getInsightsData: profiles", profilesRes.error?.code ?? "leer");
      return null;
    }
    const rows = profilesRes.data as Record<string, unknown>[];

    // Altersgruppen nur für Mitglieder (gleiche Regel wie die Zählung). Entschlüsselt wird hier nur das Feld
    // Geburtsdatum, keine Anschrift oder Handynummer (die IBAN nur unten für den Einzug). Nicht lesbar → ohne Angabe.
    let geburtsdaten = new Map<string, string | null | "unreadable">();
    try {
      const ids = rows
        .filter((r) => istMitglied({ status: text(r["Status"]), rolle: text(r["Rolle"]) }))
        .map((r) => text(r.id));
      geburtsdaten = await readMemberSecretFieldMany(admin, ids, "geburtsdatum");
    } catch (err) {
      console.error("getInsightsData: member_secrets", err instanceof Error ? err.name : "unbekannt");
    }

    const profiles: InsightsProfile[] = rows.map((r) => {
      const id = text(r.id);
      const geb = geburtsdaten.get(id);
      return {
        id,
        status: text(r["Status"]),
        rolle: text(r["Rolle"]),
        datumAntrag: text(r["Datum_Antrag"]) || null,
        datumKuendigung: text(r["Datum_Kündigung"]) || null,
        fach: text(r["Studiengang / Fach"]) || null,
        hochschule: text(r["Hochschulart"]) || null,
        abschluss: text(r["Abschluss"]) || null,
        altersgruppe: geb && geb !== "unreadable" ? altersgruppe(geb, today) : null,
      };
    });
    geburtsdaten.clear();

    // Nächster Einzug: Anpassungen dieses Semesters (fehlt die Tabelle, wie im Export ohne Anpassungen), dann
    // dieselbe Einordnung wie der Finanzexport. Entschlüsselt wird nur die IBAN, nur wo sie entscheidet.
    const anpassungen = new Map<string, FinanceOverrideAction>();
    for (const o of overridesRes.data ?? []) {
      if (o.action === "include" || o.action === "exclude" || o.action === "free_semester") {
        anpassungen.set(String(o.profile_id), o.action);
      }
    }
    let einzug: NaechsterEinzug | null = null;
    try {
      const ibans = await readMemberSecretFieldMany(admin, einzugIbanBedarf(rows, einzugSemester, anpassungen), "iban");
      einzug = naechsterEinzug(rows, einzugSemester, anpassungen, ibans);
      ibans.clear();
    } catch (err) {
      console.error("getInsightsData: member_secrets (IBAN)", err instanceof Error ? err.name : "unbekannt");
    }

    return computeInsights(profiles, today, einzug);
  },
  ["insights-data-v6"],
  { revalidate: 60 }
);

export async function getInsightsData(): Promise<InsightsData | null> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return null;

  return getInsightsDataCached(berlinToday());
}

export type CancellationRow = {
  id: string;
  name: string;
  /** ISO-Zeitpunkt */
  cancelledAt: string;
  reason: string | null;
  reasonText: string | null;
};

/**
 * Kündigungen mit freiwilligem Grund (Selbstkündigung im Intranet), neueste zuerst, alle. Nur Vorstand.
 * Nicht im Cache, weil Namen und Freitext darin stehen.
 */
export async function getCancellations(): Promise<CancellationRow[]> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return [];

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("membership_cancellations")
    .select('id, cancelled_at, reason, reason_text, profiles("Vorname", "Nachname")')
    .order("cancelled_at", { ascending: false })
    .range(0, 9999);
  if (error) {
    console.error("getCancellations:", error.code);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as Record<string, unknown> | null;
    const name = [p?.Vorname, p?.Nachname].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || "–";
    return {
      id: String(r.id ?? ""),
      name,
      cancelledAt: String(r.cancelled_at ?? ""),
      reason: r.reason ? String(r.reason) : null,
      reasonText: r.reason_text ? String(r.reason_text) : null,
    };
  });
}
