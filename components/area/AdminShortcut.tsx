import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hinweis-Link für Vorstand/Admin in die Verwaltung (z. B. „Neue Mitteilung“).
 * Ab sm mit Text, auf dem Handy nur das Plus-Icon (Text bleibt als aria-label/Tooltip).
 */
export function AdminShortcut({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="outline" size="sm" asChild className="max-sm:size-9 max-sm:px-0">
      <Link href={href} aria-label={label} title={label}>
        <Plus aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    </Button>
  );
}
