import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IconLink } from "@/components/kit/IconButton";
import { EventForm } from "@/components/admin/EventForm";
import { getEvent } from "@/app/(intranet)/events/actions";
import { formatEventDate } from "@/lib/events";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminEventEditPage({ params }: Props) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();

  return (
    <div className="space-y-8">
      <header className="flex min-w-0 items-start gap-3">
        <IconLink href={`/admin/events/${event.id}`} label="Zurück zur Veranstaltung" variant="outline" className="mt-1">
          <ArrowLeft />
        </IconLink>
        <div className="min-w-0 space-y-2">
          <p className="eyebrow">Bearbeiten · {formatEventDate(event.event_date)}</p>
          <h1 className="text-[1.75rem] leading-[1.05] font-bold tracking-[-0.035em] break-words sm:text-4xl">
            {event.title}
          </h1>
        </div>
      </header>

      <EventForm
        event={{
          id: event.id,
          title: event.title,
          description: event.description,
          event_date: event.event_date,
          event_time: event.event_time,
          end_time: event.end_time,
          location: event.location,
          organizer: event.organizer,
          image_url: event.image_url,
          requires_registration: event.requires_registration,
        }}
      />
    </div>
  );
}
