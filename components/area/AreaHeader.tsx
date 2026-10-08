import type { ReactNode } from "react";
import { PageHeader } from "@/components/kit/PageHeader";
import { TabBar, type TabItem } from "@/components/kit/TabBar";

/**
 * Kopf eines Bereichs mit mehreren Seiten (Veranstaltungen: Liste | Kalender,
 * Verein: Vorstand · Mitglieder · WhatsApp-Gruppe). Titel des Bereichs, höchstens
 * ein erklärender Satz, darunter die Routen-TabBar. Jede Seite des Bereichs rendert
 * denselben Kopf mit ihrem aktiven Tab, die URLs bleiben unverändert.
 *
 * Lokal gebaut, weil das Kit (components/kit) noch keinen Bereichskopf hat
 * (PageHeader ohne Satz und ohne Tabs).
 */
export function AreaHeader({
  title,
  intro,
  tabs,
  activeKey,
  layoutId,
  ariaLabel,
  action,
}: {
  title: string;
  /** Ein Satz unter dem Titel, optional. */
  intro?: string;
  tabs: TabItem[];
  activeKey: string;
  /** Eindeutig je Bereich, damit der Unterstrich nicht zwischen Leisten springt. */
  layoutId: string;
  ariaLabel: string;
  /** Aktion rechts neben dem Titel (meist ein IconLink). */
  action?: ReactNode;
}) {
  return (
    <header className="space-y-6">
      <div className="space-y-3">
        <PageHeader title={title} action={action} />
        {intro && (
          <p className="fly-rise max-w-xl text-[0.9375rem] text-muted-foreground [--fly-delay:0.15s]">
            {intro}
          </p>
        )}
      </div>
      <TabBar items={tabs} activeKey={activeKey} layoutId={layoutId} ariaLabel={ariaLabel} />
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
