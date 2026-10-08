"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Zentrierte Tab-Leiste, ersetzt die Seitenüberschrift (Muster Tenant-Dashboard,
// _components/tab-bar.tsx). Der Unterstrich in Markenrot gleitet per layoutId
// zum aktiven Tab (wie die Navi-Unterstreichung der Website).
// Zwei Modi: Routen-Tabs (href → Link, als <nav>) oder Zustands-Tabs (onSelect,
// role=tablist). Mobil horizontal scrollbar.

export type TabItem = {
  key: string;
  label: string;
  href?: string;
  /** Zähler (z. B. offene Anträge); 0/undefined = keiner. */
  count?: number;
};

export function TabBar({
  items,
  activeKey,
  layoutId,
  ariaLabel,
  onSelect,
  className,
}: {
  items: TabItem[];
  activeKey: string;
  /** Eindeutig je Tab-Leiste, sonst springt der Unterstrich zwischen Leisten. */
  layoutId: string;
  ariaLabel: string;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const isNav = items.some((t) => t.href);
  const Wrapper = isNav ? "nav" : "div";

  return (
    <Wrapper
      role={isNav ? undefined : "tablist"}
      aria-label={ariaLabel}
      className={cn(
        // overflow-y-hidden: der Unterstrich sitzt 1 px unter der Kante; overflow-x-auto allein
        // erzeugte sonst eine senkrechte Scrollleiste.
        "flex justify-start gap-6 overflow-x-auto overflow-y-hidden border-b border-border sm:justify-center sm:gap-8",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((t) => {
        const active = t.key === activeKey;
        const inner = (
          <motion.span
            whileTap={{ scale: 0.96 }}
            className={cn(
              "relative inline-flex items-center gap-2 px-1 pb-3 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? (
              <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">
                {t.count}
              </span>
            ) : null}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </motion.span>
        );

        return t.href ? (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="shrink-0 rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {inner}
          </Link>
        ) : (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(t.key)}
            className="shrink-0 rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {inner}
          </button>
        );
      })}
    </Wrapper>
  );
}
