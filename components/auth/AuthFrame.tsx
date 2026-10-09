import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Aurora } from "@/components/brand/Aurora";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { cn } from "@/lib/utils";

/**
 * Rahmen der öffentlichen Seiten (Login, Registrierung, Passwort): links die
 * Markenfläche mit dem roten Aurora-Verlauf (rote Mitte, dunkler Rand, ohne Korn),
 * rechts das Formular auf Weiß. Ab lg teilen sich beide die Breite 50/50, das
 * Formular steht mittig in der rechten Hälfte (Login und Registrierung gleich).
 * Mobil wird die Fläche zum Band über dem Formular.
 * Überschrift im oberen Drittel, oben links das Logo.
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
    <div className="light min-h-dvh bg-card text-foreground lg:grid lg:grid-cols-2">
      <aside className="relative isolate overflow-hidden text-white lg:sticky lg:top-0 lg:h-dvh">
        <Aurora />
        {/* Stier als Wasserzeichen, ganz sichtbar. Deckkraft auf dem ganzen SVG (nicht
            über eine halbtransparente Füllfarbe), sonst wird die Überlappung von Stier
            und Kurslinie am Hals doppelt hell. */}
        <IcrLogo className="pointer-events-none absolute right-[7%] bottom-[6%] z-0 hidden h-auto w-[60%] text-white opacity-[0.07] lg:block xl:w-[46%]" />
        {/* Bei niedrigen Fenstern wird die Fläche scrollbar; die Leiste selbst bleibt
            unsichtbar, sonst steht sie als dunkler Streifen genau an der Naht. */}
        <div className="relative z-10 flex h-full flex-col px-5 pt-5 pb-7 [scrollbar-width:none] sm:px-10 lg:overflow-y-auto lg:px-12 [&::-webkit-scrollbar]:hidden lg:pt-10 lg:pb-12 xl:px-20">
          <Link
            href="/login"
            className="group flex w-fit items-center gap-3 rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
            aria-label="ICR Intranet, zum Login"
          >
            <IcrLogo className="h-9 w-auto text-white transition-[rotate,scale] duration-700 ease-out group-hover:-rotate-6 group-hover:scale-[1.06] lg:h-11" />
          </Link>
          <div className="mt-6 lg:mt-[14vh] xl:max-w-2xl">{stage}</div>
        </div>
      </aside>

      <main className="flex justify-center px-5 py-10 sm:px-10 lg:items-start lg:px-12 lg:pt-[calc(14vh+5.5rem)] lg:pb-16 xl:px-16">
        <div className={cn("w-full", width === "wide" ? "max-w-2xl" : "max-w-md")}>{children}</div>
      </main>
    </div>
  );
}

/** Verzögerung für die Einflug-Animation (globals.css .fly-rise/.fly-slide). */
export function flyDelay(seconds: number): CSSProperties {
  return { "--fly-delay": `${seconds}s` } as CSSProperties;
}

/**
 * Überschrift auf der Markenfläche: Eyebrow + große, enge Headline (Website
 * heading-page). Fliegt ein wie auf der Website: Eyebrow gleitet von links, die
 * Zeilen (`title` als Array = eine Zeile je Eintrag) steigen nacheinander auf.
 */
export function StageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string | string[];
  children?: ReactNode;
}) {
  const lines = Array.isArray(title) ? title : [title];
  const start = eyebrow ? 0.14 : 0;
  return (
    <div className="space-y-4">
      {eyebrow && <p className="eyebrow eyebrow-light fly-slide">{eyebrow}</p>}
      <h1 className="text-[clamp(2.1rem,8vw,2.75rem)] leading-[0.98] font-bold tracking-[-0.04em] text-white lg:text-[3.5rem] xl:text-[4.25rem]">
        {lines.map((line, i) => (
          <span key={line} className="fly-rise block" style={flyDelay(start + i * 0.14)}>
            {line}
          </span>
        ))}
      </h1>
      {children && (
        <div className="fly-rise" style={flyDelay(start + lines.length * 0.14)}>
          {children}
        </div>
      )}
    </div>
  );
}
