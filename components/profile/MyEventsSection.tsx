import { getMyEvents } from "@/app/(intranet)/events/actions";
import { formatEventWhen } from "@/lib/events";
import { MyEventsList } from "./MyEventsList";

/** Meine Veranstaltungen: Daten wie bisher über getMyEvents, Darstellung in MyEventsList. */
export async function MyEventsSection() {
  const { upcoming, attended } = await getMyEvents();
  const view = (e: (typeof upcoming)[number]) => ({
    id: e.id,
    title: e.title,
    when: formatEventWhen(e),
    location: e.location,
  });

  return <MyEventsList upcoming={upcoming.map(view)} past={attended.map(view)} />;
}
