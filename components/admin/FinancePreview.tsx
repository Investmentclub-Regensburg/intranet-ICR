"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarOff,
  GraduationCap,
  Loader2,
  MinusCircle,
  Search,
  Undo2,
  UserMinus,
  UserPlus,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { cn } from "@/lib/utils";
import { formatDay } from "./format";
import type {
  FilterStats,
  FinanceCategory,
  FinanceOverrideAction,
  FinancePreviewRow,
} from "@/app/(intranet)/admin/actions/finance";

// Vorschau des Beitragseinzugs: Kennzahlen als Filter (Klick zeigt die Einträge), Suche über
// alle Profile und manuelle Anpassungen je Semester (entfernen, Freisemester, aufnehmen).
// Die Anpassungen liegen in finance_export_overrides und gelten auch für den Export.

type CategoryMeta = { label: string; hint: string; Icon: LucideIcon; badge?: string };

const CATEGORIES: Record<FinanceCategory, CategoryMeta> = {
  debit: { label: "Lastschriften", badge: "Lastschrift", hint: "Werden eingezogen.", Icon: WalletCards },
  alumni: { label: "Alumni", hint: "Alumni zahlen keinen Beitrag.", Icon: GraduationCap },
  cancelled: { label: "Gekündigt", hint: "Kündigung vor dem Stichtag.", Icon: UserMinus },
  free_semester: {
    label: "Freisemester",
    hint: "Eintritt ab dem Stichtag oder manuell gesetzt.",
    Icon: CalendarOff,
  },
  no_iban: { label: "Ohne IBAN", hint: "Keine Bankverbindung hinterlegt.", Icon: MinusCircle },
  invalid: { label: "Bankdaten ungültig", hint: "IBAN oder BIC fehlerhaft, bitte nachfragen.", Icon: AlertTriangle },
  removed: { label: "Entfernt", hint: "Manuell aus diesem Einzug genommen.", Icon: X },
};

const ACTION_LEGEND: { Icon: LucideIcon; text: string }[] = [
  { Icon: CalendarOff, text: "Freisemester geben" },
  { Icon: UserMinus, text: "Aus dem Einzug entfernen" },
  { Icon: UserPlus, text: "In den Einzug aufnehmen" },
  { Icon: Undo2, text: "Anpassung zurücksetzen" },
];

const FILTER_ORDER: FinanceCategory[] = ["alumni", "cancelled", "free_semester", "no_iban", "invalid", "removed"];

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function FinancePreview({
  rows,
  stats,
  editable,
  periodLabel,
  pendingId,
  onOverride,
}: {
  rows: FinancePreviewRow[];
  stats: FilterStats;
  /** false, solange die Tabelle für Anpassungen fehlt. */
  editable: boolean;
  /** z. B. „WS26/27“ */
  periodLabel: string;
  /** Profil, dessen Anpassung gerade gespeichert wird. */
  pendingId: string | null;
  onOverride: (row: FinancePreviewRow, action: FinanceOverrideAction | null) => void;
}) {
  const [filter, setFilter] = useState<FinanceCategory>("debit");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const sum = stats.debit * (rows.find((r) => r.category === "debit")?.amount ?? 15);

  const visible = useMemo(() => {
    if (q) {
      // Suche läuft über alle Profile, damit man auch Ausgefilterte findet und aufnehmen kann.
      return rows.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(q));
    }
    return rows.filter((r) => r.category === filter);
  }, [rows, filter, q]);

  const meta = CATEGORIES[filter];

  return (
    <div className="space-y-6">
      {/* Kennzahlen: Lastschriften groß, darunter bzw. daneben die ausgefilterten Gruppen. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <button
          type="button"
          onClick={() => {
            setFilter("debit");
            setQuery("");
          }}
          aria-pressed={filter === "debit" && !q}
          className={cn(
            "group flex flex-col justify-between gap-6 rounded-2xl border bg-card p-5 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-6",
            filter === "debit" && !q
              ? "border-primary/70 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]"
              : "border-border hover:border-edge",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <WalletCards className="size-4" aria-hidden />
              Lastschriften {periodLabel}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {stats.total} Profile
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <p className="text-5xl leading-none font-semibold tracking-[-0.04em] text-foreground tabular-nums">
                {stats.debit}
              </p>
              <div className="text-right">
                <p className="text-xl font-semibold tracking-[-0.02em] text-foreground tabular-nums">{euro(sum)}</p>
                <p className="text-xs text-muted-foreground">Summe des Einzugs</p>
              </div>
            </div>
            {/* Anteil der Profile, die eingezogen werden */}
            <div className="space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${stats.total ? Math.round((stats.debit / stats.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {stats.total ? Math.round((stats.debit / stats.total) * 100) : 0} % der Profile werden eingezogen
              </p>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FILTER_ORDER.map((key) => {
            const c = CATEGORIES[key];
            const active = filter === key && !q;
            const count = stats[key];
            const warn = key === "invalid" && count > 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(key);
                  setQuery("");
                }}
                aria-pressed={active}
                className={cn(
                  "flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  active ? "border-primary/70 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]" : "border-border hover:border-edge",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border",
                    warn
                      ? "border-destructive/25 bg-destructive/10 text-destructive"
                      : "border-border bg-background text-ink-soft",
                  )}
                >
                  <c.Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-2xl leading-none font-semibold tracking-[-0.03em] tabular-nums",
                      count === 0 ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {count}
                  </span>
                  <span className="mt-1.5 block truncate text-sm text-muted-foreground">{c.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!editable && (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Anpassungen (entfernen, Freisemester, aufnehmen) sind möglich, sobald die Migration{" "}
          <code className="text-xs">finance_export_overrides</code> in der Datenbank ausgeführt ist.
        </p>
      )}

      {/* Liste der gewählten Gruppe bzw. Suchergebnis */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="finance-list-title">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h3 id="finance-list-title" className="font-semibold tracking-[-0.01em]">
              {q ? "Suche in allen Profilen" : meta.label}
              <span className="ml-2 font-normal text-muted-foreground tabular-nums">{visible.length}</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              {q ? "Auch ausgefilterte Mitglieder lassen sich hier aufnehmen." : meta.hint}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mitglied suchen…"
              aria-label="Mitglied suchen"
              className="pl-9"
            />
          </div>
        </div>

        {editable && (
          // Legende der Aktionen: auf Touch-Geräten gibt es keinen Tooltip.
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            {ACTION_LEGEND.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5">
                <Icon className="size-3.5" aria-hidden />
                {text}
              </li>
            ))}
            <li className="text-muted-foreground/80">Gilt nur für dieses Semester und den Export.</li>
          </ul>
        )}

        {visible.length === 0 ? (
          <EmptyState
            className="py-12"
            title={q ? "Niemand gefunden." : `Keine Einträge in „${meta.label}“.`}
            hint={q ? "Vor- oder Nachname prüfen." : undefined}
          />
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Name</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Eintritt</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">IBAN</th>
                  <th className="px-3 py-2.5 text-right font-medium">Betrag</th>
                  {editable && <th className="w-px px-4 py-2.5 sm:px-5"><span className="sr-only">Aktionen</span></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 sm:px-5">
                      <p className="font-medium text-foreground">
                        {row.firstName} {row.lastName}
                      </p>
                      {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <CategoryBadge category={row.category} manual={row.override !== null} />
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground tabular-nums md:table-cell">
                      {formatDay(row.joinedAt)}
                    </td>
                    <td className="hidden px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                      {row.iban || "–"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {row.category === "debit" ? euro(row.amount) : <span className="text-muted-foreground">–</span>}
                    </td>
                    {editable && (
                      <td className="px-4 py-1.5 sm:px-5">
                        <RowActions row={row} busy={pendingId === row.id} onOverride={onOverride} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryBadge({ category, manual }: { category: FinanceCategory; manual: boolean }) {
  const tone =
    category === "debit"
      ? "bg-success-tint text-success"
      : category === "invalid"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-ink-soft";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{CATEGORIES[category].badge ?? CATEGORIES[category].label}</span>
      {manual && (
        <span className="text-xs text-muted-foreground" title="Manuell für dieses Semester angepasst">
          manuell
        </span>
      )}
    </span>
  );
}

/** Aktionen je nach Lage: Lastschrift → Freisemester/entfernen; ausgefiltert → aufnehmen; angepasst → zurücksetzen. */
function RowActions({
  row,
  busy,
  onOverride,
}: {
  row: FinancePreviewRow;
  busy: boolean;
  onOverride: (row: FinancePreviewRow, action: FinanceOverrideAction | null) => void;
}) {
  if (busy) {
    return (
      <span className="flex size-9 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-label="Wird gespeichert" />
      </span>
    );
  }
  const name = `${row.firstName} ${row.lastName}`;
  const canInclude =
    row.override === null && (row.category === "alumni" || row.category === "cancelled" || row.category === "free_semester");
  return (
    <div className="flex items-center justify-end gap-0.5">
      {row.category === "debit" && (
        <>
          <IconButton
            label={`${name}: Freisemester`}
            hint="Freisemester geben: in diesem Semester kein Beitrag"
            onClick={() => onOverride(row, "free_semester")}
          >
            <CalendarOff />
          </IconButton>
          <IconButton
            label={`${name}: aus dem Einzug entfernen`}
            hint="Aus dem Einzug entfernen (nur dieses Semester)"
            variant="danger"
            onClick={() => onOverride(row, "exclude")}
          >
            <UserMinus />
          </IconButton>
        </>
      )}
      {canInclude && (
        <IconButton
          label={`${name}: in den Einzug aufnehmen`}
          hint="In den Einzug aufnehmen: Beitrag wird in diesem Semester trotzdem eingezogen"
          onClick={() => onOverride(row, "include")}
        >
          <UserPlus />
        </IconButton>
      )}
      {row.override !== null && (
        <IconButton
          label={`${name}: Anpassung zurücksetzen`}
          hint="Anpassung zurücksetzen: wieder nach den automatischen Regeln"
          onClick={() => onOverride(row, null)}
        >
          <Undo2 />
        </IconButton>
      )}
    </div>
  );
}
