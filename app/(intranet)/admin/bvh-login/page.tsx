import { getBvhLoginRequests } from "@/app/(intranet)/magazines/actions";
import { BvhRequests } from "@/components/admin/BvhRequests";
import { EXPORT_ROLES, requireUser } from "@/utils/supabase/guards";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

export default async function AdminBvhLoginPage() {
  await sperreBeiDatenmaengeln();
  const [requests, auth] = await Promise.all([getBvhLoginRequests(), requireUser()]);
  // CSV-Export (Adressen, Geburtsdaten) nur für EXPORT_ROLES; die Server Action prüft selbst.
  const canExport = auth.ok && EXPORT_ROLES.includes(auth.role);

  return <BvhRequests requests={requests} canExport={canExport} />;
}
