import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getAlumniRequests } from "./actions";
import { AlumniRequestsTable } from "@/components/admin/AlumniRequestsTable";

export default async function AdminAlumniRequestsPage() {
  const { profile } = await getCachedAuth();
  const currentRole = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  const requests = await getAlumniRequests();
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin" aria-label="Zurück zum Admin-Bereich">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Alumni-Anträge</h1>
          <p className="text-sm text-muted-foreground">
            Mitglieder beantragen den Alumni-Status in ihrem Profil. „Freischalten“ setzt die Rolle
            auf Alumni. Nur Vorstand (board) kann entscheiden.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>Anträge</CardTitle>
          <p className="text-sm text-muted-foreground">
            {pendingCount === 0
              ? "Keine offenen Anträge"
              : `${pendingCount} ${pendingCount === 1 ? "offener Antrag" : "offene Anträge"}`}
          </p>
        </CardHeader>
        <CardContent>
          <AlumniRequestsTable requests={requests} canDecide={currentRole === "board"} />
        </CardContent>
      </Card>
    </div>
  );
}
