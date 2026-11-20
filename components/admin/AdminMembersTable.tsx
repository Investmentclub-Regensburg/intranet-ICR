"use client";

import { ChevronDown, PencilLine } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DatenMaengelSymbol } from "./DatenMaengelSymbol";
import { statusGroup } from "./format";
import { ariaSort, rollenText, statusText, type SortSpalte, type Sortierung } from "./member-list";
import type { AdminMemberRow } from "@/app/(intranet)/admin/members/actions";

type Props = {
  /** Schon gefiltert und sortiert. */
  members: AdminMemberRow[];
  /** Nur Vorstand: Stift zum Bearbeiten. */
  canEdit: boolean;
  onEdit: (member: AdminMemberRow) => void;
  sort: Sortierung;
  onSort: (spalte: SortSpalte) => void;
};

const PILLE = {
  active: "bg-success-tint text-success",
  applicant: "bg-brand-tint text-primary",
  cancelled: "bg-muted text-muted-foreground",
} as const;

function StatusPille({ member }: { member: AdminMemberRow }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        PILLE[statusGroup(member)],
      )}
    >
      {statusText(member)}
    </span>
  );
}

function Phone({ member }: { member: AdminMemberRow }) {
  if (member.secretsUnreadable) return <span className="text-destructive">nicht lesbar</span>;
  return <>{member.handynummer || "—"}</>;
}

function EditButton({ member, onEdit }: { member: AdminMemberRow; onEdit: (m: AdminMemberRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(member)}
      aria-label={`${member.name} bearbeiten`}
      title="Bearbeiten"
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-transparent text-muted-foreground transition-colors outline-none hover:border-border hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <PencilLine className="size-4" aria-hidden />
    </button>
  );
}

function SortKopf({
  spalte,
  label,
  sort,
  onSort,
  className,
}: {
  spalte: SortSpalte;
  label: string;
  sort: Sortierung;
  onSort: (spalte: SortSpalte) => void;
  className?: string;
}) {
  const aktiv = sort.spalte === spalte;
  return (
    <TableHead aria-sort={ariaSort(sort, spalte)} className={cn("h-11 py-0", className)}>
      <button
        type="button"
        onClick={() => onSort(spalte)}
        className="group -ml-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {label}
        <ChevronDown
          aria-hidden
          strokeWidth={2.25}
          className={cn(
            "size-3.5 transition-[opacity,rotate] duration-200 motion-reduce:transition-none",
            aktiv ? "text-foreground opacity-100" : "opacity-0 group-hover:opacity-45",
            aktiv && sort.richtung === "asc" && "rotate-180",
          )}
        />
      </button>
    </TableHead>
  );
}

/**
 * Unter xl (Inhalt schmaler als die Tabelle) eine Liste je Mitglied, damit Bearbeiten ohne seitliches Scrollen
 * erreichbar bleibt; ab xl die Tabelle mit sortierbaren Spalten Name, Rolle und Status (Skizze 19.11.2026).
 * Beide zeigen dieselbe Reihenfolge (sortiert in AdminMembersWithSearch).
 */
export function AdminMembersTable({ members, canEdit, onEdit, sort, onSort }: Props) {
  return (
    <>
      <ul className="divide-y divide-border xl:hidden">
        {members.map((member) => (
          <li key={member.id} className="flex items-start gap-3 px-4 py-4 sm:items-center sm:gap-6 sm:px-5">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <p className="font-medium [overflow-wrap:anywhere]">{member.name}</p>
                <DatenMaengelSymbol felder={member.datenMaengel} name={member.name} />
                <StatusPille member={member} />
              </div>
              <p className="text-sm text-muted-foreground">
                {rollenText(member)}
                {member.studiengang ? ` · ${member.studiengang}` : ""}
              </p>
              <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                <span className="[overflow-wrap:anywhere]">{member.email || "—"}</span>
                <span className="tabular-nums">
                  <Phone member={member} />
                </span>
              </p>
            </div>
            {canEdit && <EditButton member={member} onEdit={onEdit} />}
          </li>
        ))}
      </ul>

      <div className="hidden xl:block">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col />
            <col className="w-[120px]" />
            <col className="w-[140px]" />
            {canEdit && <col className="w-16" />}
          </colgroup>
          <TableHeader className="bg-transparent text-xs normal-case">
            <TableRow className="hover:bg-transparent">
              <SortKopf spalte="name" label="Name" sort={sort} onSort={onSort} className="pl-5" />
              <TableHead className="h-11 py-0 text-xs font-medium">Kontakt</TableHead>
              <SortKopf spalte="rolle" label="Rolle" sort={sort} onSort={onSort} />
              <SortKopf spalte="status" label="Status" sort={sort} onSort={onSort} />
              {canEdit && (
                <TableHead className="h-11 py-0">
                  <span className="sr-only">Bearbeiten</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-border/60">
            {members.map((member) => (
              <TableRow key={member.id} className="h-16 transition-colors hover:bg-muted/30">
                <TableCell className="py-3 pl-5">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium [overflow-wrap:anywhere]">{member.name}</p>
                    <DatenMaengelSymbol felder={member.datenMaengel} name={member.name} />
                  </div>
                  <p className="text-[0.8125rem] text-muted-foreground">{member.studiengang || "—"}</p>
                </TableCell>
                <TableCell className="py-3">
                  <p className="[overflow-wrap:anywhere]">{member.email || "—"}</p>
                  <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
                    <Phone member={member} />
                  </p>
                </TableCell>
                <TableCell className="py-3">{rollenText(member)}</TableCell>
                <TableCell className="py-3">
                  <StatusPille member={member} />
                </TableCell>
                {canEdit && (
                  <TableCell className="py-3 pr-3.5 text-right">
                    <EditButton member={member} onEdit={onEdit} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
