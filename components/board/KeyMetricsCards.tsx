import { cn } from "@/lib/utils";

// Kennzahlen im Stil der Website (Abschnitt „Der ICR in Zahlen“): große, enge Zahlen,
// Beschriftung in Kapitälchen darunter, auf hellem Grund statt Aurora (keine dunklen
// Flächen in der App). Einheit in Markenrot, Erklärung als Tooltip.

type Props = {
  cashflow: number;
  activeTotal: number;
  newInLast6Months: number;
  cancellationsInLast6Months: number;
};

type Metric = { label: string; value: number; suffix?: string; hint: string };

export function KeyMetricsCards({ cashflow, activeTotal, newInLast6Months, cancellationsInLast6Months }: Props) {
  const metrics: Metric[] = [
    {
      label: "Erwarteter Umsatz",
      value: cashflow,
      suffix: "€",
      hint: "Zahlende Mitglieder × 15 € im laufenden Semester",
    },
    { label: "Aktive Mitglieder", value: activeTotal, hint: "Status aktiv, ohne Alumni" },
    { label: "Neuzugänge · 6 Monate", value: newInLast6Months, hint: "Nach Datum des Antrags" },
    {
      label: "Abgänge · 6 Monate",
      value: cancellationsInLast6Months,
      hint: "Status ausgetreten, nach Datum der Kündigung",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-10 rounded-2xl border border-border bg-card px-6 py-8 sm:px-8 lg:grid-cols-4 lg:gap-0 lg:py-10">
      {metrics.map((m, i) => (
        <div key={m.label} className={cn("flex min-w-0 flex-col", i > 0 && "lg:border-l lg:border-border lg:pl-8")}>
          <dt
            title={m.hint}
            className="order-2 mt-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase sm:text-xs"
          >
            {m.label}
          </dt>
          <dd className="text-5xl leading-none font-bold tracking-[-0.05em] text-foreground tabular-nums sm:text-6xl">
            {m.value.toLocaleString("de-DE")}
            {m.suffix && " "}
            {m.suffix && <span className="text-primary">{m.suffix}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
