"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tile } from "@/components/kit/Tile";
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

// Kleine Bausteine für den Bereich „Verwaltung“ (nur components/admin, das Kit bleibt
// beim Rahmen). Farben nur über Tokens.

/* ---------------------------------------------------------------------------
 * Status-Pille
 * ------------------------------------------------------------------------- */

export type PillTone = "open" | "done" | "neutral" | "danger";

const PILL: Record<PillTone, string> = {
  // Offen: Markenrot als Hinweis, dass etwas zu tun ist.
  open: "border-primary/25 bg-brand-tint text-primary",
  done: "border-border bg-muted text-foreground",
  neutral: "border-border bg-card text-muted-foreground",
  danger: "border-destructive/30 bg-destructive/5 text-destructive",
};

export function StatusPill({
  tone,
  children,
  Icon,
  className,
}: {
  tone: PillTone;
  children: ReactNode;
  Icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

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
 * Große Auswahl-Kachel („Neu anlegen“ vs. „Verwalten“)
 * ------------------------------------------------------------------------- */

export function ChoiceTile({
  Icon,
  title,
  hint,
  meta,
  href,
  onOpen,
}: {
  Icon: LucideIcon;
  title: string;
  /** Ein Satz, was dahinter passiert. */
  hint: string;
  /** Kleine Zeile unten (z. B. Anzahl). */
  meta?: ReactNode;
  href?: string;
  onOpen?: () => void;
}) {
  return (
    <Tile
      href={href}
      onOpen={onOpen}
      Icon={Icon}
      title={<span className="block text-xl tracking-[-0.03em] sm:text-2xl">{title}</span>}
      className="min-h-[12rem] p-6 sm:min-h-[14rem] sm:p-7"
      footer={
        <span className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
          <span>{meta}</span>
          <ArrowRight className="size-4 text-primary" aria-hidden />
        </span>
      }
    >
      {hint}
    </Tile>
  );
}

/* ---------------------------------------------------------------------------
 * Abschnittskopf innerhalb einer Tab-Seite (kleiner als die Seitenüberschrift)
 * ------------------------------------------------------------------------- */

export function SectionHead({
  title,
  count,
  action,
  id,
  className,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <h2 id={id} className="flex items-baseline gap-2 text-xl font-bold tracking-[-0.03em] sm:text-2xl">
        {title}
        {typeof count === "number" && (
          <span className="text-base font-semibold text-muted-foreground tabular-nums">{count}</span>
        )}
      </h2>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
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
