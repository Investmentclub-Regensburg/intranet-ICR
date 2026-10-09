import { getAlumniRequests } from "./alumni-requests/actions";
import { getBvhLoginRequests } from "@/app/(intranet)/magazines/actions";
import { getEvents } from "@/app/(intranet)/events/actions";
import { splitUpcomingPast } from "@/lib/events";
import { CounterTile } from "@/components/admin/CounterTile";
import { TileGrid } from "@/components/kit/Tile";

export default async function AdminTasksPage() {
  const [alumni, bvh, events] = await Promise.all([
    getAlumniRequests(),
    getBvhLoginRequests(),
    getEvents(),
  ]);

  const openAlumni = alumni.filter((r) => r.status === "pending").length;
  const openBvh = bvh.filter((r) => !r.handled).length;
  const upcoming = splitUpcomingPast(events).upcoming.length;

  return (
    <div className="space-y-12">
      {/* Handy: zwei Zähler nebeneinander, damit die Anträge schnell sichtbar sind. */}
      <TileGrid columns={3} className="grid-cols-2 gap-3 sm:gap-4">
        <CounterTile icon="graduation-cap" value={openAlumni} label="Alumni-Anträge" href="/admin/alumni-requests" />
        <CounterTile icon="key-round" value={openBvh} label="BVH-Anfragen" href="/admin/bvh-login" />
        <CounterTile
          icon="calendar-days"
          value={upcoming}
          label="Kommende Veranstaltungen"
          href="/admin/events?ansicht=verwalten"
          tone="neutral"
        />
      </TileGrid>
    </div>
  );
}
