import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getAlumniRequests } from "./actions";
import { AlumniRequests } from "@/components/admin/AlumniRequests";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

export default async function AdminAlumniRequestsPage() {
  await sperreBeiDatenmaengeln();
  const { profile } = await getCachedAuth();
  const role = roleOf(profile as Record<string, unknown> | null);
  const requests = await getAlumniRequests();

  return <AlumniRequests requests={requests} canDecide={role === "board"} />;
}
