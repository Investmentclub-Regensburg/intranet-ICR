import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { IntranetMotion } from "@/components/layout/IntranetMotion";
import { IntranetPageTransition } from "@/components/layout/IntranetPageTransition";

export default async function IntranetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  const vorname = ((profile?.["Vorname"] as string) ?? "").trim();
  const nachname = ((profile?.["Nachname"] as string) ?? "").trim();
  const rawRole = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  const letzterNewsAufruf = (profile?.["letzter_news_aufruf"] as string | null) ?? null;

  return (
    <IntranetMotion>
      <div className="min-h-screen bg-background md:flex md:h-screen md:overflow-hidden">
        {/* Tastatur: erst der Sprung zum Inhalt, dann die Navigation. */}
        <a
          href="#inhalt"
          className="sr-only z-[60] rounded-xs bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
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
          <div className="mx-auto h-full w-full max-w-6xl">
            <IntranetPageTransition>
              {children}
            </IntranetPageTransition>
          </div>
        </main>
      </div>
    </IntranetMotion>
  );
}
