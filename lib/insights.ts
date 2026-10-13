/**
 * Kennzahlen für die Insights-Seite (Vorstand), aus den Profilen berechnet. Reine Funktionen ohne
 * Datenbankzugriff, damit sie testbar sind. Datumswerte werden als YYYY-MM-DD-Text verglichen
 * (Berliner Kalendertag), wie im Finanzexport.
 *
 * Semester nach den Stichtagen des Vereins: SoSe ab 15.03., WiSe ab 01.10.
 */

// Gleicher Wert wie MEMBERSHIP_FEE_PER_SEMESTER (lib/membership-fee.ts), per Test abgesichert. Kein Import,
// damit die Datei ohne Bundler testbar bleibt (Node-Typ-Stripping).
export const FEE_PER_SEMESTER = 15;

export type InsightsProfile = {
  id: string;
  status: string;
  rolle: string;
  datumAntrag: string | null;
  datumKuendigung: string | null;
  fach: string | null;
  hochschule: string | null;
};

export type FeeOverride = "include" | "exclude" | "free_semester";

export type Period = { semester: "SoSe" | "WiSe"; year: number };

export type CountItem = { name: string; value: number };

export type InsightsData = {
  period: Period & { label: string };
  /** Status aktiv, ohne Alumni (Vorstand zählt mit). */
  activeTotal: number;
  alumniTotal: number;
  cancelledTotal: number;
  /** Beitragspflichtig im laufenden Semester nach den Regeln des Finanzexports (ohne IBAN-Prüfung). */
  payingCount: number;
  expectedFees: number;
  newInLast6Months: number;
  cancellationsInLast6Months: number;
  /** Neuzugänge je Semester, älteste zuerst, das letzte ist das laufende. */
  joinsBySemester: CountItem[];
  /** Nur aktive Mitglieder; ohne Angabe separat. */
  fach: { items: CountItem[]; missing: number };
  hochschule: { items: CountItem[]; missing: number };
};

const SEMESTERS_SHOWN = 8;

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

export function periodLabel(p: Period, short = false): string {
  if (p.semester === "SoSe") return short ? `SoSe ${String(p.year).slice(-2)}` : `SoSe ${p.year}`;
  const next = String(p.year + 1).slice(-2);
  return short ? `WiSe ${String(p.year).slice(-2)}/${next}` : `WiSe ${p.year}/${next}`;
}

function previousPeriod(p: Period): Period {
  return p.semester === "WiSe" ? { semester: "SoSe", year: p.year } : { semester: "WiSe", year: p.year - 1 };
}

function periodKey(p: Period): string {
  return `${p.year}-${p.semester}`;
}

/** Tag vor genau sechs Monaten (YYYY-MM-DD), Monatsende abgefangen. */
export function sixMonthsBefore(today: string): string {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7)) - 6;
  if (month < 1) {
    month += 12;
    year -= 1;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(Number(today.slice(8, 10)), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hochschulangabe vereinheitlichen (Altdaten enthalten u. a. serialisierte PHP-Arrays). */
export function normalizeHochschule(raw: string | null | undefined): string | null {
  let v = String(raw ?? "").trim();
  const serialized = /s:\d+:"([^"]*)"/.exec(v);
  if (serialized) v = serialized[1];
  const l = v.toLowerCase();
  if (!l || l === "-") return null;
  // Nur die Regensburger Hochschulen zusammenfassen (Optionen der Registrierung und Altdaten),
  // alles andere ist „Sonstige“.
  if (/\both\b/.test(l) || l.includes("ostbayerische technische hochschule")) return "OTH Regensburg";
  if (/^(uni|universität)( regensburg)?$/.test(l) || l === "ur") return "Universität Regensburg";
  return "Sonstige";
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

function countItems(values: (string | null)[]): { items: CountItem[]; missing: number } {
  const map = new Map<string, { value: number; spellings: Map<string, number> }>();
  let missing = 0;
  for (const v of values) {
    if (!v) {
      missing++;
      continue;
    }
    const key = v.toLowerCase();
    const entry = map.get(key) ?? { value: 0, spellings: new Map() };
    entry.value++;
    entry.spellings.set(v, (entry.spellings.get(v) ?? 0) + 1);
    map.set(key, entry);
  }
  const items = [...map.values()]
    .map((e) => ({
      // Häufigste Schreibweise als Anzeigename.
      name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      value: e.value,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "de"));
  return { items, missing };
}

export function computeInsights(
  profiles: InsightsProfile[],
  today: string,
  overrides: Map<string, FeeOverride> = new Map(),
): InsightsData {
  const period = periodOf(today);
  const start = periodStart(period);
  const sixAgo = sixMonthsBefore(today);

  const shown: Period[] = [period];
  while (shown.length < SEMESTERS_SHOWN) shown.unshift(previousPeriod(shown[0]));
  const joins = new Map(shown.map((p) => [periodKey(p), 0]));

  let activeTotal = 0;
  let alumniTotal = 0;
  let cancelledTotal = 0;
  let payingCount = 0;
  let newInLast6Months = 0;
  let cancellationsInLast6Months = 0;
  const fachValues: (string | null)[] = [];
  const hochschuleValues: (string | null)[] = [];

  for (const p of profiles) {
    const status = p.status.trim().toLowerCase();
    const rolle = p.rolle.trim().toLowerCase();
    const isAlumni = rolle === "alumni" || status === "alumni";
    const joinedAt = day(p.datumAntrag);
    const cancelledAt = day(p.datumKuendigung);

    if (isAlumni) alumniTotal++;
    else if (status === "cancelled") cancelledTotal++;
    else if (status === "active") {
      activeTotal++;
      fachValues.push(normalizeFach(p.fach));
      hochschuleValues.push(normalizeHochschule(p.hochschule));
    }

    if (joinedAt) {
      if (joinedAt >= sixAgo && joinedAt <= today) newInLast6Months++;
      const key = periodKey(periodOf(joinedAt));
      if (joins.has(key)) joins.set(key, joins.get(key)! + 1);
    }
    if (status === "cancelled" && cancelledAt && cancelledAt >= sixAgo && cancelledAt <= today) {
      cancellationsInLast6Months++;
    }

    // Gleiche Reihenfolge wie im Finanzexport (getFinanceExportData), nur ohne IBAN-Prüfung.
    const override = overrides.get(p.id) ?? null;
    let paying: boolean;
    if (override === "exclude" || override === "free_semester") paying = false;
    else if (override === "include") paying = true;
    else if (isAlumni) paying = false;
    else if (cancelledAt && cancelledAt < start) paying = false;
    else if (joinedAt && joinedAt >= start) paying = false;
    else paying = true;
    if (paying) payingCount++;
  }

  return {
    period: { ...period, label: periodLabel(period) },
    activeTotal,
    alumniTotal,
    cancelledTotal,
    payingCount,
    expectedFees: payingCount * FEE_PER_SEMESTER,
    newInLast6Months,
    cancellationsInLast6Months,
    joinsBySemester: shown.map((p) => ({ name: periodLabel(p, true), value: joins.get(periodKey(p)) ?? 0 })),
    fach: countItems(fachValues),
    hochschule: countItems(hochschuleValues),
  };
}
