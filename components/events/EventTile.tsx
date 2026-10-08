import Link from "next/link";
import { CircleCheck, Clock, MapPin } from "lucide-react";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { cn } from "@/lib/utils";
import { eventPath, formatEventWhen, formatTimeRange, type EventCore } from "@/lib/events";
import { DateBlock, GLOW_TILE, STRETCHED_LINK } from "./event-display";
import { RegistrationButton } from "./RegistrationButton";
import { ShareEventButton } from "./ShareEventButton";

type TileEvent = EventCore & { registration_count: number };

/** Zusagen als kurzer Text: "Noch keine Zusagen", "1 Zusage", "12 Zusagen". */
export function registrationCountLabel(count: number, past = false): string {
  if (past) return count === 1 ? "1 war dabei" : `${count} waren dabei`;
  if (count === 0) return "Noch keine Zusagen";
  return count === 1 ? "1 Zusage" : `${count} Zusagen`;
}

/** Bildfläche ohne Foto: ruhiger heller Verlauf mit der Bildmarke (kein Stockfoto). */
export function EventImageFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-full items-end justify-end bg-[radial-gradient(120%_100%_at_85%_0%,var(--color-brand-tint),var(--muted))] p-4",
        className,
      )}
      aria-hidden
    >
      <IcrLogo className="h-14 text-primary/15" />
    </div>
  );
}

/**
 * Kachel einer kommenden Veranstaltung: Bild mit Datum-Block, Titel, Zeit und Ort,
 * unten Anmeldestatus mit Anmelden-Knopf. Die ganze Kachel öffnet die Detailseite.
 */
export function EventTile({ event, isRegistered }: { event: TileEvent; isRegistered: boolean }) {
  const time = formatTimeRange(event.event_time, event.end_time);

  return (
    <article className={cn(GLOW_TILE, "flex h-full min-w-0 flex-col overflow-hidden")}>
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-[calc(1rem-1px)] bg-muted">
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase-Storage
          <img src={event.image_url} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <EventImageFallback />
        )}
        <DateBlock date={event.event_date} className="absolute top-3 left-3" />
        <div className="absolute top-3 right-3 z-10">
          <ShareEventButton eventId={event.id} title={event.title} onImage />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <h3 className="text-base leading-snug font-bold tracking-[-0.02em] text-foreground">
            <Link href={eventPath(event.id)} className={STRETCHED_LINK}>
              {event.title}
            </Link>
          </h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {time && (
              <li className="flex items-center gap-2">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                <span>{time}</span>
              </li>
            )}
            {event.location && (
              <li className="flex min-w-0 items-center gap-2">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{event.location}</span>
              </li>
            )}
          </ul>
        </div>

        <div className="mt-auto flex min-h-9 items-center justify-between gap-3 border-t border-border pt-4">
          {event.requires_registration ? (
            <>
              {isRegistered ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <CircleCheck className="size-4" aria-hidden />
                  Du bist dabei
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {registrationCountLabel(event.registration_count)}
                </span>
              )}
              <RegistrationButton
                eventId={event.id}
                eventTitle={event.title}
                when={formatEventWhen(event)}
                isRegistered={isRegistered}
                className="relative z-10"
              />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Ohne Anmeldung</span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Kompakte Kachel einer vergangenen Veranstaltung (abgesetzt, ohne Anmeldung). */
export function PastEventTile({ event }: { event: TileEvent }) {
  return (
    <article className={cn(GLOW_TILE, "flex h-full min-w-0 items-center gap-4 p-4")}>
      <DateBlock date={event.event_date} size="sm" className="opacity-80" />
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="truncate text-sm font-semibold text-foreground">
          <Link href={eventPath(event.id)} className={STRETCHED_LINK}>
            {event.title}
          </Link>
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {[
            event.location,
            event.requires_registration ? registrationCountLabel(event.registration_count, true) : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Vorbei"}
        </p>
      </div>
    </article>
  );
}
