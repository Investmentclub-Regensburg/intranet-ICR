"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/kit/PageHeader";
import { staggerProps } from "@/components/kit/Reveal";
import { filtereVerzeichnis, initialen, type MemberRow } from "./directory";

function MemberTile({ member }: { member: MemberRow }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-primary"
        aria-hidden
      >
        {initialen(member.name) || "?"}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm leading-snug font-semibold [overflow-wrap:anywhere] text-foreground">{member.name}</p>
        <p className="text-xs leading-snug text-muted-foreground">{member.studiengang || "Ohne Angabe"}</p>
      </div>
    </li>
  );
}

/**
 * Mitgliederverzeichnis (Design-Runde 19.11.2026): alle aktiven Mitglieder sofort sichtbar (die Seite lädt sie
 * auf dem Server), das Feld filtert beim Tippen nach Name. Datenumfang unverändert: nur Name und Studiengang.
 */
export function MembersSearch({ members }: { members: MemberRow[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filtereVerzeichnis(members, query), [members, query]);

  return (
    <div className="space-y-6">
      <div role="search" className="relative max-w-[440px]">
        <Search
          className="pointer-events-none absolute top-1/2 left-[13px] size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Name suchen"
          aria-label="Mitglieder nach Name suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 rounded-[10px] pl-[38px]"
        />
      </div>

      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase" aria-live="polite">
        {shown.length} {shown.length === 1 ? "Mitglied" : "Mitglieder"}
      </p>

      {shown.length === 0 ? (
        <EmptyState className="border-input bg-card py-12" title="Niemanden gefunden." hint="Versuch einen anderen Namen." />
      ) : (
        <ul {...staggerProps()} className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {shown.map((m, i) => (
            <MemberTile key={`${m.name}-${i}`} member={m} />
          ))}
        </ul>
      )}
    </div>
  );
}
