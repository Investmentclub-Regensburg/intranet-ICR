import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { IntranetPageTransition } from "@/components/layout/IntranetPageTransition";
import { KitPreview } from "./kit-preview";

export const metadata = { title: "Bausteine · ICR Intranet (Dev)" };

/**
 * Nur im Dev-Modus: Vorschau von App-Rahmen und Bausteinen (Redesign Paket 1) ohne
 * Datenbank und ohne Login. In Produktion 404. Beispieldaten, keine Abfragen
 * (die Sidebar fragt wie immer ungelesene News ab; ohne DB bleibt das leer).
 */
export default function KitPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="min-h-screen bg-background md:flex md:h-screen md:overflow-hidden">
      <Sidebar profile={{ vorname: "Max", nachname: "Muster", rolle: "board", letzterNewsAufruf: null }} />
      <main className="w-full px-4 pt-6 pb-24 sm:px-6 md:h-screen md:flex-1 md:overflow-y-auto md:px-8 md:pt-10 md:pb-28 lg:px-12 lg:pb-32">
        <div className="mx-auto h-full w-full max-w-6xl">
          <IntranetPageTransition>
            <KitPreview />
          </IntranetPageTransition>
        </div>
      </main>
    </div>
  );
}
