"use client";

import Link from "next/link";
import { Plus, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Kachel-Raster (Muster Tenant-Dashboard, terminarten/event-types-manager.tsx):
// gleich hohe Kacheln, die ganze Fläche ist klickbar. Look der Website-Karten
// (rounded-2xl, Rand line).
//
// Hover-Glow (Hannes 2026-10-08): Klickbare Kacheln bekommen beim Hover und bei
// Tastatur-Fokus einen Rahmen im dunkelroten Verlauf, leichten roten Schein und
// heben sich minimal; Schrift und Inhalt bleiben gleich. Umgesetzt als CSS-Klasse
// `.tile-glow` (globals.css), die auch eigene Kacheln anderer Bereiche nutzen können.
// Die letzte Kachel kann eine gestrichelte Plus-Kachel sein (Neu anlegen).
//
// TileGrid staffelt seine Kacheln beim Erscheinen (data-reveal="stagger").
//
// Props
// - TileGrid: columns? (2 | 3 | 4, ab lg), reveal? (Standard true), delay? (s), className?
// - Tile: Icon?, title, meta?, actions? (Icon-Aktionen oben rechts), footer?, children?,
//   href? (ganze Kachel ist Link) | onOpen? (ganze Kachel öffnet etwas), className?
// - AddTile: label, href? | onClick?, className?

export function TileGrid({
  children,
  className,
  columns = 3,
  reveal = true,
  delay,
}: {
  children: ReactNode;
  className?: string;
  /** Spalten ab lg (2, 3 oder 4). */
  columns?: 2 | 3 | 4;
  /** Kacheln gestaffelt einblenden (Standard). */
  reveal?: boolean;
  /** Start der Staffelung in Sekunden (Standard 0,18 s, nach dem Seitenkopf). */
  delay?: number;
}) {
  return (
    <div
      data-reveal={reveal ? "stagger" : undefined}
      style={delay === undefined ? undefined : ({ "--reveal-delay": `${delay}s` } as CSSProperties)}
      className={cn(
        "grid auto-rows-fr gap-4 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

const TILE_BASE =
  "group relative flex min-h-[8.5rem] flex-col gap-3 rounded-2xl bg-card p-5 text-left text-card-foreground";
const TILE_STATIC = "border border-border";
const TILE_INTERACTIVE = "tile-glow cursor-pointer outline-none";

type TileProps = {
  /** Lucide-Icon oben links in getönter Fläche. */
  Icon?: LucideIcon;
  title: ReactNode;
  /** Kurze Meta-Zeile unter dem Titel (Datum, Ort, Status …). */
  meta?: ReactNode;
  /** Icon-Aktionen oben rechts (IconButton/IconLink). Klicks darauf öffnen die Kachel nicht. */
  actions?: ReactNode;
  /** Zusatz unten (z. B. Button, Status-Pille). */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Link-Ziel: ganze Kachel ist ein Link. */
  href?: string;
  /** Alternativ: ganze Kachel öffnet etwas (Dialog, Wizard). */
  onOpen?: () => void;
};

function TileInner({ Icon, title, meta, actions, footer, children }: TileProps) {
  return (
    <>
      {(Icon || actions) && (
        <div className="flex items-start justify-between gap-3">
          {Icon ? (
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-tint text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : (
            <span />
          )}
          {actions && (
            // Aktionen stoppen das Öffnen der Kachel.
            <div
              className="-mt-1 -mr-1 flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          )}
        </div>
      )}
      <div className="min-w-0 space-y-1">
        <p className="text-base leading-snug font-bold tracking-[-0.02em] text-foreground">{title}</p>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
      {children && <div className="min-w-0 text-sm text-muted-foreground">{children}</div>}
      {footer && <div className="mt-auto pt-1">{footer}</div>}
    </>
  );
}

export function Tile(props: TileProps) {
  const { href, onOpen, className } = props;

  if (href) {
    return (
      <Link href={href} className={cn(TILE_BASE, TILE_INTERACTIVE, className)}>
        <TileInner {...props} />
      </Link>
    );
  }

  if (onOpen) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={cn(TILE_BASE, TILE_INTERACTIVE, className)}
      >
        <TileInner {...props} />
      </div>
    );
  }

  return (
    <div className={cn(TILE_BASE, TILE_STATIC, className)}>
      <TileInner {...props} />
    </div>
  );
}

/** Gestrichelte Plus-Kachel am Ende eines Rasters: neu anlegen. Hover wie .tile-glow (Rand rot statt Verlauf). */
export function AddTile({
  label,
  onClick,
  href,
  className,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = cn(
    "flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input text-muted-foreground outline-none",
    "transition-[border-color,color,background-color,box-shadow,translate,scale] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
    "hover:border-primary/70 hover:bg-card hover:text-primary hover:shadow-glow motion-safe:hover:-translate-y-0.5",
    "focus-visible:border-primary/70 focus-visible:bg-card focus-visible:text-primary focus-visible:shadow-glow motion-safe:focus-visible:-translate-y-0.5",
    "active:scale-[0.99]",
    className,
  );
  const inner = (
    <>
      <Plus className="size-6" aria-hidden />
      <span className="text-xs font-semibold">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
