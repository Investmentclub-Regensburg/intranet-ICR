"use server";

import { unstable_cache } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { berlinToday } from "@/lib/berlin-date";
import {
  computeInsights,
  periodOf,
  type FeeOverride,
  type InsightsData,
  type InsightsProfile,
} from "@/lib/insights";

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

const getInsightsDataCached = unstable_cache(
  async (): Promise<InsightsData | null> => {
    const admin = createServiceClient();
    const today = berlinToday();
    const period = periodOf(today);

    const [profilesRes, overridesRes] = await Promise.all([
      admin
        .from("profiles")
        .select('id, "Status", "Rolle", "Datum_Antrag", "Datum_Kündigung", "Studiengang / Fach"')
        .range(0, 9999),
      admin
        .from("finance_export_overrides")
        .select("profile_id, action")
        .eq("semester", period.semester)
        .eq("year", period.year),
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
      };
    });

    const overrides = new Map<string, FeeOverride>();
    for (const o of overridesRes.data ?? []) {
      if (o.action === "include" || o.action === "exclude" || o.action === "free_semester") {
        overrides.set(String(o.profile_id), o.action);
      }
    }

    return computeInsights(profiles, today, overrides);
  },
  ["insights-data-v2"],
  { revalidate: 60 }
);

export async function getInsightsData(): Promise<InsightsData | null> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return null;

  return getInsightsDataCached();
}
