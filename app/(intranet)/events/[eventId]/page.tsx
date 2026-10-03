import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getEvent } from "../actions";
import { EventCard } from "@/components/events/EventCard";
import { RegistrationButton } from "@/components/events/RegistrationButton";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { isEventPast } from "@/lib/events";

type Props = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return { title: event ? `${event.title} · ICR Events` : "Event · ICR" };
}

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const [{ user, profile }, event] = await Promise.all([getCachedAuth(), getEvent(eventId)]);
  if (!event) notFound();

  const past = isEventPast(event);
  const role = String(profile?.["Rolle"] ?? "").trim().toLowerCase();
  const isAdmin = role === "admin" || role === "board";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/events">
            <ArrowLeft className="h-4 w-4" />
            Alle Events
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/events/${event.id}`}>Verwalten</Link>
            </Button>
          )}
          <ShareEventButton eventId={event.id} title={event.title} label />
        </div>
      </div>

      <EventCard
        event={event}
        past={past}
        footer={
          event.requires_registration && (
            <RegistrationButton
              eventId={event.id}
              eventTitle={event.title}
              count={event.registration_count}
              isRegistered={!!user && event.registered_user_ids.includes(user.id)}
              closed={past}
            />
          )
        }
      />
    </div>
  );
}
