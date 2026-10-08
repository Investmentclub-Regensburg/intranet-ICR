"use client";

import { useState } from "react";
import { DoorOpen } from "lucide-react";
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
import { cancelMembership } from "@/app/(intranet)/profile/actions";
import { ReadField } from "@/components/profile/ReadField";
import type { FeeStop } from "@/components/profile/profile-format";

/**
 * Mitgliedschaft beenden: ruhige, neutrale Kachel (kein Alarm-Rot) mit dem, was eine
 * Kündigung heute bedeutet, und Bestätigungs-Modal. Logik wie bisher (cancelMembership:
 * Status gekündigt, Kündigungsdatum heute, Abmeldung, Weiterleitung zum Login).
 * `feeStop` kommt aus denselben Stichtagen wie der Finanzexport; null = kein Beitrag
 * (Alumni).
 */
export function CancelMembership({ statusLabel, since, feeStop }: {
  statusLabel: string;
  since: string | null;
  feeStop: FeeStop | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <section
      aria-labelledby="cancel-title"
      className="rounded-2xl border border-border bg-secondary/50 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-4">
          <h2 id="cancel-title" className="flex items-center gap-3 text-base font-bold tracking-[-0.02em]">
            <span className="flex size-9 items-center justify-center rounded-xl bg-card text-muted-foreground">
              <DoorOpen className="size-[1.125rem]" aria-hidden />
            </span>
            Mitgliedschaft beenden
          </h2>
          <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            <ReadField label="Mitgliedschaft" value={statusLabel} hint={since ? `seit ${since}` : undefined} />
            {feeStop && (
              <ReadField
                label="Bei Kündigung heute"
                value={`Kein Beitrag mehr ab ${feeStop.semester}`}
                hint={`Stichtag ${feeStop.stichtag}`}
              />
            )}
          </dl>
        </div>

        <AlertDialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full shrink-0 md:w-auto">
              Kündigen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mitgliedschaft kündigen?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-1">
                  <p>Dein Zugang zum Intranet endet sofort.</p>
                  {feeStop && <p>Ab {feeStop.semester} wird kein Beitrag mehr eingezogen.</p>}
                  <p>Rückgängig machen kann das nur der Vorstand.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirm();
                }}
                disabled={loading}
              >
                {loading ? "Wird verarbeitet…" : "Kündigen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
