"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/kit/PageHeader";
import { activeTabKey, type SubNavItem } from "@/components/layout/nav-sections";

/**
 * Kopf einer Seite in einem Bereich mit Unterseiten (Veranstaltungen, Verein,
 * Verwaltung). Die Unterseiten stehen nur in der Sidebar (aufgeklappt unter dem
 * Bereich); hier steht der Bereich als Eyebrow und die aktuelle Unterseite als
 * Titel, beides aus dem Pfad abgeleitet (components/layout/nav-sections.ts).
 */
export function AreaHeader({
  area,
  sections,
  intro,
  action,
}: {
  /** Name des Bereichs (Eyebrow). */
  area: string;
  sections: SubNavItem[];
  /** Ein Satz unter dem Titel, optional. */
  intro?: string;
  /** Aktion rechts neben dem Titel. */
  action?: ReactNode;
}) {
  const pathname = usePathname();
  const key = activeTabKey(pathname, sections);
  const title = sections.find((s) => s.key === key)?.label ?? area;
  return <PageHeader eyebrow={area} title={title} description={intro} action={action} />;
}
