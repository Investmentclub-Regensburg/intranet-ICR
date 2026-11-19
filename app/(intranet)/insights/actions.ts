"use server";

import { unstable_cache } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { berlinToday } from "@/lib/berlin-date";
import { readMemberSecretsMany, type MemberSecretsResult } from "@/lib/member-secrets-server";
import { altersgruppe } from "@/lib/insights-merkmale";
import {
  computeInsights,
  overrideKey,
  type FeeOverride,
  type InsightsData,
  type InsightsProfile,
} from "@/lib/insights";

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

// Nur Zählungen im Cache (keine Namen, keine Werte): das Geburtsdatum wird hier entschlüsselt, sofort auf
// die Altersgruppe reduziert und nicht weitergegeben oder protokolliert.
const getInsightsDataCached = unstable_cache(
  async (): Promise<InsightsData | null> => {
    const admin = createServiceClient();
    const today = berlinToday();
    const nextYear = Number(today.slice(0, 4)) + 1;

    const [profilesRes, overridesRes] = await Promise.all([
      admin
        .from("profiles")
        .select('id, "Status", "Rolle", "Datum_Antrag", "Datum_Kündigung", "Studiengang / Fach", "Uni/OTH", "Abschluss"')
        .range(0, 9999),
      admin.from("finance_export_overrides").select("profile_id, action, semester, year").eq("year", nextYear),
    ]);

    if (profilesRes.error || !profilesRes.data) {
      console.error("getInsightsData: profiles", profilesRes.error?.code ?? "leer");
      return null;
    }
    const rows = profilesRes.data as Record<string, unknown>[];

    // Altersgruppen nur für Mitglieder (aktiv/Alumni). Nicht lesbar → ohne Angabe.
    let secrets: Map<string, MemberSecretsResult> = new Map();
    try {
      const mitglieder = rows
        .filter((r) => {
          const s = text(r["Status"]).trim().toLowerCase();
          return s !== "cancelled" && s !== "applicant";
        })
        .map((r) => ({ id: text(r.id) }));
      secrets = await readMemberSecretsMany(admin, mitglieder);
    } catch (err) {
      console.error("getInsightsData: member_secrets", err instanceof Error ? err.name : "unbekannt");
    }

    const profiles: InsightsProfile[] = rows.map((r) => {
      const id = text(r.id);
      const s = secrets.get(id);
      return {
        id,
        status: text(r["Status"]),
        rolle: text(r["Rolle"]),
        datumAntrag: text(r["Datum_Antrag"]) || null,
        datumKuendigung: text(r["Datum_Kündigung"]) || null,
        fach: text(r["Studiengang / Fach"]) || null,
        hochschule: text(r["Uni/OTH"]) || null,
        abschluss: text(r["Abschluss"]) || null,
        altersgruppe: s && s !== "unreadable" ? altersgruppe(s.geburtsdatum, today) : null,
      };
    });
    secrets.clear();

    // Anpassungen (Freisemester, entfernen, aufnehmen) der beiden Semester des nächsten Jahres.
    const overrides = new Map<string, Map<string, FeeOverride>>();
    for (const o of overridesRes.data ?? []) {
      if (o.action !== "include" && o.action !== "exclude" && o.action !== "free_semester") continue;
      if (o.semester !== "SoSe" && o.semester !== "WiSe") continue;
      const key = overrideKey({ semester: o.semester, year: Number(o.year) });
      const map = overrides.get(key) ?? new Map<string, FeeOverride>();
      map.set(String(o.profile_id), o.action);
      overrides.set(key, map);
    }

    return computeInsights(profiles, today, overrides);
  },
  ["insights-data-v3"],
  { revalidate: 60 }
);

export async function getInsightsData(): Promise<InsightsData | null> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return null;

  return getInsightsDataCached();
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
