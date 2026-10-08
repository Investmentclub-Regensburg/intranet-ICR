"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Zentrierte Tab-Leiste, ersetzt die Seitenüberschrift (Muster Tenant-Dashboard,
// _components/tab-bar.tsx). Der Unterstrich im Markenverlauf gleitet per layoutId
// zum aktiven Tab (wie die Navi-Unterstreichung der Website).
// Zwei Modi: Routen-Tabs (href → Link, als <nav>) oder Zustands-Tabs (onSelect,
// role=tablist). Mobil horizontal scrollbar, der aktive Tab wird in die Mitte
// gescrollt.
//
// Routen-Tabs für Bereichs-Layouts (z. B. Veranstaltungen: Liste | Kalender,
// Verein, Verwaltung): `activeKey` weglassen, dann gilt der Tab, dessen `href`
// (oder einer der `match`-Pfade) am längsten zum aktuellen Pfad passt
// („/admin“ und „/admin/members“ → auf /admin/members gewinnt „Mitglieder“).
// `exact: true`, wenn ein Tab nur auf genau seinem Pfad aktiv sein soll.
// Beispiel im Layout (Client-Komponente):
//   <TabBar ariaLabel="Veranstaltungen" layoutId="tabs-veranstaltungen" items={[
//     { key: "liste", label: "Liste", href: "/events" },
//     { key: "kalender", label: "Kalender", href: "/calendar" },
//   ]} />
// Die Leiste trägt data-tabbar: Beim Tab-Wechsel bleibt sie stehen, nur der
// Inhalt blendet neu ein (globals.css, Seitenwechsel).
//
// Props: items (TabItem[]), activeKey? (Pflicht bei Zustands-Tabs), layoutId
// (eindeutig je Leiste), ariaLabel, onSelect? (Zustands-Tabs), className?

export type TabItem = {
  key: string;
  label: string;
  href?: string;
  /** Weitere Pfade, auf denen der Tab aktiv ist (Präfix, z. B. "/events"). */
  match?: string[];
  /** Nur auf genau `href` aktiv, nicht auf Unterseiten. */
  exact?: boolean;
  /** Zähler (z. B. offene Anträge); 0/undefined = keiner. */
  count?: number;
};

function matchLength(pathname: string, item: TabItem): number {
  const paths = [item.href, ...(item.match ?? [])].filter((p): p is string => Boolean(p));
  let best = -1;
  for (const p of paths) {
    const hit = item.exact ? pathname === p : pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/");
    if (hit && p.length > best) best = p.length;
  }
  return best;
}

/** Aktiver Routen-Tab: längster passender Pfad, sonst null. */
export function activeTabKey(pathname: string, items: TabItem[]): string | null {
  let key: string | null = null;
  let best = -1;
  for (const item of items) {
    const len = matchLength(pathname, item);
    if (len > best) {
      best = len;
      key = item.key;
    }
  }
  return best >= 0 ? key : null;
}

export function TabBar({
  items,
  activeKey,
  layoutId,
  ariaLabel,
  onSelect,
  className,
}: {
  items: TabItem[];
  /** Bei Routen-Tabs optional (sonst aus dem Pfad), bei Zustands-Tabs Pflicht. */
  activeKey?: string;
  /** Eindeutig je Tab-Leiste, sonst springt der Unterstrich zwischen Leisten. */
  layoutId: string;
  ariaLabel: string;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const pathname = usePathname();
  const isNav = items.some((t) => t.href);
  const current = activeKey ?? (isNav ? activeTabKey(pathname, items) : null);
  const Wrapper = isNav ? "nav" : "div";
  const scrollerRef = useRef<HTMLElement | null>(null);

  // Mobil: aktiven Tab in die Mitte der Leiste scrollen (nur die Leiste, nicht die Seite).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const el = scroller.querySelector<HTMLElement>("[data-active='true']");
    if (!el) return;
    const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "instant" as ScrollBehavior });
  }, [current]);

  return (
    <Wrapper
      ref={scrollerRef as never}
      data-tabbar=""
      role={isNav ? undefined : "tablist"}
      aria-label={ariaLabel}
      className={cn(
        // safe center: passt die Leiste nicht, beginnt sie links (sonst wären die ersten Tabs
        // abgeschnitten und nicht erreichbar).
        // overflow-y-hidden: der Unterstrich sitzt 1 px unter der Kante; overflow-x-auto allein
        // erzeugte sonst eine senkrechte Scrollleiste.
        "relative flex justify-start gap-6 overflow-x-auto overflow-y-hidden border-b border-border sm:gap-8 sm:[justify-content:safe_center]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((t) => {
        const active = t.key === current;
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
                className="bg-brand-gradient absolute inset-x-0 -bottom-px h-0.5"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </motion.span>
        );

        return t.href ? (
          <Link
            key={t.key}
            href={t.href}
            data-active={active}
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
            data-active={active}
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
