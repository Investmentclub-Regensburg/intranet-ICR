import { cn } from "@/lib/utils";

/**
 * Aurora-Hintergrund in Vereinsfarben (Signatur der Website, dort
 * src/components/ui/Aurora.astro): Bordeaux als Grund, drei driftende
 * Rot-Nebel, Vignette. Ohne Korn und ohne Maus-Parallax (im Intranet nur
 * als ruhige Bühne). CSS in app/globals.css (.aurora-*).
 *
 * Muss in einem `relative isolate overflow-hidden`-Container liegen; der
 * Inhalt darüber bekommt `relative z-10`.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-0", className)}>
      <div className="aurora-base" />
      <div className="aurora-blobs">
        <span className="aurora-blob aurora-blob-1" />
        <span className="aurora-blob aurora-blob-2" />
        <span className="aurora-blob aurora-blob-3" />
      </div>
      <div className="aurora-vignette" />
    </div>
  );
}
