import Link from "next/link";
import type { ReactNode } from "react";
import { Aurora } from "@/components/brand/Aurora";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { cn } from "@/lib/utils";

/**
 * Rahmen der öffentlichen Seiten (Login, Registrierung, Passwort): links eine
 * Aurora-Bühne in Bordeaux mit Bildmarke (Signatur der Website), rechts der Inhalt
 * auf hellem Grund. Mobil wird die Bühne zum Band über dem Inhalt.
 */
export function AuthFrame({
  stage,
  children,
  width = "narrow",
}: {
  /** Inhalt der Bühne (Eyebrow, Überschrift, ggf. Fortschritt und Zusammenfassung). */
  stage: ReactNode;
  children: ReactNode;
  /** narrow = Login/Passwort, wide = Registrierung. */
  width?: "narrow" | "wide";
}) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative isolate overflow-hidden text-white lg:sticky lg:top-0 lg:h-dvh">
        <Aurora />
        {/* Großer Stier als Wasserzeichen (wie das Slogan-Band der Website). */}
        <IcrLogo className="pointer-events-none absolute -right-[18%] -bottom-[12%] z-0 hidden h-auto w-[115%] text-white/[0.05] lg:block" />
        <div className="relative z-10 flex h-full flex-col px-5 pt-6 pb-8 sm:px-10 lg:overflow-y-auto lg:px-12 lg:pt-10 lg:pb-12 xl:px-16">
          <Link
            href="/login"
            className="group flex w-fit items-center gap-3 rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-white/40"
            aria-label="Investment Club Regensburg, zum Login"
          >
            <IcrLogo className="h-9 w-auto text-white transition-[rotate,scale] duration-700 ease-out group-hover:-rotate-6 group-hover:scale-[1.06] lg:h-11" />
            <span className="text-[0.8125rem] leading-[1.15] font-semibold">
              Investment Club
              <br />
              Regensburg
            </span>
          </Link>
          <div className="mt-8 lg:my-auto lg:pt-10">{stage}</div>
        </div>
      </aside>

      <main className="flex justify-center px-5 py-10 sm:px-10 lg:items-center lg:py-16">
        <div className={cn("w-full", width === "wide" ? "max-w-xl" : "max-w-sm")}>{children}</div>
      </main>
    </div>
  );
}

/** Überschrift auf der Bühne: Eyebrow + große, enge Headline (Website heading-page). */
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
