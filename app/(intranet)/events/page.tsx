import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getEvents, type EventListItem } from "./actions";
import { EventCard } from "@/components/events/EventCard";
import { RegistrationButton } from "@/components/events/RegistrationButton";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { eventPath, splitUpcomingPast } from "@/lib/events";

export default async function EventsPage() {
  const { user } = await getCachedAuth();
  const events = await getEvents();

  const { upcoming, past } = splitUpcomingPast(events);

  const renderEvent = (event: EventListItem, isPast: boolean) => (
    <EventCard
      key={event.id}
      event={event}
      href={eventPath(event.id)}
      past={isPast}
      actions={<ShareEventButton eventId={event.id} title={event.title} />}
      footer={
        event.requires_registration && (
          <RegistrationButton
            eventId={event.id}
            eventTitle={event.title}
            count={event.registration_count}
            isRegistered={!!user && event.registered_user_ids.includes(user.id)}
            closed={isPast}
          />
        )
      }
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">Veranstaltungen und Termine des ICR.</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Noch keine Events vorhanden.
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Anstehend</h2>
            {upcoming.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Aktuell keine anstehenden Events.
              </p>
            ) : (
              upcoming.map((e) => renderEvent(e, false))
            )}
          </section>
          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Vergangen</h2>
              {past.map((e) => renderEvent(e, true))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
