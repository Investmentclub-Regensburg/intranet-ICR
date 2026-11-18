// Tests für lib/member-data-check.ts (Paket „Mitgliederdaten“, PR 4): Stichtage 1.3./15.9. nach Berliner Datum.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BESTANDS_FELDER,
  alsDatum,
  berlinTagesbeginn,
  istAbfrageFaellig,
  istBestaetigungOffen,
  layoutModus,
  leseDatenCheckEinstellungen,
  letzterStichtag,
  spaeterBis,
  spaeterGrenze,
} from "../lib/member-data-check.ts";
import {
  ANSCHRIFT_FEHLT,
  _resetStartWarnung,
  bauDatenCheckAnsicht,
  bestaetigeStand,
  datenCheckEinstellungen,
  bestaetigungsAenderungen,
  bewerteBestand,
  ibanMaskiert,
  pruefeDatenCheckAenderung,
  HINWEIS_VORWAHL,
} from "../lib/member-data-check-server.ts";
import { isActiveMemberProfile } from "../lib/profile-status.ts";

const z = (iso) => new Date(iso);

test("Stichtag 1.3.: 28.2. 23:59 Berlin (MEZ) noch alter Stichtag, 1.3. 00:00 neuer", () => {
  assert.equal(letzterStichtag(z("2027-02-28T22:59:59Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2027-02-28T23:00:00Z")), "2027-03-01");
  // UTC-Mitternacht: in Berlin schon 1 Uhr am 1.3.
  assert.equal(letzterStichtag(z("2027-03-01T00:00:00Z")), "2027-03-01");
  // UTC noch 28.2., Berlin schon 1.3.
  assert.equal(letzterStichtag(z("2027-02-28T23:30:00Z")), "2027-03-01");
});

test("Stichtag 15.9.: 14.9. 23:59 Berlin (MESZ) noch 1.3., 15.9. 00:00 neuer", () => {
  assert.equal(letzterStichtag(z("2026-09-14T21:59:59Z")), "2026-03-01");
  assert.equal(letzterStichtag(z("2026-09-14T22:00:00Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2026-09-15T00:00:00Z")), "2026-09-15");
});

test("Jahreswechsel und Schaltjahr", () => {
  assert.equal(letzterStichtag(z("2026-12-31T22:59:59Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2026-12-31T23:30:00Z")), "2026-09-15"); // Berlin 1.1.2027
  assert.equal(letzterStichtag(z("2027-01-15T12:00:00Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2028-02-29T12:00:00Z")), "2027-09-15");
  assert.equal(letzterStichtag(z("2026-11-18T12:00:00Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2027-06-30T12:00:00Z")), "2027-03-01");
});

test("berlinTagesbeginn: Mitternacht Berlin in MEZ und MESZ, auch an Umstellungstagen", () => {
  assert.equal(berlinTagesbeginn("2027-03-01").toISOString(), "2027-02-28T23:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-09-15").toISOString(), "2026-09-14T22:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-03-29").toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-03-30").toISOString(), "2026-03-29T22:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-10-25").toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-10-26").toISOString(), "2026-10-25T23:00:00.000Z");
});

test("istBestaetigungOffen: leer oder ungültig = offen", () => {
  const jetzt = z("2026-11-18T12:00:00Z");
  for (const leer of [null, undefined, "", "  ", "kaputt", new Date(Number.NaN)]) {
    assert.equal(istBestaetigungOffen({ bestaetigtAm: leer, jetzt }), true, String(leer));
  }
});

test("istBestaetigungOffen: vor dem letzten Stichtag offen, ab dem Stichtag (Berliner Datum) erledigt", () => {
  const jetzt = z("2027-04-10T12:00:00Z"); // letzter Stichtag 1.3.2027
  assert.equal(istBestaetigungOffen({ bestaetigtAm: "2027-02-28T22:59:59+00:00", jetzt }), true); // 28.2. 23:59 Berlin
  assert.equal(istBestaetigungOffen({ bestaetigtAm: "2027-02-28T23:00:00+00:00", jetzt }), false); // 1.3. 00:00 Berlin
  assert.equal(istBestaetigungOffen({ bestaetigtAm: z("2027-03-20T08:00:00Z"), jetzt }), false);
  assert.equal(istBestaetigungOffen({ bestaetigtAm: "2026-09-20T08:00:00Z", jetzt }), true);
});

test("istBestaetigungOffen: am Stichtag selbst wird eine ältere Bestätigung fällig", () => {
  const bestaetigtAm = "2026-10-01T10:00:00Z";
  assert.equal(istBestaetigungOffen({ bestaetigtAm, jetzt: z("2027-02-28T22:59:59Z") }), false);
  assert.equal(istBestaetigungOffen({ bestaetigtAm, jetzt: z("2027-02-28T23:00:00Z") }), true);
});

test("Migration: Spalten additiv, ohne Standardwert, kein Schreibrecht für Mitglieder, Registrierung bestätigt", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261118140000_member_data_confirmation.sql", import.meta.url), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.match(code, /add column if not exists daten_bestaetigt_am timestamptz,/);
  assert.match(code, /add column if not exists daten_erinnern_ab timestamptz;/);
  assert.doesNotMatch(code, /\bdefault\b/i);
  assert.doesNotMatch(code, /\bgrant\b/i);
  assert.doesNotMatch(code, /create policy/i);
  assert.match(code, /from anon, authenticated;/);
  assert.match(code, /set daten_bestaetigt_am = now\(\)\s+where p\.id = p_user_id\s+and p\.user_id = p_user_id/);
  assert.match(code, /revoke execute on function public\.adopt_pending_secrets\(uuid\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /\b(truncate|delete from|drop table|drop column)\b/i);
});

// ---------------------------------------------------------------------------------------------------
// Teil B: Fälligkeit, „Später“, Bewertung des Bestands
// ---------------------------------------------------------------------------------------------------

const JETZT = z("2026-11-18T12:00:00Z");
const faellig = (extra = {}) =>
  istAbfrageFaellig({ eingeschaltet: true, aktiv: true, bestaetigtAm: null, erinnernAb: null, jetzt: JETZT, ...extra });

test("Schalter: nur genau „true“ schaltet ein; DATA_CHECK_START nur als gültiges Datum", () => {
  assert.deepEqual(leseDatenCheckEinstellungen({}), { eingeschaltet: false, start: null });
  assert.deepEqual(leseDatenCheckEinstellungen({ DATA_CHECK_ENABLED: "true", DATA_CHECK_START: "2026-12-01" }), {
    eingeschaltet: true,
    start: "2026-12-01",
  });
  for (const aus of ["", "1", "yes", "false", "on"]) {
    assert.equal(leseDatenCheckEinstellungen({ DATA_CHECK_ENABLED: aus }).eingeschaltet, false, aus);
  }
  for (const kaputt of ["2026-02-30", "01.12.2026", "2026-1-1", "morgen"]) assert.equal(alsDatum(kaputt), null, kaputt);
});

test("Fällig: leer = fällig (Start sofort), Schalter aus → nie, inaktiv → nie", () => {
  assert.equal(faellig(), true);
  assert.equal(faellig({ eingeschaltet: false }), false);
  assert.equal(faellig({ aktiv: false }), false);
});

test("Fällig: gekündigt und Antrag offen nie; Vorstand und Alumni ja", () => {
  const aktiv = (p) => faellig({ aktiv: isActiveMemberProfile(p) });
  assert.equal(aktiv({ Status: "cancelled", Rolle: "member" }), false);
  assert.equal(aktiv({ Status: "applicant", Rolle: "member" }), false);
  assert.equal(aktiv({ Status: "active", Rolle: "board" }), true);
  assert.equal(aktiv({ Status: "alumni", Rolle: "alumni" }), true);
  assert.equal(aktiv({ Status: "active", Rolle: "alumni" }), true);
  assert.equal(aktiv(null), false);
});

test("Fällig: Neumitglied (gerade registriert) nicht, Bestätigung vor dem Stichtag schon", () => {
  assert.equal(faellig({ bestaetigtAm: "2026-11-17T09:00:00Z" }), false);
  assert.equal(faellig({ bestaetigtAm: "2026-09-14T21:00:00Z" }), true); // 14.9. 23 Uhr Berlin
  assert.equal(faellig({ bestaetigtAm: "2026-09-14T22:00:00Z" }), false); // 15.9. 0 Uhr Berlin
});

test("Fällig: „Später“ läuft → nicht fällig; erreicht → fällig", () => {
  assert.equal(faellig({ erinnernAb: "2026-11-20T12:00:00Z" }), false);
  assert.equal(faellig({ erinnernAb: "2026-11-18T12:00:00Z" }), true);
  assert.equal(faellig({ erinnernAb: "2026-11-01T00:00:00Z" }), true);
  assert.equal(faellig({ erinnernAb: "kaputt" }), true);
});

test("Später: 7 Tage, höchstens bis 4 Wochen nach dem Stichtag", () => {
  // Stichtag 1.3.2027 → Grenze 29.3.2027 0 Uhr Berlin (MESZ ab 28.3.).
  assert.equal(spaeterGrenze({ jetzt: z("2027-03-10T12:00:00Z"), start: null }).toISOString(), "2027-03-28T22:00:00.000Z");
  assert.equal(spaeterBis({ jetzt: z("2027-03-10T12:00:00Z"), start: null }).toISOString(), "2027-03-17T12:00:00.000Z");
  assert.equal(spaeterBis({ jetzt: z("2027-03-25T12:00:00Z"), start: null }).toISOString(), "2027-03-28T22:00:00.000Z");
  assert.equal(spaeterBis({ jetzt: z("2027-03-28T21:59:59Z"), start: null }).toISOString(), "2027-03-28T22:00:00.000Z");
  assert.equal(spaeterBis({ jetzt: z("2027-03-28T22:00:00Z"), start: null }), null);
  assert.equal(spaeterBis({ jetzt: z("2027-06-01T12:00:00Z"), start: null }), null);
});

test("Später: Einschalt-Datum verlängert die Grenze (4 Wochen nach DATA_CHECK_START), ohne Start nur Stichtag", () => {
  // Stichtag 15.9.2026 längst vorbei; eingeschaltet am 1.12.2026 → Grenze 29.12.2026 0 Uhr Berlin.
  assert.equal(spaeterBis({ jetzt: z("2026-12-10T12:00:00Z"), start: "2026-12-01" }).toISOString(), "2026-12-17T12:00:00.000Z");
  assert.equal(spaeterBis({ jetzt: z("2026-12-28T12:00:00Z"), start: "2026-12-01" }).toISOString(), "2026-12-28T23:00:00.000Z");
  assert.equal(spaeterBis({ jetzt: z("2026-12-28T23:00:00Z"), start: "2026-12-01" }), null);
  assert.equal(spaeterBis({ jetzt: z("2026-12-10T12:00:00Z"), start: null }), null);
  // Nächster Stichtag 1.3.2027 liegt nach dem Start: dann gilt der Stichtag.
  assert.equal(spaeterGrenze({ jetzt: z("2027-03-02T12:00:00Z"), start: "2026-12-01" }).toISOString(), "2027-03-28T22:00:00.000Z");
});

const HEUTE = "2026-11-18";
const IBAN_DE = "DE89370400440532013000";
const gut = (extra = {}) => ({
  vorname: "Erika",
  nachname: "Muster",
  iban: IBAN_DE,
  bic: "COBADEFFXXX",
  geburtsdatum: "2001-04-12",
  strasse: "Musterstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handynummer: "+491761234567",
  ...extra,
});

const ansicht = (bestand, extra = {}) =>
  bauDatenCheckAnsicht({ bestand, alumni: false, email: "erika@example.org", version: 3, landBekannt: true, spaeterMoeglich: true, heute: HEUTE, ...extra });

test("Gültiger Bestand: Stimmt alles + Später, nichts neu zu schreiben (U6)", () => {
  const a = ansicht(gut());
  assert.equal(a.gueltig, true);
  assert.equal(a.spaeterErlaubt, true);
  assert.deepEqual(a.zeilen.map((zl) => zl.key), ["name", "anschrift", "handy", "email", "iban", "bic", "geburtsdatum"]);
  assert.deepEqual(a.zeilen.find((zl) => zl.key === "anschrift").wert, ["Musterstraße 12a", "93047 Regensburg", "Deutschland"]);
  assert.deepEqual(a.zeilen.find((zl) => zl.key === "iban").wert, ["…3000"]);
  assert.deepEqual(a.zeilen.find((zl) => zl.key === "geburtsdatum").wert, ["12.04.2001"]);
  assert.ok(a.zeilen.every((zl) => !zl.fehler));
  const b = bewerteBestand(gut(), false, HEUTE);
  assert.deepEqual(bestaetigungsAenderungen(gut(), b.werte, false), { secrets: {}, namen: {} });
  // Ohne Später-Zeitraum: nur Stimmt alles/Ändern.
  assert.equal(ansicht(gut(), { spaeterMoeglich: false }).spaeterErlaubt, false);
});

test("Mangel → ungültig, kein Später; Punkt + eine Zeile am Feld (land_unbekannt nur am Land)", () => {
  const a = ansicht(gut({ iban: "DE89370400440532013001", plz: "9304" }));
  assert.equal(a.gueltig, false);
  assert.equal(a.spaeterErlaubt, false);
  assert.ok(a.zeilen.find((zl) => zl.key === "iban").fehler);
  assert.equal(a.zeilen.find((zl) => zl.key === "anschrift").fehler, "In Deutschland hat die PLZ 5 Ziffern.");
  assert.ok(a.formularFehler.iban && a.formularFehler.plz);
  const l = bewerteBestand(gut({ land: "XX" }), false, HEUTE);
  assert.ok(l.fehler.land);
  assert.equal(l.fehler.plz, undefined);
});

test("Leere Pflichtfelder (keine Daten) → ungültig, Zeilen ohne Wert", () => {
  const leer = { vorname: "Max", nachname: "Leer", iban: null, bic: null, geburtsdatum: null, strasse: null, hausnummer: null, plz: null, ort: null, land: null, handynummer: null };
  const a = ansicht(leer);
  assert.equal(a.gueltig, false);
  assert.deepEqual(a.zeilen.find((zl) => zl.key === "handy").wert, []);
  for (const key of ["anschrift", "handy", "iban", "geburtsdatum"]) assert.ok(a.zeilen.find((zl) => zl.key === key).fehler, key);
  // BIC ist freiwillig: leer und ohne Mangel keine Zeile.
  assert.equal(a.zeilen.find((zl) => zl.key === "bic"), undefined);
});

test("Alumni ohne IBAN/BIC gültig, Bank bleibt unangetastet", () => {
  const bestand = gut({ iban: null, bic: null });
  assert.equal(ansicht(bestand).gueltig, false);
  const a = ansicht(bestand, { alumni: true });
  assert.equal(a.gueltig, true);
  assert.equal(a.zeilen.find((zl) => zl.key === "iban"), undefined);
  // Ungültige alte IBAN eines Alumnus: kein Mangel, wird bei „Stimmt alles“ nicht angefasst.
  const alt = gut({ iban: "de89 3704 0044 0532 0130 01" });
  const b = bewerteBestand(alt, true, HEUTE);
  assert.equal(b.gueltig, true);
  assert.deepEqual(bestaetigungsAenderungen(alt, b.werte, true).secrets, {});
});

test("Hinweis vorwahl_ergaenzt: blockiert nicht, Anzeige zeigt die bestätigte Nummer, „Stimmt alles“ speichert E.164", () => {
  const bestand = gut({ handynummer: "17612345678" });
  const a = ansicht(bestand);
  assert.equal(a.gueltig, true);
  const handy = a.zeilen.find((zl) => zl.key === "handy");
  assert.deepEqual(handy.wert, ["+49 176 12345678"]);
  assert.equal(handy.hinweis, HINWEIS_VORWAHL);
  const b = bewerteBestand(bestand, false, HEUTE);
  assert.deepEqual(bestaetigungsAenderungen(bestand, b.werte, false).secrets, { handynummer: "+4917612345678" });
});

test("Normalisierter Altwert gilt als Änderung (Handy +49 0…, IBAN mit Leerzeichen, BIC klein, Name mit Leerraum)", () => {
  const bestand = gut({ handynummer: "+49 0176 1234567", iban: "de89 3704 0044 0532 0130 00", bic: "cobadeffxxx", vorname: " Erika " });
  const b = bewerteBestand(bestand, false, HEUTE);
  assert.equal(b.gueltig, true);
  const r = bestaetigungsAenderungen(bestand, b.werte, false);
  assert.deepEqual(r.secrets, { handynummer: "+491761234567", iban: IBAN_DE, bic: "COBADEFFXXX" });
  // Name ist kein Bestandsfeld: wird weder bewertet noch bei „Stimmt alles“ umgeschrieben.
  assert.deepEqual(r.namen, {});
});

test("Name und E-Mail zählen nicht als Bestandsmangel (gleiche Feldliste wie Übersicht und Skript)", () => {
  assert.deepEqual([...BESTANDS_FELDER].sort(), ["bic", "geburtsdatum", "handynummer", "hausnummer", "iban", "land", "ort", "plz", "strasse"]);
  const a = ansicht(gut({ vorname: "", nachname: "=Formel" }));
  assert.equal(a.gueltig, true);
  assert.equal(a.zeilen.find((zl) => zl.key === "name").fehler, undefined);
  // Im Formular „Ändern“ gelten für den Namen die Formularregeln.
  const r = pruefeDatenCheckAenderung(formular({ vorname: "" }), gut(), false, false, HEUTE);
  assert.equal(r.gueltig, false);
  assert.ok(r.fehler.vorname);
});

test("Land: Altdaten ohne Land werden nur bei anderen Änderungen mitgeschrieben, bei unbekanntem Land nie", () => {
  const ohneLand = gut({ land: null });
  const b = bewerteBestand(ohneLand, false, HEUTE);
  assert.deepEqual(bestaetigungsAenderungen(ohneLand, b.werte, false).secrets, {});
  const mitAenderung = gut({ land: null, bic: "cobadeffxxx" });
  const b2 = bewerteBestand(mitAenderung, false, HEUTE);
  assert.deepEqual(bestaetigungsAenderungen(mitAenderung, b2.werte, false).secrets, { bic: "COBADEFFXXX", land: "DE" });
  assert.deepEqual(bestaetigungsAenderungen(mitAenderung, b2.werte, false, false).secrets, { bic: "COBADEFFXXX" });
});

test("IBAN maskiert: nur die letzten vier Stellen", () => {
  assert.equal(ibanMaskiert("DE89 3704 0044 0532 0130 00"), "…3000");
  assert.equal(ibanMaskiert(null), "");
});

const formular = (extra = {}) => ({
  vorname: "Erika",
  nachname: "Muster",
  strasse: "Musterstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handyLand: "DE",
  handynummer: "176 1234567",
  geburtsdatum: "2001-04-12",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "COBADEFFXXX",
  ...extra,
});

test("Ändern: unverändert gültig → nichts zu schreiben, aber gültig (Bestätigung)", () => {
  const r = pruefeDatenCheckAenderung(formular(), gut(), false, false, HEUTE);
  assert.equal(r.gueltig, true);
  assert.deepEqual(r.secrets, {});
  assert.deepEqual(r.namen, {});
});

test("Ändern: neue IBAN + PLZ korrigiert → normalisiert gespeichert", () => {
  const bestand = gut({ iban: "DE89370400440532013001", plz: "9304" });
  const r = pruefeDatenCheckAenderung(formular({ iban: "de89 3704 0044 0532 0130 00", plz: "93047" }), bestand, false, false, HEUTE);
  assert.equal(r.gueltig, true);
  assert.equal(r.secrets.iban, IBAN_DE);
  assert.equal(r.secrets.plz, "93047");
});

test("Ändern: unveränderte kaputte Altnummer blockiert (sonst gälte nichts als bestätigt), nichts gespeichert", () => {
  const bestand = gut({ handynummer: "0941 123456" });
  const r = pruefeDatenCheckAenderung(formular({ handynummer: "0941 123456" }), bestand, false, false, HEUTE);
  assert.equal(r.gueltig, false);
  assert.ok(r.fehler.handynummer);
  assert.deepEqual(r.secrets, {});
  const ok = pruefeDatenCheckAenderung(formular({ handynummer: "176 1234567" }), bestand, false, false, HEUTE);
  assert.equal(ok.gueltig, true);
  assert.equal(ok.secrets.handynummer, "+491761234567");
});

test("Ändern: Pflichtfeld leeren → Fehler am Feld; Name wird geprüft und gespeichert", () => {
  const leer = pruefeDatenCheckAenderung(formular({ ort: "" }), gut(), false, false, HEUTE);
  assert.equal(leer.gueltig, false);
  assert.ok(leer.fehler.ort);
  const name = pruefeDatenCheckAenderung(formular({ nachname: "Muster-Neu" }), gut(), false, false, HEUTE);
  assert.equal(name.gueltig, true);
  assert.deepEqual(name.namen, { nachname: "Muster-Neu" });
});

test("Ändern: Alumni ohne IBAN gültig; sobald eine IBAN eingegeben wird, wird sie geprüft", () => {
  const bestand = gut({ iban: null, bic: null });
  assert.equal(pruefeDatenCheckAenderung(formular({ iban: "", bic: "" }), bestand, true, false, HEUTE).gueltig, true);
  const falsch = pruefeDatenCheckAenderung(formular({ iban: "DE89370400440532013001", bic: "" }), bestand, true, false, HEUTE);
  assert.equal(falsch.gueltig, false);
  assert.ok(falsch.fehler.iban);
});

test("Ort im Code: Fenster im Layout, nie in middleware.ts; Schalter steht in .env.example", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.doesNotMatch(middleware, /member-data-check|member-crypto/);
  const layout = readFileSync(new URL("../app/(intranet)/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /istAbfrageFaellig/);
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(env, /^DATA_CHECK_ENABLED=\r?$/m);
  assert.match(env, /^DATA_CHECK_START=\r?$/m);
});

// ---------------------------------------------------------------------------------------------------
// Fixrunde (Reviews A1–A4, B1–B3)
// ---------------------------------------------------------------------------------------------------

test("A1/B1: Layout-Modus – Mängel → nur Fenster, gültig → Fenster über der Seite, nicht fällig → Seite", () => {
  assert.equal(layoutModus(null), "seite");
  assert.equal(layoutModus({ gueltig: true }), "fenster-ueber-seite");
  assert.equal(layoutModus({ gueltig: false }), "nur-fenster");
  const layout = readFileSync(new URL("../app/(intranet)/layout.tsx", import.meta.url), "utf8");
  // Seiteninhalt (children) steckt nur in `seite`; im Modus „nur-fenster“ bekommt das Fenster einen leeren Grund.
  assert.equal(layout.match(/\{children\}/g).length, 1);
  assert.match(layout, /modus === "fenster-ueber-seite" \? seite : <div className="min-h-screen bg-background" \/>/);
  const fenster = readFileSync(new URL("../components/member/DatenCheckFenster.tsx", import.meta.url), "utf8");
  // Ohne Portal (steht im Server-HTML), Seite darunter inert, noscript mit Abmelden.
  assert.doesNotMatch(fenster, /DialogPrimitive.Portal|<DialogPortal|<DialogContent/);
  assert.match(fenster, /inert=\{offen\}/);
  assert.match(fenster, /<noscript>[\s\S]*Bitte aktiviere JavaScript, um deine Daten zu aktualisieren\.[\s\S]*action=\{logoutAction\}/);
});

function fakeAdmin({ rpc, version = 0, rpcFehler = null } = {}) {
  const calls = { rpc: [], updates: [] };
  return {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (rpcFehler) return { data: null, error: rpcFehler };
      return { data: rpc, error: null };
    },
    from: (tabelle) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: version === null ? null : { version }, error: null }) }) }),
      update: (werte) => ({
        eq: async (spalte, wert) => {
          calls.updates.push({ tabelle, werte, spalte, wert });
          return { error: null };
        },
      }),
    }),
  };
}

test("A2: Bestätigung nur für den geprüften Stand (confirm_member_data mit erwarteter Version)", async () => {
  const ok = fakeAdmin({ rpc: true });
  assert.equal(await bestaetigeStand(ok, "p1", 4), "ok");
  assert.deepEqual(ok.calls.rpc, [{ name: "confirm_member_data", args: { p_profile_id: "p1", p_expected_version: 4 } }]);
  assert.equal(ok.calls.updates.length, 0);
  assert.equal(await bestaetigeStand(fakeAdmin({ rpc: false }), "p1", 4), "konflikt");
  const kaputt = fakeAdmin({ rpcFehler: { code: "XX000", message: "boom" } });
  assert.equal(await bestaetigeStand(kaputt, "p1", 4), "fehler");
  assert.equal(kaputt.calls.updates.length, 0);
});

test("A2: Übergang ohne Funktion – Version vergleichen, nur bei gleichem Stand setzen", async () => {
  const fehlt = { code: "PGRST202", message: "Could not find the function public.confirm_member_data" };
  const gleich = fakeAdmin({ rpcFehler: fehlt, version: 4 });
  assert.equal(await bestaetigeStand(gleich, "p1", 4), "ok");
  assert.equal(gleich.calls.updates.length, 1);
  assert.equal(gleich.calls.updates[0].werte.daten_erinnern_ab, null);
  const anders = fakeAdmin({ rpcFehler: fehlt, version: 5 });
  assert.equal(await bestaetigeStand(anders, "p1", 4), "konflikt");
  assert.equal(anders.calls.updates.length, 0);
  const ohneZeile = fakeAdmin({ rpcFehler: fehlt, version: null });
  assert.equal(await bestaetigeStand(ohneZeile, "p1", 0), "ok");
});

test("A2: Migration confirm_member_data – Versionsvergleich unter Sperre, nur service_role", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261118150000_member_data_confirm.sql", import.meta.url), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.match(code, /for share;/);
  assert.match(code, /coalesce\(v_version, 0\) <> p_expected_version/);
  assert.match(code, /security definer/);
  assert.match(code, /set search_path = ''/);
  assert.match(code, /from public, anon, authenticated;/);
  assert.match(code, /to service_role;/);
  assert.doesNotMatch(code, /\b(truncate|delete from|drop table|drop column)\b/i);
  const actions = readFileSync(new URL("../app/(intranet)/profile/data-check-actions.ts", import.meta.url), "utf8");
  assert.match(actions, /bestaetigeStand\(admin, g\.id, erwartet\)/);
  assert.doesNotMatch(actions, /daten_bestaetigt_am: new Date/);
});

test("A3: landUnbekannt kommt nur vom Server, nie aus dem Formular", () => {
  const actions = readFileSync(new URL("../app/(intranet)/profile/data-check-actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /formData\.get\("landUnbekannt"\)/);
  assert.match(actions, /const landUnbekannt = !g\.landBekannt;/);
  const fenster = readFileSync(new URL("../components/member/DatenCheckFenster.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(fenster, /name="landUnbekannt"/);
});

test("A4: Schalter an ohne gültiges Start-Datum → einmal Warnung ohne Wert", () => {
  const original = console.warn;
  const warnungen = [];
  console.warn = (...args) => warnungen.push(args.join(" "));
  try {
    _resetStartWarnung();
    datenCheckEinstellungen({ DATA_CHECK_ENABLED: "true", DATA_CHECK_START: "2026-02-30" });
    datenCheckEinstellungen({ DATA_CHECK_ENABLED: "true" });
    assert.equal(warnungen.length, 1);
    assert.doesNotMatch(warnungen[0], /2026-02-30/);
    _resetStartWarnung();
    datenCheckEinstellungen({ DATA_CHECK_ENABLED: "true", DATA_CHECK_START: "2026-12-01" });
    datenCheckEinstellungen({ DATA_CHECK_ENABLED: "false" });
    assert.equal(warnungen.length, 1);
  } finally {
    console.warn = original;
  }
});

test("B2: „Ändern“ fokussiert bei Mängeln das erste markierte Feld", () => {
  const fenster = readFileSync(new URL("../components/member/DatenCheckFenster.tsx", import.meta.url), "utf8");
  assert.match(fenster, /fokussiere\(nach === "aendern" && Object\.values\(fehler\)\.some\(Boolean\) \? "fehler" : "schritt"\)/);
});

test("B3: Anschrift ganz leer → „Fehlt“ und eine Zeile für die Anschrift, Feldmarkierungen bleiben", () => {
  const a = ansicht(gut({ strasse: null, hausnummer: null, plz: null, ort: null, land: null }));
  const zeile = a.zeilen.find((zl) => zl.key === "anschrift");
  assert.deepEqual(zeile.wert, []);
  assert.equal(zeile.fehler, ANSCHRIFT_FEHLT);
  assert.equal(ANSCHRIFT_FEHLT, "Bitte trag deine Anschrift ein.");
  for (const feld of ["strasse", "plz", "ort"]) assert.ok(a.formularFehler[feld], feld);
  // Nur teilweise leer: die Feldmeldung wie bisher.
  const teil = ansicht(gut({ plz: null })).zeilen.find((zl) => zl.key === "anschrift");
  assert.notEqual(teil.fehler, ANSCHRIFT_FEHLT);
  assert.ok(teil.wert.length > 0);
});
