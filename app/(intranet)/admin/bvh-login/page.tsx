import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBvhLoginRequests } from "@/app/(intranet)/magazines/actions";
import { BvhLoginRequestsTable } from "@/components/admin/BvhLoginRequestsTable";
import { BvhCsvDownloadButton } from "@/components/admin/BvhCsvDownloadButton";
import { EXPORT_ROLES, requireUser } from "@/utils/supabase/guards";

export default async function AdminBvhLoginPage() {
  const [requests, auth] = await Promise.all([getBvhLoginRequests(), requireUser()]);
  const unhandledCount = requests.filter((r) => !r.handled).length;
  // CSV-Export (Adressen, Geburtsdaten) nur für EXPORT_ROLES; die Server Action prüft selbst.
  const canExport = auth.ok && EXPORT_ROLES.includes(auth.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin" aria-label="Zurück zum Admin-Bereich">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">BVH Login</h1>
          <p className="text-sm text-muted-foreground">
            Anfragen für BVH-Zugangsdaten. „Akzeptieren“ nur zum Abhaken – die Freischaltung erfolgt manuell auf der BVH-Seite.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>Anfragen</CardTitle>
          {canExport ? (
            <BvhCsvDownloadButton unhandledCount={unhandledCount} />
          ) : (
            <p className="text-sm text-muted-foreground">CSV-Export nur für den Vorstand</p>
          )}
        </CardHeader>
        <CardContent>
          <BvhLoginRequestsTable requests={requests} />
        </CardContent>
      </Card>
    </div>
  );
}
