import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getEvents } from "./actions";
import { AdminShortcut } from "@/components/area/AdminShortcut";
import { AreaHeader, EVENT_TABS } from "@/components/area/AreaHeader";
import { EmptyState } from "@/components/kit/PageHeader";
import { TileGrid } from "@/components/kit/Tile";
import { EventTile, PastEventTile } from "@/components/events/EventTile";
import { ShowMoreGrid } from "@/components/events/ShowMoreGrid";
import { splitUpcomingPast } from "@/lib/events";

export default async function EventsPage() {
  const { user, profile } = await getCachedAuth();
  const events = await getEvents();
  const { upcoming, past } = splitUpcomingPast(events);

  const role = roleOf(profile as Record<string, unknown> | null);
  const canManage = role === "admin" || role === "board";

  return (
    <div className="space-y-10">
      <AreaHeader
        title="Veranstaltungen"
        intro="Hier findest du alle Termine zum Hingehen."
        tabs={EVENT_TABS}
        activeKey="list"
        layoutId="tabs-veranstaltungen"
        ariaLabel="Ansicht der Veranstaltungen"
        action={
          canManage ? (
            <AdminShortcut href="/admin/events" label="Neue Veranstaltung" />
          ) : undefined
        }
      />

      <section aria-labelledby="kommende" className="space-y-4">
        <h2 id="kommende" className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Kommende
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Gerade steht nichts an."
            hint="Neue Termine erscheinen hier und im Kalender, sobald der Vorstand sie anlegt."
          />
        ) : (
          <TileGrid>
            {upcoming.map((e) => (
              <EventTile
                key={e.id}
                event={e}
                isRegistered={!!user && e.registered_user_ids.includes(user.id)}
              />
            ))}
          </TileGrid>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="vergangen" className="space-y-4 border-t border-border pt-8">
          <h2 id="vergangen" className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Vergangen
          </h2>
          <ShowMoreGrid
            initial={6}
            className="sm:grid-cols-2 lg:grid-cols-3"
          >
            {past.map((e) => (
              <PastEventTile key={e.id} event={e} />
            ))}
          </ShowMoreGrid>
        </section>
      )}
    </div>
  );
}
