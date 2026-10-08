"use client";

import { ExternalLink, FileText } from "lucide-react";
import { Tile } from "@/components/kit/Tile";

const STATUTE_URL = "/dokumente/vereinssatzung.pdf";

/** Vereinssatzung als klickbare Kachel, öffnet das PDF in einem neuen Tab. */
export function StatuteTile() {
  return (
    <Tile
      Icon={FileText}
      title="Vereinssatzung"
      meta="PDF"
      onOpen={() => window.open(STATUTE_URL, "_blank", "noopener,noreferrer")}
      className="h-full"
      footer={
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          Öffnen
          <ExternalLink className="size-3.5" aria-hidden />
        </span>
      }
    />
  );
}
