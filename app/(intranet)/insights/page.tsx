import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getInsightsData } from "./actions";
import { KeyMetricsCards, type Metric } from "@/components/board/KeyMetricsCards";
import { BarList } from "@/components/board/BarList";
import { SemesterBars } from "@/components/board/SemesterBars";
import { EmptyState } from "@/components/kit/PageHeader";
import { FEE_PER_SEMESTER } from "@/lib/insights";

function Panel({ id, title, meta, children }: { id: string; title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-base font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {meta && <span className="text-xs text-muted-foreground tabular-nums">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
}

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

  const net = data.newInLast6Months - data.cancellationsInLast6Months;
  const metrics: Metric[] = [
    {
      label: "Aktive Mitglieder",
      value: data.activeTotal,
      detail: `${data.alumniTotal} Alumni · ${data.cancelledTotal} ausgetreten`,
      hint: "Status aktiv, ohne Alumni (Vorstand zählt mit)",
    },
    {
      label: `Erwartete Beiträge · ${data.period.label}`,
      value: data.expectedFees,
      unit: "€",
      detail: `${data.payingCount} beitragspflichtig × ${FEE_PER_SEMESTER} €`,
      hint: "Regeln wie im Finanzexport (Freisemester, Kündigungen, manuelle Anpassungen), ohne Prüfung der IBAN",
    },
    {
      label: "Neuzugänge · 6 Monate",
      value: data.newInLast6Months,
      detail: `Saldo ${signed(net)} nach Abgängen`,
      hint: "Nach Datum des Antrags",
    },
    {
      label: "Abgänge · 6 Monate",
      value: data.cancellationsInLast6Months,
      detail: `${data.cancelledTotal} ausgetreten insgesamt`,
      hint: "Status ausgetreten, nach Datum der Kündigung",
    },
  ];

  const knownHochschule = data.hochschule.items.reduce((s, i) => s + i.value, 0);

  return (
    <div className="space-y-6">
      <KeyMetricsCards metrics={metrics} />

      <Panel id="insights-joins" title="Neuzugänge je Semester" meta="Letzte 8 Semester · nach Antragsdatum · laufendes Semester heller">
        <SemesterBars items={data.joinsBySemester} unit="Neuzugänge" labelledBy="insights-joins" />
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel
          id="insights-fach"
          title="Studiengang"
          meta={`Aktive Mitglieder${data.fach.missing ? ` · ${data.fach.missing} ohne Angabe` : ""}`}
        >
          {data.fach.items.length > 0 ? (
            <BarList items={data.fach.items} max={8} />
          ) : (
            <p className="text-sm text-muted-foreground">Keine Angaben.</p>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            id="insights-hochschule"
            title="Hochschule"
            meta={`Aktive Mitglieder${data.hochschule.missing ? ` · ${data.hochschule.missing} ohne Angabe` : ""}`}
          >
            {knownHochschule > 0 ? (
              <BarList items={data.hochschule.items} total={knownHochschule} showShare />
            ) : (
              <p className="text-sm text-muted-foreground">Keine Angaben.</p>
            )}
          </Panel>

          <Panel
            id="insights-reasons"
            title="Kündigungsgründe"
            meta={data.cancellationReasons.total ? `${data.cancellationReasons.total} Kündigungen im Intranet` : undefined}
          >
            {data.cancellationReasons.total > 0 ? (
              <BarList items={data.cancellationReasons.items} total={data.cancellationReasons.total} showShare />
            ) : (
              <p className="text-sm text-muted-foreground">
                Noch keine Kündigungen über das Intranet. Gründe erscheinen hier, sobald Mitglieder selbst kündigen.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
