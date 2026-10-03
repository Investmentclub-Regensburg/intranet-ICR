import Link from "next/link";
import { ArrowLeft, CalendarPlus, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventCreator } from "@/components/admin/EventCreator";
import { DeleteEventButton } from "@/components/admin/DeleteEventButton";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { getAnnouncementRecipientCount, getEvents, type EventListItem } from "@/app/(intranet)/events/actions";
import { formatEventWhen, splitUpcomingPast } from "@/lib/events";

function EventRow({ event }: { event: EventListItem }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <Link
        href={`/admin/events/${event.id}`}
        className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-md px-1 py-1 transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0">
          <p className="truncate font-medium group-hover:text-primary">{event.title}</p>
          <p className="truncate text-xs text-muted-foreground">{formatEventWhen(event)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {event.requires_registration && (
            <span className="flex items-center gap-1 text-sm" title="Anmeldungen">
              <Users className="h-4 w-4" />
              {event.registration_count}
            </span>
          )}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </Link>
      <ShareEventButton eventId={event.id} title={event.title} />
      <DeleteEventButton eventId={event.id} title={event.title} />
    </li>
  );
}

export default async function AdminEventsPage() {
  const [events, memberCount] = await Promise.all([getEvents(), getAnnouncementRecipientCount()]);
  const { upcoming, past } = splitUpcomingPast(events);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin" aria-label="Zurück zum Admin-Bereich">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="mt-1 text-muted-foreground">Veranstaltungen anlegen, teilen und Teilnehmer verwalten.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <CalendarPlus className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Neues Event anlegen</CardTitle>
            <CardDescription>Mit Live-Vorschau, teilbarem Link und optionaler Mail an die Mitglieder.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EventCreator memberCount={memberCount} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Events verwalten</CardTitle>
          <CardDescription>Event anklicken für Teilnehmer und Mailversand.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Noch keine Events angelegt.
            </p>
          ) : (
            <>
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">Anstehend ({upcoming.length})</h2>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine anstehenden Events.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {upcoming.map((e) => (
                      <EventRow key={e.id} event={e} />
                    ))}
                  </ul>
                )}
              </section>
              {past.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium text-muted-foreground">Vergangen ({past.length})</h2>
                  <ul className="divide-y rounded-lg border opacity-80">
                    {past.map((e) => (
                      <EventRow key={e.id} event={e} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
