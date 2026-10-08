import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, Loader, MapPin, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAnnouncementRecipientCount,
  getEventWithParticipants,
  type EventAnnouncement,
} from "@/app/(intranet)/events/actions";
import { requireUser } from "@/utils/supabase/guards";
import { IconLink } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { ShareLinkButton } from "@/components/admin/ShareLinkButton";
import { DeleteEventButton } from "@/components/admin/DeleteEventButton";
import { SendAnnouncementDialog } from "@/components/admin/SendAnnouncementDialog";
import { SectionHead, StatusPill } from "@/components/admin/bits";
import { ROLE_LABELS, formatMoment } from "@/components/admin/format";
import { eventPath, formatEventDate, formatTimeRange, isEventPast } from "@/lib/events";

type Props = {
  params: Promise<{ eventId: string }>;
};

const MANAGE_HREF = "/admin/events?ansicht=verwalten";

export default async function AdminEventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const [data, memberCount, auth] = await Promise.all([
    getEventWithParticipants(eventId),
    getAnnouncementRecipientCount(),
    requireUser(),
  ]);
  if (!data) notFound();

  const { event, participants, announcements } = data;
  const time = formatTimeRange(event.event_time, event.end_time);
  const past = isEventPast(event);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <IconLink href={MANAGE_HREF} label="Zurück zur Übersicht" variant="outline" className="mt-1">
            <ArrowLeft />
          </IconLink>
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">
              {formatEventDate(event.event_date)}
              {past && " · vorbei"}
            </p>
            <h1 className="text-[1.75rem] leading-[1.05] font-bold tracking-[-0.035em] break-words sm:text-4xl">
              {event.title}
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{time || "Ganztägig"}</span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden />
                  {event.location}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <IconLink href={eventPath(event.id)} label="So sehen Mitglieder die Veranstaltung" variant="outline">
            <Eye />
          </IconLink>
          <IconLink href={`/admin/events/${event.id}/edit`} label="Bearbeiten" variant="outline">
            <Pencil />
          </IconLink>
          <ShareLinkButton eventId={event.id} title={event.title} variant="outline" />
          <SendAnnouncementDialog
            eventId={event.id}
            eventTitle={event.title}
            memberCount={memberCount}
            canCustom={auth.ok && auth.role === "board"}
          />
          <DeleteEventButton eventId={event.id} title={event.title} redirectTo={MANAGE_HREF} variant="outline" />
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-4" aria-labelledby="teilnehmer">
          <SectionHead
            id="teilnehmer"
            title="Teilnehmer"
            count={event.requires_registration ? participants.length : undefined}
          />
          {!event.requires_registration ? (
            <EmptyState title="Ohne Anmeldung." hint="Für diese Veranstaltung melden sich Mitglieder nicht an." />
          ) : participants.length === 0 ? (
            <EmptyState title="Noch keine Anmeldungen." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Studiengang</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Angemeldet am</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participants.map((p) => (
                    <TableRow key={p.user_id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {[p.vorname, p.nachname].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.studiengang || "—"}</TableCell>
                      <TableCell>{ROLE_LABELS[p.rolle.toLowerCase()] ?? (p.rolle || "—")}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {p.registered_at ? formatMoment(p.registered_at) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-4" aria-labelledby="mailversand">
          <SectionHead id="mailversand" title="Mailversand" />
          {announcements.length === 0 ? (
            <EmptyState title="Noch keine Mail verschickt." />
          ) : (
            <MailTimeline items={announcements} />
          )}
        </section>
      </div>
    </div>
  );
}

/** Mailversand als Zeitleiste, neueste oben. Markierung je Eintrag als Icon (keine Punkte). */
function MailTimeline({ items }: { items: EventAnnouncement[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[0.9375rem] before:w-px before:bg-border">
      {items.map((a) => {
        const state = a.sent_at ? "sent" : a.last_error ? "error" : "running";
        const Icon = state === "sent" ? CheckCircle2 : state === "error" ? AlertTriangle : Loader;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span
              className={
                state === "error"
                  ? "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-card text-destructive"
                  : "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary"
              }
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1 pt-0.5">
              <p className="text-xs text-muted-foreground tabular-nums">{formatMoment(a.created_at)}</p>
              <p className="text-sm font-semibold">
                {a.mode === "all" ? "Alle Mitglieder" : "Einzelne Adressen"} · {a.recipient_count} Empfänger
              </p>
              {state === "sent" ? (
                <StatusPill tone="done">Versendet</StatusPill>
              ) : state === "error" ? (
                <StatusPill tone="danger">
                  Fehler ({a.sent_count}/{a.recipient_count})
                </StatusPill>
              ) : (
                <StatusPill tone="open">
                  Läuft ({a.sent_count}/{a.recipient_count})
                </StatusPill>
              )}
              {a.last_error && <p className="text-xs break-words text-destructive">{a.last_error}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
