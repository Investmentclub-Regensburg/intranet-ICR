"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/kit/PageHeader";
import { AdminMembersTable } from "./AdminMembersTable";
import { FilterChips } from "./bits";
import { passtDatenFilter, statusGroup, type DatenFilter } from "./format";
import type { AdminMemberRow } from "@/app/(intranet)/admin/members/actions";

type RoleKey = "all" | "member" | "admin" | "board" | "alumni";
type StatusKey = "all" | "active" | "cancelled";

type Props = {
  members: AdminMemberRow[];
  canEditRole: boolean;
  /** Nur Vorstand: Filter „Daten unvollständig“ (die Feldnamen liefert der Server ohnehin nur dem Vorstand). */
  showDataIssues?: boolean;
};

export function AdminMembersWithSearch({ members, canEditRole, showDataIssues = false }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleKey>("all");
  const [status, setStatus] = useState<StatusKey>("all");
  const [daten, setDaten] = useState<DatenFilter>("all");


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
          ["cancelled", "Ausgetreten"],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        count: key === "all" ? members.length : members.filter((m) => statusGroup(m) === key).length,
      })),
    [members],
  );

  // Filter „Daten“: „Nicht bestätigt“ nur, wenn der Stand bekannt ist (Spalte vorhanden), „Daten
  // unvollständig“ nur für den Vorstand.
  const datenOptions = useMemo(() => {
    const keys: DatenFilter[] = ["all"];
    if (members.some((m) => m.bestaetigungOffen !== null)) keys.push("unbestaetigt");
    if (showDataIssues) keys.push("unvollstaendig");
    const labels: Record<DatenFilter, string> = {
      all: "Alle",
      unbestaetigt: "Nicht bestätigt",
      unvollstaendig: "Daten unvollständig",
    };
    return keys.map((key) => ({
      key,
      label: labels[key],
      count: members.filter((m) => passtDatenFilter(m, key)).length,
    }));
  }, [members, showDataIssues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter(
      (m) =>
        (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) &&
        (role === "all" || m.rolle === role) &&
        (status === "all" || statusGroup(m) === status) &&
        passtDatenFilter(m, daten),
    );
  }, [members, query, role, status, daten]);

  const hasFilters = Boolean(query.trim()) || role !== "all" || status !== "all" || daten !== "all";

  return (
    <div className="space-y-5">
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
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-8">
          <FilterChips label="Rolle" options={roleOptions} value={role} onChange={setRole} />
          <FilterChips label="Status" options={statusOptions} value={status} onChange={setStatus} />
          {datenOptions.length > 1 && (
            <FilterChips label="Daten" options={datenOptions} value={daten} onChange={setDaten} />
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {hasFilters ? `${filtered.length} von ${members.length} Einträgen` : `${members.length} Einträge`}
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
