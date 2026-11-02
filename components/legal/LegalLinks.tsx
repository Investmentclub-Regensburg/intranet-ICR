import Link from "next/link";
import { cn } from "@/lib/utils";

/** Impressum und Datenschutz: auf den Auth-Seiten, in der Sidebar und unter den Rechtstexten. */
export function LegalLinks({ className }: { className?: string }) {
  const link =
    "rounded-xs transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40";
  return (
    <nav aria-label="Rechtliches" className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      <Link href="/impressum" className={link}>
        Impressum
      </Link>
      <Link href="/datenschutz" className={link}>
        Datenschutz
      </Link>
    </nav>
  );
}
