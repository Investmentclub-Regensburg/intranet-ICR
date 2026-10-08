"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, GraduationCap, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { Tile, TileGrid } from "@/components/kit/Tile";
import { ConfirmDialog, SectionHead, StatusPill } from "./bits";
import { formatDay } from "./format";
import {
  decideMembershipApplication,
  type MembershipApplicationRow,
  type MembershipDecision,
} from "@/app/(intranet)/admin/members/actions";

type Pending = { row: MembershipApplicationRow; decision: MembershipDecision } | null;

/** Freigabe-Liste für neue Registrierungen (Status „applicant“). Entscheiden nur der Vorstand. */
export function MembershipApplications({
  applications,
  canDecide,
}: {
  applications: MembershipApplicationRow[];
  canDecide: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);

  async function decide(): Promise<string> {
    if (!pending) return "";
    const { error } = await decideMembershipApplication(pending.row.id, pending.decision);
    if (error) return error;
    toast.success(pending.decision === "approve" ? `${pending.row.name} ist jetzt Mitglied.` : "Antrag abgelehnt.");
    router.refresh();
    return "";
  }

  return (
    <section aria-labelledby="mitgliedsantraege" className="scroll-mt-6 space-y-5">
      <SectionHead
        id="mitgliedsantraege"
        title="Mitgliedsanträge"
        count={applications.length}
        action={
          !canDecide && applications.length > 0 ? (
            <span className="text-xs text-muted-foreground">Freigeben kann nur der Vorstand.</span>
          ) : undefined
        }
      />

      {applications.length === 0 ? (
        <EmptyState title="Keine offenen Mitgliedsanträge." hint="Neue Registrierungen erscheinen hier zur Freigabe." />
      ) : (
        <TileGrid>
          {applications.map((a) => {
            const study = [a.studiengang, a.hochschule].filter(Boolean).join(" · ");
            return (
              <Tile
                key={a.id}
                Icon={UserPlus}
                title={a.name}
                meta={
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="size-3.5 shrink-0" aria-hidden />
                    {study || "Ohne Studienangabe"}
                  </span>
                }
                actions={
                  canDecide ? (
                    <>
                      <IconButton
                        label={`Antrag von ${a.name} annehmen`}
                        variant="outline"
                        onClick={() => setPending({ row: a, decision: "approve" })}
                      >
                        <Check />
                      </IconButton>
                      <IconButton
                        label={`Antrag von ${a.name} ablehnen`}
                        variant="danger"
                        onClick={() => setPending({ row: a, decision: "reject" })}
                      >
                        <X />
                      </IconButton>
                    </>
                  ) : undefined
                }
                footer={
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden />
                      Beantragt am {formatDay(a.datumAntrag)}
                    </span>
                    <StatusPill tone="open">Offen</StatusPill>
                  </span>
                }
              />
            );
          })}
        </TileGrid>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.decision === "reject" ? "Antrag ablehnen?" : "Antrag annehmen?"}
        description={
          pending?.decision === "reject"
            ? `${pending.row.name} bekommt keinen Zugang. Das Profil wird als ausgetreten geführt, der Vorstand bekommt dazu die übliche Kündigungsmail.`
            : `${pending?.row.name ?? ""} kann sich danach im Intranet anmelden.`
        }
        confirmLabel={pending?.decision === "reject" ? "Ablehnen" : "Annehmen"}
        busyLabel="Wird gespeichert…"
        destructive={pending?.decision === "reject"}
        onConfirm={decide}
      />
    </section>
  );
}
