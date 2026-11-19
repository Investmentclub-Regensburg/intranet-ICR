import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { IntranetMotion } from "@/components/layout/IntranetMotion";
import { IntranetPageTransition } from "@/components/layout/IntranetPageTransition";
import { DatenCheckFenster } from "@/components/member/DatenCheckFenster";
import { DATEN_CHECK_PFAD, layoutModus } from "@/lib/member-data-check";
import { eigenerDatenCheck, sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

export default async function IntranetLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Mängel: weiter zur eigenen Seite mit nur dem Fenster (Review A1/B1, Entscheidung 4). Das allein hält den
  // Seiteninhalt NICHT aus der Antwort: Next rendert die Seite parallel und überträgt sie als eigenen RSC-Eintrag,
  // bei einer Navigation unter diesem Layout läuft das Layout gar nicht. Deshalb ruft zusätzlich jede Seite die
  // Sperre als erste Anweisung auf (Gegenprüfung S-G1, lib/member-data-check-sperre.ts).
  await sperreBeiDatenmaengeln();

  const { user, profile } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  // Abfrage „Stimmen deine Daten noch?“ (je Anfrage einmal berechnet; entschlüsselt wird nur, wenn fällig).
  const datenCheck = await eigenerDatenCheck();
  const modus = layoutModus(datenCheck);
  if (modus === "umleiten") redirect(DATEN_CHECK_PFAD);

  const vorname = ((profile?.["Vorname"] as string) ?? "").trim();
  const nachname = ((profile?.["Nachname"] as string) ?? "").trim();
  const rawRole = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  const letzterNewsAufruf = (profile?.["letzter_news_aufruf"] as string | null) ?? null;

  const seite = (
    <div className="min-h-screen bg-background md:flex md:h-screen md:overflow-hidden">
      {/* Tastatur: erst der Sprung zum Inhalt, dann die Navigation. */}
      <a
        href="#inhalt"
        className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Zum Inhalt springen
      </a>
      <Sidebar
        profile={{ vorname, nachname, rolle: rawRole, letzterNewsAufruf }}
      />
      <main
        id="inhalt"
        tabIndex={-1}
        className="w-full px-4 pt-6 pb-24 outline-none sm:px-6 md:h-screen md:flex-1 md:overflow-y-auto md:px-8 md:pt-10 md:pb-28 lg:px-12 lg:pb-32"
      >
        {/* Inhaltsbreite wie die Website (container-page), zentriert. */}
        <div className="mx-auto w-full max-w-6xl">
          <IntranetPageTransition>
            {children}
          </IntranetPageTransition>
        </div>
      </main>
    </div>
  );

  return (
    <IntranetMotion>
      {modus === "fenster-ueber-seite" && datenCheck ? (
        // Fällig + gültig: Seite unter dem Fenster, inert, solange es offen ist. Neuer Stand → Fenster neu aufbauen.
        <DatenCheckFenster
          key={`${datenCheck.formular.version}|${datenCheck.formular.vorname}|${datenCheck.formular.nachname}`}
          ansicht={datenCheck}
        >
          {seite}
        </DatenCheckFenster>
      ) : (
        seite
      )}
    </IntranetMotion>
  );
}
