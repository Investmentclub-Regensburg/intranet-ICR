import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAnnouncementRecipientCount, getEventWithParticipants } from "@/app/(intranet)/events/actions";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { DeleteEventButton } from "@/components/admin/DeleteEventButton";
import { SendAnnouncementDialog } from "@/components/admin/SendAnnouncementDialog";
import { eventPath, formatEventWhen } from "@/lib/events";

type Props = {
  params: Promise<{ eventId: string }>;
};

function formatTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export default async function AdminEventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const [data, memberCount] = await Promise.all([
    getEventWithParticipants(eventId),
    getAnnouncementRecipientCount(),
  ]);
  if (!data) notFound();

  const { event, participants, announcements } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/events" aria-label="Zurück zu Events">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            <p className="text-sm text-muted-foreground">
              {formatEventWhen(event)}
              {event.location && ` · ${event.location}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={eventPath(event.id)}>
              <ExternalLink className="h-4 w-4" />
              Ansehen
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/events/${event.id}/edit`}>
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Link>
          </Button>
          <ShareEventButton eventId={event.id} title={event.title} label />
          <SendAnnouncementDialog eventId={event.id} eventTitle={event.title} memberCount={memberCount} />
          <DeleteEventButton eventId={event.id} title={event.title} redirectTo="/admin/events" label />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Teilnehmer</CardTitle>
          <CardDescription>
            {event.requires_registration
              ? `${participants.length} ${participants.length === 1 ? "Person angemeldet" : "Personen angemeldet"}`
              : "Für dieses Event ist keine Anmeldung aktiviert."}
          </CardDescription>
        </CardHeader>
        {event.requires_registration && (
          <CardContent>
            {participants.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Noch keine Anmeldungen für dieses Event.
              </p>
            ) : (
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
                      <TableCell className="font-medium">
                        {[p.vorname, p.nachname].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell>{p.studiengang || "—"}</TableCell>
                      <TableCell>{p.rolle || "—"}</TableCell>
                      <TableCell>{p.registered_at ? formatTimestamp(p.registered_at) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mailversand</CardTitle>
          <CardDescription>Ankündigungen zu diesem Event (neueste zuerst).</CardDescription>
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Mail verschickt.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {announcements.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <p>
                      {formatTimestamp(a.created_at)} · {a.mode === "all" ? "Alle Mitglieder" : "Einzelne Adressen"} ·{" "}
                      {a.recipient_count} Empfänger
                    </p>
                    {a.last_error && <p className="text-xs text-destructive">{a.last_error}</p>}
                  </div>
                  {a.sent_at ? (
                    <Badge variant="secondary">Versendet</Badge>
                  ) : a.last_error ? (
                    <Badge variant="destructive">
                      Fehler ({a.sent_count}/{a.recipient_count})
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      Läuft ({a.sent_count}/{a.recipient_count})
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
