// Auswertung für scripts/namen.mjs: rein, ohne Datenbank und ohne Umgebung, damit sie mit erfundenen Daten
// getestet werden kann (tests/namen-skript.test.mjs).
//
// Grundsatz wie bei datenqualitaet: Ausgaben enthalten nur Zahlen und Codes – nie Namen, E-Mails oder Profil-IDs.
// Einzige Ausnahme ist die TSV-Liste (`listeTsv`), die nur auf ausdrücklichen Wunsch (`--liste <datei>`) und nur
// außerhalb des Repos geschrieben wird: Profil-ID + vorgeschlagener Name + sicherheit, damit der Vorstand die
// Fälle vor dem Schreiben ansehen kann.
import { OFFEN_GRUENDE, VORSCHLAG_GRUENDE, nameAusEmail } from "../../lib/name-aus-email.ts";
import { gruppeVon, leseArgumente } from "./datenqualitaet.mjs";

/** Quelle im Korrekturprotokoll (member_data_corrections.quelle). */
export const PROTOKOLL_QUELLE = "bereinigung";

/** Schalter nur für dieses Skript: auch „vorschlag“ (Umschrift, Namenszusatz) schreiben. */
export const MIT_VORSCHLAEGEN = "--mit-vorschlaegen";

/**
 * Status je Profil:
 *   hat_namen        Vor- und Nachname eingetragen (nichts zu tun)
 *   teilweise        nur einer von beiden eingetragen (bleibt, Vorstand)
 *   sicher           beide leer, Name eindeutig aus der Adresse
 *   vorschlag        beide leer, Name geraten (Umschrift, Namenszusatz) – nur mit --mit-vorschlaegen geschrieben
 *   offen            beide leer, kein Name ableitbar
 *   konto_hat_namen  beide leer, aber das Login-Konto hat einen Namen in den Metadaten (bleibt, Vorstand)
 */
export const STATUS = Object.freeze(["hat_namen", "teilweise", "sicher", "vorschlag", "offen", "konto_hat_namen"]);

/** Leer = null/undefined oder nur Leerraum (die Datenbankfunktion prüft dasselbe mit `^\s*$`). */
export function istLeer(wert) {
  return wert === null || wert === undefined || (typeof wert === "string" && /^\s*$/.test(wert));
}

/** Hat ein Login-Konto (auth user_metadata) einen Vor- oder Nachnamen? */
export function kontoHatNamen(metadaten) {
  if (!metadaten || typeof metadaten !== "object") return false;
  return !istLeer(metadaten.Vorname ?? null) || !istLeer(metadaten.Nachname ?? null);
}

/** Schlüssel für den Vergleich „gleicher Name wie ein anderes Profil“ (ohne Groß-/Kleinschreibung). */
export function namensSchluessel(vorname, nachname) {
  if (istLeer(vorname) || istLeer(nachname)) return null;
  return `${String(vorname).trim().toLocaleLowerCase("de-DE")} ${String(nachname).trim().toLocaleLowerCase("de-DE")}`;
}

/**
 * Ein Profil bewerten.
 *   profil           Zeile aus profiles (`Status`, `Rolle`, `Vorname`, `Nachname`, `E-Mail`)
 *   kontoMitNamen    hat das Login-Konto einen Namen in den Metadaten? (false, wenn es kein Konto gibt)
 *   mitVorschlaegen  auch „vorschlag“ schreiben
 * Liefert { gruppe, status, vorname, nachname, gruende, aendern }:
 *   vorname/nachname  abgeleiteter Name (sicher/vorschlag) oder null
 *   aendern           true nur bei Gruppe „aktiv“ und „sicher“ (mit mitVorschlaegen auch „vorschlag“)
 */
export function bewerteNamen(profil, { kontoMitNamen = false, mitVorschlaegen = false } = {}) {
  const gruppe = gruppeVon(profil);
  const nichts = { gruppe, vorname: null, nachname: null, gruende: [], aendern: false };
  const vLeer = istLeer(profil?.Vorname);
  const nLeer = istLeer(profil?.Nachname);
  if (!vLeer && !nLeer) return { ...nichts, status: "hat_namen" };
  if (!vLeer || !nLeer) return { ...nichts, status: "teilweise" };

  const n = nameAusEmail(profil?.["E-Mail"]);
  if (n.sicherheit === "offen") return { ...nichts, status: "offen", gruende: [...n.gruende] };
  const basis = { gruppe, vorname: n.vorname, nachname: n.nachname, gruende: [...n.gruende] };
  if (kontoMitNamen) return { ...basis, status: "konto_hat_namen", aendern: false };
  const schreiben = n.sicherheit === "sicher" || mitVorschlaegen;
  return { ...basis, status: n.sicherheit, aendern: gruppe === "aktiv" && schreiben };
}

/**
 * Alle Profile bewerten.
 *   profile          Zeilen aus profiles (inkl. `id`, `user_id`)
 *   kontenMitNamen   Set der Konto-IDs (user_id) mit Namen in den Metadaten
 * Liefert [{ id, userId, bewertung, doppelt }]. `doppelt`: der abgeleitete Name steht schon bei einem anderen
 * Profil oder wird für mehrere Profile abgeleitet (mögliches Doppelprofil – nur gezählt und in der Liste
 * markiert, blockiert nicht).
 */
export function bewerteAlle(profile, kontenMitNamen = new Set(), optionen = {}) {
  const eintraege = profile.map((p) => {
    const userId = p.user_id ? String(p.user_id) : null;
    const kontoMitNamen = userId !== null && kontenMitNamen.has(userId);
    return { id: String(p.id), userId, bewertung: bewerteNamen(p, { ...optionen, kontoMitNamen }) };
  });
  const anzahl = new Map();
  const zaehleSchluessel = (k) => k && anzahl.set(k, (anzahl.get(k) ?? 0) + 1);
  profile.forEach((p) => zaehleSchluessel(namensSchluessel(p.Vorname, p.Nachname)));
  eintraege.forEach((e) => zaehleSchluessel(namensSchluessel(e.bewertung.vorname, e.bewertung.nachname)));
  return eintraege.map((e) => {
    const k = namensSchluessel(e.bewertung.vorname, e.bewertung.nachname);
    return { ...e, doppelt: Boolean(k) && anzahl.get(k) > 1 };
  });
}

// ---------------------------------------------------------------------------------------------------
// Zählen
// ---------------------------------------------------------------------------------------------------

const leereStatus = () => Object.fromEntries(STATUS.map((s) => [s, 0]));

export function neueZaehlung() {
  return {
    profile: 0,
    aktiv: 0,
    gekuendigt: 0,
    antragOffen: 0,
    /** aktive Profile: Status → Anzahl */
    status: leereStatus(),
    /** aktive Profile mit „offen“: Grund → Anzahl */
    offenGruende: Object.fromEntries(OFFEN_GRUENDE.map((g) => [g, 0])),
    /** aktive Profile mit „vorschlag“: Grund → Anzahl (ein Profil kann mehrere Gründe haben) */
    vorschlagGruende: Object.fromEntries(VORSCHLAG_GRUENDE.map((g) => [g, 0])),
    /** aktive Profile mit sicher/vorschlag, deren Name es schon gibt */
    doppelt: 0,
    /** gekündigt + Antrag offen: Status → Anzahl (nur gezählt, nie geändert) */
    nichtBetroffen: leereStatus(),
    /** Profile, die `reparieren` ändern würde */
    zuAendern: 0,
  };
}

export function zaehle(z, eintrag) {
  const b = eintrag.bewertung;
  z.profile++;
  if (b.gruppe !== "aktiv") {
    if (b.gruppe === "gekuendigt") z.gekuendigt++;
    else z.antragOffen++;
    z.nichtBetroffen[b.status]++;
    return z;
  }
  z.aktiv++;
  z.status[b.status]++;
  if (b.status === "offen") for (const g of b.gruende) z.offenGruende[g]++;
  if (b.status === "vorschlag") for (const g of b.gruende) z.vorschlagGruende[g]++;
  if ((b.status === "sicher" || b.status === "vorschlag") && eintrag.doppelt) z.doppelt++;
  if (b.aendern) z.zuAendern++;
  return z;
}

export function zaehleAlle(eintraege) {
  const z = neueZaehlung();
  for (const e of eintraege) zaehle(z, e);
  return z;
}

// ---------------------------------------------------------------------------------------------------
// Ausgabe (nur Zahlen und Codes)
// ---------------------------------------------------------------------------------------------------

const zahl = (n) => String(Number.isFinite(n) ? n : 0);
const zeile = (label, n, breite = 56) => `  ${label.padEnd(breite)} ${zahl(n).padStart(5)}`;

const OFFEN_TEXT = {
  adresse: "keine gültige Adresse",
  teile: "nicht genau zwei Teile (vorname.nachname)",
  ziffern: "Ziffern",
  zeichen: "andere Zeichen",
  kurz: "Einzelbuchstabe (Initiale)",
  rolle: "Rollenadresse (info, kontakt, …)",
  gleich: "Vor- und Nachname gleich",
  name: "verletzt die Namensregel",
};
const VORSCHLAG_TEXT = {
  umschrift: "Umschrift ae/oe/ue → ä/ö/ü",
  anfang: "ae/oe/ue am Wortanfang (unverändert)",
  partikel: "Namenszusatz (von, van, de …)",
};

function kopf(z) {
  return [
    zeile("Profile gesamt", z.profile),
    zeile("betroffen (aktiv inkl. Vorstand und Alumni)", z.aktiv),
    zeile("nicht betroffen: gekündigt (nur gezählt)", z.gekuendigt),
    zeile("nicht betroffen: Antrag offen (nur gezählt)", z.antragOffen),
  ];
}

function statusZeilen(st, einrueck = "") {
  return [
    zeile(`${einrueck}Vor- und Nachname eingetragen`, st.hat_namen),
    zeile(`${einrueck}nur einer eingetragen (bleibt)`, st.teilweise),
    zeile(`${einrueck}beide leer: sicher (aus der Adresse)`, st.sicher),
    zeile(`${einrueck}beide leer: vorschlag (Vorstand prüft)`, st.vorschlag),
    zeile(`${einrueck}beide leer: offen (kein Name ableitbar)`, st.offen),
    zeile(`${einrueck}beide leer: Konto hat einen Namen (bleibt)`, st.konto_hat_namen),
  ];
}

function gruendeZeilen(z) {
  return [
    "Vorschläge je Grund (betroffene Profile, mehrere je Profil möglich)",
    ...VORSCHLAG_GRUENDE.map((g) => zeile(`  ${VORSCHLAG_TEXT[g]}`, z.vorschlagGruende[g])),
    "",
    "Offen je Grund (betroffene Profile)",
    ...OFFEN_GRUENDE.map((g) => zeile(`  ${OFFEN_TEXT[g]}`, z.offenGruende[g])),
    "",
    zeile("sicher/vorschlag mit Namen, den es schon gibt (Doppelprofil?)", z.doppelt),
  ];
}

/** Ausgabe von `pruefen`. */
export function formatierePruefung(z) {
  return [
    "Prüfung Namen (nur Zählungen)",
    ...kopf(z),
    "",
    "Betroffene Profile",
    ...statusZeilen(z.status, "  "),
    "",
    ...gruendeZeilen(z),
    "",
    "Gekündigt + Antrag offen (nur gezählt, nie geändert)",
    ...statusZeilen(z.nichtBetroffen, "  "),
  ].join("\n");
}

/** Ausgabe von `reparieren --probelauf` (und vor `reparieren`). */
export function formatiereProbelauf(z, mitVorschlaegen) {
  return [
    "Probelauf Namen (ändert nichts)",
    mitVorschlaegen
      ? "  geschrieben wird „sicher“ und „vorschlag“ (--mit-vorschlaegen), nur bei betroffenen Profilen mit leerem Vor- und Nachnamen"
      : "  geschrieben wird nur „sicher“, nur bei betroffenen Profilen mit leerem Vor- und Nachnamen",
    ...kopf(z),
    "",
    "Betroffene Profile",
    ...statusZeilen(z.status, "  "),
    "",
    ...gruendeZeilen(z),
    "",
    zeile("Profile, die „reparieren“ ändern würde", z.zuAendern),
  ].join("\n");
}

/**
 * TSV für `--liste`: alle betroffenen Profile mit leerem Vor- und Nachnamen (sicher, vorschlag, offen,
 * konto_hat_namen): Profil-ID, vorgeschlagener Vor-/Nachname, sicherheit, Gründe, doppelt (ja/nein).
 * Enthält Namen – deshalb nur auf ausdrücklichen Wunsch und nur außerhalb des Repos, nie auf stdout.
 */
export function listeTsv(eintraege) {
  const zeilen = [["profil_id", "vorname", "nachname", "sicherheit", "gruende", "doppelt"].join("\t")];
  for (const { id, bewertung: b, doppelt } of eintraege) {
    if (b.gruppe !== "aktiv" || !["sicher", "vorschlag", "offen", "konto_hat_namen"].includes(b.status)) continue;
    zeilen.push(
      [String(id), b.vorname ?? "", b.nachname ?? "", b.status, b.gruende.join(","), doppelt ? "ja" : "nein"].join("\t")
    );
  }
  return `${zeilen.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------------------------------

/**
 * Kommandozeile wie scripts/datenqualitaet.mjs (gleiche Ziele, Sicherungen, --liste nur außerhalb des Repos),
 * dazu `--mit-vorschlaegen` (nur bei „reparieren“, auch mit --probelauf). Liefert { fehler } oder die Argumente
 * von leseArgumente plus `mitVorschlaegen`.
 */
export function leseNamenArgumente(argv, env = {}, repoWurzel = null) {
  const anzahl = argv.filter((a) => a === MIT_VORSCHLAEGEN).length;
  if (anzahl > 1) return { fehler: `${MIT_VORSCHLAEGEN} ist doppelt angegeben.` };
  const args = leseArgumente(
    argv.filter((a) => a !== MIT_VORSCHLAEGEN),
    env,
    repoWurzel
  );
  if (args.fehler) {
    return args.fehler.startsWith("Unbekannte Option.") ? { fehler: `${args.fehler}, ${MIT_VORSCHLAEGEN}` } : args;
  }
  const mitVorschlaegen = anzahl === 1;
  if (mitVorschlaegen && args.befehl !== "reparieren") {
    return { fehler: `${MIT_VORSCHLAEGEN} gibt es nur bei „reparieren“.` };
  }
  return { ...args, mitVorschlaegen };
}

// ---------------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------------

export function neuesReparaturErgebnis() {
  return {
    geplant: 0,
    geaendert: 0,
    sicher: 0,
    vorschlag: 0,
    konflikt: 0,
    inzwischenErledigt: 0,
    fehler: 0,
    abgebrochen: false,
    bearbeitet: 0,
  };
}

export function formatiereReparatur(r) {
  return [
    r.abgebrochen ? `Reparatur abgebrochen nach ${zahl(r.bearbeitet)} von ${zahl(r.geplant)} Profilen (Strg+C)` : "Reparatur fertig",
    zeile("Profile geändert (mit Protokoll)", r.geaendert),
    zeile("  davon sicher", r.sicher),
    zeile("  davon vorschlag", r.vorschlag),
    zeile("übersprungen: Name inzwischen eingetragen (nicht wiederholt)", r.konflikt),
    zeile("übersprungen: inzwischen nichts mehr zu tun", r.inzwischenErledigt),
    zeile("Fehler", r.fehler),
  ].join("\n");
}

/** Profil-ID, die es nie gibt (Funktionsprobe). */
export const PROBE_PROFIL = "00000000-0000-0000-0000-000000000000";

/**
 * Argumente der Funktionsprobe vor „reparieren“: eine Profil-ID, die es nicht gibt, gültige Werte und der ECHTE
 * Vorstand. So läuft die Probe durch die Vorstandsprüfung der Datenbankfunktion (Migration 20261120110000) und
 * liefert nur dann `false`, wenn die Funktion bis zum Update fehlerfrei kommt – ein Fehler wie der Enum-Vergleich
 * in 20261120100000 fällt auf, bevor ein Profil angefasst wird.
 */
export function funktionsProbe(vorstand) {
  return {
    p_profile_id: PROBE_PROFIL,
    p_expected_vorname: null,
    p_expected_nachname: null,
    p_vorname: "Test",
    p_nachname: "Test",
    p_corrected_by: vorstand,
  };
}

/**
 * Ein Profil schreiben: frisch lesen und neu bewerten (Gruppe, leere Namen, Adresse, Konto-Metadaten), dann über
 * die Datenbankfunktion save_member_name_bereinigung (Compare-and-set „noch leer“ + Protokoll in EINER
 * Transaktion).
 *   db  { lese(id) → Zeile | null, kontoHatNamen(userId) → boolean,
 *         speichere(id, altVorname, altNachname, vorname, nachname) → true (gespeichert) | false (nicht mehr leer) }
 * Liefert "sicher" | "vorschlag" (geschrieben) | "erledigt" | "konflikt" | "fehler".
 */
export async function schreibeProfil(db, id, { mitVorschlaegen = false } = {}) {
  let frisch;
  let kontoMitNamen = false;
  try {
    frisch = await db.lese(id);
    if (frisch?.user_id) kontoMitNamen = (await db.kontoHatNamen(String(frisch.user_id))) === true;
  } catch {
    return "fehler";
  }
  if (!frisch) return "erledigt";
  const b = bewerteNamen(frisch, { kontoMitNamen, mitVorschlaegen });
  if (!b.aendern) return "erledigt";
  let ok;
  try {
    ok = await db.speichere(id, frisch.Vorname ?? null, frisch.Nachname ?? null, b.vorname, b.nachname);
  } catch {
    return "fehler";
  }
  if (ok !== true) return "konflikt";
  return b.status;
}
