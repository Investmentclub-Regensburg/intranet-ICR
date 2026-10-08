"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Clock, GraduationCap, type LucideIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { requestAlumniStatus, type AlumniRequestStatus } from "@/app/(intranet)/profile/actions";

export type AlumniInfo = {
  status: AlumniRequestStatus;
  /** fertig formatiert (dd.mm.yyyy) oder null */
  requestedAt: string | null;
  decidedAt: string | null;
};

type Phase = "none" | "pending" | "approved" | "rejected";

/**
 * Status-Kachel Alumni: zeigt, wo der Antrag steht (beantragt am …, entschieden am …),
 * und bietet das Beantragen mit Bestätigung an. Logik wie bisher (requestAlumniStatus,
 * Freigabe durch den Vorstand setzt die Rolle auf alumni).
 */
export function AlumniStatusCard({ rolle, info }: { rolle: string; info: AlumniInfo }) {
  const phase: Phase =
    rolle === "alumni"
      ? "approved"
      : info.status === "pending" || info.status === "rejected"
        ? info.status
        : "none";

  const steps: { Icon: LucideIcon; label: string; date: string | null; done: boolean }[] = [];
  if (phase !== "none" && info.requestedAt) {
    steps.push({ Icon: CircleCheck, label: "Beantragt", date: info.requestedAt, done: true });
  }
  if (phase === "pending") {
    steps.push({ Icon: Clock, label: "Entscheidung des Vorstands", date: "offen", done: false });
  } else if (phase === "approved") {
    steps.push({
      Icon: CircleCheck,
      label: "Freigeschaltet",
      date: info.status === "approved" ? info.decidedAt : null,
      done: true,
    });
  } else if (phase === "rejected") {
    steps.push({ Icon: CircleX, label: "Abgelehnt", date: info.decidedAt, done: false });
  }

  return (
    <section
      aria-labelledby="alumni-title"
      className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="alumni-title" className="flex items-center gap-3 text-base font-bold tracking-[-0.02em]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-tint text-primary">
            <GraduationCap className="size-[1.125rem]" aria-hidden />
          </span>
          Alumni-Status
        </h2>
        <StatusPill phase={phase} />
      </div>

      {steps.length > 0 ? (
        <ol className="space-y-3">
          {steps.map(({ Icon, label, date, done }) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <Icon
                className={cn("size-[1.125rem] shrink-0", done ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className={cn("font-medium", done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {date && <span className="ml-auto text-muted-foreground tabular-nums">{date}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Studium abgeschlossen? Dann wechsle zu den Alumni.</p>
      )}

      {(phase === "none" || phase === "rejected") && (
        <div className="mt-auto">
          <RequestButton again={phase === "rejected"} />
        </div>
      )}
    </section>
  );
}

function StatusPill({ phase }: { phase: Phase }) {
  if (phase === "none") return null;
  const map = {
    pending: { label: "In Prüfung", cls: "bg-secondary text-foreground" },
    approved: { label: "Freigeschaltet", cls: "bg-brand-tint text-primary" },
    rejected: { label: "Abgelehnt", cls: "bg-secondary text-muted-foreground" },
  } as const;
  const { label, cls } = map[phase];
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", cls)}>
      {label}
    </span>
  );
}

function RequestButton({ again }: { again: boolean }) {
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
          <GraduationCap aria-hidden />
          {again ? "Erneut beantragen" : "Alumni-Status beantragen"}
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
