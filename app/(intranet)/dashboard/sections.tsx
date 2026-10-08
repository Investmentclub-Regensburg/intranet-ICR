import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/kit/PageHeader";
import { NextEventTiles, MyRegistrationTiles } from "@/components/dashboard/EventTiles";
import { NewsTiles } from "@/components/dashboard/NewsTiles";
import { QuickAccessTiles } from "@/components/dashboard/QuickAccessTiles";
import { AdminStatTiles } from "@/components/dashboard/AdminStatTiles";
import { getBvhLoginStatusForCurrentUser } from "@/app/(intranet)/magazines/actions";
import { getAdminCounts, getDashboardEvents, getDashboardNews, monthLabel } from "./data";

// Abschnitte der Übersicht. Jeder lädt seine Daten selbst und steht in der Seite in einem
// eigenen <Suspense>: Begrüßung und Überschriften sind sofort da, die Kacheln folgen.

const LOAD_ERROR_HINT = "Bitte lade die Seite neu.";

export async function NextEventsSection() {
  const data = await getDashboardEvents();
  if (!data) return <EmptyState title="Events konnten nicht geladen werden." hint={LOAD_ERROR_HINT} />;

  const next = data.upcoming.slice(0, 3);
  if (next.length === 0) {
    return (
      <EmptyState
        title="Gerade sind keine Events geplant."
        hint="Neue Termine erscheinen hier, sobald sie angelegt sind."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/events">Vergangene Events</Link>
          </Button>
        }
      />
    );
  }
  return <NextEventTiles events={next} />;
}

export async function MyRegistrationsSection() {
  const data = await getDashboardEvents();
  if (!data) return <EmptyState className="py-10" title="Anmeldungen konnten nicht geladen werden." hint={LOAD_ERROR_HINT} />;

  const mine = data.registered;
  if (mine.length === 0) {
    const canRegister = data.upcoming.some((e) => e.requiresRegistration);
    return (
      <EmptyState
        className="py-10"
        title="Noch keine Anmeldungen."
        hint={canRegister ? "Melde dich bei einem Event an, dann steht es hier." : undefined}
        action={
          canRegister ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/events">Zu den Events</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <MyRegistrationTiles events={mine.slice(0, 4)} total={mine.length} />;
}

export async function NewsSection() {
  const items = await getDashboardNews(3);
  if (!items) return <EmptyState title="News konnten nicht geladen werden." hint={LOAD_ERROR_HINT} />;
  if (items.length === 0) {
    return <EmptyState title="Noch keine News." hint="Neuigkeiten des Vorstands erscheinen hier." />;
  }
  return <NewsTiles items={items} />;
}

export async function QuickAccessSection() {
  // Eigene BVH-Anfrage, gelesen unter RLS (bestehende Funktion der Zeitschriften-Seite).
  const bvh = await getBvhLoginStatusForCurrentUser();
  const magazinesMeta = !bvh.hasRequested
    ? "BVH-Login"
    : bvh.handled
      ? "Zugang per Mail verschickt"
      : "Zugang beantragt";
  return <QuickAccessTiles magazinesMeta={magazinesMeta} monthLabel={monthLabel()} />;
}

export async function AdminSection() {
  // getAdminCounts prüft die Rolle selbst (admin/board), die Seite rendert den Abschnitt zusätzlich nur für diese Rollen.
  const counts = await getAdminCounts();
  if (!counts) return <EmptyState className="py-10" title="Zahlen gerade nicht verfügbar." hint={LOAD_ERROR_HINT} />;
  return <AdminStatTiles counts={counts} />;
}
