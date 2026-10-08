"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Kachel-Raster (Muster Tenant-Dashboard, terminarten/event-types-manager.tsx):
// gleich hohe Kacheln, die ganze Fläche ist klickbar, leichtes Anheben beim Hover,
// Rand färbt sich in Markenrot, kleiner Druck-Effekt. Die letzte Kachel kann eine
// gestrichelte Plus-Kachel sein (Neu anlegen).
// Look der Website-Karten: rounded-2xl, Rand line, Hover-Schatten shadow-card.

export function TileGrid({
  children,
  className,
  columns = 3,
}: {
  children: ReactNode;
  className?: string;
  /** Spalten ab lg (2, 3 oder 4). */
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
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
  "group relative flex min-h-[8.5rem] flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left text-card-foreground transition-[border-color,box-shadow] duration-300";
const TILE_INTERACTIVE =
  "cursor-pointer hover:border-primary/30 hover:shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";

const MotionLink = motion.create(Link);

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
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
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
  const motionProps = {
    whileHover: { y: -3 },
    whileTap: { scale: 0.99 },
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
  };

  if (href) {
    return (
      <MotionLink href={href} {...motionProps} className={cn(TILE_BASE, TILE_INTERACTIVE, className)}>
        <TileInner {...props} />
      </MotionLink>
    );
  }

  if (onOpen) {
    return (
      <motion.div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        {...motionProps}
        className={cn(TILE_BASE, TILE_INTERACTIVE, className)}
      >
        <TileInner {...props} />
      </motion.div>
    );
  }

  return (
    <div className={cn(TILE_BASE, className)}>
      <TileInner {...props} />
    </div>
  );
}

/** Gestrichelte Plus-Kachel am Ende eines Rasters: neu anlegen. */
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
    "flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input text-muted-foreground transition-colors",
    "hover:border-primary/50 hover:bg-accent/50 hover:text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
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
      <MotionLink href={href} whileTap={{ scale: 0.97 }} className={cls}>
        {inner}
      </MotionLink>
    );
  }
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.97 }} className={cls}>
      {inner}
    </motion.button>
  );
}
