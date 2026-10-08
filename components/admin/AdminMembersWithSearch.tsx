"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/kit/PageHeader";
import { AdminMembersTable } from "./AdminMembersTable";
import { FilterChips } from "./bits";
import { statusGroup } from "./format";
import type { AdminMemberRow } from "@/app/(intranet)/admin/members/actions";

type RoleKey = "all" | "member" | "admin" | "board" | "alumni";
type StatusKey = "all" | "active" | "applicant" | "cancelled";

type Props = {
  members: AdminMemberRow[];
  canEditRole: boolean;
};

export function AdminMembersWithSearch({ members, canEditRole }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleKey>("all");
  const [status, setStatus] = useState<StatusKey>("all");

  const count = (pred: (m: AdminMemberRow) => boolean) => members.filter(pred).length;

  const roleOptions = useMemo(
    () =>
      (
        [
          ["all", "Alle"],
          ["member", "Mitglied"],
          ["admin", "Admin"],
          ["board", "Vorstand"],
          ["alumni", "Alumni"],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        count: key === "all" ? members.length : members.filter((m) => m.rolle === key).length,
      })),
    [members],
  );

  const statusOptions = useMemo(
    () =>
      (
        [
          ["all", "Alle"],
          ["active", "Aktiv"],
          ["applicant", "Antrag offen"],
          ["cancelled", "Ausgetreten"],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        count: key === "all" ? members.length : members.filter((m) => statusGroup(m) === key).length,
      })),
    [members],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter(
      (m) =>
        (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) &&
        (role === "all" || m.rolle === role) &&
        (status === "all" || statusGroup(m) === status),
    );
  }, [members, query, role, status]);

  const hasFilters = Boolean(query.trim()) || role !== "all" || status !== "all";

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Mitglieder</h1>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Name oder E-Mail suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9"
            aria-label="Mitglieder suchen"
          />
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
          <FilterChips label="Rolle" options={roleOptions} value={role} onChange={setRole} />
          <FilterChips label="Status" options={statusOptions} value={status} onChange={setStatus} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {hasFilters ? `${filtered.length} von ${members.length} Einträgen` : `${members.length} Einträge`}
        {count((m) => m.status === "applicant") > 0 && status !== "applicant" && (
          <> · {count((m) => m.status === "applicant")} mit offenem Antrag</>
        )}
      </p>

      {filtered.length === 0 ? (
        <EmptyState title={hasFilters ? "Niemand passt zu den Filtern." : "Keine Mitglieder gefunden."} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <AdminMembersTable members={filtered} canEditRole={canEditRole} />
        </div>
      )}
    </div>
  );
}
