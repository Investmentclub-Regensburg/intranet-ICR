"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Kleine Bausteine für den Bereich „Verwaltung“, die das Kit nicht hat (Filter-Chips,
// Schalter, Bestätigung). Farben nur über Tokens.

/* ---------------------------------------------------------------------------
 * Filter-Chips (runde Pillen, gewählt einfarbig Rot wie der Weiter-Button)
 * ------------------------------------------------------------------------- */

export type ChipOption<K extends string> = { key: K; label: string; count?: number };

export function FilterChips<K extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Name der Gruppe (Screenreader, sichtbar als kleines Label). */
  label: string;
  options: readonly ChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <motion.button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-brand"
                : "border-input bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground",
            )}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span className={cn("tabular-nums", active ? "text-white/80" : "text-muted-foreground/80")}>
                {o.count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Schalter statt Checkbox (Muster OpSwitch, Thumb gleitet per layout)
 * ------------------------------------------------------------------------- */

export function Switch({
  id,
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
          checked ? "justify-end bg-primary" : "justify-start bg-input",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 36 }}
          className="size-5 rounded-full bg-white shadow-soft"
        />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Bestätigung vor einer Aktion (sperrt während der Ausführung, zeigt Fehler im Dialog)
 * ------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel = "Bitte warten…",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  destructive?: boolean;
  /** Liefert eine Fehlermeldung oder "" bei Erfolg (Dialog schließt dann). */
  onConfirm: () => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const message = await onConfirm();
      if (message) setError(message);
      else onOpenChange(false);
    } catch {
      setError("Das hat nicht geklappt. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setError("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="rounded-xs border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={run}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
