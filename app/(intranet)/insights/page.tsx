import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getCancellations, getInsightsData } from "./actions";
import { EmptyState, PageHeader } from "@/components/kit/PageHeader";
import { InsightsView } from "@/components/insights/InsightsView";
import { insightsTab } from "@/components/insights/insights-tabs";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

type Props = {
  searchParams: Promise<{ ansicht?: string | string[] }>;
};

export default async function InsightsPage({ searchParams }: Props) {
  await sperreBeiDatenmaengeln();
  const { user, profile } = await getCachedAuth();

  if (!user) redirect("/login");

  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  if (role !== "board") redirect("/dashboard");

  const [{ ansicht }, data, cancellations] = await Promise.all([searchParams, getInsightsData(), getCancellations()]);
  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Verwaltung" title="Insights" />
        <EmptyState title="Keine Daten verfügbar." />
      </div>
    );
  }

  return <InsightsView data={data} cancellations={cancellations} initialTab={insightsTab(ansicht)} />;
}
