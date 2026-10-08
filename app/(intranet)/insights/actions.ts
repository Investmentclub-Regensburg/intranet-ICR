"use server";

import { unstable_cache } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";

export type StatusCounts = {
  active: number;
  alumni: number;
  applicant: number;
  cancelled: number;
};

export type DemographicsItem = {
  name: string;
  count: number;
};

export type InsightsData = {
  statusCounts: StatusCounts;
  demographics: DemographicsItem[];
  payingMembersCount: number;
  activeTotal: number;
  newInLast6Months: number;
  /** Kündigungen mit Status `cancelled` und `Datum_Kündigung` in den letzten 6 Monaten */
  cancellationsInLast6Months: number;
};

/** Start of current semester: Oct 1 (Winter) or Apr 1 (Summer). */
function getCurrentSemesterStart(): Date {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 10) return new Date(year, 9, 1); // 1 Oct
  if (month >= 4) return new Date(year, 3, 1);  // 1 Apr
  return new Date(year - 1, 9, 1);              // previous year 1 Oct
}

/** Date 6 months ago from now. */
function getSixMonthsAgo(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d;
}

const getInsightsDataCached = unstable_cache(
  async (): Promise<InsightsData | null> => {
  const admin = createServiceClient();

  const { data: rows, error } = await admin
    .from("profiles")
    .select('"Status", "Rolle", "Datum_Antrag", "Datum_Kündigung", "Studiengang / Fach"');

  if (error || !rows) return null;

  const statusCounts: StatusCounts = {
    active: 0,
    alumni: 0,
    applicant: 0,
    cancelled: 0,
  };

  const studiengangMap = new Map<string, number>();
  const semesterStart = getCurrentSemesterStart();
  const sixMonthsAgo = getSixMonthsAgo();
  let payingCount = 0;
  let newInLast6 = 0;
  let cancellationsLast6 = 0;

  for (const row of rows) {
    const raw = row as Record<string, unknown>;
    const status = String(raw.Status ?? raw.status ?? "")
      .trim()
      .toLowerCase();
    const role = String(raw.Rolle ?? raw.rolle ?? "")
      .trim()
      .toLowerCase();
    const isAlumni = role === "alumni" || status === "alumni";
    const statusKey = isAlumni
      ? "alumni"
      : status === "active"
        ? "active"
        : status === "applicant"
          ? "applicant"
          : status === "cancelled"
            ? "cancelled"
            : null;
    if (statusKey) statusCounts[statusKey]++;

    const datumRaw = raw["Datum_Antrag"] ?? (raw as Record<string, unknown>)["datum_antrag"];
    let datumAntrag: Date | null = null;
    if (datumRaw) {
      const d = new Date(String(datumRaw));
      if (!Number.isNaN(d.getTime())) datumAntrag = d;
    }

    if (status === "active" && !isAlumni && datumAntrag && datumAntrag < semesterStart)
      payingCount++;
    if (datumAntrag && datumAntrag >= sixMonthsAgo) newInLast6++;

    const kuendigungRaw =
      raw["Datum_Kündigung"] ?? (raw as Record<string, unknown>)["datum_kündigung"];
    let datumKuendigung: Date | null = null;
    if (kuendigungRaw) {
      const k = new Date(String(kuendigungRaw));
      if (!Number.isNaN(k.getTime())) datumKuendigung = k;
    }
    if (status === "cancelled" && datumKuendigung && datumKuendigung >= sixMonthsAgo) {
      cancellationsLast6++;
    }

    const sg =
      raw["Studiengang / Fach"] ?? (raw as Record<string, unknown>)["Studiengang / Fach"];
    const studiengang = String(sg ?? "")
      .trim();
    const key = studiengang || "Ohne Angabe";
    studiengangMap.set(key, (studiengangMap.get(key) ?? 0) + 1);
  }

  const demographics: DemographicsItem[] = Array.from(studiengangMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    statusCounts,
    demographics,
    payingMembersCount: payingCount,
    activeTotal: statusCounts.active,
    newInLast6Months: newInLast6,
    cancellationsInLast6Months: cancellationsLast6,
  };
  },
  ["insights-data"],
  { revalidate: 60 }
);

export async function getInsightsData(): Promise<InsightsData | null> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return null;

  return getInsightsDataCached();
}
