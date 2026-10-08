import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, CalendarDays, CircleCheck, Clock, MapPin, Pencil, UserRound, UsersRound } from "lucide-react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getEvent } from "../actions";
import { PageHeader } from "@/components/kit/PageHeader";
import { IconLink } from "@/components/kit/IconButton";
import { RegistrationButton } from "@/components/events/RegistrationButton";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { registrationCountLabel } from "@/components/events/EventTile";
import { formatEventDate, formatEventWhen, formatTimeRange, isEventPast } from "@/lib/events";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return { title: event ? `${event.title} · Veranstaltungen · ICR` : "Veranstaltung · ICR" };
}

function Fact({ Icon, label, children }: { Icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium break-words text-foreground">{children}</dd>
      </div>
    </div>
  );
}

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const [{ user, profile }, event] = await Promise.all([getCachedAuth(), getEvent(eventId)]);
  if (!event) notFound();

  const past = isEventPast(event);
  const role = roleOf(profile as Record<string, unknown> | null);
  const canManage = role === "admin" || role === "board";
  const isRegistered = !!user && event.registered_user_ids.includes(user.id);
  const time = formatTimeRange(event.event_time, event.end_time);
  const paragraphs = (event.description ?? "").split(/\n{2,}/).filter((p) => p.trim());

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 rounded-xs text-sm font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Veranstaltungen
        </Link>
        <div className="flex items-center gap-1">
          <ShareEventButton eventId={event.id} title={event.title} />
          {canManage && (
            <>
              <IconLink href={`/admin/events/${event.id}/edit`} label="Bearbeiten">
                <Pencil />
              </IconLink>
              <IconLink href={`/admin/events/${event.id}`} label="Verwalten: Teilnehmer und Mails">
                <UsersRound />
              </IconLink>
            </>
          )}
        </div>
      </div>

      <PageHeader eyebrow={past ? "Vorbei" : "Veranstaltung"} title={event.title} />

      {/* Handy: Bild, dann Fakten und Anmeldung, dann Text. Ab lg: Bild und Text links, Fakten rechts. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-8">
        {event.image_url && (
          // Bild unbeschnitten (Flyer sind oft hochkant), groß, mit Rand wie die Website.
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase-Storage */}
            <img
              src={event.image_url}
              alt=""
              className="max-h-[34rem] w-auto max-w-full rounded-2xl border border-border bg-muted object-contain"
            />
          </div>
        )}

        <aside className="space-y-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <dl className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <Fact Icon={CalendarDays} label="Datum">
              {formatEventDate(event.event_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </Fact>
            {time && (
              <Fact Icon={Clock} label="Uhrzeit">
                {time}
              </Fact>
            )}
            {event.location && (
              <Fact Icon={MapPin} label="Ort">
                {event.location}
              </Fact>
            )}
            <Fact Icon={UserRound} label="Veranstalter">
              {event.organizer || "ICR"}
            </Fact>
          </dl>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            {!event.requires_registration ? (
              <p className="text-sm text-muted-foreground">
                {past ? "Diese Veranstaltung ist vorbei." : "Ohne Anmeldung. Komm einfach vorbei."}
              </p>
            ) : past ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Anmeldung geschlossen</p>
                <p className="text-sm text-muted-foreground">
                  {registrationCountLabel(event.registration_count, true)}
                  {isRegistered && ", du auch"}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {isRegistered ? (
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      <CircleCheck className="size-4" aria-hidden />
                      Du bist angemeldet
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-foreground">Anmeldung offen</p>
                  )}
                  <p className="text-sm text-muted-foreground">{registrationCountLabel(event.registration_count)}</p>
                </div>
                <RegistrationButton
                  eventId={event.id}
                  eventTitle={event.title}
                  when={formatEventWhen(event)}
                  isRegistered={isRegistered}
                  size="default"
                  block
                />
              </>
            )}
          </div>
        </aside>

        <div
          className={cn(
            "min-w-0 lg:col-start-1",
            event.image_url ? "lg:row-start-2" : "lg:row-span-2 lg:row-start-1",
          )}
        >
          {paragraphs.length > 0 ? (
            <div className="max-w-2xl space-y-4 text-[0.9375rem] leading-relaxed whitespace-pre-line text-foreground/85">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            !event.image_url && <p className="text-sm text-muted-foreground">Keine Beschreibung.</p>
          )}
        </div>
      </div>
    </div>
  );
}
