import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EventForm } from "@/components/admin/EventForm";
import { getEvent } from "@/app/(intranet)/events/actions";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminEventEditPage({ params }: Props) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/admin/events/${event.id}`} aria-label="Zurück zum Event">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Event bearbeiten</h1>
          <p className="text-sm text-muted-foreground">{event.title}</p>
        </div>
      </div>

      <Card>
        <CardContent>
          <EventForm event={event} />
        </CardContent>
      </Card>
    </div>
  );
}
