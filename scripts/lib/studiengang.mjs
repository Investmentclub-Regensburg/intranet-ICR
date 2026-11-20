// Auswertung für scripts/studiengang.mjs: rein, ohne Datenbank und ohne Umgebung, damit sie mit erfundenen Daten
// getestet werden kann (tests/studiengang-skript.test.mjs).
//
// Grundsatz wie bei datenqualitaet: Ausgaben enthalten nur Zahlen und Namen aus der Studiengangsliste – nie Altwerte
// (Freitext), Namen, E-Mails oder Profil-IDs.
import { STUDIENGANG_NAMEN, istLeer, normalisiereStudiengang, schluessel } from "../../lib/studiengaenge.ts";
import { gruppeVon } from "./datenqualitaet.mjs";

/** Spalte in profiles (Klartext). */
export const SPALTE = "Studiengang / Fach";

/** Quelle im Korrekturprotokoll (member_data_corrections.quelle, Migration 20261119120000). */
export const PROTOKOLL_QUELLE = "bereinigung";

/** Ziel „leeren“ in ALTWERT_FREIGABEN. */
export const LEEREN = Symbol("leeren");

/**
 * Freigaben von Hannes (entscheidungen-hannes.md, 19.11.2026) NUR für die Altwerte: Diese Schreibweisen sind in
 * lib/studiengaenge.ts „vorschlag“ bzw. „offen“ und werden dort bei neuen Eingaben nie umgedeutet (Review M2). Im
 * Skript gelten sie als „sicher“. Schlüssel wie lib/studiengaenge.ts → schluessel (Groß-/Kleinschreibung,
 * Bindestriche, Schrägstriche egal; „BWL - Finance“ und „BWL/Finance“ sind derselbe Schlüssel).
 * „Diplom-Finanzwirt (FH)“ bleibt bewusst unverändert (Freitext unter „Sonstiges“).
 */
export const ALTWERT_FREIGABEN = new Map(
  [
    ["BW", "BWL"],
    ["BM", "Business Management"],
    ["DBM", "Digital Business Management"],
    ["BWL - Finance", "BWL"],
    ["BWL/ Medienwissenschaften", "BWL"],
    ["Angewandte Wirtschaftsinformatik", "Wirtschaftsinformatik"],
    ["Elektronik", "Elektro- und Informationstechnik"],
    // Entscheidung 3: unklare Sammelbegriffe leeren (protokolliert wie jede Änderung).
    ["Geisteswissenschaften", LEEREN],
    ["Naturwissenschaften", LEEREN],
    ["Wirtschaftswissenschaften", LEEREN],
  ].map(([roh, ziel]) => [schluessel(roh), ziel])
);

/**
 * Status je Profil: richtig = steht schon so in der Liste, sicher = wird auf einen Listennamen gesetzt,
 * leeren = wird geleert (Sammelbegriff), vorschlag/offen = bleibt, leer = nichts eingetragen.
 */
export const STATUS = Object.freeze(["richtig", "sicher", "leeren", "vorschlag", "offen", "leer"]);

/**
 * Ein Profil bewerten.
 *   profil  Zeile aus profiles (`Status`, `Rolle`, SPALTE)
 * Liefert { gruppe, status, ziel, aendern, neu }:
 *   ziel    Name aus der Liste (richtig/sicher/vorschlag) oder null
 *   aendern true nur bei Gruppe „aktiv“ und Status „sicher“ oder „leeren“
 *   neu     zu schreibender Wert (Listenname; null = leeren)
 */
export function bewerteStudiengang(profil) {
  const gruppe = gruppeVon(profil);
  const roh = profil?.[SPALTE];
  const nichts = { gruppe, aendern: false, neu: null };
  if (istLeer(roh)) return { ...nichts, status: "leer", ziel: null };

  const freigabe = ALTWERT_FREIGABEN.get(schluessel(roh));
  if (freigabe === LEEREN) return { gruppe, status: "leeren", ziel: null, aendern: gruppe === "aktiv", neu: null };
  if (typeof freigabe === "string") {
    return { gruppe, status: "sicher", ziel: freigabe, aendern: gruppe === "aktiv", neu: freigabe };
  }

  const n = normalisiereStudiengang(roh);
  if (n.sicherheit === "offen") return { ...nichts, status: "offen", ziel: null };
  if (n.sicherheit === "vorschlag") return { ...nichts, status: "vorschlag", ziel: n.wert };
  // sicher: steht der Name schon genau so da, ist nichts zu tun.
  if (roh === n.wert) return { ...nichts, status: "richtig", ziel: n.wert };
  return { gruppe, status: "sicher", ziel: n.wert, aendern: gruppe === "aktiv", neu: n.wert };
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
    /** aktive Profile: Zielwert → { richtig, sicher, vorschlag } */
    ziele: {},
    /** gekündigt + Antrag offen: Status → Anzahl (nur gezählt, nie geändert) */
    nichtBetroffen: leereStatus(),
    /** Profile, die `reparieren` ändern würde */
    zuAendern: 0,
  };
}

export function zaehle(z, b) {
  z.profile++;
  if (b.gruppe !== "aktiv") {
    if (b.gruppe === "gekuendigt") z.gekuendigt++;
    else z.antragOffen++;
    z.nichtBetroffen[b.status]++;
    return z;
  }
  z.aktiv++;
  z.status[b.status]++;
  if (b.ziel) {
    z.ziele[b.ziel] ??= { richtig: 0, sicher: 0, vorschlag: 0 };
    z.ziele[b.ziel][b.status]++;
  }
  if (b.aendern) z.zuAendern++;
  return z;
}

export function zaehleAlle(bewertungen) {
  const z = neueZaehlung();
  for (const b of bewertungen) zaehle(z, b);
  return z;
}

/**
 * Angaben der Registrierung, die nach der Bereinigung liegen bleiben (Review N6): Die Datenbank entfernt
 * Registrierungsangaben am Konto und offene pending_registrations erst, wenn sie zum Profil passen
 * (registration_meta_is_redundant vergleicht u. a. „Fach“). Nur zählen, nichts löschen.
 *   konten    Konten (auth.users) als { metadaten }
 *   offene    pending_registrations als { user_id }
 *   profile   profiles als { user_id, Status, Rolle }
 */
export const REGISTRIERUNG_META_SCHLUESSEL = Object.freeze([
  "IBAN",
  "BIC",
  "Geburtsdatum",
  "Straße",
  "Hausnr",
  "Ort",
  "PLZ",
  "Handynummer",
  "Fach",
  "Abschluss",
  "Semester",
  "Uni/OTH",
  "Sepa-Bestätigung",
]);

export function zaehleRegistrierungsreste({ konten, offene, profile }) {
  const kontenMitAngaben = konten.filter((k) => {
    const m = k?.metadaten;
    return m && typeof m === "object" && REGISTRIERUNG_META_SCHLUESSEL.some((s) => Object.hasOwn(m, s));
  }).length;
  const aktiveKonten = new Set(
    profile.filter((p) => p.user_id && gruppeVon(p) === "aktiv").map((p) => String(p.user_id))
  );
  const offeneAktiv = offene.filter((o) => aktiveKonten.has(String(o.user_id))).length;
  return { kontenMitAngaben, offeneGesamt: offene.length, offeneAktiv };
}

// ---------------------------------------------------------------------------------------------------
// Ausgabe (nur Zahlen und Listennamen)
// ---------------------------------------------------------------------------------------------------

const zahl = (n) => String(Number.isFinite(n) ? n : 0);
const zeile = (label, n, breite = 52) => `  ${label.padEnd(breite)} ${zahl(n).padStart(5)}`;
const NAME_BREITE = 40;
const kurz = (name) => (name.length > NAME_BREITE ? `${name.slice(0, NAME_BREITE - 1)}…` : name);

function kopf(z) {
  return [
    zeile("Profile gesamt", z.profile),
    zeile("betroffen (aktiv inkl. Vorstand und Alumni)", z.aktiv),
    zeile("nicht betroffen: gekündigt (nur gezählt)", z.gekuendigt),
    zeile("nicht betroffen: Antrag offen (nur gezählt)", z.antragOffen),
  ];
}

/** Tabelle je Zielwert in Listenreihenfolge (nur Zielwerte mit mindestens einem Profil). */
function zielTabelle(z) {
  const spalten = ["richtig", "sicher", "vorschlag"];
  const zeilen = [`  ${"Zielwert".padEnd(NAME_BREITE)} ${spalten.map((s) => s.padStart(9)).join(" ")}`];
  for (const name of STUDIENGANG_NAMEN) {
    const t = z.ziele[name];
    if (!t) continue;
    zeilen.push(`  ${kurz(name).padEnd(NAME_BREITE)} ${spalten.map((s) => zahl(t[s]).padStart(9)).join(" ")}`);
  }
  if (zeilen.length === 1) zeilen.push("  keine");
  return zeilen;
}

function statusZeilen(st, einrueck = "") {
  return [
    zeile(`${einrueck}richtig (steht schon so in der Liste)`, st.richtig),
    zeile(`${einrueck}sicher (wird auf einen Listennamen gesetzt)`, st.sicher),
    zeile(`${einrueck}leeren (Sammelbegriff, wird geleert)`, st.leeren),
    zeile(`${einrueck}vorschlag (bleibt, entscheidet der Vorstand)`, st.vorschlag),
    zeile(`${einrueck}offen (bleibt Freitext unter „Sonstiges“)`, st.offen),
    zeile(`${einrueck}leer`, st.leer),
  ];
}

function resteZeilen(reste) {
  if (!reste) return [];
  return [
    "",
    "Registrierungsangaben, die liegen bleiben können (nur gezählt, nichts gelöscht)",
    zeile("  Konten mit Registrierungsangaben in den Metadaten", reste.kontenMitAngaben),
    zeile("  offene Registrierungen gesamt", reste.offeneGesamt),
    zeile("  davon zu aktiven Profilen", reste.offeneAktiv),
  ];
}

/** Ausgabe von `pruefen`. `reste` optional (zaehleRegistrierungsreste). */
export function formatierePruefung(z, reste) {
  return [
    "Prüfung Studiengang (nur Zählungen)",
    ...kopf(z),
    "",
    "Betroffene Profile",
    ...statusZeilen(z.status, "  "),
    "",
    "Je Zielwert (betroffene Profile)",
    ...zielTabelle(z),
    "",
    "Gekündigt + Antrag offen (nur gezählt, nie geändert)",
    ...statusZeilen(z.nichtBetroffen, "  "),
    ...resteZeilen(reste),
  ].join("\n");
}

/** Ausgabe von `reparieren --probelauf` (und vor `reparieren`). */
export function formatiereProbelauf(z) {
  return [
    "Probelauf Studiengang (ändert nichts)",
    "  geschrieben wird nur „sicher“ und „leeren“ und nur bei betroffenen Profilen",
    ...kopf(z),
    "",
    "Je Zielwert (betroffene Profile)",
    ...zielTabelle(z),
    zeile("leeren (Sammelbegriff)", z.status.leeren),
    zeile("offen (ohne Zuordnung, bleibt)", z.status.offen),
    zeile("leer (bleibt)", z.status.leer),
    "",
    zeile("Profile, die „reparieren“ ändern würde", z.zuAendern),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------------

export function neuesReparaturErgebnis() {
  return {
    geplant: 0,
    geaendert: 0,
    geleert: 0,
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
    zeile("  davon geleert", r.geleert),
    zeile("übersprungen: inzwischen geändert (nicht wiederholt)", r.konflikt),
    zeile("übersprungen: inzwischen nichts mehr zu tun", r.inzwischenErledigt),
    zeile("Fehler", r.fehler),
  ].join("\n");
}

/**
 * Ein Profil schreiben: frisch lesen und neu bewerten (Gruppe und Wert), dann über die Datenbankfunktion
 * save_member_studiengang (Compare-and-set auf den gelesenen Wert + Protokoll in EINER Transaktion, Review M1).
 *   db  { lese(id) → Zeile | null, speichere(id, alt, neu) → true (gespeichert) | false (inzwischen geändert) }
 * Liefert "geaendert" | "geleert" | "erledigt" | "konflikt" | "fehler".
 */
export async function schreibeProfil(db, id) {
  let frisch;
  try {
    frisch = await db.lese(id);
  } catch {
    return "fehler";
  }
  if (!frisch) return "erledigt";
  const b = bewerteStudiengang(frisch);
  if (!b.aendern) return "erledigt";
  let ok;
  try {
    ok = await db.speichere(id, frisch[SPALTE], b.neu);
  } catch {
    return "fehler";
  }
  if (ok !== true) return "konflikt";
  return b.neu === null ? "geleert" : "geaendert";
}
