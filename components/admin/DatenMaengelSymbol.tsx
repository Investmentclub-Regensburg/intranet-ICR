"use client";

import { CircleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Symbol „Daten unvollständig“ in der Mitgliederliste (nur Vorstand). Zeigt beim Antippen/Klicken die NAMEN
 * der betroffenen Felder, nie Werte. Ohne Felder nichts.
 */
export function DatenMaengelSymbol({ felder, name }: { felder?: readonly string[]; name: string }) {
  if (!felder || felder.length === 0) return null;
  const liste = felder.join(", ");
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Daten von ${name} unvollständig: ${liste}`}
        title={`Unvollständig: ${liste}`}
        className="-my-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-destructive outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <CircleAlert className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-72 rounded-lg px-3 py-2 text-sm shadow-soft">
        <p className="font-medium">Unvollständig oder ungültig</p>
        <p className="text-muted-foreground">{liste}</p>
      </PopoverContent>
    </Popover>
  );
}
