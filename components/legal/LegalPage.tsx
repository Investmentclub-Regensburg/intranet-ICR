import Link from "next/link";
import type { ReactNode } from "react";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { LegalLinks } from "@/components/legal/LegalLinks";

/**
 * Rahmen für Impressum und Datenschutz, öffentlich (ohne Login) wie auf der Website:
 * Eyebrow „Rechtliches“ + H1, darunter der Text in schmaler Spalte. Die Typo der
 * Rechtstexte (.legal) steht in globals.css und folgt LegalContent.astro der Website.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            aria-label="ICR Intranet, zur Startseite"
          >
            <IcrLogo className="h-8 w-auto text-brand transition-[rotate,scale] duration-700 ease-out group-hover:-rotate-6 group-hover:scale-[1.06]" />
            <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Intranet</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-14 pb-20 sm:px-8 sm:pt-20 lg:pt-24">
        <p className="eyebrow">Rechtliches</p>
        <h1 className="mt-5 text-[clamp(2.25rem,7vw,3.5rem)] leading-[1.02] font-bold tracking-[-0.04em]">{title}</h1>
        <div className="legal mt-12">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
