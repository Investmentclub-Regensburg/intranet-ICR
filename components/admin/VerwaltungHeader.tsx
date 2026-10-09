"use client";

import { usePathname } from "next/navigation";
import { AreaHeader } from "@/components/area/AreaHeader";
import { VERWALTUNG_SECTIONS, sectionsForRole } from "@/components/layout/nav-sections";

// Kopf des Bereichs „Verwaltung“ (Admin-Bereich + Insights). Die Unterseiten stehen
// in der Sidebar; hier nur Eyebrow „Verwaltung“ + Titel der Unterseite. Nur auf den
// Bereichsseiten selbst: Detailseiten (z. B. /admin/events/[id]) tragen ihren eigenen
// Titel. Insights nur für board; die Seiten prüfen die Rollen weiterhin.
export function VerwaltungHeader({ role }: { role: string }) {
  const pathname = usePathname();
  const sections = sectionsForRole(VERWALTUNG_SECTIONS, role);
  if (!sections.some((s) => s.href === pathname)) return null;
  return <AreaHeader area="Verwaltung" sections={sections} />;
}
