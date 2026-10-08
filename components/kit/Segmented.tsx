"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Segment-Schalter (Muster Tenant-Dashboard, _components/segmented.tsx): eine Wahl
// aus wenigen Optionen, die aktive trägt eine Fläche, die per layoutId gleitet.
// `radio` für Formular-Auswahl (radiogroup), sonst Toggle-Buttons (aria-pressed).

export type SegmentOption<K extends string> = {
  key: K;
  label: string;
  Icon?: LucideIcon;
  /** Nur Icon zeigen, Label als Tooltip/aria-label (z. B. schmale Sidebar). */
  iconOnly?: boolean;
};

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  layoutId,
  radio = false,
  ariaLabel,
  fill = false,
  className,
}: {
  options: readonly SegmentOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  layoutId: string;
  radio?: boolean;
  ariaLabel?: string;
  /** Volle Breite, Optionen teilen sich den Platz. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      role={radio ? "radiogroup" : "group"}
      aria-label={ariaLabel}
      className={cn(
        "flex rounded-xs border border-border bg-card p-0.5",
        fill ? "w-full" : "w-fit",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <motion.button
            key={o.key}
            type="button"
            role={radio ? "radio" : undefined}
            aria-checked={radio ? active : undefined}
            aria-pressed={radio ? undefined : active}
            aria-label={o.iconOnly ? o.label : undefined}
            title={o.iconOnly ? o.label : undefined}
            onClick={() => onChange(o.key)}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              fill && "flex-1",
              active ? "text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="bg-brand-gradient absolute inset-0 rounded-[2px] shadow-brand"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {o.Icon && <o.Icon className="relative size-3.5 shrink-0" aria-hidden />}
            {!o.iconOnly && <span className="relative">{o.label}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
