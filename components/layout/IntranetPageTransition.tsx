"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hängt den Seiteninhalt bei jedem Pfadwechsel neu ein, damit die CSS-Einflüge
 * (PageHeader, TileGrid, Reveal/Stagger und die gestaffelten Abschnitte, siehe
 * globals.css „Seitenwechsel“ und „Einfliegen im Intranet“) auch bei Client-
 * Navigation laufen. Die TabBar eines Bereichs bleibt dabei stehen ([data-tabbar]).
 */
export function IntranetPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="intranet-page-fade-in h-full">
      {children}
    </div>
  );
}
