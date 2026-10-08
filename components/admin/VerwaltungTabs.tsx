"use client";

import { usePathname } from "next/navigation";
import { TabBar, type TabItem } from "@/components/kit/TabBar";

// Bereichs-Navigation „Verwaltung“ (Admin-Bereich + Insights) als zentrierte TabBar
// über allen Unterseiten. Rechte wie bisher: alle Tabs für admin und board,
// Insights nur für board. Die Seiten selbst prüfen die Rollen weiterhin.

const TABS: (TabItem & { match: (path: string) => boolean; boardOnly?: boolean })[] = [
  { key: "aufgaben", label: "Aufgaben", href: "/admin", match: (p) => p === "/admin" },
  { key: "mitglieder", label: "Mitglieder", href: "/admin/members", match: (p) => p.startsWith("/admin/members") },
  {
    key: "veranstaltungen",
    label: "Veranstaltungen",
    href: "/admin/events",
    match: (p) => p.startsWith("/admin/events"),
  },
  { key: "brett", label: "Schwarzes Brett", href: "/admin/news", match: (p) => p.startsWith("/admin/news") },
  { key: "finanzen", label: "Finanzen", href: "/admin/finance", match: (p) => p.startsWith("/admin/finance") },
  { key: "bvh", label: "BVH", href: "/admin/bvh-login", match: (p) => p.startsWith("/admin/bvh-login") },
  {
    key: "alumni",
    label: "Alumni",
    href: "/admin/alumni-requests",
    match: (p) => p.startsWith("/admin/alumni-requests"),
  },
  { key: "insights", label: "Insights", href: "/insights", match: (p) => p.startsWith("/insights"), boardOnly: true },
];

export function VerwaltungTabs({ role }: { role: string }) {
  const pathname = usePathname() ?? "";
  const items = TABS.filter((t) => !t.boardOnly || role === "board");
  const active = items.find((t) => t.match(pathname))?.key ?? "aufgaben";

  return (
    <TabBar
      items={items.map(({ key, label, href }) => ({ key, label, href }))}
      activeKey={active}
      layoutId="verwaltung-tabs"
      ariaLabel="Verwaltung"
      className="-mx-4 px-4 sm:mx-0 sm:px-0"
    />
  );
}
