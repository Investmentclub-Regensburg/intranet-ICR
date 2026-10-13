"use server";

import { unstable_cache } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { berlinToday } from "@/lib/berlin-date";
import { cancellationReasonLabel } from "@/lib/cancellation-reasons";
import {
  computeInsights,
  periodOf,
  type CountItem,
  type FeeOverride,
  type InsightsData,
  type InsightsProfile,
} from "@/lib/insights";

export type InsightsPageData = InsightsData & {
  /** Kündigungsgründe aus der Selbstkündigung (freiwillige Angabe), alle bisherigen. */
  cancellationReasons: { items: CountItem[]; total: number };
};

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

const getInsightsDataCached = unstable_cache(
  async (): Promise<InsightsPageData | null> => {
    const admin = createServiceClient();
    const today = berlinToday();
    const period = periodOf(today);

    const [profilesRes, overridesRes, reasonsRes] = await Promise.all([
      admin
        .from("profiles")
        .select('id, "Status", "Rolle", "Datum_Antrag", "Datum_Kündigung", "Studiengang / Fach", "Hochschulart"')
        .range(0, 9999),
      admin
        .from("finance_export_overrides")
        .select("profile_id, action")
        .eq("semester", period.semester)
        .eq("year", period.year),
      admin.from("membership_cancellations").select("reason"),
    ]);

    if (profilesRes.error || !profilesRes.data) return null;

    const profiles: InsightsProfile[] = profilesRes.data.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: text(r.id),
        status: text(r["Status"]),
        rolle: text(r["Rolle"]),
        datumAntrag: text(r["Datum_Antrag"]) || null,
        datumKuendigung: text(r["Datum_Kündigung"]) || null,
        fach: text(r["Studiengang / Fach"]) || null,
        hochschule: text(r["Hochschulart"]) || null,
      };
    });

    const overrides = new Map<string, FeeOverride>();
    for (const o of overridesRes.data ?? []) {
      if (o.action === "include" || o.action === "exclude" || o.action === "free_semester") {
        overrides.set(String(o.profile_id), o.action);
      }
    }

    // Ohne Tabelle (alter Datenbankstand) einfach keine Gründe anzeigen.
    const reasonCounts = new Map<string, number>();
    for (const r of reasonsRes.error ? [] : (reasonsRes.data ?? [])) {
      const label = cancellationReasonLabel(r.reason as string | null);
      reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
    }
    const reasonItems = [...reasonCounts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "de"));

    return {
      ...computeInsights(profiles, today, overrides),
      cancellationReasons: { items: reasonItems, total: reasonItems.reduce((s, i) => s + i.value, 0) },
    };
  },
  ["insights-data-v2"],
  { revalidate: 60 }
);

export async function getInsightsData(): Promise<InsightsPageData | null> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return null;

  return getInsightsDataCached();
}
