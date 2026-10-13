import { getAnnouncementRecipientCount, getEvents, type EventListItem } from "@/app/(intranet)/events/actions";
import { requireUser } from "@/utils/supabase/guards";
import { splitUpcomingPast } from "@/lib/events";
import { EventsHub, type AdminEventTile } from "@/components/admin/EventsHub";

type Props = {
  searchParams: Promise<{ ansicht?: string }>;
};

/** Nur die Felder für die Kacheln an den Browser geben (keine User-IDs der Anmeldungen). */
function toTile(e: EventListItem): AdminEventTile {
  return {
    id: e.id,
    title: e.title,
    event_date: e.event_date,
    event_time: e.event_time,
    end_time: e.end_time,
    location: e.location,
    requires_registration: e.requires_registration,
    registration_count: e.registration_count,
  };
}

export default async function AdminEventsPage({ searchParams }: Props) {
  const { ansicht } = await searchParams;
  const [events, memberCount, auth] = await Promise.all([
    getEvents(),
    getAnnouncementRecipientCount(),
    requireUser(),
  ]);
  const { upcoming, past } = splitUpcomingPast(events);

  return (
    <EventsHub
      view={ansicht === "verwalten" ? "manage" : "choose"}
      startWizard={ansicht === "neu"}
      upcoming={upcoming.map(toTile)}
      past={past.map(toTile)}
      memberCount={memberCount}
      canCustomMail={auth.ok && auth.role === "board"}
    />
  );
}
