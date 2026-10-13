import { Pencil, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton, IconLink } from "@/components/kit/IconButton";

/*
 * Lesesicht statt Formular (Brief UX-Umbau, „überall sieht es aus, als wäre man
 * in den Input-Fields“): Daten als ruhige Liste, kleines graues Label, Wert
 * darunter in normaler Schrift. Bearbeiten erst über das Stift-Icon pro
 * Abschnitt (öffnet das Formular: eigener Zustand, Dialog oder Seite).
 *
 * ReadSection-Props
 * - title: Abschnittsname („Stammdaten“, „Bankverbindung“)
 * - Icon?: kleines Icon vor dem Titel
 * - onEdit?: Stift-Icon als Knopf (Client-Komponenten) | editHref?: Stift als Link
 * - editLabel?: Tooltip/aria-label (Standard „{title} bearbeiten“)
 * - actions?: weitere Icon-Aktionen neben dem Stift
 * - columns?: 1 | 2 (Standard 2 ab sm)
 * - children: ReadField-Einträge
 * - className?
 *
 * ReadField-Props
 * - label: kleines graues Label
 * - value?: Wert (oder children); leer/null → „Nicht angegeben“ in Grau
 * - empty?: eigener Leer-Text
 * - wide?: über beide Spalten
 * - mono?: Ziffern gleich breit (IBAN, Mitgliedsnummer)
 *
 * Kein "use client": Mit editHref in Server-Komponenten nutzbar, mit onEdit aus
 * Client-Komponenten.
 */

export function ReadSection({
  title,
  Icon,
  onEdit,
  editHref,
  editLabel,
  actions,
  columns = 2,
  children,
  className,
}: {
  title: string;
  Icon?: LucideIcon;
  onEdit?: () => void;
  editHref?: string;
  editLabel?: string;
  actions?: ReactNode;
  columns?: 1 | 2;
  children: ReactNode;
  className?: string;
}) {
  const label = editLabel ?? `${title} bearbeiten`;
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-base leading-tight font-bold tracking-[-0.02em]">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="truncate">{title}</span>
        </h2>
        <div className="-my-1.5 -mr-1.5 flex shrink-0 items-center gap-0.5">
          {actions}
          {onEdit ? (
            <IconButton label={label} onClick={onEdit}>
              <Pencil />
            </IconButton>
          ) : editHref ? (
            <IconLink href={editHref} label={label}>
              <Pencil />
            </IconLink>
          ) : null}
        </div>
      </div>
      <dl className={cn("grid gap-x-8 gap-y-4", columns === 2 && "sm:grid-cols-2")}>{children}</dl>
    </section>
  );
}

export function ReadField({
  label,
  value,
  children,
  empty = "Nicht angegeben",
  wide = false,
  mono = false,
  className,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
  empty?: string;
  wide?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const content = value ?? children;
  const isEmpty = content === null || content === undefined || content === "" || content === false;
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-[0.9375rem] break-words",
          isEmpty ? "text-muted-foreground/80" : "text-foreground",
          mono && !isEmpty && "tabular-nums",
        )}
      >
        {isEmpty ? empty : content}
      </dd>
    </div>
  );
}
