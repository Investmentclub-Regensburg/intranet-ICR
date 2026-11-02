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

function Phone({ member }: { member: AdminMemberRow }) {
  if (member.secretsUnreadable) return <span className="text-destructive">nicht lesbar</span>;
  return <>{member.handynummer || "—"}</>;
}

function RoleControl({ member, canEditRole }: { member: AdminMemberRow; canEditRole: boolean }) {
  if (canEditRole) return <MemberRoleSelect member={member} />;
  return <span className="text-sm">{ROLE_LABELS[member.rolle] ?? member.rolle}</span>;
}

/**
 * Unter xl (Inhalt schmaler als die Tabelle) eine Liste je Mitglied, damit Rolle und
 * Korrektur ohne seitliches Scrollen erreichbar bleiben; ab xl die Tabelle mit
 * zusammengefassten Spalten.
 */
export function AdminMembersTable({ members, canEditRole }: Props) {
  return (
    <>
      <ul className="divide-y divide-border xl:hidden">
        {members.map((member) => {
          const pill = STATUS_PILL[statusGroup(member)];
          return (
            <li
              key={member.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <p className="font-medium">{member.name}</p>
                  <StatusPill status={pill.status}>{pill.label}</StatusPill>
                </div>
                <p className="text-sm text-muted-foreground">{member.studiengang || "—"}</p>
                <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                  <span className="[overflow-wrap:anywhere]">{member.email || "—"}</span>
                  <span className="tabular-nums">
                    <Phone member={member} />
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <RoleControl member={member} canEditRole={canEditRole} />
                {canEditRole && <MemberCorrectionDialog profileId={member.id} name={member.name} />}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-5">Name</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{canEditRole ? "Rolle ändern" : "Rolle"}</TableHead>
              {canEditRole && <TableHead className="px-5 text-right">Daten</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const pill = STATUS_PILL[statusGroup(member)];
              return (
                <TableRow key={member.id}>
                  <TableCell className="px-5 py-3">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-muted-foreground">{member.studiengang || "—"}</p>
                  </TableCell>
                  <TableCell className="py-3">
                    <p className="[overflow-wrap:anywhere]">{member.email || "—"}</p>
                    <p className="text-muted-foreground tabular-nums">
                      <Phone member={member} />
                    </p>
                  </TableCell>
                  <TableCell className="py-3">
                    <StatusPill status={pill.status}>{pill.label}</StatusPill>
                  </TableCell>
                  <TableCell className="py-3">
                    <RoleControl member={member} canEditRole={canEditRole} />
                  </TableCell>
                  {canEditRole && (
                    <TableCell className="px-5 py-3 text-right">
                      <MemberCorrectionDialog profileId={member.id} name={member.name} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
