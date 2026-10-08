import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getAdminMembers } from "./actions";
import { AdminMembersWithSearch } from "@/components/admin/AdminMembersWithSearch";

export default async function AdminMembersPage() {
  const { profile } = await getCachedAuth();
  const role = roleOf(profile as Record<string, unknown> | null);
  const members = await getAdminMembers();

  // Rollen und Status ändert nur der Vorstand (updateMemberRole prüft das selbst).
  return <AdminMembersWithSearch members={members} canEditRole={role === "board"} />;
}
