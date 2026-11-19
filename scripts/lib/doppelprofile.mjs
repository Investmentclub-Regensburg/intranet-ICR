// Auswertung für scripts/doppelprofile.mjs: rein, ohne Datenbank und ohne Umgebung, damit sie mit erfundenen Daten
// getestet werden kann (tests/doppelprofile-skript.test.mjs).
//
// Doppelprofil = zwei Profile mit derselben E-Mail-Adresse ohne Groß-/Kleinschreibung und ohne Leerzeichen am Rand
// (SQL: lower(btrim("E-Mail")), wie der Unique-Index profiles_email_lower_key). Befund und Entscheidungen:
// _intern/…/doppelprofile-bericht.md (nicht im Repo).
//
// Muster, das automatisch zusammengeführt wird (alles andere ist „pruefen“ und wird NIE angefasst):
//   A = Profil mit Login-Konto, id = user_id, ohne Vor- und Nachnamen, ohne verschlüsselte Daten, ohne
//       Klartext-IBAN, ohne Mitgliedsnummer, ohne Mandatsdatum, Rolle member (oder gleich B), jünger als B
//   B = Profil ohne Konto mit Vor- und Nachnamen und IBAN in member_secrets, IBAN-Fingerabdruck bei keinem
//       anderen Profil
//   genau diese zwei Profile haben die Adresse; das Konto hat dieselbe Adresse, keine offene Registrierung, und
//   seine Sperre passt zum Status von A (gekündigt ⇔ gesperrt)
//   Status: beide aktiv oder beide gekündigt → „zusammenfuehren“; nur A gekündigt (mit Datum, B nicht Vorstand/
//   Admin) → „kuendigung“ (Kündigung wird übernommen); B gekündigt, A aktiv → prüfen; Antrag offen → prüfen
// Die Datenbankfunktion merge_member_doppelprofil prüft dieselben Kriterien ein zweites Mal.
//
// Grundsatz wie bei datenqualitaet: Ausgaben enthalten nur Zahlen und Codes – nie Namen, E-Mails oder Profil-IDs.
// Einzige Ausnahme ist die TSV-Liste (`listeTsv`), nur auf ausdrücklichen Wunsch (`--liste <datei>`) und nur
// außerhalb des Repos: Profil-IDs + Einstufung + Gründe (keine Namen, keine Adressen).
import { leseArgumente } from "./datenqualitaet.mjs";
import { istLeer } from "./namen.mjs";

/** Quelle im Korrekturprotokoll (member_data_corrections.quelle). */
export const PROTOKOLL_QUELLE = "bereinigung";

/** Sperre, die der Trigger profiles_sync_auth_ban für gekündigte Profile setzt. */
export const SPERRE_BIS = Date.parse("2999-12-31T00:00:00Z");

/** Verschlüsselte Felder in member_secrets (für die Prüfung „A hat Daten“ – nur null/nicht null, nie Werte). */
export const SECRET_SPALTEN = Object.freeze([
  "iban",
  "bic",
  "geburtsdatum",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "handynummer",
  "land",
]);

/** Spalten, die das Skript aus profiles liest. */
export const PROFIL_SPALTEN =
  'id, user_id, "E-Mail", "Status", "Rolle", "Vorname", "Nachname", "Mitgliedsnummer", "Datum_Kündigung", ' +
  '"Datum_Mandat", "IBAN", letzter_news_aufruf, created_at';

/** Compare-and-set: diese Spalten müssen beim Schreiben noch dem gelesenen Stand entsprechen (merge_member_doppelprofil_stand). */
export const CAS_SPALTEN = Object.freeze([
  "user_id",
  "E-Mail",
  "Status",
  "Datum_Kündigung",
  "Vorname",
  "Nachname",
  "Rolle",
  "Mitgliedsnummer",
  "Datum_Mandat",
  "letzter_news_aufruf",
]);

export const EINSTUFUNGEN = Object.freeze(["zusammenfuehren", "kuendigung", "pruefen"]);

/** Gründe für „pruefen“ (Reihenfolge = Ausgabe). */
export const GRUENDE = Object.freeze([
  "gruppe_groesse",
  "beide_konto",
  "kein_konto",
  "a_id_ungleich_konto",
  "a_hat_namen",
  "b_ohne_namen",
  "a_hat_daten",
  "a_hat_stammdaten",
  "b_ohne_iban",
  "iban_gruppe",
  "antrag_offen",
  "b_gekuendigt",
  "kuendigung_ohne_datum",
  "kuendigung_vorstand",
  "rolle",
  "reihenfolge",
  "konto_fehlt",
  "konto_email",
  "konto_sperre",
  "registrierung_offen",
]);

export const GRUND_TEXT = Object.freeze({
  gruppe_groesse: "mehr als zwei Profile mit der Adresse",
  beide_konto: "beide Profile mit Login-Konto",
  kein_konto: "kein Profil mit Login-Konto",
  a_id_ungleich_konto: "Konto-Profil nicht vom Konto angelegt (id ≠ user_id)",
  a_hat_namen: "Konto-Profil hat einen Namen",
  b_ohne_namen: "Import-Profil ohne Vor- oder Nachnamen",
  a_hat_daten: "Konto-Profil hat Daten (verschlüsselt oder IBAN)",
  a_hat_stammdaten: "Konto-Profil hat Mitgliedsnummer oder Mandat",
  b_ohne_iban: "Import-Profil ohne IBAN",
  iban_gruppe: "IBAN auch bei einem anderen Profil",
  antrag_offen: "Antrag offen",
  b_gekuendigt: "Import-Profil gekündigt, Konto-Profil aktiv",
  kuendigung_ohne_datum: "Kündigung ohne Datum",
  kuendigung_vorstand: "Kündigung übernehmen bei Vorstand/Admin",
  rolle: "verschiedene Rollen",
  reihenfolge: "Import-Profil jünger als Konto-Profil",
  konto_fehlt: "Login-Konto nicht gefunden",
  konto_email: "Konto hat eine andere Adresse",
  konto_sperre: "Kontosperre passt nicht zum Status",
  registrierung_offen: "offene Registrierung zum Konto",
});

/**
 * Schlüssel für den Vergleich: wie SQL lower(btrim(x)) – btrim entfernt nur Leerzeichen, nicht Tabs/Umbrüche.
 * Liefert null bei fehlender oder leerer Adresse.
 */
export function emailSchluessel(email) {
  if (typeof email !== "string") return null;
  const k = email.replace(/^ +| +$/g, "").toLowerCase();
  return k === "" ? null : k;
}

const status = (p) => String(p?.Status ?? "").trim().toLowerCase();
const rolle = (p) => (p?.Rolle === null || p?.Rolle === undefined ? null : String(p.Rolle));

/** Ist die Sperre des Kontos die der Kündigung (banned_until ≥ 2999-12-31)? */
export function kontoGesperrt(bannedUntil) {
  if (bannedUntil === null || bannedUntil === undefined || bannedUntil === "") return false;
  const t = Date.parse(String(bannedUntil));
  return Number.isFinite(t) && t >= SPERRE_BIS;
}

/** member_secrets-Zeile → { daten, iban, ibanHash } (Werte werden sofort verworfen). */
export function secretsKurz(zeile) {
  const daten = SECRET_SPALTEN.some((s) => zeile?.[s] !== null && zeile?.[s] !== undefined);
  return {
    daten,
    iban: zeile?.iban !== null && zeile?.iban !== undefined,
    ibanHash: typeof zeile?.iban_hash === "string" && zeile.iban_hash !== "" ? zeile.iban_hash : null,
  };
}

/**
 * Ein Paar einstufen.
 *   a, b     Profile (A mit Konto, B ohne – die Zuordnung macht findePaare)
 *   kontext  { secrets: Map<profilId, secretsKurz>, konten: Map<userId, { email, gesperrt }>,
 *              registrierungen: Set<userId>, ibanAnzahl: Map<ibanHash, Anzahl Profile> }
 * Liefert { einstufung, gruende }.
 */
export function stufeEin(a, b, kontext) {
  const { secrets = new Map(), konten = new Map(), registrierungen = new Set(), ibanAnzahl = new Map() } = kontext ?? {};
  const g = [];
  const key = emailSchluessel(a?.["E-Mail"]);
  const sa = secrets.get(String(a.id)) ?? { daten: false, iban: false, ibanHash: null };
  const sb = secrets.get(String(b.id)) ?? { daten: false, iban: false, ibanHash: null };
  const aGek = status(a) === "cancelled";
  const bGek = status(b) === "cancelled";
  const kuendigung = aGek && !bGek;

  if (String(a.id) !== String(a.user_id)) g.push("a_id_ungleich_konto");
  if (!istLeer(a.Vorname) || !istLeer(a.Nachname)) g.push("a_hat_namen");
  if (istLeer(b.Vorname) || istLeer(b.Nachname)) g.push("b_ohne_namen");
  if (sa.daten || !istLeer(a.IBAN)) g.push("a_hat_daten");
  if (!istLeer(a.Mitgliedsnummer) || (a.Datum_Mandat !== null && a.Datum_Mandat !== undefined)) g.push("a_hat_stammdaten");
  if (!sb.iban) g.push("b_ohne_iban");
  // Fingerabdruck auch bei einem dritten Profil (A hat ohne IBAN keinen).
  if (sb.ibanHash && (ibanAnzahl.get(sb.ibanHash) ?? 0) - (sa.ibanHash === sb.ibanHash ? 2 : 1) > 0) g.push("iban_gruppe");
  if (status(a) === "applicant" || status(b) === "applicant") g.push("antrag_offen");
  if (bGek && !aGek) g.push("b_gekuendigt");
  if (kuendigung && (a.Datum_Kündigung === null || a.Datum_Kündigung === undefined)) g.push("kuendigung_ohne_datum");
  if (kuendigung && ["board", "admin"].includes(rolle(b) ?? "")) g.push("kuendigung_vorstand");
  if (rolle(a) !== null && rolle(a) !== "member" && rolle(a) !== rolle(b)) g.push("rolle");
  if (Date.parse(b.created_at) > Date.parse(a.created_at)) g.push("reihenfolge");

  const konto = konten.get(String(a.user_id));
  if (!konto) g.push("konto_fehlt");
  else {
    if (emailSchluessel(konto.email) !== key) g.push("konto_email");
    if (Boolean(konto.gesperrt) !== aGek) g.push("konto_sperre");
  }
  if (registrierungen.has(String(a.user_id))) g.push("registrierung_offen");

  if (g.length) return { einstufung: "pruefen", gruende: g };
  return { einstufung: kuendigung ? "kuendigung" : "zusammenfuehren", gruende: [] };
}

/**
 * Alle Profile nach Adresse gruppieren und jede Gruppe mit mehr als einem Profil einstufen.
 *   profile  Zeilen aus profiles (PROFIL_SPALTEN)
 *   kontext  wie stufeEin, ohne ibanAnzahl (wird hier aus secrets berechnet)
 * Liefert { eintraege, ibanGruppen }:
 *   eintraege    [{ art: "paar" | "gruppe", a, b, ids, einstufung, gruende }] (a/b = Profilzeilen bei „paar“
 *                mit eindeutiger Zuordnung, sonst null; ids = alle Profil-IDs der Gruppe)
 *   ibanGruppen  [{ ids, mitPaar }] Profile mit gleichem IBAN-Fingerabdruck (nur gemeldet, nie geändert);
 *                mitPaar = mindestens ein Profil der Gruppe gehört zu einem Doppelprofil-Eintrag
 */
export function findePaare(profile, kontext = {}) {
  const secrets = kontext.secrets ?? new Map();
  const gruppen = new Map();
  for (const p of profile) {
    const k = emailSchluessel(p?.["E-Mail"]);
    if (!k) continue;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(p);
  }

  const ibanAnzahl = new Map();
  const ibanIds = new Map();
  for (const [id, s] of secrets) {
    if (!s.ibanHash) continue;
    ibanAnzahl.set(s.ibanHash, (ibanAnzahl.get(s.ibanHash) ?? 0) + 1);
    if (!ibanIds.has(s.ibanHash)) ibanIds.set(s.ibanHash, []);
    ibanIds.get(s.ibanHash).push(String(id));
  }
  const ctx = { ...kontext, secrets, ibanAnzahl };

  const eintraege = [];
  for (const liste of gruppen.values()) {
    if (liste.length < 2) continue;
    const ids = liste.map((p) => String(p.id)).sort();
    if (liste.length > 2) {
      eintraege.push({ art: "gruppe", a: null, b: null, ids, einstufung: "pruefen", gruende: ["gruppe_groesse"] });
      continue;
    }
    const mitKonto = liste.filter((p) => p.user_id !== null && p.user_id !== undefined && p.user_id !== "");
    if (mitKonto.length !== 1) {
      const grund = mitKonto.length === 2 ? "beide_konto" : "kein_konto";
      eintraege.push({ art: "paar", a: null, b: null, ids, einstufung: "pruefen", gruende: [grund] });
      continue;
    }
    const a = mitKonto[0];
    const b = liste.find((p) => p !== a);
    eintraege.push({ art: "paar", a, b, ids, ...stufeEin(a, b, ctx) });
  }
  eintraege.sort((x, y) => (x.ids[0] < y.ids[0] ? -1 : x.ids[0] > y.ids[0] ? 1 : 0));

  const inPaar = new Set(eintraege.flatMap((e) => e.ids));
  const ibanGruppen = [...ibanIds.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({ ids: [...ids].sort(), mitPaar: ids.some((id) => inPaar.has(id)) }))
    .sort((x, y) => (x.ids[0] < y.ids[0] ? -1 : 1));
  return { eintraege, ibanGruppen };
}

/** Erwarteter Stand eines Profils für den Compare-and-set (nur CAS_SPALTEN, fehlende Werte = null). */
export function erwarteterStand(profil) {
  return Object.fromEntries(CAS_SPALTEN.map((s) => [s, profil?.[s] ?? null]));
}

// ---------------------------------------------------------------------------------------------------
// Zählen
// ---------------------------------------------------------------------------------------------------

export function neueZaehlung() {
  return {
    profile: 0,
    gruppen: 0,
    paare: 0,
    groessereGruppen: 0,
    einstufung: Object.fromEntries(EINSTUFUNGEN.map((e) => [e, 0])),
    /** pruefen: Grund → Anzahl Einträge (ein Eintrag kann mehrere Gründe haben) */
    gruende: Object.fromEntries(GRUENDE.map((g) => [g, 0])),
    ibanGruppen: 0,
    ibanGruppenMitPaar: 0,
    /** Paare, die „zusammenfuehren“ ändern würde */
    zuAendern: 0,
  };
}

export function zaehleAlle(profile, ergebnis) {
  const z = neueZaehlung();
  z.profile = profile.length;
  for (const e of ergebnis.eintraege) {
    z.gruppen++;
    if (e.art === "gruppe") z.groessereGruppen++;
    else z.paare++;
    z.einstufung[e.einstufung]++;
    for (const g of e.gruende) z.gruende[g]++;
    if (e.einstufung !== "pruefen") z.zuAendern++;
  }
  z.ibanGruppen = ergebnis.ibanGruppen.length;
  z.ibanGruppenMitPaar = ergebnis.ibanGruppen.filter((g) => g.mitPaar).length;
  return z;
}

// ---------------------------------------------------------------------------------------------------
// Ausgabe (nur Zahlen und Codes)
// ---------------------------------------------------------------------------------------------------

const zahl = (n) => String(Number.isFinite(n) ? n : 0);
const zeile = (label, n, breite = 58) => `  ${label.padEnd(breite)} ${zahl(n).padStart(5)}`;

function kern(z) {
  return [
    zeile("Profile gesamt", z.profile),
    zeile("Adressen mit mehr als einem Profil", z.gruppen),
    zeile("  davon genau 2 Profile (Paare)", z.paare),
    zeile("  davon mehr als 2 Profile", z.groessereGruppen),
    "",
    "Einstufung",
    zeile("  zusammenführen (Konto an das Import-Profil)", z.einstufung.zusammenfuehren),
    zeile("  zusammenführen + Kündigung übernehmen", z.einstufung.kuendigung),
    zeile("  prüfen (fasst das Skript nie an)", z.einstufung.pruefen),
    "",
    "Prüfen je Grund (mehrere je Eintrag möglich)",
    ...GRUENDE.filter((g) => z.gruende[g] > 0).map((g) => zeile(`  ${GRUND_TEXT[g]}`, z.gruende[g])),
    ...(z.einstufung.pruefen === 0 ? ["  keine"] : []),
    "",
    "Gleicher IBAN-Fingerabdruck bei mehreren Profilen (nur gemeldet, nie geändert)",
    zeile("  Gruppen", z.ibanGruppen),
    zeile("  davon mit einem Doppelprofil", z.ibanGruppenMitPaar),
  ];
}

/** Ausgabe von `pruefen`. */
export function formatierePruefung(z) {
  return ["Prüfung Doppelprofile (nur Zählungen)", ...kern(z)].join("\n");
}

/** Ausgabe von `zusammenfuehren --probelauf` (und vor `zusammenfuehren`). */
export function formatiereProbelauf(z) {
  return [
    "Probelauf Doppelprofile (ändert nichts)",
    "  zusammengeführt werden nur „zusammenführen“ und „zusammenführen + Kündigung übernehmen“",
    ...kern(z),
    "",
    zeile("Paare, die „zusammenfuehren“ ändern würde", z.zuAendern),
  ].join("\n");
}

/**
 * TSV für `--liste`: je Eintrag art, einstufung, gruende, konto_profil_id (A), import_profil_id (B), profil_ids
 * (alle der Gruppe); dazu je IBAN-Gruppe eine Zeile (art iban_gruppe, einstufung pruefen). Nur IDs und Codes –
 * keine Namen, keine Adressen. Trotzdem nur außerhalb des Repos (Profil-IDs).
 */
export function listeTsv(ergebnis) {
  const zeilen = [["art", "einstufung", "gruende", "konto_profil_id", "import_profil_id", "profil_ids"].join("\t")];
  for (const e of ergebnis.eintraege) {
    zeilen.push(
      [e.art, e.einstufung, e.gruende.join(","), e.a ? String(e.a.id) : "", e.b ? String(e.b.id) : "", e.ids.join(",")].join(
        "\t"
      )
    );
  }
  for (const g of ergebnis.ibanGruppen) {
    zeilen.push(["iban_gruppe", "pruefen", g.mitPaar ? "mit_doppelprofil" : "", "", "", g.ids.join(",")].join("\t"));
  }
  return `${zeilen.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------------------------------

export const BEFEHLE = Object.freeze(["pruefen", "zusammenfuehren"]);

/**
 * Kommandozeile wie scripts/datenqualitaet.mjs (gleiche Ziele, Sicherungen, --vorstand, --probelauf, --liste nur
 * außerhalb des Repos); der schreibende Befehl heißt hier „zusammenfuehren“ statt „reparieren“.
 */
export function leseDoppelArgumente(argv, env = {}, repoWurzel = null) {
  if (argv.includes("reparieren")) return { fehler: `Genau einen Befehl angeben: ${BEFEHLE.join(", ")}` };
  const umbenannt = argv.map((a) => (a === "zusammenfuehren" ? "reparieren" : a));
  const args = leseArgumente(umbenannt, env, repoWurzel);
  if (args.fehler) return { fehler: args.fehler.replaceAll("reparieren", "zusammenfuehren") };
  return { ...args, befehl: args.befehl === "reparieren" ? "zusammenfuehren" : args.befehl };
}

// ---------------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------------

export function neuesErgebnis() {
  return {
    geplant: 0,
    zusammengefuehrt: 0,
    kuendigung: 0,
    konflikt: 0,
    muster: 0,
    verweise: 0,
    inzwischenErledigt: 0,
    fehler: 0,
    abgebrochen: false,
    bearbeitet: 0,
  };
}

export function formatiereErgebnis(r) {
  return [
    r.abgebrochen ? `Zusammenführen abgebrochen nach ${zahl(r.bearbeitet)} von ${zahl(r.geplant)} Paaren (Strg+C)` : "Zusammenführen fertig",
    zeile("Paare zusammengeführt (mit Protokoll)", r.zusammengefuehrt),
    zeile("  davon Kündigung übernommen", r.kuendigung),
    zeile("übersprungen: inzwischen geändert (nicht wiederholt)", r.konflikt),
    zeile("übersprungen: passt nicht mehr zum Muster", r.muster),
    zeile("übersprungen: Verweise, die nicht umgehängt werden", r.verweise),
    zeile("übersprungen: Profil gibt es nicht mehr", r.inzwischenErledigt),
    zeile("Fehler", r.fehler),
  ].join("\n");
}

/** Rückgabecodes von merge_member_doppelprofil. */
export const CODES = Object.freeze([
  "zusammengefuehrt",
  "zusammengefuehrt_kuendigung",
  "konflikt",
  "muster",
  "verweise",
  "fehlt",
]);

/**
 * Ein Paar zusammenführen (nur Einträge mit Einstufung zusammenfuehren/kuendigung). Die Datenbankfunktion prüft
 * Muster und Stand erneut und schreibt alles in EINER Transaktion.
 *   db  { zusammenfuehren(aId, bId, erwartet) → Code (CODES) }
 * Ergebnis wird in r gezählt; liefert den Code bzw. "fehler".
 */
export async function schreibePaar(db, eintrag, r) {
  if (!eintrag?.a || !eintrag?.b || eintrag.einstufung === "pruefen") {
    r.fehler++;
    return "fehler";
  }
  let code;
  try {
    code = await db.zusammenfuehren(String(eintrag.a.id), String(eintrag.b.id), {
      a: erwarteterStand(eintrag.a),
      b: erwarteterStand(eintrag.b),
    });
  } catch {
    r.fehler++;
    return "fehler";
  }
  if (code === "zusammengefuehrt") r.zusammengefuehrt++;
  else if (code === "zusammengefuehrt_kuendigung") {
    r.zusammengefuehrt++;
    r.kuendigung++;
  } else if (code === "konflikt") r.konflikt++;
  else if (code === "muster") r.muster++;
  else if (code === "verweise") r.verweise++;
  else if (code === "fehlt") r.inzwischenErledigt++;
  else {
    r.fehler++;
    return "fehler";
  }
  return code;
}

