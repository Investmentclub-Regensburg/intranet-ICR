// Vorstandsübersicht in admin/members (Paket „Mitgliederdaten“, PR 5): Zeilen der Mitgliederliste bauen,
// rein und ohne I/O (getAdminMembers liest und entschlüsselt, hier wird nur ausgewertet).
//
// Datenschutz: Der Browser bekommt je Mitglied höchstens die deutschen NAMEN der betroffenen Felder
// („IBAN, Handy“), nie Werte, Mängel-Codes oder Hinweise. Die Feldnamen bekommt nur der Vorstand (board);
// für admin fehlt die Eigenschaft `datenMaengel` ganz.
import "server-only";
import { pruefeBestand, type Feld, type Mangel } from "./member-rules";
import { isActiveMemberProfile, isAlumniProfile } from "./profile-status";
import { BESTANDS_FELDER, alsZeitpunkt, berlinTagesbeginn, letzterStichtag } from "./member-data-check";
import { berlinToday } from "./berlin-date";
import type { MemberSecretsResult } from "./member-secrets-server";

export type AdminMemberRow = {
  id: string;
  name: string;
  studiengang: string;
  email: string;
  handynummer: string;
  /** Verschlüsselte Daten dieses Mitglieds nicht lesbar (Handynummer fehlt dann). */
  secretsUnreadable: boolean;
  rolle: string;
  /** Kleinbuchstaben, z. B. active | cancelled | applicant */
  status: string;
  /**
   * Bestätigung „Stimmen deine Daten noch?“ offen (nur aktive Mitglieder inkl. Vorstand und Alumni; sonst
   * false). null = unbekannt (Spalte daten_bestaetigt_am fehlt noch, Übergang vor der Migration).
   */
  bestaetigungOffen: boolean | null;
  /**
   * Nur Vorstand: deutsche Namen der Felder mit Mangel (leer = alles in Ordnung). Fehlt bei admin, bei nicht
   * aktiven Mitgliedern und bei nicht lesbaren verschlüsselten Daten.
   */
  datenMaengel?: string[];
};

/** Deutsche Feldnamen für die Vorstandsübersicht (Reihenfolge = Reihenfolge der Anzeige). */
export const FELD_NAMEN: Readonly<Record<Feld, string>> = Object.freeze({
  vorname: "Vorname",
  nachname: "Nachname",
  email: "E-Mail",
  strasse: "Straße",
  hausnummer: "Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  land: "Land",
  handynummer: "Handy",
  iban: "IBAN",
  bic: "BIC",
  geburtsdatum: "Geburtsdatum",
});

const FELD_REIHENFOLGE = Object.keys(FELD_NAMEN) as Feld[];

/**
 * Felder mit Mangel im gespeicherten Bestand (BESTANDS_FELDER, gleiche Liste wie Abfrage-Fenster und Skript),
 * geprüft mit `pruefeBestand` OHNE `handyLand` (regeln-fuer-aufrufer.md 1); Alumni ohne Bankmängel (3).
 * `land_unbekannt` zählt nur am Feld `land` (Punkt 4). Hinweise (`vorwahl_ergaenzt`, `bic_land`) bleiben
 * bewusst weg: Sie blockieren nie, und das Mitglied bestätigt sie selbst im Abfrage-Fenster.
 */
export function maengelFelder(
  werte: Readonly<Record<string, string | null | undefined>>,
  profil: Record<string, unknown>,
  heute?: string
): Feld[] {
  const daten: Record<string, string | null> = {};
  for (const feld of BESTANDS_FELDER) daten[feld] = werte[feld] ?? null;
  const alumni = isAlumniProfile(profil);
  const kontext = heute ? { alumni, wer: "mitglied" as const, heute } : { alumni, wer: "mitglied" as const };
  const maengel: Mangel[] = pruefeBestand(daten, kontext).maengel;
  const felder = new Set<Feld>();
  for (const m of maengel) {
    if (m.code === "land_unbekannt" && m.feld !== "land") continue;
    felder.add(m.feld);
  }
  return FELD_REIHENFOLGE.filter((f) => felder.has(f));
}

function text(wert: unknown): string {
  return typeof wert === "string" || typeof wert === "number" ? String(wert).trim() : "";
}

/**
 * Zeilen der Mitgliederliste aus `profiles` (mit `daten_bestaetigt_am`, sofern gelesen) und den
 * entschlüsselten Werten.
 *   secrets         Ergebnis von readMemberSecretsMany; null = member_secrets nicht lesbar (alle „nicht lesbar“)
 *   vorstand        true nur für Rolle board: dann und nur dann `datenMaengel`
 *   bestaetigtBekannt  false, wenn die Spalte daten_bestaetigt_am fehlt (→ bestaetigungOffen null)
 */
export function adminMitgliederZeilen(
  profiles: ReadonlyArray<Record<string, unknown>>,
  secrets: ReadonlyMap<string, MemberSecretsResult> | null,
  {
    vorstand,
    bestaetigtBekannt = true,
    jetzt = new Date(),
    heute,
  }: { vorstand: boolean; bestaetigtBekannt?: boolean; jetzt?: Date; heute?: string }
): AdminMemberRow[] {
  // Einmal je Aufruf (Review V1): Stichtag als Zeitpunkt (00:00 Berlin) und das Berliner Datum für die Regeln.
  // „Bestätigung vor dem Stichtag (Berliner Datum)“ ⇔ Zeitpunkt vor 00:00 Berlin am Stichtag.
  const stichtagBeginn = berlinTagesbeginn(letzterStichtag(jetzt)).getTime();
  const heuteBerlin = heute ?? berlinToday(jetzt);
  const offen = (bestaetigtAm: unknown) => {
    const zeitpunkt = alsZeitpunkt(bestaetigtAm);
    return !zeitpunkt || zeitpunkt.getTime() < stichtagBeginn;
  };
  return profiles.map((raw) => {
    const id = text(raw.id);
    const v = text(raw.Vorname ?? raw.vorname);
    const n = text(raw.Nachname ?? raw.nachname);
    const sv = secrets?.get(id);
    const unreadable = !secrets || sv === "unreadable";
    const werte = sv && sv !== "unreadable" ? sv : null;
    const aktiv = isActiveMemberProfile(raw);
    const row: AdminMemberRow = {
      id,
      name: [v, n].filter(Boolean).join(" ") || "—",
      studiengang: text(raw["Studiengang / Fach"]),
      email: text(raw["E-Mail"] ?? raw["e-mail"]),
      handynummer: text(werte?.handynummer),
      secretsUnreadable: unreadable,
      rolle: String(raw.Rolle ?? raw.rolle ?? "member").trim().toLowerCase(),
      status: String(raw.Status ?? raw.status ?? "active").trim().toLowerCase(),
      bestaetigungOffen: !bestaetigtBekannt
        ? null
        : aktiv && offen(raw.daten_bestaetigt_am),
    };
    if (vorstand && aktiv && werte) {
      row.datenMaengel = maengelFelder(werte, raw, heuteBerlin).map((f) => FELD_NAMEN[f]);
    }
    return row;
  });
}
