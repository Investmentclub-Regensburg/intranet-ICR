/** Reiter der Insights-Seite. Schlüssel stehen auch im Link (?ansicht=mitglieder). */
export const INSIGHTS_TABS = [
  { key: "ueberblick", label: "Überblick" },
  { key: "mitglieder", label: "Mitglieder" },
  { key: "austritte", label: "Austritte" },
] as const;

export type InsightsTab = (typeof INSIGHTS_TABS)[number]["key"];

/** Reiter aus dem Link-Parameter; Unbekanntes oder leer → Überblick. */
export function insightsTab(raw: string | string[] | null | undefined): InsightsTab {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return INSIGHTS_TABS.find((t) => t.key === v)?.key ?? "ueberblick";
}

/** Nächster Reiter für Pfeiltasten (rundum), Pos1/Ende springen an den Rand. */
export function naechsterTab(current: InsightsTab, key: string): InsightsTab | null {
  const i = INSIGHTS_TABS.findIndex((t) => t.key === current);
  const n = INSIGHTS_TABS.length;
  if (key === "ArrowRight") return INSIGHTS_TABS[(i + 1) % n].key;
  if (key === "ArrowLeft") return INSIGHTS_TABS[(i - 1 + n) % n].key;
  if (key === "Home") return INSIGHTS_TABS[0].key;
  if (key === "End") return INSIGHTS_TABS[n - 1].key;
  return null;
}

/** Breite eines Balkens in Prozent des größten Werts (mindestens 2 %, 0 bleibt 0). */
export function balkenBreite(n: number, max: number): number {
  if (n <= 0 || max <= 0) return 0;
  return Math.max(2, Math.round((n / max) * 100));
}

/** Höhe einer Säule in px bei `hoehe` px für den größten Wert (mindestens 2 px, 0/leer bleibt 0). */
export function saeulenHoehe(n: number | null, max: number, hoehe = 160): number {
  if (n === null || n <= 0 || max <= 0) return 0;
  return Math.max(2, Math.round((n / max) * hoehe));
}

/** Anteil in ganzen Prozent für den Tooltip. */
export function anteil(n: number, summe: number): number {
  return summe > 0 ? Math.round((n / summe) * 100) : 0;
}
