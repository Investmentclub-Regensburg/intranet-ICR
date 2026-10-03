import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatEventWhen, type EventCore } from "@/lib/events";

type Props = {
  event: Omit<EventCore, "id"> & { id?: string };
  /** Titel verlinkt auf diese URL (z. B. Detailseite). */
  href?: string;
  past?: boolean;
  /** Platzhaltertexte für die Live-Vorschau im Admin-Formular. */
  preview?: boolean;
  /** Zusätzliche Aktionen (Teilen) oben rechts. */
  actions?: ReactNode;
  /** Fußzeile, z. B. Anmeldung. */
  footer?: ReactNode;
  className?: string;
};

export function EventCard({ event, href, past, preview, actions, footer, className }: Props) {
  const title = event.title || (preview ? "Titel des Events" : "");
  const when = event.event_date ? formatEventWhen(event) : preview ? "Datum wählen" : "";

  return (
    <Card className={cn("overflow-hidden py-0", past && "opacity-75", className)}>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {event.organizer || (preview ? "Veranstalter" : "ICR")}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>{when}</span>
            </p>
          </div>
          {past && <Badge variant="secondary">Vorbei</Badge>}
          {actions}
        </div>
        <div className="border-t px-3 pb-3 pt-2">
          <h2 className="font-semibold">
            {href ? (
              <Link href={href} className="hover:text-primary hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          {(event.description || preview) && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {event.description || "Beschreibung …"}
            </p>
          )}
        </div>
        {event.image_url && (
          <div className="relative aspect-[1.91/1] w-full overflow-hidden border-t bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase-Storage / Blob-Vorschau */}
            <img src={event.image_url} alt="" className="h-full w-full object-cover object-center" />
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
