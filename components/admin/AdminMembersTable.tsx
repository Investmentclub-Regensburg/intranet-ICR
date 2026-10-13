"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberRoleSelect } from "./MemberRoleSelect";
import { MemberCorrectionDialog } from "./MemberCorrectionDialog";
import { StatusPill } from "@/components/kit/StatusCard";
import { ROLE_LABELS, statusGroup } from "./format";
import type { AdminMemberRow } from "@/app/(intranet)/admin/members/actions";

type Props = {
  members: AdminMemberRow[];
  canEditRole: boolean;
};

const STATUS_PILL = {
  active: { status: "done", label: "Aktiv" },
  applicant: { status: "open", label: "Antrag offen" },
  cancelled: { status: "rejected", label: "Ausgetreten" },
} as const;

export function AdminMembersTable({ members, canEditRole }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Studiengang</TableHead>
          <TableHead>E-Mail</TableHead>
          <TableHead>Handynummer</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>{canEditRole ? "Rolle ändern" : "Rolle"}</TableHead>
          {canEditRole && <TableHead className="text-right">Daten</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const pill = STATUS_PILL[statusGroup(member)];
          return (
            <TableRow key={member.id}>
              <TableCell className="font-medium whitespace-nowrap">{member.name}</TableCell>
              <TableCell className="text-muted-foreground">{member.studiengang || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{member.email || "—"}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {member.secretsUnreadable ? (
                  <span className="text-destructive">nicht lesbar</span>
                ) : (
                  member.handynummer || "—"
                )}
              </TableCell>
              <TableCell>
                <StatusPill status={pill.status}>{pill.label}</StatusPill>
              </TableCell>
              <TableCell>
                {canEditRole ? (
                  <MemberRoleSelect member={member} />
                ) : (
                  <span>{ROLE_LABELS[member.rolle] ?? member.rolle}</span>
                )}
              </TableCell>
              {canEditRole && (
                <TableCell className="text-right">
                  <MemberCorrectionDialog profileId={member.id} name={member.name} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
