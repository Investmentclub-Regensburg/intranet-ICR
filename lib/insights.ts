/**
 * Kennzahlen für die Insights-Seite (Vorstand), aus den Profilen berechnet. Reine Funktionen ohne
 * Datenbankzugriff, damit sie testbar sind. Datumswerte werden als YYYY-MM-DD-Text verglichen
 * (Berliner Kalendertag), wie im Finanzexport.
 *
 * Bezugsgröße ist immer das Semester nach den Stichtagen des Vereins: SoSe ab 15.03., WiSe ab 01.10.
 */

import { CANCELLATION_REASONS } from "./cancellation-reasons";
import {
  ABSCHLUESSE,
  ALTERSGRUPPEN,
  HOCHSCHULEN,
  median,
  normalizeAbschluss,
  normalizeHochschule,
  volleMonate,
  type Altersgruppe,
} from "./insights-merkmale";

// Gleicher Wert wie MEMBERSHIP_FEE_PER_SEMESTER (lib/membership-fee.ts), per Test abgesichert.
export const FEE_PER_SEMESTER = 15;

/** Anzahl der Semester in den Säulen „je Semester“ (laufendes eingeschlossen). */
export const SEMESTER_IN_SAEULEN = 8;

export type InsightsProfile = {
  id: string;
  status: string;
  rolle: string;
  datumAntrag: string | null;
  datumKuendigung: string | null;
  fach: string | null;
  /** Rohwert der Spalte „Hochschulart“. */
  hochschule: string | null;
  /** Rohwert der Spalte „Abschluss“. */
  abschluss: string | null;
  /** Schon serverseitig aus dem Geburtsdatum bestimmt; das Datum selbst kommt hier nie an. */
  altersgruppe: Altersgruppe | null;
};

export type FeeOverride = "include" | "exclude" | "free_semester";

export type Period = { semester: "SoSe" | "WiSe"; year: number };

/** Zeile einer Balkenliste. `grau` = „ohne Angabe“. */
export type BarRow = { label: string; n: number; grau?: boolean };

/** Säule je Semester. `n` null = in diesem Semester noch nicht erfasst. */
export type SemesterSaeule = { key: string; label: string; kurz: string; n: number | null; aktuell: boolean };

export type InsightsData = {
  period: Period & { label: string };
  /** Status aktiv, ohne Alumni. */
  studierende: number;
  alumni: number;
  /** Studierende + Alumni (ohne Gekündigte und offene Anträge). */
  mitglieder: number;
  budget: { year: number; total: number; semester: { label: string; zahlend: number }[] };
  eintritteAktuell: number;
  austritteAktuell: number;
  eintritte: SemesterSaeule[];
  austritte: SemesterSaeule[];
  /** Median der vollen Monate zwischen Antrag und Kündigung (alle Austritte mit beiden Daten). */
  medianMonate: number | null;
  fach: BarRow[];
  alter: BarRow[];
  hochschule: BarRow[];
  abschluss: BarRow[];
};

function day(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return m ? m[1] : null;
}

/** Semester, in das ein Kalendertag (YYYY-MM-DD) fällt. */
export function periodOf(dayStr: string): Period {
  const year = Number(dayStr.slice(0, 4));
  const md = dayStr.slice(5);
  if (md >= "10-01") return { semester: "WiSe", year };
  if (md >= "03-15") return { semester: "SoSe", year };
  return { semester: "WiSe", year: year - 1 };
}

export function periodStart(p: Period): string {
  return p.semester === "SoSe" ? `${p.year}-03-15` : `${p.year}-10-01`;
}

export function periodLabel(p: Period): string {
  return p.semester === "SoSe" ? `SoSe ${p.year}` : `WiSe ${p.year}/${String(p.year + 1).slice(-2)}`;
}

/** Kurzform für schmale Säulen: „So 26“, „Wi 26“ (WiSe 2026/27). */
export function periodShort(p: Period): string {
  return `${p.semester === "SoSe" ? "So" : "Wi"} ${String(p.year).slice(-2)}`;
}

export function periodKey(p: Period): string {
  return `${p.year}-${p.semester}`;
}

export function previousPeriod(p: Period): Period {
  return p.semester === "WiSe" ? { semester: "SoSe", year: p.year } : { semester: "WiSe", year: p.year - 1 };
}

/** Die letzten `n` Semester bis einschließlich `current`, ältestes zuerst. */
export function lastPeriods(current: Period, n: number): Period[] {
  const out: Period[] = [current];
  while (out.length < n) out.unshift(previousPeriod(out[0]));
  return out;
}

/**
 * Beitragspflicht in einem Semester, gleiche Reihenfolge wie im Finanzexport (getFinanceExportData), nur
 * ohne IBAN-Prüfung: Anpassung „entfernen“/„Freisemester“ gewinnt, „aufnehmen“ zählt immer; sonst fallen
 * Alumni, vor dem Stichtag Gekündigte und Eintritte ab dem Stichtag (Freisemester) heraus.
 */
export function zahltBeitrag(p: InsightsProfile, start: string, override: FeeOverride | null): boolean {
  if (override === "exclude" || override === "free_semester") return false;
  if (override === "include") return true;
  const status = p.status.trim().toLowerCase();
  const rolle = p.rolle.trim().toLowerCase();
  if (rolle === "alumni" || status === "alumni") return false;
  const cancelledAt = day(p.datumKuendigung);
  if (cancelledAt && cancelledAt < start) return false;
  const joinedAt = day(p.datumAntrag);
  if (joinedAt && joinedAt >= start) return false;
  return true;
}

/** Schlüssel für Anpassungen eines Semesters (finance_export_overrides). */
export function overrideKey(p: Period): string {
  return periodKey(p);
}

/**
 * Budget des nächsten Kalenderjahres bei heutigem Stand: SoSe und WiSe dieses Jahres, je zahlende Mitglieder
 * × Beitrag. Zahlend wie im Finanzexport (zahltBeitrag) mit den Anpassungen des jeweiligen Semesters. Für
 * die Vorschau zählen offene Anträge und Gekündigte ohne Kündigungsdatum nicht (keine Mitglieder mehr bzw.
 * noch nicht), außer per Anpassung „aufnehmen“.
 */
export function budgetNaechstesJahr(
  profiles: InsightsProfile[],
  today: string,
  overrides: Map<string, Map<string, FeeOverride>> = new Map(),
): InsightsData["budget"] {
  const year = Number(today.slice(0, 4)) + 1;
  const semester: Period[] = [
    { semester: "SoSe", year },
    { semester: "WiSe", year },
  ];
  const zeilen = semester.map((s) => {
    const start = periodStart(s);
    const anpassungen = overrides.get(overrideKey(s)) ?? new Map<string, FeeOverride>();
    let zahlend = 0;
    for (const p of profiles) {
      const override = anpassungen.get(p.id) ?? null;
      const status = p.status.trim().toLowerCase();
      if (override !== "include" && (status === "applicant" || status === "cancelled")) continue;
      if (zahltBeitrag(p, start, override)) zahlend++;
    }
    return { label: periodLabel(s), zahlend };
  });
  return { year, total: zeilen.reduce((s, z) => s + z.zahlend * FEE_PER_SEMESTER, 0), semester: zeilen };
}

/** Herleitung des Budgets für den Tooltip. */
export function budgetHerleitung(budget: InsightsData["budget"]): string {
  const [a, b] = budget.semester;
  if (a && b && a.zahlend === b.zahlend) {
    return `2 Semester × ${a.zahlend} zahlende Mitglieder × ${FEE_PER_SEMESTER} €`;
  }
  return budget.semester.map((s) => `${s.label}: ${s.zahlend} × ${FEE_PER_SEMESTER} €`).join(" + ");
}

const FACH_ALIASES: Record<string, string> = {
  bwl: "BWL",
  bw: "BWL",
  betriebswirtschaftslehre: "BWL",
  "bwl/finance": "BWL",
  vwl: "VWL",
  volkswirtschaftslehre: "VWL",
  wirtschaftsinformatik: "Wirtschaftsinformatik",
  "angewandte wirtschaftsinformatik": "Wirtschaftsinformatik",
  "digital business": "Digital Business",
  "digital business management": "Digital Business",
  dbm: "Digital Business",
  jura: "Jura",
  rechtswissenschaften: "Jura",
  rechtswissenschaft: "Jura",
  sonstiges: "Sonstiges",
  sonstige: "Sonstiges",
  "kein student": "Sonstiges",
};

/** Studiengang vereinheitlichen: bekannte Schreibweisen zusammenfassen, sonst getrimmt übernehmen. */
export function normalizeFach(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!v || v === "-") return null;
  return FACH_ALIASES[v.toLowerCase()] ?? v;
}

export const OHNE_ANGABE = "ohne Angabe";

/**
 * Freie Werte zählen (Groß-/Kleinschreibung zusammengefasst, häufigste Schreibweise als Name), absteigend.
 * Mehr als `maxBenannt` Werte → die übrigen als „Weitere“. „ohne Angabe“ grau am Ende (nur wenn > 0).
 */
export function freieBalken(values: (string | null)[], maxBenannt = 8): BarRow[] {
  const map = new Map<string, { n: number; spellings: Map<string, number> }>();
  let missing = 0;
  for (const v of values) {
    if (!v) {
      missing++;
      continue;
    }
    const key = v.toLowerCase();
    const entry = map.get(key) ?? { n: 0, spellings: new Map() };
    entry.n++;
    entry.spellings.set(v, (entry.spellings.get(v) ?? 0) + 1);
    map.set(key, entry);
  }
  const items = [...map.values()]
    .map((e) => ({ label: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], n: e.n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "de"));
  const rows: BarRow[] =
    items.length > maxBenannt
      ? [
          ...items.slice(0, maxBenannt - 1),
          { label: "Weitere", n: items.slice(maxBenannt - 1).reduce((s, i) => s + i.n, 0) },
        ]
      : items;
  if (missing > 0) rows.push({ label: OHNE_ANGABE, n: missing, grau: true });
  return rows;
}

/**
 * Feste Kategorien in fester Reihenfolge zählen (null = ohne Angabe). `alleZeigen`: auch Kategorien mit 0
 * (Altersgruppen), sonst nur vorkommende.
 */
export function festeBalken<T extends string>(
  kategorien: readonly T[],
  values: (T | null)[],
  alleZeigen = false,
): BarRow[] {
  const zahl = new Map<T, number>();
  let missing = 0;
  for (const v of values) {
    if (v === null) missing++;
    else zahl.set(v, (zahl.get(v) ?? 0) + 1);
  }
  const rows: BarRow[] = kategorien
    .map((k) => ({ label: k as string, n: zahl.get(k) ?? 0 }))
    .filter((r) => alleZeigen || r.n > 0);
  if (missing > 0) rows.push({ label: OHNE_ANGABE, n: missing, grau: true });
  return rows;
}

/** Kündigungsgründe zählen (Beschriftung wie CANCELLATION_REASONS), absteigend, ohne Angabe grau am Ende. */
export function gruendeBalken(reasons: (string | null)[]): BarRow[] {
  const rows: BarRow[] = CANCELLATION_REASONS.map((r) => ({
    label: r.label as string,
    n: reasons.filter((x) => x === r.value).length,
  }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const known = new Set<string>(CANCELLATION_REASONS.map((r) => r.value));
  const missing = reasons.filter((x) => !x || !known.has(x)).length;
  if (missing > 0) rows.push({ label: OHNE_ANGABE, n: missing, grau: true });
  return rows;
}

/**
 * Säulen der letzten Semester. Semester vor dem ersten erfassten Wert gelten als „nicht erfasst“ (null),
 * wenn `abErstemWert` gesetzt ist (Kündigungsdaten gibt es erst seit der Umstellung).
 */
export function semesterSaeulen(
  perioden: Period[],
  tage: string[],
  current: Period,
  abErstemWert = false,
): SemesterSaeule[] {
  const zahl = new Map<string, number>();
  let erster: string | null = null;
  for (const t of tage) {
    const k = periodKey(periodOf(t));
    zahl.set(k, (zahl.get(k) ?? 0) + 1);
    const start = periodStart(periodOf(t));
    if (erster === null || start < erster) erster = start;
  }
  return perioden.map((p) => ({
    key: periodKey(p),
    label: periodLabel(p),
    kurz: periodShort(p),
    n: abErstemWert && erster !== null && periodStart(p) < erster ? null : (zahl.get(periodKey(p)) ?? 0),
    aktuell: periodKey(p) === periodKey(current),
  }));
}

export function computeInsights(
  profiles: InsightsProfile[],
  today: string,
  budgetOverrides: Map<string, Map<string, FeeOverride>> = new Map(),
): InsightsData {
  const period = periodOf(today);
  const perioden = lastPeriods(period, SEMESTER_IN_SAEULEN);

  let studierende = 0;
  let alumni = 0;
  const mitglieder: InsightsProfile[] = [];
  const eintrittTage: string[] = [];
  const austrittTage: string[] = [];
  const dauer: number[] = [];

  for (const p of profiles) {
    const status = p.status.trim().toLowerCase();
    const rolle = p.rolle.trim().toLowerCase();
    // Offene Anträge sind noch keine Mitglieder und zählen nirgends.
    if (status === "applicant") continue;

    const joinedAt = day(p.datumAntrag);
    const cancelledAt = day(p.datumKuendigung);
    // Eintritte nach Antragsdatum, auch wer später ausgetreten ist.
    if (joinedAt && joinedAt <= today) eintrittTage.push(joinedAt);

    if (status === "cancelled") {
      if (cancelledAt && cancelledAt <= today) {
        austrittTage.push(cancelledAt);
        if (joinedAt) {
          const m = volleMonate(joinedAt, cancelledAt);
          if (m !== null) dauer.push(m);
        }
      }
      continue;
    }

    if (rolle === "alumni" || status === "alumni") {
      alumni++;
      mitglieder.push(p);
    } else if (status === "active") {
      studierende++;
      mitglieder.push(p);
    }
  }

  const eintritte = semesterSaeulen(perioden, eintrittTage, period);
  const austritte = semesterSaeulen(perioden, austrittTage, period, true);
  const m = median(dauer);

  return {
    period: { ...period, label: periodLabel(period) },
    studierende,
    alumni,
    mitglieder: studierende + alumni,
    budget: budgetNaechstesJahr(profiles, today, budgetOverrides),
    eintritteAktuell: eintritte[eintritte.length - 1].n ?? 0,
    austritteAktuell: austritte[austritte.length - 1].n ?? 0,
    eintritte,
    austritte,
    medianMonate: m === null ? null : Math.round(m),
    fach: freieBalken(mitglieder.map((p) => normalizeFach(p.fach))),
    alter: festeBalken(ALTERSGRUPPEN, mitglieder.map((p) => p.altersgruppe), true),
    hochschule: festeBalken(HOCHSCHULEN, mitglieder.map((p) => normalizeHochschule(p.hochschule))),
    abschluss: festeBalken(ABSCHLUESSE, mitglieder.map((p) => normalizeAbschluss(p.abschluss))),
  };
}
