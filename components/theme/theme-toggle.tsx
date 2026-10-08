"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Segmented } from "@/components/kit/Segmented";

const OPTIONS = [
  { key: "light", label: "Hell", Icon: Sun },
  { key: "dark", label: "Dunkel", Icon: Moon },
  { key: "system", label: "System", Icon: Monitor },
] as const;

type ThemeKey = (typeof OPTIONS)[number]["key"];

type ThemeToggleProps = {
  className?: string;
  /** Eindeutig je Instanz (Desktop-Sidebar und mobiles Menü gleichzeitig im DOM). */
  layoutId?: string;
  /** Nur Icons (schmale Leisten). */
  iconOnly?: boolean;
};

const subscribe = () => () => {};

/**
 * Farbschema Hell/Dunkel/System als Segment-Schalter. Das Theme ist erst nach dem
 * Mounten bekannt (next-themes liest localStorage); bis dahin ist nichts markiert.
 */
export function ThemeToggle({ className, layoutId = "theme-toggle", iconOnly = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  // true erst im Browser, ohne setState im Effect (Hydration-sicher).
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const value = mounted && theme ? (theme as ThemeKey) : null;

  return (
    <Segmented
      ariaLabel="Farbschema"
      layoutId={layoutId}
      fill
      className={className}
      value={value}
      onChange={(key) => setTheme(key)}
      options={OPTIONS.map((o) => ({ ...o, iconOnly }))}
    />
  );
}
