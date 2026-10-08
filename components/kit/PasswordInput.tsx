"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Passwortfeld mit Auge zum kurzen Anzeigen (Hannes 2026-10-08). Reicht alle
 * Attribute und den ref an das echte <input> durch (name, required, minLength,
 * setCustomValidity …), Formularlogik bleibt also unverändert; nur `type` wechselt
 * zwischen password und text.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        aria-pressed={visible}
        title={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";
