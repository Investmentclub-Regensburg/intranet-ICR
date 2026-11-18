import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { createServiceClient } from "@/utils/supabase/service";
import { IntranetMotion } from "@/components/layout/IntranetMotion";
import { DatenCheckFenster } from "@/components/member/DatenCheckFenster";
import { faelligerDatenCheck } from "@/lib/member-data-check-server";

export const metadata = { title: "Stimmen deine Daten noch? · ICR Intranet" };

/**
 * Abfrage „Stimmen deine Daten noch?“ bei Mängeln (Paket „Mitgliederdaten“, PR 4, Review A1/B1): bewusst außerhalb
 * des Intranet-Layouts, damit kein Seiteninhalt mitkommt. Nur das Fenster auf leerem Grund (ohne JavaScript mit
 * Hinweis und Abmelden). Nicht fällig oder gültig → zurück ins Intranet. Geschützt in middleware.ts.
 */
export default async function DatenBestaetigenPage() {
  const { user, profile, datenCheckSpalten } = await getCachedAuth();
  if (!user) redirect("/login");

  const datenCheck = await faelligerDatenCheck({
    profil: profile,
    email: user.email ?? ((profile?.["E-Mail"] as string | null) ?? ""),
    spalten: datenCheckSpalten,
    admin: createServiceClient,
  });
  if (!datenCheck || datenCheck.gueltig) redirect("/dashboard");

  return (
    <IntranetMotion>
      <DatenCheckFenster
        key={`${datenCheck.formular.version}|${datenCheck.formular.vorname}|${datenCheck.formular.nachname}`}
        ansicht={datenCheck}
        weiter="/dashboard"
      >
        <div className="min-h-screen bg-background" />
      </DatenCheckFenster>
    </IntranetMotion>
  );
}
