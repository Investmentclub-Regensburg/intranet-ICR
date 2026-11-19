// Reine Logik der Mitgliederliste in Verwaltung › Mitglieder (Design-Runde 19.11.2026): Filter-Standard,
// Zähler am Knopf „Filter“, Filtern, Sortieren und die Zuordnung Rolle/Status im Bearbeiten-Fenster →
// Aufruf von updateMemberRole. Ohne I/O, getestet in tests/member-list.test.mjs.
import { ROLE_LABELS, STATUS_LABELS, passtDatenFilter, statusGroup, type DatenFilter } from "./format";

export const ROLLEN = ["member", "admin", "board", "alumni"] as const;
export type Rolle = (typeof ROLLEN)[number];

export type StatusGruppe = "active" | "applicant" | "cancelled";
export const STATUS_GRUPPEN: readonly StatusGruppe[] = ["active", "applicant", "cancelled"];

/** Rolle für Filter und Auswahl: unbekannte oder leere Werte zählen wie auf dem Server (roleOf) als Mitglied. */
export function rolleVon(m: { rolle: string }): Rolle {
  const r = String(m.rolle ?? "").trim().toLowerCase();
  return (ROLLEN as readonly string[]).includes(r) ? (r as Rolle) : "member";
}

export type MitgliederFilter = {
  rollen: readonly Rolle[];
  status: readonly StatusGruppe[];
  daten: DatenFilter;
};

/** Standard: alle Rollen, Status Aktiv + Antrag offen (Ausgetretene ausgeblendet), Daten „Alle“. */
export function standardFilter(): MitgliederFilter {
  return { rollen: [...ROLLEN], status: ["active", "applicant"], daten: "all" };
}

function gleicheMenge<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Zahl der Filtergruppen (Rolle, Status, Daten), die vom Standard abweichen: der rote Zähler am Knopf „Filter“. */
export function filterAbweichungen(f: MitgliederFilter): number {
  const std = standardFilter();
  return (
    (gleicheMenge(f.rollen, std.rollen) ? 0 : 1) +
    (gleicheMenge(f.status, std.status) ? 0 : 1) +
    (f.daten === std.daten ? 0 : 1)
  );
}

/** Eintrag in einer Liste an- oder abwählen (Reihenfolge der übrigen bleibt). */
export function umschalten<T>(liste: readonly T[], wert: T): T[] {
  return liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert];
}

type FilterZeile = {
  name: string;
  email: string;
  rolle: string;
  status: string;
  bestaetigungOffen?: boolean | null;
  datenMaengel?: readonly string[];
};

/** Suche (Name oder E-Mail) und die drei Filtergruppen. */
export function filtereMitglieder<T extends FilterZeile>(rows: readonly T[], suche: string, f: MitgliederFilter): T[] {
  const q = suche.trim().toLowerCase();
  return rows.filter(
    (m) =>
      (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) &&
      f.rollen.includes(rolleVon(m)) &&
      f.status.includes(statusGroup(m)) &&
      passtDatenFilter(m, f.daten),
  );
}

export type SortSpalte = "name" | "rolle" | "status";
export type SortRichtung = "asc" | "desc";
export type Sortierung = { spalte: SortSpalte; richtung: SortRichtung };

export const STANDARD_SORTIERUNG: Sortierung = { spalte: "name", richtung: "asc" };

/** Klick auf einen Spaltenkopf: neue Spalte A–Z, dieselbe Spalte wechselt A–Z ↔ Z–A. */
export function naechsteSortierung(aktuell: Sortierung, spalte: SortSpalte): Sortierung {
  if (aktuell.spalte !== spalte) return { spalte, richtung: "asc" };
  return { spalte, richtung: aktuell.richtung === "asc" ? "desc" : "asc" };
}

/** Angezeigter Text der Rolle (Tabelle, Sortierung). */
export function rollenText(m: { rolle: string }): string {
  return ROLE_LABELS[m.rolle] ?? m.rolle;
}

/** Angezeigter Text des Status (Pille, Sortierung). */
export function statusText(m: { status: string }): string {
  return STATUS_LABELS[statusGroup(m)];
}

const SORTIER_WERT: Record<SortSpalte, (m: { name: string; rolle: string; status: string }) => string> = {
  name: (m) => m.name,
  rolle: rollenText,
  status: statusText,
};

/** Sortiert nach dem angezeigten Text (deutsch), bei Gleichstand immer nach Name A–Z. */
export function sortiereMitglieder<T extends { name: string; rolle: string; status: string }>(
  rows: readonly T[],
  s: Sortierung,
): T[] {
  const wert = SORTIER_WERT[s.spalte];
  const richtung = s.richtung === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) => richtung * wert(a).localeCompare(wert(b), "de") || a.name.localeCompare(b.name, "de"),
  );
}

/** aria-sort eines Spaltenkopfs. */
export function ariaSort(s: Sortierung, spalte: SortSpalte): "ascending" | "descending" | "none" {
  if (s.spalte !== spalte) return "none";
  return s.richtung === "asc" ? "ascending" : "descending";
}

/* ---------------------------------------------------------------------------
 * Bearbeiten-Fenster: Abschnitt „Mitgliedschaft“
 * ------------------------------------------------------------------------- */

/** Wählbarer Status im Fenster. „Antrag offen“ wird nur angezeigt (Anträge laufen über die Aufgaben). */
export type StatusAuswahl = "active" | "cancelled";

export type Mitgliedschaft = { rolle: Rolle; status: StatusGruppe };

/** Ausgangswerte des Fensters aus der Listenzeile. */
export function mitgliedschaftVon(m: { rolle: string; status: string }): Mitgliedschaft {
  return { rolle: rolleVon(m), status: statusGroup(m) };
}

/** Bei offenem Antrag sind Rolle und Status gesperrt. */
export function mitgliedschaftGesperrt(basis: Mitgliedschaft): boolean {
  return basis.status === "applicant";
}

/**
 * Welche Rolle das Feld zeigt: Wird jemand gerade auf „Ausgetreten“ gesetzt, setzt der Server die Rolle auf
 * Mitglied zurück (updateMemberRole mit „cancelled“) – das Feld zeigt das schon vorher und ist gesperrt.
 */
export function angezeigteRolle(basis: Mitgliedschaft, auswahl: Mitgliedschaft): Rolle {
  if (auswahl.status === "cancelled" && basis.status !== "cancelled") return "member";
  return auswahl.rolle;
}

/** Rollenfeld gesperrt: bei offenem Antrag und solange „Ausgetreten“ gewählt ist. */
export function rolleGesperrt(basis: Mitgliedschaft, auswahl: Mitgliedschaft): boolean {
  return mitgliedschaftGesperrt(basis) || auswahl.status === "cancelled";
}

/**
 * Auswahl im Fenster → Wert für updateMemberRole(profileId, wert), oder null, wenn nichts zu senden ist.
 *   - Antrag offen: nie (gesperrt).
 *   - Austritt (aktiv → ausgetreten): „cancelled“; der Server setzt Status, Kündigungsdatum und Rolle Mitglied.
 *   - Wiederaufnahme (ausgetreten → aktiv): die gewählte Rolle, auch wenn sie gleich bleibt; der Server setzt
 *     Status aktiv und löscht das Kündigungsdatum.
 *   - Aktiv bleibt aktiv: nur bei geänderter Rolle die neue Rolle.
 *   - Ausgetreten bleibt ausgetreten: nichts.
 */
export function mitgliedschaftAufruf(basis: Mitgliedschaft, auswahl: Mitgliedschaft): string | null {
  if (mitgliedschaftGesperrt(basis)) return null;
  if (auswahl.status === "applicant") return null;
  if (!(ROLLEN as readonly string[]).includes(auswahl.rolle)) return null;
  if (auswahl.status === "cancelled") return basis.status === "cancelled" ? null : "cancelled";
  if (basis.status === "cancelled") return auswahl.rolle;
  return auswahl.rolle !== basis.rolle ? auswahl.rolle : null;
}

/** Mitgliedschaft nach erfolgreichem Aufruf (neue Ausgangswerte, damit erneutes Speichern nichts doppelt sendet). */
export function mitgliedschaftNachAufruf(wert: string): Mitgliedschaft {
  if (wert === "cancelled") return { rolle: "member", status: "cancelled" };
  return { rolle: rolleVon({ rolle: wert }), status: "active" };
}

export type DatenAntwort = { error: string; unchanged?: boolean; fehler?: Partial<Record<string, string>> };
export type MitgliedschaftAntwort = { error: string };

export type SpeicherErgebnis =
  /** Nichts zu senden. */
  | { art: "nichts" }
  /** Alles durch; `geaendert` = mindestens ein Teil hat wirklich etwas gespeichert. */
  | { art: "ok"; geaendert: boolean; mitgliedschaft: Mitgliedschaft | null }
  /** Datenteil abgelehnt: nichts gespeichert, die Mitgliedschaft wurde gar nicht erst gesendet. */
  | { art: "datenFehler"; meldung: string; fehler: Partial<Record<string, string>> }
  /** Mitgliedschaft abgelehnt; `datenGespeichert` = der Datenteil davor ist schon gespeichert. */
  | { art: "mitgliedschaftFehler"; meldung: string; datenGespeichert: boolean };

/**
 * Speichern im Bearbeiten-Fenster, Reihenfolge fest: erst die Datenfelder, und nur wenn die ohne Fehler durch
 * sind, die Mitgliedschaft. So läuft z. B. ein Austritt nie an einer Tippfehler-PLZ vorbei.
 */
export async function speichereBearbeitung<E>(
  eingabe: E | null,
  aufruf: string | null,
  wege: {
    daten: (eingabe: E) => Promise<DatenAntwort>;
    mitgliedschaft: (wert: string) => Promise<MitgliedschaftAntwort>;
  },
): Promise<SpeicherErgebnis> {
  if (eingabe === null && aufruf === null) return { art: "nichts" };

  let datenGespeichert = false;
  if (eingabe !== null) {
    let antwort: DatenAntwort;
    try {
      antwort = await wege.daten(eingabe);
    } catch {
      return { art: "datenFehler", meldung: "Korrektur konnte nicht gespeichert werden.", fehler: {} };
    }
    const fehler = antwort.fehler ?? {};
    if (Object.keys(fehler).length > 0 || antwort.error) {
      return { art: "datenFehler", meldung: antwort.error, fehler };
    }
    datenGespeichert = !antwort.unchanged;
  }

  if (aufruf !== null) {
    let antwort: MitgliedschaftAntwort;
    try {
      antwort = await wege.mitgliedschaft(aufruf);
    } catch {
      return { art: "mitgliedschaftFehler", meldung: "Änderung konnte nicht gespeichert werden.", datenGespeichert };
    }
    if (antwort.error) return { art: "mitgliedschaftFehler", meldung: antwort.error, datenGespeichert };
    return { art: "ok", geaendert: true, mitgliedschaft: mitgliedschaftNachAufruf(aufruf) };
  }
  return { art: "ok", geaendert: datenGespeichert, mitgliedschaft: null };
}

/** Meldung im Fenster, wenn die Mitgliedschaft scheitert (bei schon gespeicherten Daten ausdrücklich gesagt). */
export function mitgliedschaftFehlerText(meldung: string, datenGespeichert: boolean): string {
  return datenGespeichert ? `Daten gespeichert, Rolle/Status nicht: ${meldung}` : meldung;
}

/** Datenfelder des Korrekturteils (Vergleich mit den Werten beim Öffnen, nur Rohtext). */
export function datenGeaendert<K extends string>(
  eingabe: Readonly<Record<K, string>> & { iban: string },
  basis: Readonly<Record<K, string>>,
  felder: readonly K[],
): boolean {
  if (eingabe.iban.trim() !== "") return true;
  return felder.some((f) => (eingabe[f] ?? "") !== (basis[f] ?? ""));
}
