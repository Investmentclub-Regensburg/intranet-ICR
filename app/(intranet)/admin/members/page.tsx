import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getAdminMembers, getCancellations } from "./actions";
import { AdminMembersWithSearch } from "@/components/admin/AdminMembersWithSearch";
import { CancellationsOverview } from "@/components/admin/CancellationsOverview";
import { MembersViewSwitch } from "@/components/admin/MembersViewSwitch";

export default async function AdminMembersPage() {
  const { profile } = await getCachedAuth();
  const role = roleOf(profile as Record<string, unknown> | null);
  const [members, cancellations] = await Promise.all([getAdminMembers(), getCancellations()]);

  // Rollen und Status ändert nur der Vorstand (updateMemberRole prüft das selbst).
  return (
    <MembersViewSwitch
      cancellationsCount={cancellations.length}
      members={<AdminMembersWithSearch members={members} canEditRole={role === "board"} />}
      cancellations={<CancellationsOverview rows={cancellations} />}
    />
  );
}
