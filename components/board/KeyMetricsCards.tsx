// Kennzahlen oben auf der Insights-Seite: große Zahl, Beschriftung darüber, eine ruhige
// Erläuterung darunter. Zahl und Einheit in derselben Textfarbe (keine Markenfarbe im Text),
// Erklärung zusätzlich als Tooltip.

export type Metric = {
  label: string;
  value: number;
  unit?: string;
  detail: string;
  hint: string;
};

export function KeyMetricsCards({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} title={m.hint} className="flex min-w-0 flex-col gap-2 bg-card px-4 py-5 sm:px-6 sm:py-6">
          <dt className="text-xs font-medium text-muted-foreground">{m.label}</dt>
          <dd className="flex items-baseline gap-1.5 text-3xl leading-none font-semibold sm:text-4xl tracking-[-0.03em] text-foreground tabular-nums">
            {m.value.toLocaleString("de-DE")}
            {m.unit && <span className="text-xl font-medium tracking-normal sm:text-2xl">{m.unit}</span>}
          </dd>
          <dd className="text-sm text-muted-foreground tabular-nums">{m.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
