"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, GraduationCap, X } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { Segmented } from "@/components/kit/Segmented";
import { Tile, TileGrid } from "@/components/kit/Tile";
import {
  decideAlumniRequest,
  type AlumniRequestDecision,
  type AlumniRequestRow,
} from "@/app/(intranet)/admin/alumni-requests/actions";
import { StatusPill } from "@/components/kit/StatusCard";
import { ConfirmDialog } from "./bits";
import { formatDay } from "./format";

type Pending = { row: AlumniRequestRow; decision: AlumniRequestDecision } | null;

/** Alumni-Anträge als Kacheln. Entscheiden nur der Vorstand (wie bisher). */
export function AlumniRequests({ requests, canDecide }: { requests: AlumniRequestRow[]; canDecide: boolean }) {
  const router = useRouter();
  const open = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");
  const [filter, setFilter] = useState<"open" | "done">("open");
  const [pending, setPending] = useState<Pending>(null);
  const list = filter === "open" ? open : done;

  const nameOf = (r: AlumniRequestRow) => [r.vorname, r.nachname].filter(Boolean).join(" ") || "—";

  async function decide(): Promise<string> {
    if (!pending) return "";
    const { error } = await decideAlumniRequest(pending.row.id, pending.decision);
    if (error) return error;
    toast.success(pending.decision === "approved" ? "Alumni-Status freigeschaltet." : "Antrag abgelehnt.");
    router.refresh();
    return "";
  }

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Alumni-Anträge</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          layoutId="alumni-filter"
          ariaLabel="Filter"
          options={[
            { key: "open", label: `Offen ${open.length}` },
            { key: "done", label: `Erledigt ${done.length}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {!canDecide && open.length > 0 && (
          <span className="text-xs text-muted-foreground">Entscheiden kann nur der Vorstand.</span>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "Keine offenen Anträge." : "Noch nichts entschieden."}
          hint={filter === "open" ? "Mitglieder beantragen den Alumni-Status in ihrem Profil." : undefined}
        />
      ) : (
        <TileGrid>
          {list.map((r) => {
            const name = nameOf(r);
            const isOpen = r.status === "pending";
            return (
              <Tile
                key={r.id}
                Icon={GraduationCap}
                title={name}
                meta={r.email || "—"}
                actions={
                  isOpen && canDecide ? (
                    <>
                      <IconButton
                        label={`${name} als Alumni freischalten`}
                        variant="outline"
                        onClick={() => setPending({ row: r, decision: "approved" })}
                      >
                        <Check />
                      </IconButton>
                      <IconButton
                        label={`Antrag von ${name} ablehnen`}
                        variant="danger"
                        onClick={() => setPending({ row: r, decision: "rejected" })}
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
                      {isOpen
                        ? `Beantragt am ${formatDay(r.createdAt)}`
                        : `Entschieden am ${formatDay(r.handledAt ?? r.createdAt)}`}
                    </span>
                    {isOpen ? (
                      <StatusPill status="open" />
                    ) : r.status === "approved" ? (
                      <StatusPill status="done">Freigeschaltet</StatusPill>
                    ) : (
                      <StatusPill status="rejected" />
                    )}
                  </span>
                }
              />
            );
          })}
        </TileGrid>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.decision === "rejected" ? "Antrag ablehnen?" : "Als Alumni freischalten?"}
        description={
          pending?.decision === "rejected"
            ? `${pending ? nameOf(pending.row) : ""} bleibt Mitglied und bekommt eine Mail mit der Entscheidung.`
            : `${pending ? nameOf(pending.row) : ""} wird Alumni und bekommt eine Mail mit der Entscheidung.`
        }
        confirmLabel={pending?.decision === "rejected" ? "Ablehnen" : "Freischalten"}
        busyLabel="Wird gespeichert…"
        destructive={pending?.decision === "rejected"}
        onConfirm={decide}
      />
    </div>
  );
}
