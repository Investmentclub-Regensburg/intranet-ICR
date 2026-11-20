import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { DatenPruefenSeite } from "@/components/member/DatenPruefenSeite";
import { rueckkehrZiel } from "@/lib/member-data-check";
import { eigenerDatenCheck } from "@/lib/member-data-check-sperre";

export const metadata = { title: "Deine Daten · ICR Intranet" };

/**
 * Abfrage „Stimmen deine Daten noch?“ als eigene Seite (Design-Runde 19.11.2026, Skizze DatenPruefen.dc.html):
 * bewusst außerhalb des Intranet-Layouts, ohne Seitenleiste und ohne Seiteninhalt. Die Sperre leitet jede fällige
 * Abfrage hierher, mit dem ursprünglichen Ziel in `?weiter=` (geprüft über rueckkehrZiel). Nicht (mehr) fällig →
 * dorthin zurück. Ohne JavaScript Hinweis und Abmelden. Geschützt in middleware.ts.
 */
export default async function DatenBestaetigenPage({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string | string[] }>;
}) {
  const { user } = await getCachedAuth();
  if (!user) redirect("/login");

  const { weiter: roh } = await searchParams;
  const weiter = rueckkehrZiel(Array.isArray(roh) ? roh[0] : roh);
  const datenCheck = await eigenerDatenCheck();
  if (!datenCheck) redirect(weiter);

  const f = datenCheck.formular;
  return (
    <DatenPruefenSeite
      // Neuer Stand (Version, Name) → Seite neu aufbauen.
      key={`${f.version}|${f.vorname}|${f.nachname}`}
      ansicht={{
        gueltig: datenCheck.gueltig,
        spaeterErlaubt: datenCheck.spaeterErlaubt,
        formular: f,
        formularFehler: datenCheck.formularFehler,
        handyHinweis: datenCheck.zeilen.find((z) => z.key === "handy")?.hinweis,
      }}
      email={user.email ?? ""}
      weiter={weiter}
    />
  );
}
