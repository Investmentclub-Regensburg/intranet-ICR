import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { IntranetMotion } from "@/components/layout/IntranetMotion";
import { IntranetPageTransition } from "@/components/layout/IntranetPageTransition";
import { DatenCheckFenster } from "@/components/member/DatenCheckFenster";
import { createServiceClient } from "@/utils/supabase/service";
import { isActiveMemberProfile } from "@/lib/profile-status";
import { istAbfrageFaellig, layoutModus, type DatenCheckAnsicht } from "@/lib/member-data-check";
import { datenCheckEinstellungen, ladeDatenCheckAnsicht } from "@/lib/member-data-check-server";

export default async function IntranetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile, datenCheckSpalten } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  // Abfrage „Stimmen deine Daten noch?“: Fälligkeit aus den Spalten von getCachedAuth (kein zusätzlicher
  // Datenbankaufruf); entschlüsselt wird die eigene Zeile nur, wenn sie fällig ist.
  const einstellungen = datenCheckEinstellungen();
  let datenCheck: DatenCheckAnsicht | null = null;
  if (
    profile &&
    datenCheckSpalten &&
    istAbfrageFaellig({
      eingeschaltet: einstellungen.eingeschaltet,
      aktiv: isActiveMemberProfile(profile),
      bestaetigtAm: profile["daten_bestaetigt_am"] as string | null,
      erinnernAb: profile["daten_erinnern_ab"] as string | null,
    })
  ) {
    datenCheck = await ladeDatenCheckAnsicht({
      admin: createServiceClient(),
      profil: profile,
      email: user.email ?? ((profile["E-Mail"] as string | null) ?? ""),
      einstellungen,
    });
  }

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

  // Fällig + gültig: Fenster über der Seite (inert, „Später“ möglich). Fällig + Mängel: KEIN Seiteninhalt, nur
  // das Fenster auf leerem Grund (Review A1/B1, Entscheidung 4: man kommt nicht vorbei). Server-Actions und
  // API-Routen anderer Seiten bleiben technisch aufrufbar – bewusst: Das Mitglied ist dafür ohnehin berechtigt,
  // es geht um die Datenqualität, nicht um Vertraulichkeit.
  const modus = layoutModus(datenCheck);
  return (
    <IntranetMotion>
      {modus === "seite" || !datenCheck ? (
        seite
      ) : (
        // Neuer Stand (Version/Name) → Fenster neu aufbauen (Formularwerte vom Server).
        <DatenCheckFenster
          key={`${datenCheck.formular.version}|${datenCheck.formular.vorname}|${datenCheck.formular.nachname}`}
          ansicht={datenCheck}
        >
          {modus === "fenster-ueber-seite" ? seite : <div className="min-h-screen bg-background" />}
        </DatenCheckFenster>
      )}
    </IntranetMotion>
  );
}
