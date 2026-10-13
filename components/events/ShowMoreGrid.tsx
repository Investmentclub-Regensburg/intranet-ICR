"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { staggerProps } from "@/components/kit/Reveal";
import { cn } from "@/lib/utils";

/** Raster, das zuerst nur `initial` Einträge zeigt; der Rest kommt per Knopf dazu. */
/** Kinder kommen gestaffelt (Kit: staggerProps). */
export function ShowMoreGrid({
  children,
  initial,
  className,
}: {
  children: ReactNode;
  initial: number;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - initial;
  const visible = all || hidden <= 0 ? items : items.slice(0, initial);

  return (
    <div className="space-y-4">
      <div {...staggerProps()} className={cn("grid grid-cols-1 gap-3", className)}>
        {visible}
      </div>
      {!all && hidden > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
            {hidden} weitere anzeigen
            <ChevronDown aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
