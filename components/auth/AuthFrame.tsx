import Link from "next/link";
import type { ReactNode } from "react";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { cn } from "@/lib/utils";

/**
 * Rahmen der öffentlichen Seiten (Login, Registrierung, Passwort) in Rot und Weiß:
 * links eine Markenfläche in Logo-Rot mit weißer Bildmarke, rechts der Inhalt auf
 * Weiß. Mobil wird die Fläche zum Band über dem Inhalt. Überschrift im oberen
 * Drittel (Hannes 2026-10-08), kein Schwarz/Bordeaux, kein Korn.
 */
export function AuthFrame({
  stage,
  children,
  width = "narrow",
}: {
  /** Inhalt der Markenfläche (Eyebrow, Überschrift, ggf. Fortschritt und Zusammenfassung). */
  stage: ReactNode;
  children: ReactNode;
  /** narrow = Login/Passwort, wide = Registrierung. */
  width?: "narrow" | "wide";
}) {
  return (
    <div className="min-h-dvh bg-card lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="bg-brand-stage relative isolate overflow-hidden text-white lg:sticky lg:top-0 lg:h-dvh">
        {/* Stier als Wasserzeichen, ganz sichtbar. Deckkraft auf dem ganzen SVG (nicht
            über eine halbtransparente Füllfarbe), sonst wird die Überlappung von Stier
            und Kurslinie am Hals doppelt hell. */}
        <IcrLogo className="pointer-events-none absolute right-[7%] bottom-[6%] z-0 hidden h-auto w-[60%] text-white opacity-[0.09] lg:block" />
        <div className="relative z-10 flex h-full flex-col px-5 pt-5 pb-7 sm:px-10 lg:overflow-y-auto lg:px-12 lg:pt-10 lg:pb-12 xl:px-16">
          <Link
            href="/login"
            className="group flex w-fit items-center gap-3 rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
            aria-label="ICR Intranet, zum Login"
          >
            <IcrLogo className="h-9 w-auto text-white transition-[rotate,scale] duration-700 ease-out group-hover:-rotate-6 group-hover:scale-[1.06] lg:h-11" />
            <span className="text-base font-semibold tracking-[-0.01em]">Intranet</span>
          </Link>
          <div className="mt-6 lg:mt-[14vh]">{stage}</div>
        </div>
      </aside>

      <main className="flex justify-center px-5 py-10 sm:px-10 lg:items-start lg:pt-[calc(14vh+5.5rem)] lg:pb-16">
        <div className={cn("w-full", width === "wide" ? "max-w-xl" : "max-w-sm")}>{children}</div>
      </main>
    </div>
  );
}

/** Überschrift auf der Markenfläche: Eyebrow + große, enge Headline (Website heading-page). */
export function StageHeading({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      {eyebrow && <p className="eyebrow eyebrow-light">{eyebrow}</p>}
      <h1 className="text-[clamp(2.1rem,8vw,2.75rem)] leading-[0.98] font-bold tracking-[-0.04em] text-white lg:text-[3.5rem]">
        {title}
      </h1>
      {children}
    </div>
  );
}
