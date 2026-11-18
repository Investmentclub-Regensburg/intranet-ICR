import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { IntranetMotion } from "@/components/layout/IntranetMotion";
import { IntranetPageTransition } from "@/components/layout/IntranetPageTransition";
import { DatenCheckFenster } from "@/components/member/DatenCheckFenster";
import { createServiceClient } from "@/utils/supabase/service";
import { DATEN_CHECK_PFAD, layoutModus, type DatenCheckAnsicht } from "@/lib/member-data-check";
import { faelligerDatenCheck } from "@/lib/member-data-check-server";

export default async function IntranetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile, datenCheckSpalten } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  // Abfrage „Stimmen deine Daten noch?“ (nur wenn fällig wird die eigene Zeile entschlüsselt).
  const datenCheck: DatenCheckAnsicht | null = await faelligerDatenCheck({
    profil: profile,
    email: user.email ?? ((profile?.["E-Mail"] as string | null) ?? ""),
    spalten: datenCheckSpalten,
    admin: createServiceClient,
  });
  const modus = layoutModus(datenCheck);
  // Mängel: weiter zur eigenen Seite mit nur dem Fenster (Review A1/B1, Entscheidung 4). Die Weiterleitung passiert
  // vor jeder Ausgabe; der Seiteninhalt landet so weder im HTML noch im RSC-Payload. Server-Actions und API-Routen
  // anderer Seiten bleiben technisch aufrufbar – bewusst: Das Mitglied ist dafür ohnehin berechtigt, es geht um die
  // Datenqualität, nicht um Vertraulichkeit.
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
