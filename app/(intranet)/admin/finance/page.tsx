import { Lock } from "lucide-react";
import { FinanceExport } from "@/components/admin/FinanceExport";
import { EXPORT_ROLES, requireUser } from "@/utils/supabase/guards";

export default async function AdminFinancePage() {
  // Exporte mit Bankdaten nur für EXPORT_ROLES (Vorstand). Die Server Action prüft das
  // weiterhin selbst; hier nur, damit Admins einen Hinweis statt eines Fehlers sehen.
  const auth = await requireUser();
  const canExport = auth.ok && EXPORT_ROLES.includes(auth.role);

  return (
    <div>
      <h1 className="sr-only">Finanzen</h1>
      {canExport ? (
        <FinanceExport />
      ) : (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-dashed border-input px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Lock className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="font-semibold">Exporte nur für den Vorstand</p>
            <p className="text-sm text-muted-foreground">
              SEPA-Vorschau und Exporte enthalten die Bankdaten aller Mitglieder.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
