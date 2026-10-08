import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Knapper Seitenkopf für Seiten ohne Unterbereiche (mit Unterbereichen ersetzt die
 * TabBar die Überschrift). Titel fett und eng wie die Website, optional Eyebrow
 * (roter Strich + Kapitälchen), höchstens ein Satz darunter und eine Aktion rechts
 * (meist ein IconButton).
 *
 * Fliegt ein wie auf der Website: Eyebrow gleitet von links herein, Titel und Satz
 * steigen nacheinander mit etwas Weg und leichter Unschärfe auf, die Aktion zuletzt
 * (CSS, globals.css „Einfliegen im Intranet“; ohne JS sichtbar, bei jeder Client-
 * Navigation neu, „Bewegung reduzieren“ = nur Einblenden). `reveal={false}` schaltet
 * das ab (z. B. in Dialogen).
 *
 * Props: title, eyebrow?, description? (ein Satz), action?, reveal? (Standard true),
 * as? ("h1" Standard, "h2" für Unterabschnitte), className?.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  action,
  reveal = true,
  as: Heading = "h1",
  className,
}: {
  title: ReactNode;
  eyebrow?: string;
  /** Höchstens ein Satz; mehr gehört in Tooltip oder Leerzustand. */
  description?: ReactNode;
  action?: ReactNode;
  reveal?: boolean;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div
      data-reveal={reveal ? "heading" : undefined}
      className={cn("flex items-end justify-between gap-4", className)}
    >
      <div data-reveal-part={reveal ? "text" : undefined} className="min-w-0 space-y-2">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading
          className={cn(
            "leading-[1.05] font-bold tracking-[-0.035em]",
            Heading === "h1" ? "text-[1.75rem] sm:text-4xl" : "text-2xl sm:text-[1.75rem]",
          )}
        >
          {title}
        </Heading>
        {description && <p className="max-w-2xl pt-0.5 text-[0.9375rem] text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <div data-reveal-part={reveal ? "action" : undefined} className="flex shrink-0 items-center gap-1">
          {action}
        </div>
      )}
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
