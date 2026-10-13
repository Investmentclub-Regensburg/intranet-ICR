"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Wahl zwischen großen Kacheln, bevor es losgeht (Brief UX-Umbau: „erst überlegen
 * können: Event verwalten oder neues anlegen“). Meist zwei Wege nebeneinander,
 * mobil untereinander. Jede Kachel: Icon, Titel, ein Satz, optional eine Meta-Zeile
 * (z. B. „3 anstehend“), Pfeil unten rechts. Ganze Kachel klickbar (Link oder
 * Aktion), Hover/Fokus mit dem roten Verlaufsrahmen (.tile-glow). Die Kacheln
 * kommen gestaffelt.
 *
 * Props
 * - items: ChoiceItem[] (key, Icon, title, text?, meta?, href? | onSelect?, primary?)
 *   `primary` hebt die Hauptwahl hervor (Icon-Fläche in Primär-Rot).
 * - ariaLabel?: Name der Auswahl für Screenreader (z. B. „Was möchtest du tun?“).
 * - columns?: 2 (Standard) | 3
 * - reveal?: gestaffelt einblenden (Standard true), delay? (s)
 * - className?
 */

export type ChoiceItem = {
  key: string;
  Icon: LucideIcon;
  title: string;
  /** Ein Satz. */
  text?: string;
  /** Kleine Zeile über dem Pfeil, z. B. Zähler. */
  meta?: ReactNode;
  href?: string;
  onSelect?: () => void;
  /** Hauptwahl: Icon-Fläche in Primär-Rot. */
  primary?: boolean;
};

const CHOICE_CLS =
  "tile-glow group flex min-h-[11rem] w-full flex-col gap-4 rounded-2xl p-6 text-left outline-none sm:min-h-[13rem] sm:p-7";

function ChoiceInner({ item }: { item: ChoiceItem }) {
  const { Icon } = item;
  return (
    <>
      <span
        className={cn(
          "tile-icon size-12 rounded-xl",
          item.primary && "border-primary bg-primary text-primary-foreground",
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 space-y-1.5">
        <span className="block text-xl leading-tight font-bold tracking-[-0.025em] text-foreground sm:text-[1.375rem]">
          {item.title}
        </span>
        {item.text && <span className="block text-sm text-muted-foreground">{item.text}</span>}
      </span>
      <span className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-xs font-semibold text-muted-foreground">{item.meta}</span>
        <ArrowRight
          className="size-5 shrink-0 text-muted-foreground transition-[translate,color] duration-300 group-hover:text-primary group-focus-visible:text-primary motion-safe:group-hover:translate-x-1"
          aria-hidden
        />
      </span>
    </>
  );
}

export function ChoiceTiles({
  items,
  ariaLabel,
  columns = 2,
  reveal = true,
  delay,
  className,
}: {
  items: ChoiceItem[];
  ariaLabel?: string;
  columns?: 2 | 3;
  reveal?: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <ul
      aria-label={ariaLabel}
      data-reveal={reveal ? "stagger" : undefined}
      style={delay === undefined ? undefined : ({ "--reveal-delay": `${delay}s` } as CSSProperties)}
      className={cn("grid gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", className)}
    >
      {items.map((item) => (
        <li key={item.key} className="flex">
          {item.href ? (
            <Link href={item.href} className={CHOICE_CLS}>
              <ChoiceInner item={item} />
            </Link>
          ) : (
            <button type="button" onClick={item.onSelect} className={CHOICE_CLS}>
              <ChoiceInner item={item} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
