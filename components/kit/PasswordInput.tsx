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
 *
 * Rechts bleibt Platz (2.25rem) für Icons von Passwort-Managern (Bitwarden,
 * Vaultwarden u. a.), die sich an den rechten Feldrand legen; unser Knopf sitzt
 * links davon, liegt darüber (z-10) und nimmt den Fokus nicht aus dem Feld.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, forwardedRef) => {
  const [visible, setVisible] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const toggle = () => {
    setVisible((v) => !v);
    // Nach dem Typwechsel Fokus und Cursor ans Ende, damit man weitertippen kann.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el || document.activeElement !== el) return;
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  };

  return (
    <div className="relative">
      <Input
        ref={setRefs}
        type={visible ? "text" : "password"}
        className={cn("pr-[4.75rem]", className)}
        {...props}
      />
      <button
        type="button"
        // Fokus bleibt im Feld (kein Blur, keine Prüfung beim Verlassen).
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        aria-pressed={visible}
        title={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        className="absolute top-1/2 right-9 z-10 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";
