"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/kit/PageHeader";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { budgetHerleitung, gruendeBalken, type InsightsData } from "@/lib/insights";
import { cancellationReasonLabel } from "@/lib/cancellation-reasons";
import type { CancellationRow } from "@/app/(intranet)/insights/actions";
import { INSIGHTS_TABS, naechsterTab, type InsightsTab } from "./insights-tabs";
import { Balken, Karte, Kennzahl, Leer, Saeulen } from "./charts";

const DATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

const ZAHL = new Intl.NumberFormat("de-DE");

/**
 * Insights (nur Vorstand) nach der Skizze der Design-Runde 19.11.2026: Reiter Überblick | Mitglieder |
 * Austritte, Bezugsgröße immer das Semester. Der Reiter steht im Link (?ansicht=…), ohne Neuladen.
 */
export function InsightsView({
  data,
  cancellations,
  initialTab,
}: {
  data: InsightsData;
  cancellations: CancellationRow[];
  initialTab: InsightsTab;
}) {
  const [tab, setTab] = useState<InsightsTab>(initialTab);
  const reduced = useReducedMotionSafe();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function waehle(key: InsightsTab, fokus = false) {
    setTab(key);
    if (fokus) tabRefs.current[key]?.focus();
    try {
      const url = new URL(window.location.href);
      if (key === "ueberblick") url.searchParams.delete("ansicht");
      else url.searchParams.set("ansicht", key);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Link nicht aktualisierbar: Reiter wechselt trotzdem.
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = naechsterTab(tab, e.key);
    if (!next) return;
    e.preventDefault();
    waehle(next, true);
  }

  const semester = data.period.label;

  const reiter = (
    <div
      role="tablist"
      aria-label="Bereiche"
      onKeyDown={onKeyDown}
      className="inline-flex flex-wrap gap-1 rounded-xl bg-sidebar-active p-1"
    >
      {INSIGHTS_TABS.map((t) => {
        const an = t.key === tab;
        return (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            type="button"
            role="tab"
            id={`insights-tab-${t.key}`}
            aria-selected={an}
            // Nur der aktive Reiter verweist auf ein Panel: die anderen Panels sind nicht im DOM.
            aria-controls={an ? `insights-panel-${t.key}` : undefined}
            tabIndex={an ? 0 : -1}
            onClick={() => waehle(t.key)}
            className={cn(
              "relative h-10 rounded-[9px] px-[18px] text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              an ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {an && (
              <motion.span
                layoutId="insights-tab"
                className="absolute inset-0 rounded-[9px] bg-card shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-foreground/[0.06] ring-inset"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Verwaltung · ${semester}`} title="Insights" action={reiter} className="flex-wrap" />

      <div
        key={tab}
        role="tabpanel"
        id={`insights-panel-${tab}`}
        aria-labelledby={`insights-tab-${tab}`}
        // Fokussierbar, weil Überblick und Mitglieder keine fokussierbaren Elemente haben (APG Tabs).
        tabIndex={0}
        className="insights-panel flex flex-col gap-4 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {tab === "ueberblick" && <Ueberblick data={data} />}
        {tab === "mitglieder" && <Mitglieder data={data} />}
        {tab === "austritte" && <Austritte data={data} cancellations={cancellations} />}
      </div>
    </div>
  );
}

function Ueberblick({ data }: { data: InsightsData }) {
  const semester = data.period.label;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kennzahl label="Aktive Mitglieder" value={ZAHL.format(data.studierende)} />
        <Kennzahl
          label={`Budget ${data.budget.year}`}
          value={ZAHL.format(data.budget.total)}
          unit="€"
          title={budgetHerleitung(data.budget)}
        />
        <Kennzahl label={`Eintritte ${semester}`} value={ZAHL.format(data.eintritteAktuell)} />
        <Kennzahl label={`Austritte ${semester}`} value={ZAHL.format(data.austritteAktuell)} />
      </div>
      <Karte id="insights-eintritte" title="Eintritte je Semester">
        <div className="pt-0.5">
          <Saeulen saeulen={data.eintritte} name="Eintritte je Semester" />
        </div>
      </Karte>
    </>
  );
}

function Mitglieder({ data }: { data: InsightsData }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Kennzahl label="Mitglieder" value={ZAHL.format(data.mitglieder)} />
        <Kennzahl label="Studierende" value={ZAHL.format(data.studierende)} />
        <Kennzahl label="Alumni" value={ZAHL.format(data.alumni)} />
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <Karte id="insights-fach" title="Studiengang">
          {data.fach.length ? <Balken rows={data.fach} /> : <Leer>Keine Mitglieder.</Leer>}
        </Karte>
        <Karte id="insights-alter" title="Alter">
          <Balken rows={data.alter} />
        </Karte>
        <Karte id="insights-hochschule" title="Hochschule">
          {data.hochschule.length ? <Balken rows={data.hochschule} /> : <Leer>Keine Mitglieder.</Leer>}
        </Karte>
        <Karte id="insights-abschluss" title="Abschluss">
          {data.abschluss.length ? <Balken rows={data.abschluss} /> : <Leer>Keine Mitglieder.</Leer>}
        </Karte>
      </div>
    </>
  );
}

function Austritte({ data, cancellations }: { data: InsightsData; cancellations: CancellationRow[] }) {
  const gruende = gruendeBalken(cancellations.map((c) => c.reason));
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Kennzahl label={`Austritte ${data.period.label}`} value={ZAHL.format(data.austritteAktuell)} />
        <Kennzahl
          label="Mitglied bis zum Austritt (Median)"
          value={data.medianMonate === null ? "–" : ZAHL.format(data.medianMonate)}
          unit={data.medianMonate === null ? undefined : data.medianMonate === 1 ? "Monat" : "Monate"}
        />
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <Karte id="insights-austritte" title="Austritte je Semester">
          <div className="pt-0.5">
            <Saeulen saeulen={data.austritte} name="Austritte je Semester" kurz />
          </div>
        </Karte>
        <Karte id="insights-gruende" title="Gründe">
          {gruende.length ? <Balken rows={gruende} /> : <Leer>Noch keine Kündigungen erfasst.</Leer>}
        </Karte>
      </div>
      <Karte id="insights-feedback" title="Feedback">
        {cancellations.length ? (
          <ul className="-mt-1">
            {cancellations.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 border-t border-border/70 py-3 text-sm first:border-t-0 lg:grid-cols-[minmax(0,170px)_96px_minmax(0,220px)_minmax(0,1fr)] lg:gap-4"
              >
                <span className="min-w-0 truncate font-medium" title={c.name}>
                  {c.name}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {c.cancelledAt ? DATUM.format(new Date(c.cancelledAt)) : "–"}
                </span>
                <span className="col-span-2 min-w-0 lg:col-span-1">
                  <span className="inline-block max-w-full truncate rounded-full bg-muted px-2.5 py-0.5 align-bottom text-xs font-semibold text-ink-soft">
                    {cancellationReasonLabel(c.reason)}
                  </span>
                </span>
                <span className="col-span-2 min-w-0 break-words whitespace-pre-wrap text-ink-soft lg:col-span-1">
                  {c.reasonText || "–"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Leer>Noch keine Kündigungen erfasst.</Leer>
        )}
      </Karte>
    </>
  );
}
