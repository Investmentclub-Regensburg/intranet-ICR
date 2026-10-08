"use client";

// Wizard-Gerüst nach dem Muster des Tenant-Dashboards (_components/wizard.tsx,
// Anwendung terminarten/event-types-manager.tsx):
// - pro Schritt eine Frage, der Inhalt gleitet je nach Laufrichtung herein,
// - jede beantwortete Frage wird eine Zeile in der Zusammenfassung, ein Klick darauf
//   springt in den Schritt zurück,
// - stehen alle Antworten schon, führt „Weiter“ direkt ans Ende,
// - Fortschritt als Striche (keine Punkte),
// - Auswahl als Kacheln (echte Radio-Felder), Enter in Feldern sendet nie ab.
//
// Unterschied zum Tenant-Dashboard: Die Schritte bleiben im DOM (nur `hidden`), damit
// Formulare mit Server Action ihre Felder unverändert mitsenden und eigene Feld-
// Komponenten (z. B. IbanBicFields) ihren Zustand behalten. Prüfen je Schritt über
// `reportStepValidity`.

import { useState, type ChangeEventHandler, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Pencil, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/kit/IconButton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EASE = [0.22, 1, 0.36, 1] as const;

export type WizardDirection = "forward" | "back";

export type WizardStepDef<K extends string> = {
  key: K;
  /** Kurzname (Fortschritt, Zusammenfassung). */
  label: string;
  Icon?: LucideIcon;
};

/** Schritt-Zustand: aktueller Schritt, Laufrichtung, erledigte Schritte. */
export function useWizard<K extends string>(steps: readonly WizardStepDef<K>[], initial?: K) {
  const [step, setStep] = useState<K>(initial ?? steps[0].key);
  const [direction, setDirection] = useState<WizardDirection>("forward");
  const [completed, setCompleted] = useState<K[]>([]);

  const indexOf = (key: K) => steps.findIndex((s) => s.key === key);
  const index = indexOf(step);
  const lastKey = steps[steps.length - 1].key;

  /** In einen Schritt springen; die Richtung steuert, von welcher Seite er hereingleitet. */
  const goTo = (next: K) => {
    setDirection(indexOf(next) >= index ? "forward" : "back");
    setStep(next);
  };

  const back = () => {
    if (index > 0) goTo(steps[index - 1].key);
  };

  /**
   * Schritt abhaken und weiter. Stehen alle Schritte vor dem letzten schon fest (Rücksprung
   * aus der Zusammenfassung), geht es direkt ans Ende statt noch einmal durch alles.
   */
  const complete = (key: K = step) => {
    const list = completed.includes(key) ? completed : [...completed, key];
    setCompleted(list);
    const allDone = steps.slice(0, -1).every((s) => list.includes(s.key));
    const after = steps[indexOf(key) + 1];
    if (allDone) goTo(lastKey);
    else if (after) goTo(after.key);
  };

  return {
    steps,
    step,
    index,
    count: steps.length,
    direction,
    completed,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    goTo,
    back,
    complete,
  };
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Erstes ungültiges Feld eines Schritts (`[data-wizard-step="key"]`) oder null. */
export function firstInvalidField(scope: ParentNode | null): Field | null {
  if (!scope) return null;
  const fields = scope.querySelectorAll<Field>("input, select, textarea");
  for (const field of fields) {
    if (field.disabled || (field instanceof HTMLInputElement && field.type === "hidden")) continue;
    if (!field.checkValidity()) return field;
  }
  return null;
}

/** Prüft die Felder eines Schritts mit den Browser-Regeln (required, minLength,
 *  setCustomValidity …) und zeigt die erste Meldung an. true = alles gültig. */
export function reportStepValidity(form: HTMLFormElement | null, key: string): boolean {
  const scope = form?.querySelector(`[data-wizard-step="${key}"]`) ?? null;
  const invalid = firstInvalidField(scope);
  if (!invalid) return true;
  invalid.reportValidity();
  return false;
}

/** Ausschnitt i von count aus einem durchgehenden Markenverlauf (Bordeaux → Rot → helles Rot). */
function gradientSlice(i: number, count: number) {
  return {
    backgroundImage:
      "linear-gradient(90deg, var(--color-bordeaux) 0%, var(--color-brand) 55%, var(--color-brand-soft) 100%)",
    backgroundSize: `${count * 100}% 100%`,
    backgroundPosition: `${count > 1 ? (i / (count - 1)) * 100 : 0}% 0`,
  };
}

/** Fortschritt als Striche: erledigt und aktuell gefüllt, kommende leer. */
export function WizardProgress({
  count,
  index,
  label,
  tone = "default",
  className,
}: {
  count: number;
  index: number;
  /** Name des aktuellen Schritts. */
  label?: string;
  tone?: "default" | "onBrand";
  className?: string;
}) {
  const onBrand = tone === "onBrand";
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs font-semibold">
        <span className={onBrand ? "text-white" : "text-foreground"}>{label}</span>
        <span className={cn("tabular-nums", onBrand ? "text-white/75" : "text-muted-foreground")}>
          {index + 1} / {count}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Fortschritt"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        aria-valuetext={label ? `Schritt ${index + 1} von ${count}: ${label}` : undefined}
        className="flex gap-1"
      >
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={cn("relative h-1 flex-1 overflow-hidden rounded-full", onBrand ? "bg-white/25" : "bg-border")}
          >
            <motion.span
              className={cn("absolute inset-0 origin-left rounded-full", onBrand && "bg-white")}
              // Auf hellem Grund: ein durchgehender Markenverlauf über alle Striche
              // (jeder Strich zeigt seinen Ausschnitt), Markierung des Fortschritts.
              style={onBrand ? undefined : gradientSlice(i, count)}
              initial={false}
              animate={{ scaleX: i <= index ? 1 : 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Ein Schritt. Bleibt im DOM (Felder behalten Wert und werden mitgesendet), nur der aktive
 * ist sichtbar und gleitet je nach Richtung herein (CSS .wizard-step in globals.css).
 */
export function WizardStep({
  stepKey,
  active,
  direction,
  title,
  children,
  className,
}: {
  stepKey: string;
  active: boolean;
  direction: WizardDirection;
  /** Die eine Frage des Schritts. */
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-wizard-step={stepKey}
      hidden={!active}
      data-dir={direction}
      aria-label={title}
      className={cn("wizard-step space-y-5", className)}
    >
      {title && (
        <h2 className="text-2xl leading-tight font-bold tracking-[-0.03em] sm:text-[1.75rem]">{title}</h2>
      )}
      {children}
    </section>
  );
}

/** Fuß eines Schritts: Zurück als Icon links, Hauptaktion rechts. */
export function WizardNav({
  onBack,
  children,
  className,
}: {
  /** Fehlt = erster Schritt, kein Zurück. */
  onBack?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-2", className)}>
      {onBack ? (
        <IconButton label="Zurück" variant="outline" className="size-11" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
      ) : (
        <span />
      )}
      <div className="flex flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export type WizardRow<K extends string> = {
  key: K;
  label: string;
  value: ReactNode;
  Icon?: LucideIcon;
};

/**
 * Zusammenfassung: eine Zeile je beantworteter Frage, die offene ist hinterlegt. Klick
 * springt in den Schritt zurück. `onBrand` für die rote Markenfläche der Auth-Seiten.
 */
export function WizardSummary<K extends string>({
  rows,
  activeKey,
  onSelect,
  tone = "default",
  className,
}: {
  rows: WizardRow<K>[];
  activeKey?: K | null;
  onSelect: (key: K) => void;
  tone?: "default" | "onBrand";
  className?: string;
}) {
  const onBrand = tone === "onBrand";
  return (
    <ul className={cn("space-y-0.5", className)}>
      <AnimatePresence initial={false}>
        {rows.map((r) => (
          <motion.li
            key={r.key}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(r.key)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors outline-none focus-visible:ring-[3px]",
                onBrand
                  ? "text-white hover:bg-white/12 focus-visible:ring-white/50"
                  : "text-foreground hover:bg-accent focus-visible:ring-ring/40",
                activeKey === r.key && (onBrand ? "bg-white/15" : "bg-accent"),
              )}
            >
              {r.Icon && (
                <r.Icon
                  className={cn("mt-0.5 size-4 shrink-0", onBrand ? "text-white/80" : "text-muted-foreground")}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase",
                    onBrand ? "text-white/75" : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </span>
                <span className="line-clamp-2 block text-sm font-medium break-words">{r.value}</span>
              </span>
              <Pencil
                className={cn(
                  "mt-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70",
                  onBrand ? "text-white" : "text-muted-foreground",
                )}
                aria-hidden
              />
              <span className="sr-only">ändern</span>
            </motion.button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

/**
 * Auswahl als Kachel: ein echtes Radio- (oder Checkbox-)Feld, damit Formular, Pflicht-
 * prüfung und gesendeter Wert unverändert bleiben. Gewählt = Rand und Fläche in Marke.
 */
export function PickTile({
  type = "radio",
  name,
  value,
  checked,
  onChange,
  required,
  label,
  hint,
  Icon,
  className,
}: {
  type?: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  label: string;
  hint?: string;
  Icon?: LucideIcon;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 rounded-xl border border-input bg-card px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-200",
        // Gewählt: einfarbig im Primär-Rot wie der Weiter-Button, Schrift weiß (Hannes 2026-10-08).
        "hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:shadow-brand",
        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        required={required}
        className="peer sr-only"
      />
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-has-[:checked]:bg-white/15 group-has-[:checked]:text-white">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground transition-colors group-has-[:checked]:text-white">{label}</span>
        {hint && (
          <span className="block text-xs text-muted-foreground transition-colors group-has-[:checked]:text-white/80">{hint}</span>
        )}
      </span>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-input transition-colors group-has-[:checked]:border-white group-has-[:checked]:bg-white"
      >
        <Check className="size-3 text-primary opacity-0 transition-opacity group-has-[:checked]:opacity-100" />
      </span>
    </label>
  );
}

/**
 * Wizard als Modal (für Anlegen-Vorgänge im Intranet, z. B. Event, News). Wie im
 * Tenant-Dashboard: Solange nichts eingegeben ist, schließen Klick daneben und Escape;
 * danach ignoriert der Hintergrund Klicks und Escape fragt nach. Mobil als Bottom-Sheet.
 */
export function WizardDialog({
  open,
  onOpenChange,
  title,
  dirty = false,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Für Screenreader (der sichtbare Titel steht im Schritt). */
  title: string;
  dirty?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [askDiscard, setAskDiscard] = useState(false);
  const requestClose = () => (dirty ? setAskDiscard(true) : onOpenChange(false));

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogContent
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault();
          }}
          className={cn(
            "max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-3xl",
            "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none",
            className,
          )}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
      <AlertDialog open={askDiscard} onOpenChange={setAskDiscard}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eingaben verwerfen?</AlertDialogTitle>
            <AlertDialogDescription>Deine Eingaben gehen verloren.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Weiter bearbeiten</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setAskDiscard(false);
                onOpenChange(false);
              }}
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
