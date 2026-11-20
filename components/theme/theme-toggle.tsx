"use client";

import { useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

const OPTIONS = [
  { key: "light", label: "Hell", Icon: Sun },
  { key: "dark", label: "Dunkel", Icon: Moon },
  { key: "system", label: "System", Icon: Monitor },
] as const;

const subscribe = () => () => {};

/**
 * Farbschema Hell/Dunkel/System: drei kompakte Icon-Knöpfe ohne sichtbare Beschriftung (Klickrunde
 * 20.11.2026: kein Schriftzug „Darstellung“, steht in der Seitenleiste rechts neben Impressum/Datenschutz).
 * Gruppe und Knöpfe sind über aria-label/title benannt. Die Auswahl liegt als ruhige Fläche dahinter (wie der
 * aktive Navi-Punkt, kein Rot), ohne Bewegung bei reduzierter Bewegung. Das Theme ist erst nach dem Mounten
 * bekannt (next-themes liest localStorage); bis dahin ist nichts markiert.
 */
export function ThemeToggle({ layoutId = "theme-toggle", className }: { layoutId?: string; className?: string }) {
  const { theme, setTheme } = useTheme();
  // true erst im Browser, ohne setState im Effect (Hydration-sicher).
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const value = mounted ? (theme ?? "system") : null;
  const reduced = useReducedMotionSafe();

  return (
    <div
      role="radiogroup"
      aria-label="Darstellung"
      title="Darstellung"
      className={cn("flex shrink-0 items-center gap-0.5 rounded-lg bg-sidebar-accent p-0.5", className)}
    >
      {OPTIONS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(key)}
            className={cn(
              "relative flex size-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40",
              active ? "text-sidebar-foreground" : "text-sidebar-muted hover:text-sidebar-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-sidebar shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-sidebar-foreground/[0.06] ring-inset"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 42 }}
              />
            )}
            <Icon aria-hidden className="relative size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
