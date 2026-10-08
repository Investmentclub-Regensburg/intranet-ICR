"use client";

import { CalendarDays, GraduationCap, KeyRound, UserPlus, type LucideIcon } from "lucide-react";
import { Tile } from "@/components/kit/Tile";
import { StatusPill } from "@/components/kit/StatusCard";

// Zähler-Kachel für die Aufgaben-Übersicht: große Zahl wie die Kennzahlen der Website,
// Beschriftung darunter, ganze Kachel führt zur Liste. Zahlen immer in Schwarz (Hannes
// 2026-10-08); ob etwas zu tun ist, zeigt nur die kleine Pille oben rechts.
// Icons per Name, weil die Seite eine Server-Komponente ist (Funktionen lassen sich
// nicht an Client-Komponenten geben).

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
  /** task: offene Aufgaben (Pille „Offen“ bzw. „Erledigt“); neutral: reine Info ohne Pille. */
  tone?: "task" | "neutral";
}) {
  return (
    <Tile
      href={href}
      Icon={ICONS[icon]}
      actions={
        tone === "task" ? (
          <span className="pt-1 pr-1">
            {value > 0 ? <StatusPill status="open" /> : <StatusPill status="done" />}
          </span>
        ) : undefined
      }
      title={
        <span className="block text-4xl leading-none tracking-[-0.05em] text-foreground tabular-nums sm:text-5xl">
          {value.toLocaleString("de-DE")}
        </span>
      }
      meta={<span className="text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">{label}</span>}
    />
  );
}
