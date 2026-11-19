// Auswertung für scripts/studiengang.mjs: rein, ohne Datenbank und ohne Umgebung, damit sie mit erfundenen Daten
// getestet werden kann (tests/studiengang-skript.test.mjs).
//
// Grundsatz wie bei datenqualitaet: Ausgaben enthalten nur Zahlen und Namen aus der Studiengangsliste – nie Altwerte
// (Freitext), Namen, E-Mails oder Profil-IDs.
import { STUDIENGANG_NAMEN, istLeer, normalisiereStudiengang } from "../../lib/studiengaenge.ts";
import { gruppeVon } from "./datenqualitaet.mjs";

/** Spalte in profiles (Klartext). */
export const SPALTE = "Studiengang / Fach";

/** Feldname im Korrekturprotokoll member_data_corrections (nur Feldnamen, nie Werte). */
export const PROTOKOLL_FELD = "studiengang";

/** Status je Profil: richtig = steht schon so in der Liste, sicher = wird geschrieben, vorschlag/offen = nie. */
export const STATUS = Object.freeze(["richtig", "sicher", "vorschlag", "offen", "leer"]);

/**
 * Ein Profil bewerten.
 *   profil  Zeile aus profiles (`Status`, `Rolle`, SPALTE)
 * Liefert { gruppe, status, ziel, neu }:
 *   ziel  Name aus der Liste (richtig/sicher/vorschlag) oder null (offen/leer)
 *   neu   der zu schreibende Wert – nur bei Gruppe „aktiv“ und Status „sicher“, sonst null
 */
export function bewerteStudiengang(profil) {
  const gruppe = gruppeVon(profil);
  const roh = profil?.[SPALTE];
  if (istLeer(roh)) return { gruppe, status: "leer", ziel: null, neu: null };
  const n = normalisiereStudiengang(roh);
  if (n.sicherheit === "offen") return { gruppe, status: "offen", ziel: null, neu: null };
  if (n.sicherheit === "vorschlag") return { gruppe, status: "vorschlag", ziel: n.wert, neu: null };
  // sicher: steht der Name schon genau so da, ist nichts zu tun.
  if (roh === n.wert) return { gruppe, status: "richtig", ziel: n.wert, neu: null };
  return { gruppe, status: "sicher", ziel: n.wert, neu: gruppe === "aktiv" ? n.wert : null };
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
  if (b.neu) z.zuAendern++;
  return z;
}

export function zaehleAlle(bewertungen) {
  const z = neueZaehlung();
  for (const b of bewertungen) zaehle(z, b);
  return z;
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
    zeile(`${einrueck}sicher (wird automatisch angepasst)`, st.sicher),
    zeile(`${einrueck}vorschlag (entscheidet der Vorstand)`, st.vorschlag),
    zeile(`${einrueck}offen (bleibt Freitext unter „Sonstiges“)`, st.offen),
    zeile(`${einrueck}leer`, st.leer),
  ];
}

/** Ausgabe von `pruefen`. */
export function formatierePruefung(z) {
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
  ].join("\n");
}

/** Ausgabe von `reparieren --probelauf` (und vor `reparieren`). */
export function formatiereProbelauf(z) {
  return [
    "Probelauf Studiengang (ändert nichts)",
    "  geschrieben wird nur „sicher“ und nur bei betroffenen Profilen",
    ...kopf(z),
    "",
    "Je Zielwert (betroffene Profile)",
    ...zielTabelle(z),
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
    konflikt: 0,
    inzwischenErledigt: 0,
    protokollFehler: 0,
    fehler: 0,
    abgebrochen: false,
    bearbeitet: 0,
  };
}

export function formatiereReparatur(r) {
  return [
    r.abgebrochen ? `Reparatur abgebrochen nach ${zahl(r.bearbeitet)} von ${zahl(r.geplant)} Profilen (Strg+C)` : "Reparatur fertig",
    zeile("Profile geändert", r.geaendert),
    zeile("übersprungen: inzwischen geändert (nicht wiederholt)", r.konflikt),
    zeile("übersprungen: inzwischen nichts mehr zu tun", r.inzwischenErledigt),
    zeile("geändert, aber Protokolleintrag fehlt", r.protokollFehler),
    zeile("Fehler", r.fehler),
  ].join("\n");
}

/**
 * Ein Profil schreiben (Compare-and-set, profiles hat keine Version): frisch lesen und neu bewerten (Gruppe und
 * Wert), geändert wird nur, wenn die Spalte noch dem gelesenen Wert entspricht. Danach der Protokolleintrag (nur
 * Feldname).
 *   db  { lese(id), schreibe(id, alt, neu) → Anzahl geänderter Zeilen, protokolliere(id) }
 * Liefert "geaendert" | "erledigt" | "konflikt" | "protokoll" | "fehler".
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
  if (!b.neu) return "erledigt";
  let anzahl;
  try {
    anzahl = await db.schreibe(id, frisch, b.neu);
  } catch {
    return "fehler";
  }
  if (anzahl !== 1) return "konflikt";
  try {
    await db.protokolliere(id);
  } catch {
    return "protokoll";
  }
  return "geaendert";
}
