import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getInsightsData } from "./actions";
import { KeyMetricsCards } from "@/components/board/KeyMetricsCards";
import { BarList } from "@/components/board/BarList";
import { EmptyState } from "@/components/kit/PageHeader";

const FEE_PER_MEMBER = 15;

export default async function InsightsPage() {
  const { user, profile } = await getCachedAuth();

  if (!user) redirect("/login");

  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  if (role !== "board") redirect("/dashboard");

  const data = await getInsightsData();
  if (!data) {
    return (
      <div>
        <EmptyState title="Keine Daten verfügbar." />
      </div>
    );
  }

  const status = [
    { name: "Aktiv", value: data.statusCounts.active },
    { name: "Alumni", value: data.statusCounts.alumni },
    { name: "Antrag offen", value: data.statusCounts.applicant },
    { name: "Ausgetreten", value: data.statusCounts.cancelled },
  ];
  const statusTotal = status.reduce((s, i) => s + i.value, 0);
  const cashflow = data.payingMembersCount * FEE_PER_MEMBER;

  return (
    <div className="space-y-10">
      <KeyMetricsCards
        cashflow={cashflow}
        activeTotal={data.activeTotal}
        newInLast6Months={data.newInLast6Months}
        cancellationsInLast6Months={data.cancellationsInLast6Months}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="space-y-5 rounded-2xl border border-border bg-card p-6" aria-labelledby="insights-status">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="insights-status" className="text-lg font-bold tracking-[-0.02em]">
              Status
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">{statusTotal} Profile</span>
          </div>
          <BarList items={status} total={statusTotal} showShare />
        </section>

        <section className="space-y-5 rounded-2xl border border-border bg-card p-6" aria-labelledby="insights-fach">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="insights-fach" className="text-lg font-bold tracking-[-0.02em]">
              Studiengang / Fach
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {data.demographics.length} {data.demographics.length === 1 ? "Fach" : "Fächer"}
            </span>
          </div>
          <BarList items={data.demographics.map((d) => ({ name: d.name, value: d.count }))} />
        </section>
      </div>
    </div>
  );
}
