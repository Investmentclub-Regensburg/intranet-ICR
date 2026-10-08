import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FinanceExport } from "@/components/admin/FinanceExport";
import { EXPORT_ROLES, requireUser } from "@/utils/supabase/guards";

export default async function AdminFinancePage() {
  // Exporte mit Bankdaten nur für EXPORT_ROLES (Vorstand). Die Server Action prüft das
  // weiterhin selbst; hier nur, damit Admins einen Hinweis statt eines Fehlers sehen.
  const auth = await requireUser();
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
          <h1 className="text-2xl font-semibold">Finanzen & SEPA</h1>
          <p className="text-sm text-muted-foreground">
            SEPA-Export, Vorschau und CSV/XML-Download
          </p>
        </div>
      </div>

      {canExport ? (
        <FinanceExport />
      ) : (
        <Card>
          <CardContent className="flex items-start gap-4 py-6">
            <div className="rounded-lg bg-muted p-2.5 text-muted-foreground">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Exporte nur für den Vorstand</p>
              <p className="text-sm text-muted-foreground">
                SEPA-Vorschau und die CSV/XML-Exporte enthalten die Bankdaten aller Mitglieder.
                Deshalb kann sie nur der Vorstand erstellen. Wende dich bei Bedarf an den Vorstand.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
