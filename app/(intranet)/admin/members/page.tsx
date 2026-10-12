import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getAdminMembers, getCancellations } from "./actions";
import { AdminMembersWithSearch } from "@/components/admin/AdminMembersWithSearch";
import { CancellationsOverview } from "@/components/admin/CancellationsOverview";
import { MembersViewSwitch } from "@/components/admin/MembersViewSwitch";

export default async function AdminMembersPage() {
  const { profile } = await getCachedAuth();
  const role = roleOf(profile as Record<string, unknown> | null);
  const isBoard = role === "board";
  const [members, cancellations] = await Promise.all([
    getAdminMembers(),
    isBoard ? getCancellations() : Promise.resolve([]),
  ]);
  const list = <AdminMembersWithSearch members={members} canEditRole={isBoard} />;

  // Rollen und Status ändert nur der Vorstand (updateMemberRole prüft das selbst).
  // Kündigungsgründe sieht nur der Vorstand.
  if (!isBoard) return list;
  return (
    <MembersViewSwitch
      cancellationsCount={cancellations.length}
      members={list}
      cancellations={<CancellationsOverview rows={cancellations} />}
    />
  );
}
