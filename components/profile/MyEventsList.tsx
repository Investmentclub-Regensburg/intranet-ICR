"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck2, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile, TileGrid } from "@/components/kit/Tile";
import { staggerProps } from "@/components/kit/Reveal";
import { EmptyState } from "@/components/kit/PageHeader";
import { eventPath } from "@/lib/events";
import { UnregisterEventButton } from "./UnregisterEventButton";

export type MyEventView = {
  id: string;
  title: string;
  /** fertig formatiert, z. B. "Fr., 17. Oktober 2026 · 19:00 – 22:00 Uhr" */
  when: string;
  location: string | null;
};

/** Kommende Anmeldungen als Kacheln (Abmelden per Icon), vergangene ruhig darunter. */
export function MyEventsList({ upcoming, past }: { upcoming: MyEventView[]; past: MyEventView[] }) {
  const router = useRouter();

  return (
    <div className="space-y-10">
      <section aria-labelledby="my-events-upcoming" className="space-y-4">
        <h2 id="my-events-upcoming" className="text-base font-bold tracking-[-0.02em]">
          Angemeldet
          {upcoming.length > 0 && (
            <span className="ml-2 font-semibold text-muted-foreground tabular-nums">{upcoming.length}</span>
          )}
        </h2>

        {upcoming.length === 0 ? (
          <EmptyState
            className="py-10"
            title="Keine Anmeldungen"
            action={
              <Button asChild variant="outline">
                <Link href="/events">Veranstaltungen ansehen</Link>
              </Button>
            }
          />
        ) : (
          <TileGrid delay={0.05}>
            {upcoming.map((event) => (
              <Tile
                key={event.id}
                Icon={CalendarCheck2}
                title={event.title}
                meta={event.when}
                onOpen={() => router.push(eventPath(event.id))}
                actions={<UnregisterEventButton eventId={event.id} eventTitle={event.title} />}
              >
                {event.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{event.location}</span>
                  </span>
                )}
              </Tile>
            ))}
          </TileGrid>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="my-events-past" className="space-y-3">
          <h2 id="my-events-past" className="text-sm font-semibold text-muted-foreground">
            Vergangen
          </h2>
          <ul
            {...staggerProps(0.12)}
            className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/60"
          >
            {past.map((event) => (
              <li key={event.id}>
                <Link
                  href={eventPath(event.id)}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-accent focus-visible:bg-accent sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground/80 group-hover:text-foreground">
                      {event.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {event.when}
                      {event.location ? ` · ${event.location}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
