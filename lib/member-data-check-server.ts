/**
 * Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4): Bewertung des eigenen Bestands, Anzeige
 * im Fenster, „Stimmt alles“ und „Ändern“. Geprüft wird nur über lib/member-rules.ts (Bestand: `pruefeBestand`
 * ohne `handyLand`, Regeln für Aufrufer 1; Formular: `pruefeProfil` aus lib/member-forms.ts wie im Profil).
 * Die Bewertungsfunktionen sind rein (Tests); Datenbank und Verschlüsselung machen die Server-Actions.
 * Nur Server.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_COUNTRY, findCountry } from "./country-codes";
import { normalizeIban } from "./member-crypto";
import {
  formatiereHandyAnzeige,
  pruefeBestand,
  type Feld,
  type Mitgliederdaten,
} from "./member-rules";
import {
  PLZ_DE_MELDUNG,
  handyFuerEingabe,
  landAusBestand,
  pruefeProfil,
  type FeldFehler,
  type Namen,
} from "./member-forms";
import { emptySecretValues, readMemberSecretsWithMeta, type MemberSecretValues } from "./member-secrets-server";
import { isActiveMemberProfile, isAlumniProfile } from "./profile-status";
import {
  BESTANDS_FELDER,
  istAbfrageFaellig,
  leseDatenCheckEinstellungen,
  spaeterBis,
  type DatenCheckAnsicht,
  type DatenCheckEinstellungen,
  type DatenCheckZeile,
  type DatenCheckZeilenSchluessel,
} from "./member-data-check";

let startWarnungGezeigt = false;

/**
 * Schalter DATA_CHECK_ENABLED / DATA_CHECK_START aus der Umgebung. Eingeschaltet ohne gültiges Start-Datum: einmal
 * warnen (ohne Wert); dann zählt nur der Stichtag, „Später“ kann sofort ausgeschlossen sein (Review A4).
 */
export function datenCheckEinstellungen(env: Record<string, string | undefined> = process.env): DatenCheckEinstellungen {
  const e = leseDatenCheckEinstellungen(env);
  if (e.eingeschaltet && !e.start && !startWarnungGezeigt) {
    startWarnungGezeigt = true;
    console.warn("Datenabfrage: DATA_CHECK_ENABLED ist an, DATA_CHECK_START fehlt oder ist kein Datum (YYYY-MM-DD); „Später“ richtet sich nur nach dem Stichtag");
  }
  return e;
}

/** Nur Tests: Warnung erneut erlauben. */
export function _resetStartWarnung(): void {
  startWarnungGezeigt = false;
}

let rpcFehltGewarnt = false;

/**
 * Bestätigung setzen, aber nur für den geprüften Stand: `confirm_member_data` (Migration 20261118150000) prüft
 * member_secrets.version = `erwarteteVersion` (keine Zeile = 0) unter Sperre und setzt dann daten_bestaetigt_am,
 * leert daten_erinnern_ab. Fehlt die Funktion (Übergang vor der Migration): einmal warnen, Version lesen,
 * vergleichen, setzen (ohne Sperre).
 */
export async function bestaetigeStand(
  admin: SupabaseClient,
  profileId: string,
  erwarteteVersion: number,
): Promise<"ok" | "konflikt" | "fehler"> {
  const { data, error } = await admin.rpc("confirm_member_data", {
    p_profile_id: profileId,
    p_expected_version: erwarteteVersion,
  });
  if (!error) return data === true ? "ok" : "konflikt";
  const meldung = String(error.message ?? "");
  const fehlt =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    (/confirm_member_data/.test(meldung) && /not find|does not exist/i.test(meldung));
  if (!fehlt) {
    console.error("Datenabfrage: bestätigen", error.code);
    return "fehler";
  }
  if (!rpcFehltGewarnt) {
    rpcFehltGewarnt = true;
    console.warn("Datenabfrage: confirm_member_data fehlt (Migration 20261118150000 noch nicht eingespielt), Bestätigung ohne Sperre");
  }
  const { data: row, error: leseFehler } = await admin
    .from("member_secrets")
    .select("version")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (leseFehler) {
    console.error("Datenabfrage: Version", leseFehler.code);
    return "fehler";
  }
  const version = typeof (row as { version?: unknown } | null)?.version === "number" ? (row as { version: number }).version : 0;
  if (version !== erwarteteVersion) return "konflikt";
  const { error: updateFehler } = await admin
    .from("profiles")
    .update({ daten_bestaetigt_am: new Date().toISOString(), daten_erinnern_ab: null })
    .eq("id", profileId);
  if (updateFehler) {
    console.error("Datenabfrage: bestätigen", updateFehler.code);
    return "fehler";
  }
  return "ok";
}

/** Eigener Bestand: verschlüsselte Felder + Name im Klartext. */
export type DatenBestand = MemberSecretValues & Namen;

export const HINWEIS_VORWAHL = "Vorwahl +49 ergänzt. Stimmt die Nummer?";
/**
 * Zeile „Anschrift“ ganz leer und trotzdem ein Mangel: Das geht nur, wenn die Anschrift wegen einer IBAN
 * außerhalb des EWR Pflicht ist (sonst ist sie freiwillig, Entscheidung Hannes 20.11.2026).
 */
export const ANSCHRIFT_FEHLT = "Für eine IBAN außerhalb des EWR brauchen wir deine Anschrift.";

export type BestandsBewertung = {
  gueltig: boolean;
  /** Meldung je Feld mit Mangel (`land_unbekannt` nur am Land, Regeln für Aufrufer 4). */
  fehler: FeldFehler;
  /** Nicht blockierende Hinweise je Feld. */
  hinweise: Partial<Record<Feld, string>>;
  /** Normalisierte Werte (bei „Stimmt alles“ gespeichert). */
  werte: Partial<Record<Feld, string>>;
};

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Bestand in die Form der Regeln: nur die verschlüsselten Felder ohne BIC (BESTANDS_FELDER). Name und E-Mail sind kein
 * Bestandsmangel (Abstimmung mit Vorstandsübersicht und Skript); im Formular „Ändern“ gelten für den Namen die
 * Formularregeln aus PR 2.
 */
function alsDaten(b: DatenBestand): Mitgliederdaten {
  return {
    strasse: b.strasse,
    hausnummer: b.hausnummer,
    plz: b.plz,
    ort: b.ort,
    land: b.land ?? "",
    handynummer: b.handynummer,
    iban: b.iban,
    geburtsdatum: b.geburtsdatum,
  };
}

/**
 * Gespeicherten Bestand bewerten (`pruefeBestand`, ohne `handyLand`). Alumni: IBAN nie ein Mangel
 * (Entscheidung 3). Hinweise (`vorwahl_ergaenzt`) blockieren nie. Die BIC wird nicht bewertet.
 */
export function bewerteBestand(bestand: DatenBestand, alumni: boolean, heute?: string): BestandsBewertung {
  const r = pruefeBestand(alsDaten(bestand), { alumni: alumni === true, wer: "mitglied", heute });
  const land = landAusBestand(bestand.land);
  const fehler: FeldFehler = {};
  for (const m of r.maengel) {
    if (!istBestandsFeld(m.feld)) continue;
    if (m.code === "land_unbekannt" && m.feld !== "land") continue;
    if (fehler[m.feld] !== undefined) continue;
    fehler[m.feld] = m.feld === "plz" && m.code === "format" && land === DEFAULT_COUNTRY ? PLZ_DE_MELDUNG : (r.fehler[m.feld] ?? "");
  }
  const hinweise: Partial<Record<Feld, string>> = {};
  for (const h of r.hinweise) {
    if (!istBestandsFeld(h.feld)) continue;
    if (fehler[h.feld] !== undefined) continue;
    if (h.code === "vorwahl_ergaenzt") hinweise[h.feld] = HINWEIS_VORWAHL;
  }
  return { gueltig: Object.keys(fehler).length === 0, fehler, hinweise, werte: r.werte };
}

function istBestandsFeld(feld: Feld): boolean {
  return (BESTANDS_FELDER as readonly string[]).includes(feld);
}

/** Felder, die „Stimmt alles“ normalisiert zurückschreiben darf (ohne Land; ohne BIC, die wird nicht mehr geprüft). */
const SECRET_FELDER_OHNE_LAND = ["strasse", "hausnummer", "plz", "ort", "handynummer", "geburtsdatum", "iban"] as const;

function leerZuNull(wert: string | undefined): string | null {
  return wert ? wert : null;
}

/**
 * Was „Stimmt alles“ schreibt: die normalisierten Werte, die vom Gespeicherten abweichen (z. B. Handy als E.164,
 * auch bei ergänzter Vorwahl; IBAN ohne Leerzeichen). Unveränderte Werte werden nicht neu geschrieben (U6). Das
 * Land kommt mit, sobald sich etwas ändert oder es vom angezeigten abweicht (wie im Profil); bei unbekanntem Land
 * (Übergang ohne Spalte) nie. Alumni: Bankdaten bleiben unangetastet (nie ein Mangel, also nie bestätigt).
 */
export function bestaetigungsAenderungen(
  bestand: DatenBestand,
  werte: Partial<Record<Feld, string>>,
  alumni: boolean,
  landBekannt = true,
): { secrets: Partial<MemberSecretValues>; namen: { vorname?: string; nachname?: string } } {
  const secrets: Partial<MemberSecretValues> = {};
  for (const feld of SECRET_FELDER_OHNE_LAND) {
    if (alumni && feld === "iban") continue;
    if (werte[feld] === undefined) continue;
    const neu = leerZuNull(werte[feld]);
    if (neu !== (bestand[feld] ?? null)) secrets[feld] = neu;
  }
  if (landBekannt && werte.land !== undefined) {
    const neu = leerZuNull(werte.land);
    if (neu !== (bestand.land ?? null) && (Object.keys(secrets).length > 0 || neu !== landAusBestand(bestand.land))) {
      secrets.land = neu;
    }
  }
  const namen: { vorname?: string; nachname?: string } = {};
  for (const feld of ["vorname", "nachname"] as const) {
    const neu = werte[feld];
    if (neu !== undefined && neu !== "" && neu !== (bestand[feld] ?? "")) namen[feld] = neu;
  }
  return { secrets, namen };
}

// ---------------------------------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------------------------------

const ZEILEN: { key: DatenCheckZeilenSchluessel; label: string; felder: readonly Feld[] }[] = [
  { key: "name", label: "Name", felder: ["vorname", "nachname"] },
  { key: "anschrift", label: "Anschrift", felder: ["strasse", "hausnummer", "plz", "ort", "land"] },
  { key: "handy", label: "Handy", felder: ["handynummer"] },
  { key: "email", label: "E-Mail", felder: [] },
  { key: "iban", label: "IBAN", felder: ["iban"] },
  { key: "geburtsdatum", label: "Geburtsdatum", felder: ["geburtsdatum"] },
];

/** IBAN maskiert: nur die letzten vier Stellen („…1234“). */
export function ibanMaskiert(iban: string | null | undefined): string {
  const clean = normalizeIban(text(iban));
  return clean ? `…${clean.slice(-4)}` : "";
}

function datumDeutsch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * Daten für das Fenster: kompakte Übersicht (gültige Felder normalisiert, d. h. so, wie „Stimmt alles“ sie
 * bestätigt; fehlerhafte roh), Mängel und Hinweise je Zeile, Ausgangswerte für „Ändern“.
 */
export function bauDatenCheckAnsicht({
  bestand,
  alumni,
  email,
  version,
  landBekannt,
  spaeterMoeglich,
  heute,
}: {
  bestand: DatenBestand;
  alumni: boolean;
  /** Login-Adresse (wird angezeigt, nicht geprüft). */
  email: string;
  version: number;
  landBekannt: boolean;
  /** „Später“ zeitlich noch erlaubt (spaeterBis ≠ null); bei Mängeln gilt es ohnehin nicht. */
  spaeterMoeglich: boolean;
  heute?: string;
}): DatenCheckAnsicht {
  const b = bewerteBestand(bestand, alumni, heute);
  const wert = (feld: Feld): string =>
    b.fehler[feld] === undefined && b.werte[feld] !== undefined ? b.werte[feld]! : text(bestand[feld as keyof DatenBestand]).trim();

  const anzeige: Record<DatenCheckZeilenSchluessel, string[]> = {
    name: [`${wert("vorname")} ${wert("nachname")}`.trim()],
    anschrift: [
      `${wert("strasse")} ${wert("hausnummer")}`.trim(),
      `${wert("plz")} ${wert("ort")}`.trim(),
      findCountry(b.fehler.land === undefined ? (b.werte.land ?? DEFAULT_COUNTRY) : text(bestand.land))?.name ?? text(bestand.land),
    ],
    handy: [
      b.fehler.handynummer === undefined && b.werte.handynummer
        ? formatiereHandyAnzeige(b.werte.handynummer)
        : text(bestand.handynummer).trim(),
    ],
    email: [email],
    iban: [ibanMaskiert(bestand.iban)],
    geburtsdatum: [datumDeutsch(wert("geburtsdatum"))],
  };

  // Anschrift ganz leer: keine Werte (das vorbelegte Land allein ist kein Wert, Review B3). Die Anschrift ist
  // freiwillig; nur wenn sie trotzdem einen Mangel hat (IBAN außerhalb des EWR), eine Zeile für die ganze
  // Anschrift statt der Meldungen je Feld. Die Feldmarkierungen im Formular bleiben.
  const anschriftLeer = (["strasse", "hausnummer", "plz", "ort"] as const).every((f) => !text(bestand[f]).trim());
  const anschriftMangel = ZEILEN.find((z) => z.key === "anschrift")!.felder.some((f) => b.fehler[f] !== undefined);
  if (anschriftLeer) anzeige.anschrift = [];

  const zeilen: DatenCheckZeile[] = [];
  for (const z of ZEILEN) {
    const werte = anzeige[z.key].filter((w) => w !== "");
    const fehler =
      z.key === "anschrift" && anschriftLeer && anschriftMangel
        ? ANSCHRIFT_FEHLT
        : z.felder.map((f) => b.fehler[f]).find((f) => f !== undefined);
    const hinweis = z.felder.map((f) => b.hinweise[f]).find((h) => h !== undefined);
    // Alumni ohne Bankdaten: Zeile weglassen (nicht nötig, kein Mangel).
    if (alumni && z.key === "iban" && werte.length === 0) continue;
    const zeile: DatenCheckZeile = { key: z.key, label: z.label, wert: werte };
    if (fehler) zeile.fehler = fehler;
    if (hinweis) zeile.hinweis = hinweis;
    zeilen.push(zeile);
  }

  const handy = handyFuerEingabe(bestand.handynummer);
  return {
    zeilen,
    gueltig: b.gueltig,
    spaeterErlaubt: b.gueltig && spaeterMoeglich,
    formular: {
      vorname: text(bestand.vorname).trim(),
      nachname: text(bestand.nachname).trim(),
      strasse: bestand.strasse ?? "",
      hausnummer: bestand.hausnummer ?? "",
      plz: bestand.plz ?? "",
      ort: bestand.ort ?? "",
      land: landAusBestand(bestand.land),
      handyLand: handy.land,
      handyNummer: handy.nummer,
      geburtsdatum: (bestand.geburtsdatum ?? "").trim(),
      iban: bestand.iban ?? "",
      alumni,
      version,
      landUnbekannt: !landBekannt,
    },
    formularFehler: { ...b.fehler },
  };
}

// ---------------------------------------------------------------------------------------------------
// „Ändern“ im Fenster
// ---------------------------------------------------------------------------------------------------

/** Felder des Formulars „Ändern“, wie es sie sendet (beide Profil-Abschnitte). */
export const AENDERN_FELDER = [
  "vorname",
  "nachname",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "land",
  "handyLand",
  "handynummer",
  "geburtsdatum",
  "iban",
] as const;

/**
 * „Ändern“ prüfen: dieselben Regeln wie das Profil (`pruefeProfil` für beide Abschnitte, Kontext `mitglied`),
 * danach der Bestand, wie er nach dem Speichern wäre (`bewerteBestand`): Ein unverändertes fehlerhaftes Feld
 * (z. B. alte Handynummer) muss ebenfalls korrigiert werden, sonst gilt nichts als bestätigt. Gespeichert werden
 * die Änderungen des Formulars plus die normalisierten Werte des Rests (wie „Stimmt alles“). Alles oder nichts.
 */
export function pruefeDatenCheckAenderung(
  eingabe: Record<string, unknown>,
  bestand: DatenBestand,
  alumni: boolean,
  landUnbekannt: boolean,
  heute?: string,
): {
  gueltig: boolean;
  fehler: FeldFehler;
  ersterFehler: string | null;
  secrets: Partial<MemberSecretValues>;
  namen: { vorname?: string; nachname?: string };
} {
  const persoenlich: Record<string, unknown> = {};
  for (const key of ["vorname", "nachname", "strasse", "hausnummer", "plz", "ort", "land", "handyLand", "handynummer", "geburtsdatum"]) {
    persoenlich[key] = eingabe[key];
  }
  const bank: Record<string, unknown> = { iban: eingabe.iban };
  const p = pruefeProfil("personal", persoenlich, bestand, alumni, heute, landUnbekannt);
  // Pflicht-Anschrift bei einer IBAN außerhalb des EWR: Die Anschrift steht im selben Formular, das meldet die
  // Bewertung des Bestands danach am Feld (nicht an der IBAN wie im Profil).
  const k = pruefeProfil("bank", bank, bestand, alumni, heute, landUnbekannt, false);
  const formFehler: FeldFehler = { ...p.fehler, ...k.fehler };
  if (!p.gueltig || !k.gueltig) {
    return { gueltig: false, fehler: formFehler, ersterFehler: p.ersterFehler ?? k.ersterFehler, secrets: {}, namen: {} };
  }

  const nachher: DatenBestand = {
    ...bestand,
    ...p.aenderungen,
    ...k.aenderungen,
    vorname: p.namen.vorname ?? bestand.vorname ?? null,
    nachname: p.namen.nachname ?? bestand.nachname ?? null,
  };
  const b = bewerteBestand(nachher, alumni, heute);
  if (!b.gueltig) {
    const ersterFehler = Object.values(b.fehler).find((f) => f !== undefined) ?? null;
    return { gueltig: false, fehler: b.fehler, ersterFehler, secrets: {}, namen: {} };
  }
  const rest = bestaetigungsAenderungen(nachher, b.werte, alumni, !landUnbekannt);
  return {
    gueltig: true,
    fehler: {},
    ersterFehler: null,
    secrets: { ...p.aenderungen, ...k.aenderungen, ...rest.secrets },
    namen: { ...p.namen, ...rest.namen },
  };
}

// ---------------------------------------------------------------------------------------------------
// Laden (Layout, nur wenn fällig)
// ---------------------------------------------------------------------------------------------------

/**
 * Daten für das Fenster laden: eigene verschlüsselte Zeile lesen (Service Role) und bewerten. Nur aufrufen, wenn
 * die Abfrage fällig ist. Ist die Zeile nicht lesbar, kein Fenster (null, nur Log ohne Werte): Ein Schlüsselproblem
 * soll niemanden aussperren.
 */
export async function ladeDatenCheckAnsicht({
  admin,
  profil,
  email,
  einstellungen,
  jetzt = new Date(),
}: {
  admin: SupabaseClient;
  profil: Record<string, unknown>;
  email: string;
  einstellungen: DatenCheckEinstellungen;
  jetzt?: Date;
}): Promise<DatenCheckAnsicht | null> {
  const id = String(profil.id ?? "").trim();
  if (!id) return null;
  try {
    const gelesen = await readMemberSecretsWithMeta(admin, id);
    const values = gelesen?.values ?? emptySecretValues();
    return bauDatenCheckAnsicht({
      bestand: {
        ...values,
        vorname: typeof profil.Vorname === "string" ? profil.Vorname : null,
        nachname: typeof profil.Nachname === "string" ? profil.Nachname : null,
      },
      alumni: isAlumniProfile(profil),
      email,
      version: gelesen?.version ?? 0,
      landBekannt: gelesen ? gelesen.landBekannt : true,
      spaeterMoeglich: spaeterBis({ jetzt, start: einstellungen.start }) !== null,
    });
  } catch (err) {
    console.error("Datenabfrage: lesen", err instanceof Error ? err.message : "unbekannt");
    return null;
  }
}

/**
 * Fenster-Daten für das eigene Profil, falls die Abfrage fällig ist (sonst null). Fälligkeit aus den Spalten von
 * getCachedAuth (kein zusätzlicher Datenbankaufruf); entschlüsselt wird nur, wenn fällig.
 */
export async function faelligerDatenCheck({
  profil,
  email,
  spalten,
  admin,
}: {
  profil: Record<string, unknown> | null;
  email: string;
  /** getCachedAuth hat die Spalten gelesen (Migration eingespielt). */
  spalten: boolean;
  admin: () => SupabaseClient;
}): Promise<DatenCheckAnsicht | null> {
  if (!profil || !spalten) return null;
  const einstellungen = datenCheckEinstellungen();
  const faellig = istAbfrageFaellig({
    eingeschaltet: einstellungen.eingeschaltet,
    aktiv: isActiveMemberProfile(profil),
    bestaetigtAm: profil.daten_bestaetigt_am as string | null,
    erinnernAb: profil.daten_erinnern_ab as string | null,
  });
  if (!faellig) return null;
  return ladeDatenCheckAnsicht({ admin: admin(), profil, email, einstellungen });
}
