// Tests für lib/member-forms.ts (Paket „Mitgliederdaten“, PR 2): Registrierung, Profil und Korrektur durch
// den Vorstand prüfen nur über lib/member-rules.ts. Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bicHinweis,
  geaenderteKorrekturFelder,
  handyAnzeige,
  handyFuerEingabe,
  korrekturWerte,
  landAusBestand,
  pruefeKorrektur,
  pruefeProfil,
  pruefeRegistrierung,
  PLZ_DE_MELDUNG,
} from "../lib/member-forms.ts";
import { formatBvhPhone } from "../lib/bvh-phone.ts";

const HEUTE = "2026-11-18";
const IBAN_DE = "DE89370400440532013000";
const IBAN_DE_FALSCH = "DE89370400440532013001";

const leer = () => ({
  iban: null,
  bic: null,
  geburtsdatum: null,
  strasse: null,
  hausnummer: null,
  plz: null,
  ort: null,
  handynummer: null,
  land: null,
});

/** Vollständiger, gültiger Bestand (Altformat beim Handy möglich). */
const bestand = (extra = {}) => ({
  ...leer(),
  iban: IBAN_DE,
  bic: "COBADEFFXXX",
  geburtsdatum: "2001-04-12",
  strasse: "Musterstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  handynummer: "+491761234567",
  ...extra,
});

const antrag = (extra = {}) => ({
  vorname: "Erika",
  nachname: "Muster",
  email: "erika@example.org",
  geburtsdatum: "2003-02-01",
  strasse: "Musterstraße",
  hausnummer: "12",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handyLand: "DE",
  handynummer: "0176 1234567",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "",
  ...extra,
});

// ---------------------------------------------------------------------------------------------------
// Anzeige und Aufteilung
// ---------------------------------------------------------------------------------------------------

test("Handy aus dem Bestand für die Eingabe aufteilen", () => {
  assert.deepEqual(handyFuerEingabe("+491761234567"), { land: "DE", nummer: "176 1234567" });
  assert.deepEqual(handyFuerEingabe("+436641234567"), { land: "AT", nummer: "664 1234567" });
  assert.deepEqual(handyFuerEingabe(""), { land: "DE", nummer: "" });
  assert.deepEqual(handyFuerEingabe(null), { land: "DE", nummer: "" });
  // Altwerte bleiben roh (Mitglied/Vorstand korrigiert).
  assert.deepEqual(handyFuerEingabe("+49 0176 1234567"), { land: "DE", nummer: "+49 0176 1234567" });
  assert.deepEqual(handyFuerEingabe("176 1234567"), { land: "DE", nummer: "176 1234567" });
});

test("Handy-Anzeige: E.164 international, Altwerte roh", () => {
  assert.equal(handyAnzeige("+491761234567"), "+49 176 1234567");
  assert.equal(handyAnzeige("+49 0176 1234567"), "+49 0176 1234567");
  assert.equal(handyAnzeige(null), "");
});

test("Land aus dem Bestand: leer oder unbekannt = DE", () => {
  assert.equal(landAusBestand(null), "DE");
  assert.equal(landAusBestand(""), "DE");
  assert.equal(landAusBestand("AT"), "AT");
  assert.equal(landAusBestand("XX"), "DE");
});

test("BIC-Hinweis nur bei abweichendem Land einer gültigen IBAN", () => {
  assert.equal(bicHinweis("COBADEFFXXX", IBAN_DE), null);
  assert.match(bicHinweis("NTSBDEB1XXX", "FR1420041010050500013M02606"), /anderen Land/);
  assert.equal(bicHinweis("", IBAN_DE), null);
});

test("BVH: E.164 passt unverändert in die Telefonspalte", () => {
  assert.equal(formatBvhPhone("+491761234567"), "+491761234567");
});

// ---------------------------------------------------------------------------------------------------
// Registrierung
// ---------------------------------------------------------------------------------------------------

test("Registrierung: gültig, speichert E.164, Land und normalisierte IBAN; BIC optional", () => {
  const r = pruefeRegistrierung(antrag(), HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.equal(r.aenderungen.handynummer, "+491761234567");
  assert.equal(r.aenderungen.land, "DE");
  assert.equal(r.aenderungen.iban, IBAN_DE);
  assert.equal(r.aenderungen.bic, null);
  assert.deepEqual(r.werte, { vorname: "Erika", nachname: "Muster", email: "erika@example.org" });
});

test("Registrierung: Fehler je Feld", () => {
  const r = pruefeRegistrierung(
    antrag({ email: "erika@", hausnummer: "", plz: "9304", bic: "COBA", handynummer: "0941 123456" }),
    HEUTE
  );
  assert.equal(r.gueltig, false);
  assert.deepEqual(Object.keys(r.fehler).sort(), ["bic", "email", "handynummer", "hausnummer", "plz"]);
  assert.deepEqual(r.aenderungen, {});
});

test("Registrierung: IBAN Pflicht, Prüfziffer, Geburtsdatum Pflicht", () => {
  assert.ok(pruefeRegistrierung(antrag({ iban: "" }), HEUTE).fehler.iban);
  assert.ok(pruefeRegistrierung(antrag({ iban: IBAN_DE_FALSCH }), HEUTE).fehler.iban);
  assert.ok(pruefeRegistrierung(antrag({ geburtsdatum: "" }), HEUTE).fehler.geburtsdatum);
});

test("Registrierung: Auslandsadresse mit Land-Regel", () => {
  const r = pruefeRegistrierung(antrag({ land: "AT", plz: "1010", ort: "Wien", hausnummer: "" }), HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.equal(r.aenderungen.land, "AT");
  assert.ok(pruefeRegistrierung(antrag({ land: "AT", plz: "93047" }), HEUTE).fehler.plz);
});

test("Registrierung: Handy mit anderer Länderauswahl", () => {
  const r = pruefeRegistrierung(antrag({ handyLand: "AT", handynummer: "0664 1234567" }), HEUTE);
  assert.equal(r.aenderungen.handynummer, "+436641234567");
});

// ---------------------------------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------------------------------

const persoenlich = (extra = {}) => ({
  strasse: "Musterstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handyLand: "DE",
  handynummer: "176 1234567",
  ...extra,
});

test("Profil: Pflichtfeld leeren → Fehler am Feld, nichts zu speichern", () => {
  const r = pruefeProfil("personal", persoenlich({ strasse: "" }), bestand(), false, HEUTE);
  assert.equal(r.gueltig, false);
  assert.deepEqual(Object.keys(r.fehler), ["strasse"]);
  assert.deepEqual(r.aenderungen, {});
  assert.ok(pruefeProfil("personal", persoenlich({ handynummer: "" }), bestand(), false, HEUTE).fehler.handynummer);
  assert.ok(pruefeProfil("bank", { iban: "", bic: "" }, bestand(), false, HEUTE).fehler.iban);
});

test("Profil: speichert normalisierte Werte und das Land", () => {
  const r = pruefeProfil(
    "personal",
    persoenlich({ handynummer: "0176 7654321", plz: "D-93053" }),
    bestand(),
    false,
    HEUTE
  );
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.equal(r.aenderungen.handynummer, "+491767654321");
  assert.equal(r.aenderungen.plz, "93053");
  assert.equal(r.aenderungen.land, "DE");
  assert.ok(!("ort" in r.aenderungen), "unveränderte Felder werden nicht geschrieben");
  assert.ok(!("iban" in r.aenderungen), "Bankfelder bleiben im Abschnitt Persönliches unberührt");
  assert.ok(!("geburtsdatum" in r.aenderungen), "gespeichertes Geburtsdatum wird nicht angefasst");
});

test("Profil: unveränderte Altnummer wird weder geprüft noch gespeichert, eine neue schon", () => {
  const alt = bestand({ handynummer: "176 1234567" });
  const vorher = handyFuerEingabe(alt.handynummer);
  const r = pruefeProfil("personal", persoenlich({ handyLand: vorher.land, handynummer: vorher.nummer }), alt, false, HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.ok(!("handynummer" in r.aenderungen));
  const kaputt = bestand({ handynummer: "max@example.org" });
  const k = handyFuerEingabe(kaputt.handynummer);
  assert.equal(pruefeProfil("personal", persoenlich({ handyLand: k.land, handynummer: k.nummer }), kaputt, false, HEUTE).gueltig, true);
  const neu = pruefeProfil("personal", persoenlich({ handyLand: "DE", handynummer: "0176 7654321" }), alt, false, HEUTE);
  assert.equal(neu.aenderungen.handynummer, "+491767654321");
  // Leeren bleibt verboten.
  assert.ok(pruefeProfil("personal", persoenlich({ handynummer: "" }), alt, false, HEUTE).fehler.handynummer);
});

test("Profil: unbekanntes Land nur am Feld Land gemeldet", () => {
  const r = pruefeProfil("personal", persoenlich({ land: "XX" }), bestand(), false, HEUTE);
  assert.deepEqual(Object.keys(r.fehler), ["land"]);
});

test("Profil: Altfehler im anderen Abschnitt blockieren nicht", () => {
  const alt = bestand({ iban: IBAN_DE_FALSCH, plz: "9304", handynummer: "+49 0176 1234567" });
  assert.equal(pruefeProfil("personal", persoenlich(), alt, false, HEUTE).gueltig, true);
  assert.equal(pruefeProfil("bank", { iban: IBAN_DE, bic: "" }, alt, false, HEUTE).gueltig, true);
});

test("Profil: Geburtsdatum einmal nachtragen, danach ignoriert", () => {
  const ohne = bestand({ geburtsdatum: null });
  const r = pruefeProfil("personal", persoenlich({ geburtsdatum: "2002-05-06" }), ohne, false, HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.equal(r.aenderungen.geburtsdatum, "2002-05-06");
  // Fehlt es noch, ist es Pflicht.
  assert.ok(pruefeProfil("personal", persoenlich(), ohne, false, HEUTE).fehler.geburtsdatum);
  assert.ok(pruefeProfil("personal", persoenlich({ geburtsdatum: "2030-01-01" }), ohne, false, HEUTE).fehler.geburtsdatum);
  // Gespeichert: Eingabe wird ignoriert, auch ein altes ungültiges Datum blockiert nicht.
  const mit = bestand({ geburtsdatum: "1800-01-01" });
  const r2 = pruefeProfil("personal", persoenlich({ geburtsdatum: "2002-05-06" }), mit, false, HEUTE);
  assert.equal(r2.gueltig, true);
  assert.ok(!("geburtsdatum" in r2.aenderungen));
});

test("Profil Alumni: alte ungültige IBAN blockiert nicht, Leeren erlaubt, neue IBAN wird geprüft", () => {
  const alt = bestand({ iban: IBAN_DE_FALSCH, bic: "COBA" });
  const unveraendert = pruefeProfil("bank", { iban: IBAN_DE_FALSCH, bic: "COBA" }, alt, true, HEUTE);
  assert.equal(unveraendert.gueltig, true);
  assert.deepEqual(unveraendert.aenderungen, {});
  const geleert = pruefeProfil("bank", { iban: "", bic: "" }, alt, true, HEUTE);
  assert.equal(geleert.gueltig, true);
  assert.deepEqual(geleert.aenderungen, { iban: null, bic: null });
  const neu = pruefeProfil("bank", { iban: "DE12 3456", bic: "COBA" }, alt, true, HEUTE);
  assert.ok(neu.fehler.iban);
  // Ohne Bankdaten speichert ein Alumnus seine Adresse.
  assert.equal(pruefeProfil("personal", persoenlich(), bestand({ iban: null, bic: null }), true, HEUTE).gueltig, true);
  // Nur echtes true zählt als Alumni.
  assert.ok(pruefeProfil("bank", { iban: "", bic: "" }, alt, "true", HEUTE).fehler.iban);
});

test("Profil: Datei oder Zahl statt Text ist ein Fehler, nicht leer", () => {
  const r = pruefeProfil("personal", persoenlich({ ort: 42 }), bestand(), false, HEUTE);
  assert.ok(r.fehler.ort);
});

// ---------------------------------------------------------------------------------------------------
// Korrektur durch den Vorstand
// ---------------------------------------------------------------------------------------------------

test("Vorstand: Altdaten (+49 0176…, PLZ 9304) blockieren die Änderung eines anderen Felds nicht", () => {
  const alt = bestand({ handynummer: "+49 0176 1234567", plz: "9304", hausnummer: "Hinterhaus" });
  const basis = korrekturWerte(alt);
  assert.equal(basis.handynummer, "+49 0176 1234567");
  const r = pruefeKorrektur({ ...basis, ort: "Neutraubling" }, basis, alt, HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.deepEqual(r.aenderungen, { ort: "Neutraubling" });
});

test("Vorstand: Handy korrigieren → E.164, Land der Auswahl", () => {
  const alt = bestand({ handynummer: "+49 0176 1234567" });
  const basis = korrekturWerte(alt);
  const r = pruefeKorrektur({ ...basis, handynummer: "0176 7654321" }, basis, alt, HEUTE);
  assert.deepEqual(r.aenderungen, { handynummer: "+491767654321" });
  const at = pruefeKorrektur({ ...basis, handyLand: "AT", handynummer: "0664 1234567" }, basis, alt, HEUTE);
  assert.deepEqual(at.aenderungen, { handynummer: "+436641234567" });
});

test("Vorstand: Geburtsdatum nicht leerbar, andere Felder schon", () => {
  const basis = korrekturWerte(bestand());
  assert.ok(pruefeKorrektur({ ...basis, geburtsdatum: "" }, basis, bestand(), HEUTE).fehler.geburtsdatum);
  const r = pruefeKorrektur({ ...basis, strasse: "", hausnummer: "" }, basis, bestand(), HEUTE);
  assert.equal(r.gueltig, true);
  assert.deepEqual(r.aenderungen, { strasse: null, hausnummer: null });
});

test("Vorstand: Auslandsadresse mit lockerer PLZ, DE-PLZ streng", () => {
  const basis = korrekturWerte(bestand());
  const r = pruefeKorrektur({ ...basis, land: "CH", plz: "8001", ort: "Zürich" }, basis, bestand(), HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.deepEqual(r.aenderungen, { plz: "8001", ort: "Zürich", land: "CH" });
  assert.ok(pruefeKorrektur({ ...basis, plz: "9304" }, basis, bestand(), HEUTE).fehler.plz);
});

test("Vorstand: Land ohne Änderung wird nicht gespeichert (auch bei leerem Bestand)", () => {
  const basis = korrekturWerte(bestand({ land: null }));
  assert.equal(basis.land, "DE");
  assert.deepEqual([...geaenderteKorrekturFelder({ ...basis }, basis)], []);
});

test("Vorstand: neue IBAN wird geprüft, gleiche IBAN ist keine Änderung", () => {
  const basis = korrekturWerte(bestand());
  assert.ok(pruefeKorrektur({ ...basis, iban: IBAN_DE_FALSCH }, basis, bestand(), HEUTE).fehler.iban);
  assert.deepEqual(pruefeKorrektur({ ...basis, iban: "de89 3704 0044 0532 0130 00" }, basis, bestand(), HEUTE).aenderungen, {});
  const neu = pruefeKorrektur({ ...basis, iban: "AT61 1904 3002 3457 3201" }, basis, bestand(), HEUTE);
  assert.deepEqual(neu.aenderungen, { iban: "AT611904300234573201" });
  // BIC passt nicht zur neuen IBAN: nur Hinweis, kein Fehler (BIC unverändert, wird nicht neu geprüft).
  assert.equal(neu.gueltig, true);
});

test("Vorstand: BIC leeren erlaubt, ungültige BIC nicht", () => {
  const basis = korrekturWerte(bestand());
  assert.deepEqual(pruefeKorrektur({ ...basis, bic: "" }, basis, bestand(), HEUTE).aenderungen, { bic: null });
  assert.ok(pruefeKorrektur({ ...basis, bic: "COBA" }, basis, bestand(), HEUTE).fehler.bic);
});

// ---------------------------------------------------------------------------------------------------
// Fixrunde Reviews PR 2
// ---------------------------------------------------------------------------------------------------

test("U6: Speichern ohne Änderung schreibt nichts (auch kein Land bei Altdaten ohne Land)", () => {
  const r = pruefeProfil("personal", persoenlich(), bestand({ land: null }), false, HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.deepEqual(r.aenderungen, {});
  // Gewechseltes Land allein ist eine Änderung.
  const at = pruefeProfil("personal", persoenlich({ land: "AT", plz: "1010", ort: "Wien" }), bestand({ land: null }), false, HEUTE);
  assert.equal(at.aenderungen.land, "AT");
  // Bank: gleiche IBAN in anderer Schreibweise = keine Änderung.
  assert.deepEqual(pruefeProfil("bank", { iban: "de89 3704 0044 0532 0130 00", bic: "cobadeffxxx" }, bestand(), false, HEUTE).aenderungen, {});
});

test("U1: nur umformatierte Altnummer gilt als unverändert (Profil und Vorstand)", () => {
  const alt = bestand({ handynummer: "0176 12" });
  // Profil: das Feld hat „0176 12“ zu „176 12“ umformatiert, sonst nichts geändert.
  const p = pruefeProfil("personal", persoenlich({ handyLand: "DE", handynummer: "176 12", ort: "Neutraubling" }), alt, false, HEUTE);
  assert.equal(p.gueltig, true, p.ersterFehler ?? "");
  // Land kommt bei Altdaten ohne Land mit, sobald sich etwas ändert (Teil A).
  assert.deepEqual(p.aenderungen, { ort: "Neutraubling", land: "DE" });
  // Vorstand: Ort ändern, Handy nur angetippt → speichert, Handy nicht im Protokoll.
  const basis = korrekturWerte(alt);
  const k = pruefeKorrektur({ ...basis, handynummer: "176 12", ort: "Neutraubling" }, basis, alt, HEUTE);
  assert.equal(k.gueltig, true, k.ersterFehler ?? "");
  assert.deepEqual(k.aenderungen, { ort: "Neutraubling" });
  // Österreichische Nummer, nur angetippt.
  const at = bestand({ handynummer: "+436641234567" });
  const bAt = korrekturWerte(at);
  assert.deepEqual([...geaenderteKorrekturFelder({ ...bAt, handynummer: "664 1234567" }, bAt)], []);
  // Altnummer ohne Vorwahl, nur angetippt: bleibt unverändert (Hinweis vorwahl_ergaenzt bleibt dem Bestand).
  const ohne = bestand({ handynummer: "176 1234567" });
  const bOhne = korrekturWerte(ohne);
  assert.deepEqual([...geaenderteKorrekturFelder({ ...bOhne }, bOhne)], []);
});

test("U2: PLZ-Fehler in Deutschland nennt das Land", () => {
  const r = pruefeProfil("personal", persoenlich({ plz: "1010", ort: "Wien" }), bestand({ land: null }), false, HEUTE);
  assert.equal(r.fehler.plz, PLZ_DE_MELDUNG);
  assert.equal(pruefeRegistrierung(antrag({ plz: "9304" }), HEUTE).fehler.plz, PLZ_DE_MELDUNG);
  const basis = korrekturWerte(bestand());
  assert.equal(pruefeKorrektur({ ...basis, plz: "9304" }, basis, bestand(), HEUTE).fehler.plz, PLZ_DE_MELDUNG);
  // Andere Länder: Meldung der Regeln.
  assert.notEqual(pruefeProfil("personal", persoenlich({ land: "AT", plz: "93047", ort: "Wien" }), bestand(), false, HEUTE).fehler.plz, PLZ_DE_MELDUNG);
});
