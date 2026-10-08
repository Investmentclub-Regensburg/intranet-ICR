import type { ReactNode } from "react";
import { PageHeader } from "@/components/kit/PageHeader";
import { TabBar, type TabItem } from "@/components/kit/TabBar";

/**
 * Kopf eines Bereichs mit mehreren Seiten (Veranstaltungen: Liste | Kalender,
 * Verein: Vorstand · Mitglieder · WhatsApp-Gruppe): PageHeader (Titel, höchstens
 * ein Satz, Aktion) und darunter die Routen-TabBar. Jede Seite des Bereichs
 * rendert denselben Kopf, die URLs bleiben unverändert; den aktiven Tab leitet
 * die TabBar aus dem Pfad ab.
 */
export function AreaHeader({
  title,
  intro,
  tabs,
  layoutId,
  ariaLabel,
  action,
}: {
  title: string;
  /** Ein Satz unter dem Titel, optional. */
  intro?: string;
  tabs: TabItem[];
  /** Eindeutig je Bereich, damit der Unterstrich nicht zwischen Leisten springt. */
  layoutId: string;
  ariaLabel: string;
  /** Aktion rechts neben dem Titel. */
  action?: ReactNode;
}) {
  return (
    <header className="space-y-6">
      <PageHeader title={title} description={intro} action={action} />
      <TabBar items={tabs} layoutId={layoutId} ariaLabel={ariaLabel} />
    </header>
  );
}

/** Tabs des Bereichs Veranstaltungen. */
export const EVENT_TABS: TabItem[] = [
  { key: "list", label: "Liste", href: "/events" },
  { key: "calendar", label: "Kalender", href: "/calendar" },
];

/** Tabs des Bereichs Verein. */
export const VEREIN_TABS: TabItem[] = [
  { key: "board", label: "Vorstand", href: "/board-members" },
  { key: "members", label: "Mitglieder", href: "/members" },
  { key: "whatsapp", label: "WhatsApp-Gruppe", href: "/whatsapp" },
];
