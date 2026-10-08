"use client";

import { TabBar, type TabItem } from "@/components/kit/TabBar";

// Bereichs-Navigation „Verwaltung“ (Admin-Bereich + Insights) als zentrierte TabBar
// über allen Unterseiten; der aktive Tab ergibt sich aus dem Pfad (TabBar aus dem Kit).
// Rechte wie bisher: alle Tabs für admin und board, Insights nur für board. Die Seiten
// selbst prüfen die Rollen weiterhin.

const TABS: TabItem[] = [
  { key: "aufgaben", label: "Aufgaben", href: "/admin", exact: true },
  { key: "mitglieder", label: "Mitglieder", href: "/admin/members" },
  { key: "veranstaltungen", label: "Veranstaltungen", href: "/admin/events" },
  { key: "brett", label: "Schwarzes Brett", href: "/admin/news" },
  { key: "finanzen", label: "Finanzen", href: "/admin/finance" },
  { key: "bvh", label: "BVH", href: "/admin/bvh-login" },
  { key: "alumni", label: "Alumni", href: "/admin/alumni-requests" },
  { key: "insights", label: "Insights", href: "/insights" },
];

export function VerwaltungTabs({ role }: { role: string }) {
  const items = role === "board" ? TABS : TABS.filter((t) => t.key !== "insights");
  return (
    <TabBar items={items} layoutId="verwaltung-tabs" ariaLabel="Verwaltung" className="-mx-4 px-4 sm:mx-0 sm:px-0" />
  );
}
