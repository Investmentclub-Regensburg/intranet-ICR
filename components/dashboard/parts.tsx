import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Kleine Bausteine der Übersicht. Ohne Hooks, daher in Server- und Client-Komponenten nutzbar.

/** Kachel-Grundlook wie components/kit/Tile (Website-Karten: rund, Rand line, Hover-Schatten). */
export const DASH_TILE =
  "group relative rounded-2xl border border-border bg-card text-card-foreground transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-card";

export const DASH_FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";

/** Abschnittskopf: Titel links, optional „Alle …“-Link rechts. */
export function SectionHeading({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-bold tracking-[-0.025em] sm:text-xl">
        {title}
      </h2>
      {href && linkLabel && (
        <Link
          href={href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1 rounded-xs text-sm font-semibold text-primary transition-colors hover:text-brand-hover",
            DASH_FOCUS,
          )}
        >
          {linkLabel}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Datumsblock: Monat klein in Rot, Tag groß, Wochentag. Volles Datum nur für Screenreader. */
export function DateBlock({
  day,
  month,
  weekday,
  label,
  size = "lg",
}: {
  day: string;
  month: string;
  weekday: string;
  label: string;
  size?: "lg" | "sm";
}) {
  const lg = size === "lg";
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-center",
        lg ? "w-16 py-2.5" : "w-12 py-1.5",
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden className="text-[0.625rem] font-semibold tracking-[0.14em] text-primary uppercase">
        {month}
      </span>
      <span
        aria-hidden
        className={cn("leading-none font-bold tracking-[-0.04em] tabular-nums", lg ? "mt-1 text-[2rem]" : "mt-0.5 text-xl")}
      >
        {day}
      </span>
      {lg && (
        <span aria-hidden className="mt-1 text-[0.6875rem] font-medium text-muted-foreground">
          {weekday}
        </span>
      )}
    </div>
  );
}

/** Kachel kommt gestaffelt herein (CSS, Endzustand sichtbar, auch ohne JS; reduzierte Bewegung: aus). */
export function TileIn({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  return (
    <div className={cn("tile-in h-full", className)} style={{ "--tile-i": index } as CSSProperties}>
      {children}
    </div>
  );
}

/** Ladezustand: graue Kacheln in der Form der echten. */
export function TileSkeletons({
  count,
  className,
  tileClassName,
  variant = "tile",
}: {
  count: number;
  className?: string;
  tileClassName?: string;
  variant?: "tile" | "row" | "stat";
}) {
  return (
    <div className={className} aria-busy="true">
      <span className="sr-only">Wird geladen …</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "rounded-2xl border border-border bg-card p-5 motion-safe:animate-pulse",
            variant === "row" && "flex items-center gap-3 p-3",
            tileClassName,
          )}
        >
          {variant === "tile" && (
            <div className="flex gap-4">
              <div className="h-[5.25rem] w-16 rounded-xl bg-muted" />
              <div className="flex-1 space-y-2.5 pt-1">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-4 w-4/5 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          )}
          {variant === "row" && (
            <>
              <div className="h-12 w-12 rounded-xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </>
          )}
          {variant === "stat" && (
            <div className="space-y-4">
              <div className="size-9 rounded-xl bg-muted" />
              <div className="h-7 w-10 rounded bg-muted" />
              <div className="h-3 w-3/4 rounded bg-muted" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
