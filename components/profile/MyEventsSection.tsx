import Link from "next/link";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getMyEvents } from "@/app/(intranet)/events/actions";
import { UnregisterEventButton } from "./UnregisterEventButton";
import { eventPath, formatEventWhen } from "@/lib/events";

export async function MyEventsSection() {
  const { upcoming, attended } = await getMyEvents();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Meine Events</h2>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Angemeldet
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Keine anstehenden Anmeldungen.
            </p>
          ) : (
            upcoming.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <Link href={eventPath(event.id)} className="block font-medium hover:text-primary hover:underline">
                  {event.title}
                </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatEventWhen(event)}
                  </p>
                  {event.location && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {event.location}
                    </p>
                  )}
                </div>
                <UnregisterEventButton
                  eventId={event.id}
                  eventTitle={event.title}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Teilgenommen
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {attended.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Noch keine teilgenommenen Events.
            </p>
          ) : (
            attended.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <Link href={eventPath(event.id)} className="block font-medium hover:text-primary hover:underline">
                  {event.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {formatEventWhen(event)}
                </p>
                {event.location && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {event.location}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
