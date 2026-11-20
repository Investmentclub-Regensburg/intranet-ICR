import { Pencil, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/kit/IconButton";
import { cn } from "@/lib/utils";

/*
 * Bausteine der Profil-Seiten nach Skizze Profil.dc.html (Design-Runde 19.11.2026):
 * - TileIcon: rotes Symbol auf Rosé (40 px, Mitgliedskarte 48 px).
 * - ProfileCard: Kachel mit Symbol, Titel und Stift; gleich hoch, wenn das Raster streckt (Standard-Stretch, kein h-full).
 * - Rows/Row: Lesesicht als Liste, Beschriftung links, Wert rechts, feine Linie zwischen den Zeilen.
 * Bewusst lokal statt components/kit/ReadSection: das Layout (Beschriftung links) gilt bisher nur hier.
 */

export function TileIcon({ Icon, large = false }: { Icon: LucideIcon; large?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand-tint text-primary",
        large ? "size-12 rounded-xl" : "size-10 rounded-[0.6875rem]",
      )}
    >
      <Icon className={large ? "size-[1.375rem]" : "size-[1.125rem]"} aria-hidden />
    </span>
  );
}

export function ProfileCard({
  id,
  title,
  Icon,
  onEdit,
  children,
}: {
  id?: string;
  title: string;
  Icon: LucideIcon;
  /** Stift im Kopf (nur in der Lesesicht). */
  onEdit?: () => void;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-titel` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-card px-5 pt-5 pb-6 sm:px-[1.375rem] sm:pt-[1.375rem]"
    >
      <div className="mb-5 flex min-h-10 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TileIcon Icon={Icon} />
          <h2 id={headingId} className="truncate text-base leading-tight font-bold tracking-[-0.02em]">
            {title}
          </h2>
        </div>
        {onEdit && (
          <IconButton label={`${title} bearbeiten`} onClick={onEdit} className="size-10">
            <Pencil />
          </IconButton>
        )}
      </div>
      {children}
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

export function Row({
  label,
  value,
  children,
  empty = "Nicht angegeben",
  mono = false,
  numeric = false,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
  empty?: string;
  /** Gleich breite Zeichen mit etwas Abstand (IBAN, BIC). */
  mono?: boolean;
  /** Ziffern gleich breit (Datum, Telefon). */
  numeric?: boolean;
}) {
  const content = value ?? children;
  const isEmpty = content === null || content === undefined || content === "" || content === false;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-t border-border/70 py-3 first:border-t-0 first:pt-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm leading-normal font-medium break-words",
          isEmpty && "font-normal text-muted-foreground",
          !isEmpty && mono && "font-mono tracking-[0.04em]",
          !isEmpty && numeric && "tabular-nums",
        )}
      >
        {isEmpty ? empty : content}
      </dd>
    </div>
  );
}
