"use client";

import { CalendarDays, Check, GraduationCap, KeyRound, UserPlus, type LucideIcon } from "lucide-react";
import { Tile } from "@/components/kit/Tile";
import { cn } from "@/lib/utils";

// Zähler-Kachel für die Aufgaben-Übersicht: große Zahl wie die Kennzahlen der Website,
// Beschriftung darunter, ganze Kachel führt zur Liste. Icons per Name, weil die Seite
// eine Server-Komponente ist (Funktionen lassen sich nicht an Client-Komponenten geben).

const ICONS = {
  "user-plus": UserPlus,
  "graduation-cap": GraduationCap,
  "key-round": KeyRound,
  "calendar-days": CalendarDays,
} satisfies Record<string, LucideIcon>;

export type CounterIcon = keyof typeof ICONS;

export function CounterTile({
  icon,
  value,
  label,
  href,
  tone = "task",
}: {
  icon: CounterIcon;
  value: number;
  label: string;
  href: string;
  /** task: offene Aufgaben (Zahl rot, solange > 0); neutral: reine Info. */
  tone?: "task" | "neutral";
}) {
  const done = tone === "task" && value === 0;
  return (
    <Tile
      href={href}
      Icon={ICONS[icon]}
      actions={
        done ? (
          <span className="flex items-center gap-1 pt-1 pr-1 text-xs font-semibold text-muted-foreground">
            <Check className="size-3.5" aria-hidden />
            Erledigt
          </span>
        ) : undefined
      }
      title={
        <span
          className={cn(
            "block text-4xl leading-none tracking-[-0.05em] tabular-nums sm:text-5xl",
            tone === "task" && value > 0 ? "text-primary" : "text-foreground",
          )}
        >
          {value.toLocaleString("de-DE")}
        </span>
      }
      meta={<span className="text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">{label}</span>}
    />
  );
}
