import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { IntranetMotion } from "@/components/layout/IntranetMotion";
import { DatenCheckFenster } from "@/components/member/DatenCheckFenster";
import { eigenerDatenCheck } from "@/lib/member-data-check-sperre";

export const metadata = { title: "Bitte aktualisiere deine Daten · ICR Intranet" };

/**
 * Abfrage „Stimmen deine Daten noch?“ bei Mängeln (Paket „Mitgliederdaten“, PR 4, Review A1/B1): bewusst außerhalb
 * des Intranet-Layouts, damit kein Seiteninhalt mitkommt. Nur das Fenster auf leerem Grund (ohne JavaScript mit
 * Hinweis und Abmelden). Nicht fällig oder gültig → zurück ins Intranet. Geschützt in middleware.ts.
 */
export default async function DatenBestaetigenPage() {
  const { user } = await getCachedAuth();
  if (!user) redirect("/login");

  const datenCheck = await eigenerDatenCheck();
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
