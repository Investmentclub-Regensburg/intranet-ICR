import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BarRow, SemesterSaeule } from "@/lib/insights";
import { anteil, balkenBreite, saeulenHoehe } from "./insights-tabs";

// Bausteine der Insights-Seite nach der Skizze (Design-Runde 19.11.2026): Kennzahl-Kachel, Karte mit
// Überschrift (ohne Untertext), Balkenliste, Säulen je Semester. Reines HTML, Werte stehen als Text da,
// Tooltips per title. Bewegung über CSS (.insights-grow/.insights-up), bei „Bewegung reduzieren“ aus.

export function Kennzahl({
  label,
  value,
  unit,
  title,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex min-h-[118px] min-w-0 flex-col justify-between rounded-2xl border border-border bg-card px-4 py-[18px] sm:px-6 sm:py-[22px]"
    >
      <p className="text-xs leading-snug text-muted-foreground sm:text-[13px]">{label}</p>
      <p className="mt-2.5 text-[1.625rem] leading-none font-bold tracking-[-0.03em] whitespace-nowrap tabular-nums sm:text-[34px]">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-semibold tracking-normal text-muted-foreground sm:text-base">{unit}</span>
        )}
      </p>
    </div>
  );
}

export function Karte({ title, id, children, className }: { title: string; id: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0 rounded-2xl border border-border bg-card px-5 py-5 sm:px-6 sm:py-[22px]", className)}>
      <h2 id={id} className="text-base font-bold tracking-[-0.02em]">
        {title}
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

export function Leer({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

export function Balken({ rows }: { rows: BarRow[] }) {
  const max = Math.max(0, ...rows.map((r) => r.n));
  const summe = rows.reduce((s, r) => s + r.n, 0);
  return (
    <ul>
      {rows.map((r) => (
        <li
          key={r.label}
          title={`${r.label}: ${r.n} (${anteil(r.n, summe)} %)`}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 py-[5px] text-[13px] sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_2.75rem]"
        >
          <span className={cn("truncate", r.grau && "text-muted-foreground")}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-[4px] bg-muted" aria-hidden>
            <span
              className={cn("insights-grow block h-full rounded-r-[4px]", r.grau ? "bg-ink-mute/50" : "bg-primary")}
              style={{ width: `${balkenBreite(r.n, max)}%` }}
            />
          </span>
          <span className="text-right text-ink-soft tabular-nums">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export function Saeulen({
  saeulen,
  name,
  kurz = false,
}: {
  saeulen: SemesterSaeule[];
  /** Für den Screenreader („Eintritte je Semester“). */
  name: string;
  /** Kurze Beschriftung („Wi 26“) immer; sonst nur auf schmalen Bildschirmen. */
  kurz?: boolean;
}) {
  const max = Math.max(0, ...saeulen.map((s) => s.n ?? 0));
  const beschreibung = `${name}: ${saeulen.map((s) => `${s.label} ${s.n ?? "nicht erfasst"}`).join(", ")}`;
  return (
    <div>
      <div role="img" aria-label={beschreibung} className="flex h-[190px] items-end gap-2 border-b border-input">
        {saeulen.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${s.n === null ? "nicht erfasst" : s.n}`}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span className="text-[11px] text-ink-soft tabular-nums">{s.n ?? "–"}</span>
            <span
              className={cn("insights-up w-full max-w-[30px] rounded-t-[4px]", s.aktuell ? "bg-primary" : "bg-primary/45")}
              style={{ height: `${saeulenHoehe(s.n, max)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2" aria-hidden>
        {saeulen.map((s) => (
          <span key={s.key} className="min-w-0 flex-1 text-center text-[10.5px] leading-tight text-muted-foreground">
            {kurz ? (
              s.kurz
            ) : (
              <>
                <span className="sm:hidden">{s.kurz}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
