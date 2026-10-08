"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronRight,
  Gift,
  LayoutDashboard,
  Menu,
  PartyPopper,
  Settings,
  X,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { checkUnreadNews, markNewsAsRead } from "@/app/(intranet)/news/actions";
import { SidebarNavIcon } from "@/components/layout/SidebarNavIcon";
import { navItemVariants } from "@/components/layout/nav-icon-motion";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { IconButton } from "@/components/kit/IconButton";
import { cn } from "@/lib/utils";

type Profile = {
  vorname: string;
  nachname: string;
  rolle: string;
  letzterNewsAufruf: string | null;
};

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Animiertes Icon aus SidebarNavIcon (Schlüssel = alter Pfad), Standard: href. */
  iconKey?: string;
  /** Weitere Pfade (Präfix), auf denen der Eintrag aktiv ist (Bereiche mit TabBar). */
  match?: string[];
  allowedRoles: string[];
};

type NavGroup = {
  key: string;
  /** Abschnittsüberschrift (optional). */
  label?: string;
  /** Mit Trennlinie vom Abschnitt darüber abgesetzt. */
  separated?: boolean;
  items: NavItem[];
};

const ALL_ROLES = ["member", "admin", "board", "alumni"];

// Struktur UX-Umbau (Hannes 2026-10-08, ux-umbau-brief.md): fünf Bereiche für alle,
// darunter abgesetzt die Verwaltung (nur admin/board wie bisher). „Mein Profil“
// steht nicht in der Liste, sondern ist die Nutzerzeile unten (Hannes). Bereiche mit
// Unterseiten tragen oben eine TabBar; der Navi-Eintrag ist auf allen ihren Pfaden
// aktiv. URLs bleiben unverändert.
//   Veranstaltungen = /events (Liste) + /calendar (Kalender) + /events/[id]
//   Verein          = /whatsapp (öffnet zuerst, Hannes) + /members (+ /members/satzung) + /board-members
//   Verwaltung      = /admin* + /insights (Insights-Tab nur board, regelt die TabBar)
const NAV_GROUPS: NavGroup[] = [
  {
    key: "main",
    items: [
      { name: "Übersicht", href: "/dashboard", icon: LayoutDashboard, allowedRoles: ALL_ROLES },
      {
        name: "Veranstaltungen",
        href: "/events",
        icon: PartyPopper,
        match: ["/calendar"],
        allowedRoles: ALL_ROLES,
      },
      { name: "Schwarzes Brett", href: "/news", icon: Bell, allowedRoles: ALL_ROLES },
      { name: "Vorteile", href: "/magazines", icon: Gift, allowedRoles: ALL_ROLES },
      {
        name: "Verein",
        href: "/whatsapp",
        icon: Users,
        iconKey: "/members",
        match: ["/members", "/board-members"],
        allowedRoles: ALL_ROLES,
      },
    ],
  },
  {
    key: "verwaltung",
    separated: true,
    items: [
      {
        name: "Verwaltung",
        href: "/admin",
        icon: Settings,
        match: ["/insights"],
        allowedRoles: ["admin", "board"],
      },
    ],
  },
];

/** Bildmarke + „Intranet“ (ohne ausgeschriebenen Vereinsnamen, Hannes 2026-10-08). */
function BrandMark({ logoClassName }: { logoClassName?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <IcrLogo className={cn("h-9 w-auto shrink-0 text-brand", logoClassName)} />
      <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-sidebar-foreground">Intranet</span>
    </span>
  );
}

function isActivePath(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.match ?? [])].some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  board: "Vorstand",
  member: "Mitglied",
  alumni: "Alumni",
};

function getInitials(vorname: string, nachname: string) {
  return `${vorname.charAt(0)}${nachname.charAt(0)}`.toUpperCase();
}

const drawerEase = [0.22, 1, 0.36, 1] as const;

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasUnread, setHasUnread] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const lastReadRef = useRef(profile.letzterNewsAufruf);
  const lastCheckAtRef = useRef<number | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  // Server-Profil (z. B. nach markNewsAsRead + refresh) mit Ref abgleichen
  useEffect(() => {
    if (profile.letzterNewsAufruf) {
      lastReadRef.current = profile.letzterNewsAufruf;
    }
  }, [profile.letzterNewsAufruf]);

  useEffect(() => {
    let cancelled = false;
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;

    async function check() {
      if (pathname === "/news") {
        await markNewsAsRead();
        const nowIso = new Date().toISOString();
        lastReadRef.current = nowIso;
        lastCheckAtRef.current = Date.now();
        if (!cancelled) setHasUnread(false);
        // Layout/Profil neu laden, damit der Zeitstempel nicht nur clientseitig existiert
        router.refresh();
        return;
      }

      // Nach Verlassen von /news nicht durch 60s-Throttle blockieren – sonst bleibt der rote Punkt hängen
      const leftNews = prev === "/news" && pathname !== "/news";
      const now = Date.now();
      if (
        !leftNews &&
        lastCheckAtRef.current &&
        now - lastCheckAtRef.current < 60_000
      ) {
        return;
      }
      const unread = await checkUnreadNews(lastReadRef.current);
      // Zeitstempel erst nach gültiger Antwort setzen: Ein abgebrochener Lauf (z. B.
      // doppelter Effekt im Strict Mode, schneller Seitenwechsel) blockierte sonst den
      // nächsten Abruf für 60 s, und die Pille „Neu“ erschien nie.
      if (cancelled) return;
      lastCheckAtRef.current = now;
      setHasUnread(unread);
    }
    // Abgebrochene Anfragen (Seite verlassen, Netz weg) sind kein Fehler: Hinweis bleibt
    // wie er ist. Firefox meldete sonst „NetworkError“ als unbehandelte Ablehnung.
    check().catch(() => {});
    return () => { cancelled = true; };
  }, [pathname, router]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Escape schließt das mobile Menü.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.allowedRoles.includes(profile.rolle)),
  })).filter((group) => group.items.length > 0);
  const initials = getInitials(profile.vorname, profile.nachname);
  const roleLabel = ROLE_LABELS[profile.rolle] ?? profile.rolle;
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  // Laufende Nummer je Eintrag über alle Gruppen (Staffelung im mobilen Menü).
  const groupOffsets = groups.map((_, gi) =>
    groups.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0)
  );

  const renderNav = (idPrefix: string, onNavigate?: () => void) => {
    return (
      <nav aria-label="Intranet Navigation" className="space-y-4">
        {groups.map((group, gi) => (
          <div
            key={group.key}
            className={cn(group.separated && "border-t border-sidebar-border pt-4")}
          >
            {group.label && (
              <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-sidebar-muted uppercase">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item, ii) => {
                const active = isActivePath(pathname, item);
                const showUnread = item.href === "/news" && hasUnread && !active;
                const i = groupOffsets[gi] + ii;

                return (
                  <motion.li
                    key={item.href}
                    // Mobil: Einträge kommen gestaffelt (Website-Menü), Desktop ohne Verzögerung.
                    initial={onNavigate ? { opacity: 0, x: -12 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: onNavigate ? 0.08 + i * 0.03 : 0, ease: drawerEase }}
                  >
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <motion.div
                        // whileTap macht das Element sonst selbst fokussierbar (zweiter Tab-Stopp im Link).
                        tabIndex={-1}
                        initial="rest"
                        whileHover="hover"
                        whileTap={{ scale: 0.98 }}
                        variants={navItemVariants}
                        onHoverStart={() => setHoveredHref(item.href)}
                        onHoverEnd={() =>
                          setHoveredHref((current) =>
                            current === item.href ? null : current
                          )
                        }
                        className={cn(
                          "group relative flex items-center gap-3 overflow-visible rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                          !active && "hover:bg-sidebar-accent/60",
                        )}
                      >
                        {active && (
                          // Aktive Fläche im Markenverlauf gleitet zwischen den Einträgen
                          // (layoutId, Muster TabBar). Verlauf nur für Markierungen.
                          <motion.span
                            layoutId={`${idPrefix}-nav-active`}
                            className="bg-brand-gradient absolute inset-0 rounded-lg shadow-brand"
                            transition={{ type: "spring", stiffness: 500, damping: 42 }}
                          />
                        )}
                        <span className="relative">
                          <SidebarNavIcon
                            href={item.iconKey ?? item.href}
                            icon={item.icon}
                            active={active}
                            isRowHovered={hoveredHref === item.href}
                          />
                        </span>
                        <span
                          className={cn(
                            "relative truncate",
                            active
                              ? "font-semibold text-white"
                              : "font-medium text-sidebar-muted group-hover:text-sidebar-foreground",
                          )}
                        >
                          {item.name}
                        </span>
                        {showUnread && (
                          // Ungelesene Beiträge am Schwarzen Brett: kleine Pille statt Punkt.
                          <span className="relative ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-primary-foreground uppercase">
                            Neu
                            <span className="sr-only"> (ungelesene Beiträge)</span>
                          </span>
                        )}
                      </motion.div>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  };

  // Nutzerzeile = Zugang zu „Mein Profil“ (kein eigener Navi-Eintrag). Auf /profile
  // trägt sie die aktive Fläche im Markenverlauf; dieselbe layoutId wie die Navi, die
  // Fläche gleitet also von der Liste hierher. Hover/Fokus: Fläche + Pfeil nach rechts.
  const renderFooter = (idPrefix: string, onNavigate?: () => void) => (
    <div className="border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-1">
        <Link
          href="/profile"
          onClick={onNavigate}
          title="Mein Profil"
          aria-current={profileActive ? "page" : undefined}
          className={cn(
            "group relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
            !profileActive && "hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
          )}
        >
          {profileActive && (
            <motion.span
              layoutId={`${idPrefix}-nav-active`}
              className="bg-brand-gradient absolute inset-0 rounded-lg shadow-brand"
              transition={{ type: "spring", stiffness: 500, damping: 42 }}
            />
          )}
          <span
            className={cn(
              "relative flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-transform duration-300 group-hover:scale-105",
              profileActive ? "bg-white text-primary" : "bg-primary text-primary-foreground",
            )}
          >
            {initials}
          </span>
          <span className="relative min-w-0 flex-1 leading-tight">
            <span className="sr-only">Mein Profil: </span>
            <span
              className={cn(
                "block truncate text-sm font-semibold",
                profileActive ? "text-white" : "text-sidebar-foreground",
              )}
            >
              {profile.vorname} {profile.nachname}
            </span>
            <span className={cn("block truncate text-xs", profileActive ? "text-white/80" : "text-sidebar-muted")}>
              {roleLabel}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              "relative -ml-1 size-3.5 shrink-0 transition-[translate,color,opacity] duration-300 motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5",
              profileActive
                ? "text-white"
                : "text-sidebar-muted opacity-60 group-hover:text-primary group-hover:opacity-100 group-focus-visible:text-primary group-focus-visible:opacity-100",
            )}
          />
        </Link>
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop-Sidebar: weiß wie der Website-Header, Bildmarke oben. */}
      <aside className="hidden h-screen w-[17rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex">
        <Link
          href="/dashboard"
          className="group flex items-center px-5 pt-6 pb-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label="Investment Club Regensburg, Intranet-Übersicht"
        >
          <BrandMark logoClassName="transition-[rotate,scale] duration-700 ease-out group-hover:-rotate-6 group-hover:scale-[1.06]" />
        </Link>
        <div className="flex-1 overflow-y-auto px-3 pb-4">{renderNav("desktop")}</div>
        <div className="px-3 pb-4">{renderFooter("desktop")}</div>
      </aside>

      {/* Mobile Topbar: Glas-Weiß wie der Website-Header. */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-sidebar-border bg-background/80 px-4 backdrop-blur-xl md:hidden">
        <Link
          href="/dashboard"
          className="rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label="Investment Club Regensburg, Intranet-Übersicht"
        >
          <BrandMark logoClassName="h-8" />
        </Link>
        <IconButton
          label="Navigation öffnen"
          aria-expanded={isOpen}
          className="-mr-1 size-10 text-foreground [&_svg]:size-5"
          onClick={() => setIsOpen(true)}
        >
          <Menu />
        </IconButton>
      </header>

      {/* Mobiles Menü: Drawer von links, Backdrop in Night mit Unschärfe (Website). */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-ink/20 backdrop-blur-md"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.4, ease: drawerEase }}
              className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[86vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-card"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <BrandMark />
                <IconButton
                  label="Navigation schließen"
                  className="-mr-2 size-10 [&_svg]:size-5"
                  onClick={() => setIsOpen(false)}
                >
                  <X />
                </IconButton>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {renderNav("mobile", () => setIsOpen(false))}
              </div>
              <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {renderFooter("mobile", () => setIsOpen(false))}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
