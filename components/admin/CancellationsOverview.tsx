import { EmptyState } from "@/components/kit/PageHeader";
import { CANCELLATION_REASONS, cancellationReasonLabel } from "@/lib/cancellation-reasons";
import type { CancellationRow } from "@/app/(intranet)/admin/members/actions";

const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/**
 * Kündigungen mit freiwilligem Grund: oben die Verteilung der Gründe, darunter die Liste.
 * Erfasst werden nur Selbstkündigungen im Intranet (seit Einführung der Abfrage).
 */
export function CancellationsOverview({ rows }: { rows: CancellationRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Noch keine Kündigungen erfasst"
        hint="Hier erscheinen Kündigungen, die Mitglieder selbst im Intranet abschicken – mit ihrem freiwilligen Grund."
      />
    );
  }

  const withReason = rows.filter((r) => r.reason);
  const counts = [...CANCELLATION_REASONS, { value: "", label: "Nicht angegeben" }]
    .map((r) => ({
      label: r.label,
      count: r.value ? rows.filter((x) => x.reason === r.value).length : rows.length - withReason.length,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <section aria-labelledby="cancel-reasons" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 id="cancel-reasons" className="text-base font-bold tracking-[-0.02em]">
          Gründe
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} Kündigung{rows.length === 1 ? "" : "en"}, davon {withReason.length} mit Angabe eines Grunds.
        </p>
        <ul className="mt-4 space-y-2.5">
          {counts.map((c) => {
            const pct = Math.round((c.count / rows.length) * 100);
            return (
              <li key={c.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className="truncate">{c.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {c.count} · {pct} %
                </span>
                <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="cancel-list" className="space-y-3">
        <h2 id="cancel-list" className="text-sm font-semibold text-muted-foreground">
          Alle Kündigungen
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.cancelledAt ? DATE.format(new Date(r.cancelledAt)) : "–"}
                </span>
              </div>
              <p className="text-sm">{cancellationReasonLabel(r.reason)}</p>
              {r.reasonText && (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">„{r.reasonText}“</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
