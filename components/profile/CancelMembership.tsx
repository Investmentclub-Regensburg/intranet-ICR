"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cancelMembership } from "@/app/(intranet)/profile/actions";
import type { FeeStop } from "@/components/profile/profile-format";

/**
 * Kündigung als abgesetzter Gefahrenbereich am Seitenende (wie „Danger Zone“ in SaaS-Einstellungen).
 * Bestätigung im Modal erst nach Häkchen. Logik wie bisher (cancelMembership: Status gekündigt,
 * Kündigungsdatum heute, Abmeldung, Weiterleitung zum Login).
 * `feeStop` kommt aus denselben Stichtagen wie der Finanzexport; null = kein Beitrag (Alumni).
 */
export function CancelMembership({ feeStop }: { feeStop: FeeStop | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [understood, setUnderstood] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await cancelMembership();
      if (result.success) {
        toast.success("Austritt im System vermerkt.");
      } else {
        toast.error(result.error || "Ein Fehler ist aufgetreten.");
        setLoading(false);
      }
    } catch (err) {
      const maybeDigest =
        typeof err === "object" &&
        err !== null &&
        "digest" in err &&
        typeof (err as { digest?: unknown }).digest === "string"
          ? (err as { digest: string }).digest
          : "";

      // redirect("/login") in Server Actions wirft intern NEXT_REDIRECT.
      // Das ist hier kein Fehlerfall und soll keinen Toast auslösen.
      if (!maybeDigest.startsWith("NEXT_REDIRECT")) {
        toast.error("Ein unerwarteter Fehler ist aufgetreten.");
        setLoading(false);
      }
    }
  }

  const consequences = [
    "Dein Zugang zum Intranet endet sofort.",
    feeStop
      ? `Ab ${feeStop.semester} wird kein Beitrag mehr eingezogen (Stichtag ${feeStop.stichtag}).`
      : null,
    "Rückgängig machen kann das nur der Vorstand.",
  ].filter((c): c is string => Boolean(c));

  return (
    <section aria-labelledby="cancel-heading" className="space-y-3">
      <h2 id="cancel-heading" className="text-sm font-semibold text-muted-foreground">
        Mitgliedschaft beenden
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl border border-destructive/25 bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div className="min-w-0 space-y-1">
          <p className="text-base leading-snug font-bold tracking-[-0.02em]">Mitgliedschaft kündigen</p>
          <p className="text-sm text-muted-foreground">
            {feeStop
              ? `Kündigst du heute, wird ab ${feeStop.semester} kein Beitrag mehr eingezogen. Dein Zugang endet sofort.`
              : "Dein Zugang zum Intranet endet sofort."}
          </p>
        </div>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (loading) return;
            setOpen(next);
            if (!next) setUnderstood(false);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full shrink-0 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive sm:w-auto"
            >
              Kündigen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mitgliedschaft kündigen?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <ul className="list-disc space-y-1 pl-5 text-left">
                  {consequences.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <Checkbox
                checked={understood}
                onCheckedChange={(v) => setUnderstood(v === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span>Ich möchte meine Mitgliedschaft im ICR verbindlich kündigen.</span>
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirm();
                }}
                disabled={loading || !understood}
              >
                {loading ? "Wird verarbeitet…" : "Endgültig kündigen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
