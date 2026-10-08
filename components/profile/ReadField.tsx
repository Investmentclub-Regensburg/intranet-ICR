import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lesesicht statt Formular: kleines graues Label, Wert darunter in normaler Schrift.
 * Leere Werte erscheinen als „Nicht hinterlegt“ (grau), nicht als Strich.
 */
export function ReadField({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Kleine Zusatzzeile unter dem Wert (z. B. Stichtag). */
  hint?: ReactNode;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-[0.9375rem] leading-snug break-words", empty ? "text-muted-foreground" : "text-foreground")}>
        {empty ? "Nicht hinterlegt" : value}
      </dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Ruhige Kachel für einen Abschnitt: Titel links, Aktion (Stift) rechts. */
export function SectionCard({
  title,
  icon,
  action,
  children,
  className,
  labelledBy,
}: {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("rounded-2xl border border-border bg-card p-5 sm:p-6", className)}
    >
      <div className="mb-5 flex min-h-9 items-center justify-between gap-3">
        <h2 id={labelledBy} className="flex items-center gap-3 text-base font-bold tracking-[-0.02em]">
          {icon && (
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-tint text-primary [&_svg]:size-[1.125rem]">
              {icon}
            </span>
          )}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
