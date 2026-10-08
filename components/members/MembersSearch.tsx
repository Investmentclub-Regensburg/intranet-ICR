"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { Segmented } from "@/components/kit/Segmented";
import { staggerProps } from "@/components/kit/Reveal";
import { cn } from "@/lib/utils";
import { searchMembers, getAllMembers, type MemberRow } from "@/app/(intranet)/members/actions";

type Mode = "search" | "all";

const MODES = [
  { key: "search", label: "Suchen" },
  { key: "all", label: "Alle anzeigen" },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MemberTile({ member }: { member: MemberRow }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-primary"
        aria-hidden
      >
        {initials(member.name) || "?"}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
        <p className="truncate text-xs text-muted-foreground">{member.studiengang || "Ohne Angabe"}</p>
      </div>
    </li>
  );
}

/**
 * Mitgliederverzeichnis: Suche oben (Enter oder Lupe, Server-Suche wie bisher),
 * „Alle anzeigen“ als Segment-Schalter. In „Alle“ filtert das Feld sofort in der
 * geladenen Liste. Datenumfang unverändert: nur Name und Studiengang.
 */
export function MembersSearch() {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (mode === "all") return; // filtert lokal
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      setResults(await searchMembers(query));
    } finally {
      setLoading(false);
    }
  }

  async function changeMode(next: Mode) {
    setMode(next);
    setResults(null);
    if (next === "all") {
      setLoading(true);
      try {
        setResults(await getAllMembers());
      } finally {
        setLoading(false);
      }
    }
  }

  const shown = useMemo(() => {
    if (!results) return null;
    if (mode !== "all") return results;
    const q = query.trim().toLowerCase();
    return q ? results.filter((m) => m.name.toLowerCase().includes(q)) : results;
  }, [results, mode, query]);

  return (
    <div className="space-y-6">
      <form
        onSubmit={runSearch}
        role="search"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder={mode === "all" ? "In der Liste filtern …" : "Name eingeben …"}
            aria-label="Mitglieder nach Name suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pr-12 pl-9"
          />
          {mode === "search" && (
            <IconButton
              type="submit"
              label="Suchen"
              disabled={loading}
              className="absolute top-1/2 right-1 -translate-y-1/2"
            >
              <Search />
            </IconButton>
          )}
        </div>
        <Segmented
          options={MODES}
          value={mode}
          onChange={changeMode}
          layoutId="members-mode"
          ariaLabel="Ansicht"
          className="self-start sm:self-auto"
        />
      </form>

      <div aria-live="polite" className={cn("transition-opacity", loading && "opacity-50")}>
        {shown === null ? (
          loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p>
          ) : (
            <EmptyState title="Wen suchst du?" hint="Gib einen Namen ein oder lass dir alle Mitglieder anzeigen." />
          )
        ) : shown.length === 0 ? (
          <EmptyState
            title="Niemanden gefunden."
            hint={mode === "all" ? "Versuch einen anderen Namen." : "Versuch einen anderen Namen oder zeig alle an."}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {shown.length} {shown.length === 1 ? "Mitglied" : "Mitglieder"}
            </p>
            <ul {...staggerProps()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((m, i) => (
                <MemberTile key={`${m.name}-${i}`} member={m} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
