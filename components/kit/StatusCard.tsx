import { Check, Clock, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Status sichtbar machen (Brief UX-Umbau): Nach jedem Antrag (BVH-Zugang, Alumni,
 * Kündigung) eine Status-Kachel mit Datum und nächstem Schritt, z. B.
 *   offen:     „Zugang beantragt“ · „Beantragt am 8. Oktober 2026“ ·
 *              „Der Vorstand schaltet deinen Zugang frei.“
 *   erledigt:  „Zugang freigeschaltet“
 *   abgelehnt: „Antrag abgelehnt“
 * Nur Zustände und Schritte zeigen, die das System wirklich kennt (keine
 * erfundenen Fristen oder Mails).
 *
 * StatusCard-Props
 * - status: "open" | "done" | "rejected"
 * - title: was passiert ist („Zugang beantragt“)
 * - date?: ISO-String oder Date; wird „8. Oktober 2026“ (Europe/Berlin)
 * - dateLabel?: Text vor dem Datum (Standard je Status: „Beantragt am“,
 *   „Erledigt am“, „Abgelehnt am“)
 * - next?: nächster Schritt, ein Satz
 * - statusLabel?: Text der Pille (Standard „Offen“, „Erledigt“, „Abgelehnt“)
 * - action?: Knopf/Link rechts bzw. unten (z. B. „Zur Zeitschrift“)
 * - Icon?: eigenes Icon statt Uhr/Haken/X
 * - className?
 *
 * StatusPill: dieselbe Pille einzeln (status, children? = Text), z. B. in
 * Antrags-Kacheln im Admin-Bereich.
 *
 * Kein "use client": in Server- und Client-Komponenten nutzbar.
 */

export type StatusVariant = "open" | "done" | "rejected";

const STATUS: Record<
  StatusVariant,
  { label: string; dateLabel: string; Icon: LucideIcon; icon: string; pill: string }
> = {
  open: {
    label: "Offen",
    dateLabel: "Beantragt am",
    Icon: Clock,
    icon: "bg-muted text-ink-soft",
    pill: "bg-brand-tint text-primary",
  },
  done: {
    label: "Erledigt",
    dateLabel: "Erledigt am",
    Icon: Check,
    icon: "bg-success-tint text-success",
    pill: "bg-success-tint text-success",
  },
  rejected: {
    label: "Abgelehnt",
    dateLabel: "Abgelehnt am",
    Icon: X,
    icon: "bg-destructive/10 text-destructive",
    pill: "bg-destructive/10 text-destructive",
  },
};

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

/** „8. Oktober 2026“; ungültige oder leere Werte ergeben null. */
export function formatStatusDate(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}

export function StatusPill({
  status,
  children,
  className,
}: {
  status: StatusVariant;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6875rem] leading-5 font-semibold tracking-[0.06em] uppercase",
        STATUS[status].pill,
        className,
      )}
    >
      {children ?? STATUS[status].label}
    </span>
  );
}

export function StatusCard({
  status,
  title,
  date,
  dateLabel,
  next,
  statusLabel,
  action,
  Icon,
  className,
}: {
  status: StatusVariant;
  title: ReactNode;
  date?: string | Date | null;
  dateLabel?: string;
  next?: ReactNode;
  statusLabel?: string;
  action?: ReactNode;
  Icon?: LucideIcon;
  className?: string;
}) {
  const s = STATUS[status];
  const StatusIcon = Icon ?? s.Icon;
  const formatted = formatStatusDate(date);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", s.icon)}>
          <StatusIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-base leading-snug font-bold tracking-[-0.02em] text-foreground">{title}</p>
            <StatusPill status={status}>{statusLabel}</StatusPill>
          </div>
          {formatted && (
            <p className="text-xs text-muted-foreground">
              {dateLabel ?? s.dateLabel} <time dateTime={new Date(date as string | Date).toISOString()}>{formatted}</time>
            </p>
          )}
          {next && <p className="pt-1 text-sm text-ink-soft">{next}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 sm:justify-end">{action}</div>}
    </div>
  );
}
