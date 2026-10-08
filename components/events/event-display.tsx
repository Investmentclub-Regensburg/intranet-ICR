import { cn } from "@/lib/utils";
import { formatEventDate } from "@/lib/events";

/**
 * Darstellungshelfer für Veranstaltungen (Kacheln, Detail, Kalender).
 * Datum wird wie in lib/events.ts rein aus dem String formatiert (Wanduhrzeit Berlin).
 */

/** "2026-10-17" → { month: "Okt", day: "17", weekday: "Fr", year: "2026" } */
export function eventDateParts(date: string) {
  const strip = (s: string) => s.replace(/\.$/, "");
  return {
    month: strip(formatEventDate(date, { month: "short" })),
    day: formatEventDate(date, { day: "numeric" }).replace(/\.$/, ""),
    weekday: strip(formatEventDate(date, { weekday: "short" })),
    year: formatEventDate(date, { year: "numeric" }),
  };
}

/** Heutiges Datum in Berlin als "yyyy-MM-dd" (unabhängig von der Server-Zeitzone). */
export function todayInBerlin(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Hover für klickbare Kacheln: Rahmen im dunkelroten Markenverlauf, leichter roter
 * Glow, Kachel hebt sich minimal; Inhalt bleibt unverändert (Brief UX-Umbau).
 * Lokal nachgebaut, weil die Kit-Kachel (components/kit/Tile.tsx) keinen Bild-Kopf hat.
 */
export const GLOW_TILE = cn(
  "relative isolate rounded-2xl border border-border bg-card",
  "transition-[translate,box-shadow,border-color] duration-300 ease-out",
  "hover:-translate-y-0.5 hover:border-transparent",
  "hover:[background:linear-gradient(var(--card),var(--card))_padding-box,linear-gradient(120deg,var(--color-bordeaux),var(--color-brand)_55%,var(--color-brand-soft))_border-box]",
  "hover:shadow-[0_16px_40px_-18px_color-mix(in_srgb,var(--color-brand)_55%,transparent),0_0_0_3px_color-mix(in_srgb,var(--color-brand)_7%,transparent)]",
  "focus-within:-translate-y-0.5",
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
);

/**
 * Link, dessen Klickfläche die ganze Kachel abdeckt (::after über der Kachel).
 * Weitere Bedienelemente in der Kachel brauchen `relative z-10`.
 */
export const STRETCHED_LINK =
  "outline-none after:absolute after:inset-0 after:z-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40";

/** Datum-Block wie auf der Website: Monat klein in Rot, Tag groß, Wochentag darunter. */
export function DateBlock({
  date,
  className,
  size = "md",
}: {
  date: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const p = eventDateParts(date);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-xl bg-card text-center leading-none",
        size === "md" ? "w-14 gap-1 py-2 shadow-soft" : "w-12 gap-0.5 border border-border py-1.5",
        className,
      )}
      aria-hidden
    >
      <span className="text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">{p.month}</span>
      <span
        className={cn(
          "font-bold tracking-[-0.04em] text-foreground tabular-nums",
          size === "md" ? "text-2xl" : "text-xl",
        )}
      >
        {p.day}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">{p.weekday}</span>
    </div>
  );
}
