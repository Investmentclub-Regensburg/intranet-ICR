import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Knapper Seitenkopf für Seiten ohne Unterbereiche (mit Unterbereichen ersetzt die
 * TabBar die Überschrift). Titel fett und eng wie die Website, optional Eyebrow
 * (roter Strich + Kapitälchen) und eine Aktion rechts (meist ein IconButton).
 * Bewusst ohne Erklärsatz: wenig Text.
 */
export function PageHeader({
  title,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-[1.75rem] leading-[1.05] font-bold tracking-[-0.035em] sm:text-4xl">{title}</h1>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

/** Leerzustand: gestrichelter Rahmen, ein Satz, optional eine Aktion (Muster Tenant-Dashboard, bits.tsx). */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-input px-6 py-14 text-center", className)}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
