"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ListFilter, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/kit/PageHeader";
import { SELECT_CLASS } from "@/components/member/MemberInputs";
import { cn } from "@/lib/utils";
import { AdminMembersTable } from "./AdminMembersTable";
import { MemberCorrectionDialog } from "./MemberCorrectionDialog";
import { datenLesbarkeit, passtDatenFilter, statusGroup, type DatenFilter } from "./format";
import {
  ROLLEN,
  STANDARD_SORTIERUNG,
  STATUS_GRUPPEN,
  filterAbweichungen,
  filtereMitglieder,
  naechsteSortierung,
  rolleVon,
  sortiereMitglieder,
  standardFilter,
  umschalten,
  type MitgliederFilter,
  type SortRichtung,
  type SortSpalte,
  type Sortierung,
} from "./member-list";
import type { AdminMemberRow } from "@/app/(intranet)/admin/members/actions";

type Props = {
  members: AdminMemberRow[];
  /** Nur Vorstand: Bearbeiten (Rolle, Status, Daten). Der Server prüft das selbst. */
  canEditRole: boolean;
  /** Nur Vorstand: Filter „Daten unvollständig“ (die Feldnamen liefert der Server ohnehin nur dem Vorstand). */
  showDataIssues?: boolean;
};

const ROLLEN_LABEL: Record<(typeof ROLLEN)[number], string> = {
  member: "Mitglied",
  admin: "Admin",
  board: "Vorstand",
  alumni: "Alumni",
};

const STATUS_LABEL = { active: "Aktiv", applicant: "Antrag offen", cancelled: "Ausgetreten" } as const;

const DATEN_LABEL: Record<DatenFilter, string> = {
  all: "Alle",
  unbestaetigt: "Nicht bestätigt",
  unvollstaendig: "Unvollständig",
};

const SORTIER_OPTIONEN: { spalte: SortSpalte; richtung: SortRichtung; label: string }[] = [
  { spalte: "name", richtung: "asc", label: "Name A–Z" },
  { spalte: "name", richtung: "desc", label: "Name Z–A" },
  { spalte: "rolle", richtung: "asc", label: "Rolle A–Z" },
  { spalte: "rolle", richtung: "desc", label: "Rolle Z–A" },
  { spalte: "status", richtung: "asc", label: "Status A–Z" },
  { spalte: "status", richtung: "desc", label: "Status Z–A" },
];

function mitgliederText(n: number): string {
  return `${n} ${n === 1 ? "Mitglied" : "Mitglieder"}`;
}

export function AdminMembersWithSearch({ members, canEditRole, showDataIssues = false }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MitgliederFilter>(standardFilter);
  const [sort, setSort] = useState<Sortierung>(STANDARD_SORTIERUNG);
  const [leisteOffen, setLeisteOffen] = useState(false);
  // Bearbeiten-Fenster: Stand beim Öffnen; `n` hängt das Fenster je Öffnung neu ein. Es liegt außerhalb der
  // Zeilen, damit es offen bleibt, wenn die Zeile nach dem Speichern aus dem Filter fällt (z. B. ausgetreten).
  const [bearbeiten, setBearbeiten] = useState<{ member: AdminMemberRow; n: number } | null>(null);
  const [fensterOffen, setFensterOffen] = useState(false);

  const rollenOptionen = useMemo(
    () => ROLLEN.map((key) => ({ key, label: ROLLEN_LABEL[key], count: members.filter((m) => rolleVon(m) === key).length })),
    [members],
  );

  const statusOptionen = useMemo(
    () =>
      STATUS_GRUPPEN.map((key) => ({
        key,
        label: STATUS_LABEL[key],
        count: members.filter((m) => statusGroup(m) === key).length,
      })),
    [members],
  );

  // Nur Vorstand: Nicht lesbare (aktive) Mitglieder können nicht geprüft werden und fehlen in „Unvollständig“;
  // sie werden als Zahl genannt. Ist gar nichts lesbar (member_secrets nicht lesbar), statt „0“ ein Hinweis.
  const lesbarkeit = useMemo(() => datenLesbarkeit(members), [members]);
  const nichtLesbar = showDataIssues ? lesbarkeit.nichtLesbar : 0;
  const pruefungMoeglich = !showDataIssues || lesbarkeit.pruefungMoeglich;

  // Filter „Daten“: „Nicht bestätigt“ nur, wenn der Stand bekannt ist (Spalte vorhanden), „Unvollständig“ nur
  // für den Vorstand und nur, wenn die Prüfung möglich ist.
  const datenOptionen = useMemo(() => {
    const keys: DatenFilter[] = ["all"];
    if (members.some((m) => m.bestaetigungOffen !== null)) keys.push("unbestaetigt");
    if (showDataIssues && pruefungMoeglich) keys.push("unvollstaendig");
    return keys.map((key) => ({
      key,
      label: DATEN_LABEL[key],
      count: members.filter((m) => passtDatenFilter(m, key)).length,
    }));
  }, [members, showDataIssues, pruefungMoeglich]);
  const datenSichtbar = datenOptionen.length > 1 || !pruefungMoeglich;

  // Ist eine gewählte Daten-Option weggefallen (z. B. Prüfung nicht mehr möglich), gilt „Alle“.
  const wirksamerFilter = useMemo<MitgliederFilter>(
    () => (datenOptionen.some((o) => o.key === filter.daten) ? filter : { ...filter, daten: "all" }),
    [datenOptionen, filter],
  );

  const shown = useMemo(
    () => sortiereMitglieder(filtereMitglieder(members, query, wirksamerFilter), sort),
    [members, query, wirksamerFilter, sort],
  );
  const abweichungen = filterAbweichungen(wirksamerFilter);

  function oeffneBearbeiten(member: AdminMemberRow) {
    setBearbeiten((alt) => ({ member, n: (alt?.n ?? 0) + 1 }));
    setFensterOffen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[440px] flex-[1_1_280px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-[13px] size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Name oder E-Mail suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 rounded-[10px] pl-[38px]"
            aria-label="Mitglieder suchen"
          />
        </div>
        <button
          type="button"
          onClick={() => setLeisteOffen(true)}
          aria-haspopup="dialog"
          aria-expanded={leisteOffen}
          className={cn(
            "relative inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border bg-card px-4 text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
            abweichungen > 0 ? "border-primary text-primary" : "border-input text-foreground",
          )}
        >
          <ListFilter className="size-4" aria-hidden />
          <span>Filter</span>
          {abweichungen > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] font-semibold text-primary-foreground tabular-nums">
              {abweichungen}
              <span className="sr-only"> geändert</span>
            </span>
          )}
        </button>
        <label className="xl:hidden">
          <span className="sr-only">Sortierung</span>
          <select
            value={`${sort.spalte}-${sort.richtung}`}
            onChange={(e) => {
              const o = SORTIER_OPTIONEN.find((x) => `${x.spalte}-${x.richtung}` === e.target.value);
              if (o) setSort({ spalte: o.spalte, richtung: o.richtung });
            }}
            className={cn(SELECT_CLASS, "h-11 w-auto rounded-[10px] pr-2 pl-3")}
          >
            {SORTIER_OPTIONEN.map((o) => (
              <option key={`${o.spalte}-${o.richtung}`} value={`${o.spalte}-${o.richtung}`}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          className="border-input bg-card py-12"
          title={members.length === 0 ? "Keine Mitglieder gefunden." : "Niemand passt zu den Filtern."}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <AdminMembersTable
            members={shown}
            canEdit={canEditRole}
            onEdit={oeffneBearbeiten}
            sort={sort}
            onSort={(spalte) => setSort((alt) => naechsteSortierung(alt, spalte))}
          />
        </div>
      )}

      <DialogPrimitive.Root open={leisteOffen} onOpenChange={setLeisteOffen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-md duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none dark:bg-black/50" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(380px,92vw)] flex-col border-l border-border bg-card shadow-card outline-none duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none"
          >
            <div className="flex items-center justify-between pt-5 pr-5 pb-3 pl-6">
              <DialogPrimitive.Title className="text-lg font-bold tracking-[-0.02em]">Filter</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Filter schließen" className="text-muted-foreground">
                  <X className="size-[18px]" aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 pt-2 pb-6">
              <OptionenGruppe id="f-rolle" titel="Rolle">
                {rollenOptionen.map((o) => (
                  <Option
                    key={o.key}
                    role="checkbox"
                    an={filter.rollen.includes(o.key)}
                    label={o.label}
                    count={o.count}
                    onClick={() => setFilter((f) => ({ ...f, rollen: umschalten(f.rollen, o.key) }))}
                  />
                ))}
              </OptionenGruppe>

              <OptionenGruppe id="f-status" titel="Status">
                {statusOptionen.map((o) => (
                  <Option
                    key={o.key}
                    role="checkbox"
                    an={filter.status.includes(o.key)}
                    label={o.label}
                    count={o.count}
                    onClick={() => setFilter((f) => ({ ...f, status: umschalten(f.status, o.key) }))}
                  />
                ))}
              </OptionenGruppe>

              {datenSichtbar && (
                <OptionenGruppe
                  id="f-daten"
                  titel="Daten"
                  radio
                  hinweis={
                    !pruefungMoeglich
                      ? "Prüfung gerade nicht möglich (Daten nicht lesbar)"
                      : nichtLesbar > 0
                        ? `${nichtLesbar} nicht lesbar`
                        : undefined
                  }
                >
                  {datenOptionen.map((o) => (
                    <Option
                      key={o.key}
                      role="radio"
                      an={wirksamerFilter.daten === o.key}
                      label={o.label}
                      count={o.count}
                      onClick={() => setFilter((f) => ({ ...f, daten: o.key }))}
                    />
                  ))}
                </OptionenGruppe>
              )}
            </div>

            <div className="flex gap-2.5 border-t border-border px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" className="h-[42px] rounded-[10px] px-[18px] font-semibold" onClick={() => setFilter(standardFilter())}>
                Zurücksetzen
              </Button>
              <Button className="h-[42px] flex-1 rounded-[10px] px-[18px] font-semibold" onClick={() => setLeisteOffen(false)}>
                {mitgliederText(shown.length)} anzeigen
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {bearbeiten && (
        <MemberCorrectionDialog
          key={bearbeiten.n}
          member={bearbeiten.member}
          open={fensterOffen}
          onOpenChange={setFensterOffen}
        />
      )}
    </div>
  );
}

function OptionenGruppe({
  id,
  titel,
  radio = false,
  hinweis,
  children,
}: {
  id: string;
  titel: string;
  radio?: boolean;
  hinweis?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p id={id} className="text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {titel}
      </p>
      <div
        role={radio ? "radiogroup" : "group"}
        aria-labelledby={id}
        className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
      >
        {children}
      </div>
      {hinweis && <p className="text-xs text-muted-foreground tabular-nums">{hinweis}</p>}
    </div>
  );
}

/** Zeile der Filter-Leiste: 48 px, Kästchen, Beschriftung, Anzahl. Auch „Daten“ hat ein Kästchen (Hannes). */
function Option({
  role,
  an,
  label,
  count,
  onClick,
}: {
  role: "checkbox" | "radio";
  an: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={an}
      onClick={onClick}
      className={cn(
        "flex h-12 w-full items-center gap-3 bg-card px-4 text-left text-sm transition-colors outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset",
        an ? "font-semibold text-foreground" : "font-medium text-ink-soft",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-primary-foreground transition-colors duration-200",
          an ? "border-primary bg-primary" : "border-input bg-card",
        )}
      >
        <Check
          strokeWidth={3.5}
          className={cn(
            "size-3 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            an ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        />
      </span>
      <span>{label}</span>
      <span className="ml-auto text-[0.8125rem] font-normal text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}
