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

  // Klickfläche je Knopf 40 × 40 px (Regel der Design-Runde), Optik kompakt: Die Knöpfe liegen lückenlos
  // nebeneinander (keine Überlappung), die sichtbaren Flächen sind 28 px groß und liegen ganz in ihrer Klickfläche.
  // Die Schiene dahinter ist nur Optik (10 px schmaler je Seite); negative Ränder halten das Layout so klein wie die
  // Schiene, die Klickflächen ragen 10 px seitlich und 4 px oben/unten darüber hinaus.
  return (
    <div
      role="radiogroup"
      aria-label="Darstellung"
      title="Darstellung"
      className={cn("relative -mx-2.5 -my-1 flex shrink-0", className)}
    >
      <span aria-hidden className="absolute inset-x-2.5 inset-y-1 rounded-lg bg-sidebar-accent" />
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
              "group relative flex size-10 items-center justify-center outline-none",
              key === "light" ? "justify-end" : key === "system" ? "justify-start" : "",
              active ? "text-sidebar-foreground" : "text-sidebar-muted hover:text-sidebar-foreground",
            )}
          >
            <span className="relative flex size-7 items-center justify-center rounded-md transition-colors group-focus-visible:ring-[3px] group-focus-visible:ring-ring/40">
              {active && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-md bg-sidebar shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-sidebar-foreground/[0.06] ring-inset"
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 42 }}
                />
              )}
              <Icon aria-hidden className="relative size-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
