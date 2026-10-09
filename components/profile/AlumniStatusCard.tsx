"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
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
import { StatusCard } from "@/components/kit/StatusCard";
import { requestAlumniStatus, type AlumniRequestStatus } from "@/app/(intranet)/profile/actions";

export type AlumniInfo = {
  status: AlumniRequestStatus;
  /** ISO-Zeitpunkte aus alumni_requests (created_at, handled_at) oder null */
  requestedAt: string | null;
  decidedAt: string | null;
};

/**
 * Alumni-Status als Status-Kachel: beantragt am …, freigeschaltet bzw. abgelehnt am …
 * Beantragen mit Bestätigung. Logik wie bisher (requestAlumniStatus; die Freigabe durch
 * den Vorstand setzt die Rolle auf alumni).
 */
export function AlumniStatusCard({ rolle, info }: { rolle: string; info: AlumniInfo }) {
  if (rolle === "alumni") {
    return (
      <StatusCard
        status="done"
        Icon={GraduationCap}
        title="Alumni-Status"
        statusLabel="Freigeschaltet"
        date={info.status === "approved" ? info.decidedAt : null}
        dateLabel="Freigeschaltet am"
        className="h-full"
      />
    );
  }

  if (info.status === "pending") {
    return (
      <StatusCard
        status="open"
        title="Alumni-Status"
        statusLabel="Beantragt"
        date={info.requestedAt}
        next="Der Vorstand prüft deinen Antrag."
        className="h-full"
      />
    );
  }

  if (info.status === "rejected") {
    return (
      <StatusCard
        status="rejected"
        title="Alumni-Status"
        statusLabel="Abgelehnt"
        date={info.decidedAt}
        action={<RequestButton again />}
        className="h-full"
      />
    );
  }

  return (
    <section className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="tile-icon size-11 rounded-xl">
          <GraduationCap className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base leading-snug font-bold tracking-[-0.02em]">Alumni-Status</h2>
          <p className="text-sm text-muted-foreground">Studium abgeschlossen? Dann wechsle zu den Alumni.</p>
        </div>
      </div>
      <div className="shrink-0">
        <RequestButton />
      </div>
    </section>
  );
}

function RequestButton({ again = false }: { again?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await requestAlumniStatus();
      if (result.success) {
        setOpen(false);
        toast.success("Antrag gestellt.");
        router.refresh();
      } else if (result.error.includes("bereits einen offenen Antrag")) {
        setOpen(false);
        toast.info(result.error);
        router.refresh();
      } else {
        toast.error(result.error || "Ein Fehler ist aufgetreten.");
      }
    } catch {
      toast.error("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button variant={again ? "outline" : "default"} className="w-full sm:w-auto">
          {again ? "Erneut beantragen" : "Beantragen"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alumni-Status beantragen?</AlertDialogTitle>
          <AlertDialogDescription>Der Vorstand prüft deinen Antrag.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading}
          >
            {loading ? "Wird gesendet…" : "Beantragen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
