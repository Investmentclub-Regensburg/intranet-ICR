"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  decideAlumniRequest,
  type AlumniRequestDecision,
  type AlumniRequestRow,
} from "@/app/(intranet)/admin/alumni-requests/actions";

type Props = { requests: AlumniRequestRow[]; canDecide: boolean };

const STATUS_LABELS: Record<string, string> = {
  pending: "Offen",
  approved: "Freigeschaltet",
  rejected: "Abgelehnt",
};

function statusVariant(status: string) {
  if (status === "approved") return "default" as const;
  if (status === "rejected") return "secondary" as const;
  return "outline" as const;
}

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AlumniRequestsTable({ requests, canDecide }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDecision(id: string, decision: AlumniRequestDecision) {
    setBusyId(id);
    try {
      const { error } = await decideAlumniRequest(id, decision);
      if (error) {
        toast.error(error);
      } else {
        toast.success(
          decision === "approved" ? "Alumni-Status freigeschaltet." : "Antrag abgelehnt."
        );
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>E-Mail</TableHead>
          <TableHead>Beantragt am</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[220px]">Aktion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Keine Anträge.
            </TableCell>
          </TableRow>
        ) : (
          requests.map((r) => {
            const name = [r.vorname, r.nachname].filter(Boolean).join(" ") || "—";
            const pending = r.status === "pending";
            const busy = busyId === r.id;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell>{r.email || "—"}</TableCell>
                <TableCell>{formatDate(r.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {pending ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        disabled={!canDecide || busy}
                        onClick={() => handleDecision(r.id, "approved")}
                      >
                        {busy ? "…" : "Freischalten"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canDecide || busy}
                        onClick={() => handleDecision(r.id, "rejected")}
                      >
                        Ablehnen
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {r.handledAt ? `Entschieden am ${formatDate(r.handledAt)}` : "Erledigt"}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
