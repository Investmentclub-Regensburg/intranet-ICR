// Unterseiten der Bereiche. Die Sidebar ist die einzige Navigation: Unter dem aktiven
// Bereich klappen dessen Unterseiten auf; die Seiten selbst zeigen nur noch einen Kopf
// (Bereich als Eyebrow, Unterseite als Titel). Ohne Hooks, daher in Server- und
// Client-Komponenten nutzbar. URLs bleiben unverändert.

export type SubNavItem = {
  key: string;
  label: string;
  href: string;
  /** Weitere Pfade, auf denen der Eintrag aktiv ist (Präfix, z. B. "/events"). */
  match?: string[];
  /** Nur auf genau `href` aktiv, nicht auf Unterseiten. */
  exact?: boolean;
  /** Nur für diese Rollen sichtbar (Standard: alle, die den Bereich sehen). */
  roles?: string[];
};

function matchLength(pathname: string, item: { href?: string; match?: string[]; exact?: boolean }): number {
  const paths = [item.href, ...(item.match ?? [])].filter((p): p is string => Boolean(p));
  let best = -1;
  for (const p of paths) {
    const hit = item.exact ? pathname === p : pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/");
    if (hit && p.length > best) best = p.length;
  }
  return best;
}

/**
 * Aktiver Eintrag: längster passender Pfad, sonst null
 * („/admin“ und „/admin/members“ → auf /admin/members gewinnt „Mitglieder“).
 */
export function activeTabKey(
  pathname: string,
  items: { key: string; href?: string; match?: string[]; exact?: boolean }[],
): string | null {
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

/** Veranstaltungen: Liste (inkl. /events/[id]) und Kalender. */
export const EVENT_SECTIONS: SubNavItem[] = [
  { key: "list", label: "Liste", href: "/events" },
  { key: "calendar", label: "Kalender", href: "/calendar" },
];

/**
 * Verein (Reihenfolge Hannes 2026-10-08, Einstieg = WhatsApp-Gruppe). Satzung liegt
 * unter /members/satzung (Login-Schutz der Middleware über das Präfix /members/);
 * auf dem Pfad gewinnt der längere Eintrag.
 */
export const VEREIN_SECTIONS: SubNavItem[] = [
  { key: "whatsapp", label: "WhatsApp-Gruppe", href: "/whatsapp" },
  { key: "members", label: "Mitglieder", href: "/members", exact: true },
  { key: "board", label: "Vorstand", href: "/board-members" },
  { key: "statute", label: "Satzung", href: "/members/satzung" },
];

/** Verwaltung (admin/board), Insights nur board. Die Seiten prüfen die Rollen weiterhin. */
export const VERWALTUNG_SECTIONS: SubNavItem[] = [
  { key: "aufgaben", label: "Aufgaben", href: "/admin", exact: true },
  { key: "mitglieder", label: "Mitglieder", href: "/admin/members" },
  { key: "veranstaltungen", label: "Veranstaltungen", href: "/admin/events" },
  { key: "brett", label: "Schwarzes Brett", href: "/admin/news" },
  { key: "finanzen", label: "Finanzen", href: "/admin/finance" },
  { key: "bvh", label: "BVH", href: "/admin/bvh-login" },
  { key: "alumni", label: "Alumni", href: "/admin/alumni-requests" },
  { key: "insights", label: "Insights", href: "/insights", roles: ["board"] },
];

export function sectionsForRole(items: SubNavItem[], role: string): SubNavItem[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}
