"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarPlus, LayoutGrid, MapPin, Pencil, Plus, Users } from "lucide-react";
import { IconButton, IconLink } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { Segmented } from "@/components/kit/Segmented";
import { AddTile, Tile, TileGrid } from "@/components/kit/Tile";
import { formatEventWhen, type EventCore } from "@/lib/events";
import { ChoiceTile, StatusPill } from "./bits";
import { DeleteEventButton } from "./DeleteEventButton";
import { EventWizard } from "./EventWizard";
import { ShareLinkButton } from "./ShareLinkButton";

/** Was die Verwaltung pro Veranstaltung braucht (ohne die User-IDs der Anmeldungen). */
export type AdminEventTile = Pick<
  EventCore,
  "id" | "title" | "event_date" | "event_time" | "end_time" | "location" | "requires_registration"
> & { registration_count: number };

type Props = {
  view: "choose" | "manage";
  upcoming: AdminEventTile[];
  past: AdminEventTile[];
  memberCount: number;
  canCustomMail: boolean;
  /** Wizard gleich offen (Link ?ansicht=neu). */
  startWizard?: boolean;
};

/**
 * Veranstaltungen in der Verwaltung: erst die Wahl zwischen „Neu anlegen“ (Wizard)
 * und „Verwalten“ (Kachel-Raster), wie von Hannes gewünscht.
 */
export function EventsHub({ view, upcoming, past, memberCount, canCustomMail, startWizard = false }: Props) {
  const [wizardOpen, setWizardOpen] = useState(startWizard);
  // Jede Öffnung startet einen frischen Wizard.
  const [wizardKey, setWizardKey] = useState(0);
  const [range, setRange] = useState<"upcoming" | "past">("upcoming");

  function openWizard() {
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
  }

  const list = range === "upcoming" ? upcoming : past;

  return (
    <>
      {view === "choose" ? (
        <div className="space-y-6">
          <h1 className="sr-only">Veranstaltungen</h1>
          <div className="grid gap-4 md:grid-cols-2">
            <ChoiceTile
              Icon={CalendarPlus}
              title="Neue Veranstaltung anlegen"
              hint="Schritt für Schritt, mit Vorschau und optionaler Rundmail."
              meta="Dauert etwa zwei Minuten"
              onOpen={openWizard}
            />
            <ChoiceTile
              Icon={LayoutGrid}
              title="Veranstaltungen verwalten"
              hint="Bearbeiten, teilen, Teilnehmer ansehen, Mail nachschicken."
              meta={`${upcoming.length} kommend · ${past.length} vergangen`}
              href="/admin/events?ansicht=verwalten"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <IconLink href="/admin/events" label="Zurück zur Auswahl" variant="outline">
                <ArrowLeft />
              </IconLink>
              <h1 className="truncate text-xl font-bold tracking-[-0.03em] sm:text-2xl">Veranstaltungen verwalten</h1>
            </div>
            <div className="flex items-center gap-2">
              <Segmented
                layoutId="admin-events-range"
                options={[
                  { key: "upcoming", label: `Kommend ${upcoming.length}` },
                  { key: "past", label: `Vergangen ${past.length}` },
                ]}
                value={range}
                onChange={setRange}
                ariaLabel="Zeitraum"
              />
              <IconButton label="Neue Veranstaltung anlegen" variant="primary" onClick={openWizard}>
                <Plus />
              </IconButton>
            </div>
          </div>

          {list.length === 0 && range === "past" ? (
            <EmptyState title="Noch keine vergangenen Veranstaltungen." />
          ) : (
            <TileGrid>
              {list.map((e) => (
                <EventTile key={e.id} event={e} past={range === "past"} />
              ))}
              {range === "upcoming" && <AddTile label="Neue Veranstaltung" onClick={openWizard} />}
            </TileGrid>
          )}
        </div>
      )}

      <EventWizard
        key={wizardKey}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        memberCount={memberCount}
        canCustomMail={canCustomMail}
      />
    </>
  );
}

function EventTile({ event, past }: { event: AdminEventTile; past: boolean }) {
  const router = useRouter();
  // Aktionen als Buttons: die ganze Kachel ist schon ein Link (kein Link im Link).
  return (
    <Tile
      href={`/admin/events/${event.id}`}
      Icon={CalendarDays}
      title={event.title}
      meta={formatEventWhen(event)}
      className={past ? "opacity-80" : undefined}
      actions={
        // Klicks auf die Icons dürfen den Link der Kachel nicht auslösen (bubbelnd, damit die
        // Handler der Buttons und Dialoge vorher laufen).
        <span className="flex items-center gap-0.5" onClick={(e) => e.preventDefault()}>
          <IconButton
            label={`${event.title} bearbeiten`}
            onClick={() => router.push(`/admin/events/${event.id}/edit`)}
          >
            <Pencil />
          </IconButton>
          <ShareLinkButton eventId={event.id} title={event.title} />
          <DeleteEventButton eventId={event.id} title={event.title} />
        </span>
      }
      footer={
        event.requires_registration ? (
          <StatusPill tone={past ? "neutral" : "done"} Icon={Users}>
            {event.registration_count} angemeldet
          </StatusPill>
        ) : (
          <StatusPill tone="neutral">Ohne Anmeldung</StatusPill>
        )
      }
    >
      {event.location && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{event.location}</span>
        </span>
      )}
    </Tile>
  );
}
