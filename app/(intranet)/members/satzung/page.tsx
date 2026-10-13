import type { Metadata } from "next";
import { Download, ExternalLink, FileText } from "lucide-react";
import { AreaHeader } from "@/components/area/AreaHeader";
import { VEREIN_SECTIONS } from "@/components/layout/nav-sections";
import { Reveal } from "@/components/kit/Reveal";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Satzung · Verein · ICR" };

// Vorhandene PDF des Intranets (public/dokumente), identisch mit dem Download auf der
// Website. Fassung laut Website (site.ts): Stand 08.02.2024.
const SATZUNG_PDF = "/dokumente/vereinssatzung.pdf";

/**
 * Tab „Satzung“ im Bereich Verein. Route unter /members/, damit die bestehende
 * Middleware (Präfix /members) und das Intranet-Layout den Login verlangen.
 */
export default function SatzungPage() {
  return (
    <div className="space-y-8">
      <AreaHeader area="Verein" sections={VEREIN_SECTIONS} />

      <Reveal as="section" aria-labelledby="satzung-titel" className="max-w-3xl">
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:p-8">
          <span className="tile-icon size-12 rounded-xl">
            <FileText className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 id="satzung-titel" className="text-xl leading-tight font-bold tracking-[-0.02em] text-foreground">
              Vereinssatzung
            </h2>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Fassung vom 08.02.2024 · PDF
            </p>
            <p className="pt-1 text-[0.9375rem] text-muted-foreground">
              Hier stehen die Regeln zu Mitgliedschaft, Beitrag und Kündigung.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
            <Button asChild>
              <a href={SATZUNG_PDF} target="_blank" rel="noopener noreferrer">
                Öffnen
                <ExternalLink aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={SATZUNG_PDF} download="ICR-Vereinssatzung.pdf">
                <Download aria-hidden />
                Herunterladen
              </a>
            </Button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
