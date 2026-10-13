import { cn } from "@/lib/utils";

// Balkenliste für Insights (ersetzt die recharts-Diagramme): Größen vergleichen, also ein
// Farbton (Markenrot) auf hellroter Spur, sortiert, Wert direkt am Ende jeder Zeile.
// Reines HTML: lesbar ohne JS, Screenreader bekommen eine Liste mit Zahlen.

export type BarItem = { name: string; value: number };

export function BarList({
  items,
  total,
  max = 12,
  showShare = false,
  className,
}: {
  items: BarItem[];
  /** Bezugsgröße für Prozentangaben (Standard: Summe). */
  total?: number;
  /** Mehr Zeilen werden zu „Weitere“ zusammengefasst. */
  max?: number;
  showShare?: boolean;
  className?: string;
}) {
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  const rows =
    items.length > max
      ? [
          ...items.slice(0, max - 1),
          { name: `Weitere (${items.length - (max - 1)})`, value: items.slice(max - 1).reduce((s, i) => s + i.value, 0) },
        ]
      : items;
  const top = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className={cn("space-y-3", className)}>
      {rows.map((r) => {
        const share = sum > 0 ? Math.round((r.value / sum) * 100) : 0;
        return (
          <li
            key={r.name}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            title={`${r.name}: ${r.value}${sum > 0 ? ` (${share} %)` : ""}`}
          >
            <span className="truncate text-sm text-foreground">{r.name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-brand-tint" aria-hidden>
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${r.value > 0 ? Math.max(2, (r.value / top) * 100) : 0}%` }}
              />
            </span>
            <span
              className={cn(
                "text-right text-sm font-semibold whitespace-nowrap text-foreground tabular-nums",
                showShare ? "w-[5.5rem]" : "w-10",
              )}
            >
              {r.value}
              {showShare && <span className="ml-1.5 font-normal text-muted-foreground">{share} %</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
