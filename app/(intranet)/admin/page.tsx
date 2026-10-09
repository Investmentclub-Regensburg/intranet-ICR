import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getMembershipApplications } from "./members/actions";
import { getAlumniRequests } from "./alumni-requests/actions";
import { getBvhLoginRequests } from "@/app/(intranet)/magazines/actions";
import { getEvents } from "@/app/(intranet)/events/actions";
import { splitUpcomingPast } from "@/lib/events";
import { CounterTile } from "@/components/admin/CounterTile";
import { MembershipApplications } from "@/components/admin/MembershipApplications";
import { TileGrid } from "@/components/kit/Tile";

export default async function AdminTasksPage() {
  const { profile } = await getCachedAuth();
  const role = roleOf(profile as Record<string, unknown> | null);

  const [applications, alumni, bvh, events] = await Promise.all([
    getMembershipApplications(),
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
      <TileGrid columns={4} className="grid-cols-2 gap-3 sm:gap-4">
        <CounterTile
          icon="user-plus"
          value={applications.length}
          label="Mitgliedsanträge"
          href="#mitgliedsantraege"
        />
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

      <MembershipApplications applications={applications} canDecide={role === "board"} />
    </div>
  );
}
