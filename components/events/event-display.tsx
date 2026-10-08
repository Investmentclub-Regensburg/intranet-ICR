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
 * Klickbare Kachel mit Hover-Glow aus dem Kit (`.tile-glow`, globals.css): Rahmen im
 * dunkelroten Verlauf, leichter Schein, hebt sich minimal; auch bei Tastatur-Fokus
 * eines Kindes. Keine eigenen Rand-, Schatten-, Flächen- oder Transition-Klassen dazu.
 * Eigene Kachel statt Kit-Tile, weil die Veranstaltungs-Kachel einen Bild-Kopf hat.
 */
export const GLOW_TILE = "tile-glow relative isolate rounded-2xl";

/**
 * Link, dessen Klickfläche die ganze Kachel abdeckt (::after über der Kachel).
 * Weitere Bedienelemente in der Kachel brauchen `relative z-10`. Den Fokus zeigt
 * die Kachel selbst (tile-glow reagiert auf :has(:focus-visible)).
 */
export const STRETCHED_LINK =
  "outline-none after:absolute after:inset-0 after:z-0 after:rounded-2xl after:content-['']";

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
