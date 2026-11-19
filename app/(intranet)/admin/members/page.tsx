import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getAdminMembers } from "./actions";
import { AdminMembersWithSearch } from "@/components/admin/AdminMembersWithSearch";
import { handyAnzeige } from "@/lib/member-forms";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

// Nur noch die Liste. Kündigungen mit Gründen stehen seit der Design-Runde unter Insights › Austritte.
export default async function AdminMembersPage() {
  await sperreBeiDatenmaengeln();
  const { profile } = await getCachedAuth();
  const role = roleOf(profile as Record<string, unknown> | null);
  const isBoard = role === "board";
  const rows = await getAdminMembers();
  // Handy international formatiert (Altwerte, die noch nicht E.164 sind, roh).
  const members = rows.map((m) => ({ ...m, handynummer: handyAnzeige(m.handynummer) }));
  // Rollen und Status ändert nur der Vorstand (updateMemberRole prüft das selbst).
  return <AdminMembersWithSearch members={members} canEditRole={isBoard} showDataIssues={isBoard} />;
}
