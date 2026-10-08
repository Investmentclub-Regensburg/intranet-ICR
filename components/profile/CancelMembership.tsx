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
import { StatusCard, type StatusVariant } from "@/components/kit/StatusCard";
import { cancelMembership } from "@/app/(intranet)/profile/actions";
import type { FeeStop } from "@/components/profile/profile-format";

/**
 * Mitgliedschaft als Status-Kachel mit dezentem „Kündigen“ (neutral, kein Alarm-Rot)
 * und Bestätigungs-Modal. Logik wie bisher (cancelMembership: Status gekündigt,
 * Kündigungsdatum heute, Abmeldung, Weiterleitung zum Login).
 * `feeStop` kommt aus denselben Stichtagen wie der Finanzexport; null = kein Beitrag
 * (Alumni), dann entfällt der Satz.
 */
export function CancelMembership({
  statusLabel,
  status,
  since,
  feeStop,
}: {
  statusLabel: string;
  status: StatusVariant;
  /** ISO-Datum des Mitgliedsantrags oder null */
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
    <StatusCard
      status={status}
      title="Mitgliedschaft"
      statusLabel={statusLabel}
      date={since}
      dateLabel="Mitglied seit"
      next={
        feeStop
          ? `Kündigst du heute, wird ab ${feeStop.semester} kein Beitrag mehr eingezogen (Stichtag ${feeStop.stichtag}).`
          : undefined
      }
      action={
        <AlertDialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
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
      }
    />
  );
}
