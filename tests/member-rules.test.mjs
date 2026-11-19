// Tests für lib/member-rules.ts, lib/member-rules-client.ts, lib/iban.ts und lib/country-codes.ts
// (Paket „Mitgliederdaten“, PR 1). Ausführen mit `npm test`. Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  MANGEL_CODES,
  STAMMFELDER,
  istPflicht,
  pruefeHandy,
  formatiereHandyAnzeige,
  pruefeIban,
  pruefeBic,
  pruefeStrasse,
  pruefeHausnummer,
  pruefePlz,
  pruefeOrt,
  pruefeLand,
  pruefeGeburtsdatum,
  pruefeName,
  pruefeEmail,
  pruefeFormular,
  pruefeMitgliederdaten,
  pruefeBestand,
  pruefeVorstandskorrektur,
  HINWEIS_CODES,
  repariereHandy,
  repariereIban,
  repariereBic,
  repariereStrasse,
  repariereMitgliederdaten,
} from "../lib/member-rules.ts";
import {
  formatiereHandyEingabe,
  handyPlatzhalter,
  ibanInViererbloecken,
  emailTippfehler,
} from "../lib/member-rules-client.ts";
import { SEPA_IBAN_LENGTHS, checkSepaIban, validateIBAN, validateBICFormat } from "../lib/iban.ts";
import {
  countryCodes,
  countryFromSelectValue,
  dialCodeFor,
  findCountry,
  isCountryCode,
  DEFAULT_COUNTRY,
} from "../lib/country-codes.ts";
import { normalizeIban } from "../lib/member-crypto.ts";
import { isAlumniProfile } from "../lib/profile-status.ts";

const HEUTE = "2026-11-18";
const MITGLIED = { alumni: false, wer: "mitglied", heute: HEUTE };
const ALUMNI = { alumni: true, wer: "mitglied", heute: HEUTE };
const REGISTRIERUNG = { alumni: false, wer: "registrierung", heute: HEUTE };
const VORSTAND = { alumni: false, wer: "vorstand", heute: HEUTE };

const IBAN_DE = "DE89370400440532013000";
const IBAN_AT = "AT611904300234573201";
const IBAN_CH = "CH9300762011623852957";
const IBAN_GB = "GB82WEST12345698765432";
const IBAN_NO = "NO9386011117947";
const IBAN_BR = "BR1800360305000010009795493C1";

/** Gültiger, vollständiger Datensatz (erfunden). */
const GUT = Object.freeze({
  strasse: "Hauptstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handynummer: "+4917612345678",
  iban: IBAN_DE,
  bic: "COBADEFFXXX",
  geburtsdatum: "2001-05-17",
});

const ok = (r) => r.code === null && r.fehler === null;

// ---------------------------------------------------------------------------------------------------
// Handy
// ---------------------------------------------------------------------------------------------------

test("Handy DE: gültige Schreibweisen werden zu E.164", () => {
  for (const eingabe of [
    "0176 12345678",
    "176 12345678",
    "+49 (0)176 12345678",
    "+49 0176 12345678",
    "0049 176 12345678",
    "+49 176 12345678",
    "+4917612345678",
    "0176/123-456-78",
  ]) {
    const r = pruefeHandy(eingabe, "DE", MITGLIED);
    assert.ok(ok(r), eingabe);
    assert.equal(r.wert, "+4917612345678", eingabe);
    assert.equal(r.land, "DE", eingabe);
  }
});

test("Handy DE: Festnetz, zu kurz, Mailadresse", () => {
  const tabelle = [
    ["0941 123456", "kein_mobil"],
    ["+49 30 123456", "kein_mobil"],
    ["0176 123", "format"],
    ["max@example.org", "format"],
    ["0176 1234 5678 9999 0000 1111 2222", "format"],
  ];
  for (const [eingabe, code] of tabelle) {
    const r = pruefeHandy(eingabe, "DE", MITGLIED);
    assert.equal(r.code, code, eingabe);
    assert.ok(r.fehler, eingabe);
  }
  assert.equal(pruefeHandy("0941 123456", "DE", MITGLIED).fehler, "Das ist eine Festnetznummer. Bitte deine Handynummer.");
});

test("Handy Ausland: AT gültig/ungültig, Land folgt der Nummer", () => {
  const at = pruefeHandy("0664 1234567", "AT", MITGLIED);
  assert.ok(ok(at));
  assert.equal(at.wert, "+436641234567");
  assert.equal(pruefeHandy("123", "AT", MITGLIED).code, "format");
  // Fremde Vorwahl bei Auswahl DE: die Nummer gewinnt.
  const fremd = pruefeHandy("+43 664 1234567", "DE", MITGLIED);
  assert.ok(ok(fremd));
  assert.equal(fremd.wert, "+436641234567");
  assert.equal(fremd.land, "AT");
  // Schweiz, China (Mobil), USA/Kanada (Typ „Festnetz oder Mobil“) sind gültig.
  assert.equal(pruefeHandy("+41 79 123 45 67", "DE", MITGLIED).wert, "+41791234567");
  assert.equal(pruefeHandy("138 1234 5678", "CN", MITGLIED).wert, "+8613812345678");
  assert.equal(pruefeHandy("416 555 0123", "CA", MITGLIED).land, "CA");
  assert.equal(pruefeHandy("202 555 0123", "US", MITGLIED).land, "US");
});

test("Handy: Pflicht außer für den Vorstand; unbekanntes Land → DE", () => {
  assert.equal(pruefeHandy("", "DE", MITGLIED).code, "fehlt");
  assert.equal(pruefeHandy("  ", "DE", REGISTRIERUNG).code, "fehlt");
  assert.equal(pruefeHandy(null, "DE", ALUMNI).code, "fehlt");
  assert.ok(ok(pruefeHandy("", "DE", VORSTAND)));
  assert.equal(pruefeHandy("0176 12345678", "XX", MITGLIED).wert, "+4917612345678");
});

test("Handy-Anzeige international", () => {
  assert.equal(formatiereHandyAnzeige("+4917612345678"), "+49 176 12345678");
  assert.equal(formatiereHandyAnzeige(""), "");
  assert.equal(formatiereHandyAnzeige("kaputt"), "kaputt");
});

// ---------------------------------------------------------------------------------------------------
// IBAN / BIC
// ---------------------------------------------------------------------------------------------------

test("IBAN: SEPA, Länge, Prüfziffer, Meldungen", () => {
  const r = pruefeIban("de89 3704 0044 0532 0130 00", MITGLIED);
  assert.ok(ok(r));
  assert.equal(r.wert, IBAN_DE);
  for (const iban of [IBAN_AT, IBAN_CH, IBAN_GB, IBAN_NO]) assert.ok(ok(pruefeIban(iban, MITGLIED)), iban);

  const pz = pruefeIban("DE89 3704 0044 0532 0130 01", MITGLIED);
  assert.equal(pz.code, "pruefziffer");
  assert.equal(pz.fehler, "Prüfziffer passt nicht. Vertippt?");

  const br = pruefeIban(IBAN_BR, MITGLIED);
  assert.equal(br.code, "nicht_sepa");
  assert.equal(br.fehler, "Nur Konten aus dem SEPA-Raum.");
  assert.equal(pruefeIban("US12 3456 7890 1234 5678", MITGLIED).code, "nicht_sepa");

  const kurz = pruefeIban("DE89 3704 0044 0532 0130", MITGLIED);
  assert.equal(kurz.code, "laenge");
  assert.equal(kurz.fehler, "Eine IBAN aus Deutschland hat 22 Stellen.");
  assert.equal(pruefeIban("12345", MITGLIED).code, "format");
  // Meldung enthält nie den Wert.
  assert.ok(!pz.fehler.includes("3704"));
});

test("IBAN: Pflicht für Mitglieder, optional für Alumni (wenn angegeben, geprüft)", () => {
  assert.equal(pruefeIban("", MITGLIED).code, "fehlt");
  assert.equal(pruefeIban("", REGISTRIERUNG).code, "fehlt");
  assert.ok(ok(pruefeIban("", ALUMNI)));
  assert.ok(ok(pruefeIban("", VORSTAND)));
  assert.equal(pruefeIban("DE89370400440532013001", ALUMNI).code, "pruefziffer");
});

test("IBAN-Tabelle: alle SEPA-Länder, Längen 15–31, bekannte Präfixe", () => {
  for (const land of ["CH", "LI", "GB", "NO", "IS", "MC", "SM", "AD", "VA", "AL", "ME", "MD", "MK", "RS", "GI"]) {
    assert.ok(SEPA_IBAN_LENGTHS[land], land);
  }
  const eu = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
  for (const land of eu) assert.ok(SEPA_IBAN_LENGTHS[land], land);
  for (const [land, laenge] of Object.entries(SEPA_IBAN_LENGTHS)) {
    assert.ok(laenge >= 15 && laenge <= 31, land);
  }
  assert.equal(Object.keys(SEPA_IBAN_LENGTHS).length, 42);
  assert.equal(SEPA_IBAN_LENGTHS.US, undefined);
  assert.equal(checkSepaIban(IBAN_DE), "ok");
});

test("lib/iban.ts: bestehende Aufrufer (validateIBAN/validateBICFormat) funktionieren weiter", () => {
  assert.equal(validateIBAN("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(validateIBAN("DE89370400440532013001"), false);
  // Außerhalb SEPA wie bisher ohne Längenprüfung, nur Prüfsumme.
  assert.equal(validateIBAN(IBAN_BR), true);
  assert.equal(validateBICFormat("COBADEFFXXX"), true);
  assert.equal(validateBICFormat("COBADEF"), false);
});

test("BIC: optional, Format, Land passt zur IBAN", () => {
  assert.ok(ok(pruefeBic("", IBAN_DE, MITGLIED)));
  assert.ok(ok(pruefeBic("", IBAN_DE, REGISTRIERUNG)));
  const r = pruefeBic("coba de ff xxx", IBAN_DE, MITGLIED);
  assert.ok(ok(r));
  assert.equal(r.wert, "COBADEFFXXX");
  assert.ok(ok(pruefeBic("COBADEFF", IBAN_DE, MITGLIED)));
  assert.equal(pruefeBic("COBADEF", IBAN_DE, MITGLIED).code, "format");
  assert.equal(pruefeBic("COBADEFFXX", IBAN_DE, MITGLIED).code, "format");
  // Ohne IBAN kein Länderabgleich; Jersey-Bank zu GB-IBAN ist in Ordnung.
  assert.ok(ok(pruefeBic("COBADEFF", "", MITGLIED)));
  assert.ok(ok(pruefeBic("ABCDJESHXXX", IBAN_GB, MITGLIED)));
});

// ---------------------------------------------------------------------------------------------------
// Anschrift
// ---------------------------------------------------------------------------------------------------

test("Straße: Buchstaben, Hausnummer ins eigene Feld", () => {
  assert.ok(ok(pruefeStrasse("Hauptstraße", "12", MITGLIED)));
  assert.ok(ok(pruefeStrasse("Straße des 17. Juni", "3", MITGLIED)));
  assert.equal(pruefeStrasse("12345", "1", MITGLIED).code, "keine_buchstaben");
  const r = pruefeStrasse("Hauptstraße 12", "", MITGLIED);
  assert.equal(r.code, "hausnummer_in_strasse");
  assert.equal(r.fehler, "Hausnummer bitte ins eigene Feld.");
  assert.equal(pruefeStrasse("Hauptstr.5a", "", MITGLIED).code, "hausnummer_in_strasse");
  // Mit Hausnummer im eigenen Feld ist eine Zahl am Ende kein Mangel.
  assert.ok(ok(pruefeStrasse("Hauptstraße 12", "12", MITGLIED)));
  assert.equal(pruefeStrasse("", "", MITGLIED).code, "fehlt");
  assert.equal(pruefeStrasse("=SUMME(A1)", "1", MITGLIED).code, "zeichen");
  assert.equal(pruefeStrasse("a".repeat(101), "1", MITGLIED).code, "zu_lang");
  assert.equal(pruefeStrasse("  Haupt\tstraße  ", "1", MITGLIED).wert, "Haupt straße");
});

test("Hausnummer DE: Ziffer zuerst; außerhalb DE optional", () => {
  for (const nr of ["12", "12a", "12 b", "12-14", "3/1", "12a-12c", "1"]) {
    assert.ok(ok(pruefeHausnummer(nr, "DE", MITGLIED)), nr);
  }
  for (const nr of ["a", "Hinterhaus", "12 Hinterhaus", "-12"]) {
    assert.ok(pruefeHausnummer(nr, "DE", MITGLIED).code, nr);
  }
  assert.equal(pruefeHausnummer("a", "DE", MITGLIED).code, "format");
  assert.equal(pruefeHausnummer("", "DE", MITGLIED).code, "fehlt");
  assert.equal(pruefeHausnummer("", "", MITGLIED).code, "fehlt"); // leeres Land = DE
  assert.ok(ok(pruefeHausnummer("", "AT", MITGLIED)));
  assert.ok(ok(pruefeHausnummer("Stiege 2/Top 5", "AT", MITGLIED)));
  assert.ok(ok(pruefeHausnummer("", "DE", VORSTAND)));
});

test("PLZ: DE 5 Ziffern, Tabelle je Land, sonst locker", () => {
  const tabelle = [
    ["93047", "DE", null],
    ["01067", "DE", null],
    ["9304", "DE", "format"],
    ["ABC", "DE", "format"],
    ["930470", "DE", "format"],
    ["", "DE", "fehlt"],
    ["1010", "AT", null],
    ["10101", "AT", "format"],
    ["8001", "CH", null],
    ["9490", "LI", null],
    ["L-1234", "LU", null],
    ["1000", "BE", null],
    ["1234 ab", "NL", null],
    ["2100", "DK", null],
    ["0150", "NO", null],
    ["1051", "HU", null],
    ["75001", "FR", null],
    ["7500", "FR", "format"],
    ["00-950", "PL", null],
    ["110 00", "CZ", null],
    ["SW1A 1AA", "GB", null],
    ["1100-148", "PT", null],
    ["ABC-12", "US", null], // lockere Regel
    ["X", "US", "format"],
  ];
  for (const [plz, land, code] of tabelle) {
    assert.equal(pruefePlz(plz, land, MITGLIED).code, code, `${land} ${plz}`);
  }
  assert.equal(pruefePlz("1234 ab", "NL", MITGLIED).wert, "1234 AB");
  assert.equal(pruefePlz("9304", "DE", MITGLIED).fehler, "Die PLZ hat 5 Ziffern.");
  // Vorstand: Ausland immer locker, Deutschland streng.
  assert.ok(ok(pruefePlz("10101", "AT", VORSTAND)));
  assert.equal(pruefePlz("9304", "DE", VORSTAND).code, "format");
  assert.ok(ok(pruefePlz("", "DE", VORSTAND)));
});

test("Ort: keine Ziffern in DE, Buchstaben Pflicht", () => {
  assert.ok(ok(pruefeOrt("Neumarkt i.d.OPf.", "DE", MITGLIED)));
  assert.ok(ok(pruefeOrt("Frankfurt am Main", "DE", MITGLIED)));
  assert.equal(pruefeOrt("Regensburg 2", "DE", MITGLIED).code, "ziffern");
  assert.equal(pruefeOrt("...", "DE", MITGLIED).code, "keine_buchstaben");
  assert.ok(ok(pruefeOrt("Dublin 4", "IE", MITGLIED)));
  assert.equal(pruefeOrt("", "DE", MITGLIED).code, "fehlt");
});

test("Land der Anschrift: ISO-Code, leer = DE", () => {
  assert.equal(pruefeLand("").wert, "DE");
  assert.equal(pruefeLand(null).wert, "DE");
  assert.equal(pruefeLand("at").wert, "AT");
  assert.equal(pruefeLand("XX").code, "land_unbekannt");
  assert.equal(pruefeLand("+49").code, "land_unbekannt");
});

// ---------------------------------------------------------------------------------------------------
// Geburtsdatum, Name, E-Mail
// ---------------------------------------------------------------------------------------------------

test("Geburtsdatum: echtes Datum, vor heute, höchstens 120 Jahre, kein Mindestalter", () => {
  const tabelle = [
    ["2004-02-29", null], // Schaltjahr
    ["2005-02-29", "format"],
    ["2000-02-30", "format"],
    ["17.05.2001", "format"],
    ["2026-11-18", "zukunft"], // heute
    ["2026-11-19", "zukunft"], // morgen
    ["2026-11-17", null], // gestern: kein Mindestalter
    ["2016-11-18", null], // 10 Jahre
    ["1906-11-18", null], // genau 120 Jahre
    ["1906-11-17", null], // 120 Jahre und ein Tag
    ["1905-11-19", null], // morgen 121
    ["1905-11-18", "zu_alt"], // genau 121 Jahre
    ["1899-01-01", "zu_alt"],
    ["", "fehlt"],
  ];
  for (const [datum, code] of tabelle) {
    assert.equal(pruefeGeburtsdatum(datum, MITGLIED).code, code, datum);
  }
  // Auch der Vorstand darf es nicht leeren.
  assert.equal(pruefeGeburtsdatum("", VORSTAND).code, "fehlt");
  // Ohne `heute` gilt das Berliner Datum.
  assert.equal(pruefeGeburtsdatum("2999-01-01", { alumni: false, wer: "mitglied" }).code, "zukunft");
});

test("Name: Buchstaben inkl. Akzente, - ' . ; keine Ziffern", () => {
  for (const name of ["Anna", "Zoë", "Jean-Luc", "O'Brien", "Dr. Müller", "Ægir Þórsson", "Łukasz"]) {
    assert.ok(ok(pruefeName(name, "vorname")), name);
  }
  for (const name of ["Anna2", "R2-D2", "@nna", "...", "Anna_B"]) {
    assert.ok(pruefeName(name, "vorname").code, name);
  }
  assert.equal(pruefeName("Erika2", "vorname").fehler, "Bitte nur Buchstaben, Leerzeichen, - ' und .");
  assert.equal(pruefeName("", "nachname").code, "fehlt");
  assert.equal(pruefeName("a".repeat(101), "nachname").code, "zu_lang");
});

test("E-Mail: isValidEmail", () => {
  assert.ok(ok(pruefeEmail("max@example.org", MITGLIED)));
  assert.equal(pruefeEmail("max@", MITGLIED).code, "format");
  assert.equal(pruefeEmail("", MITGLIED).code, "fehlt");
});

// ---------------------------------------------------------------------------------------------------
// Gesamtprüfung
// ---------------------------------------------------------------------------------------------------

test("Gesamtprüfung: gültiger Datensatz ohne Mängel, Werte normalisiert", () => {
  const r = pruefeFormular({ ...GUT, iban: "de89 3704 0044 0532 0130 00", handynummer: "0176 12345678" }, MITGLIED);
  assert.equal(r.gueltig, true);
  assert.deepEqual(r.maengel, []);
  assert.equal(r.ersterFehler, null);
  assert.equal(r.werte.iban, IBAN_DE);
  assert.equal(r.werte.handynummer, "+4917612345678");
  assert.deepEqual(Object.keys(r.werte), STAMMFELDER);
});

test("Gesamtprüfung: Alumni ohne IBAN kein Mangel, Mitglied ohne IBAN Mangel", () => {
  const ohneBank = { ...GUT, iban: "", bic: "" };
  assert.deepEqual(pruefeMitgliederdaten(ohneBank, ALUMNI), []);
  assert.deepEqual(pruefeMitgliederdaten(ohneBank, MITGLIED), [{ feld: "iban", code: "fehlt" }]);
});

test("Gesamtprüfung: leerer Altdatensatz (Mitglied) listet alle Pflichtfelder, ohne Werte", () => {
  const maengel = pruefeMitgliederdaten({}, MITGLIED);
  assert.deepEqual(maengel, [
    { feld: "strasse", code: "fehlt" },
    { feld: "hausnummer", code: "fehlt" },
    { feld: "plz", code: "fehlt" },
    { feld: "ort", code: "fehlt" },
    { feld: "handynummer", code: "fehlt" },
    { feld: "iban", code: "fehlt" },
    { feld: "geburtsdatum", code: "fehlt" },
  ]);
  for (const m of maengel) assert.ok(MANGEL_CODES.includes(m.code));
});

test("Gesamtprüfung: Altformat, BIC zu fremder IBAN, Codes und erste Meldung", () => {
  const r = pruefeFormular(
    { ...GUT, handynummer: "0941 123456", bic: "COBADEFF", iban: IBAN_AT, plz: "9304", strasse: "Hauptstraße 12", hausnummer: "" },
    MITGLIED
  );
  assert.deepEqual(r.maengel, [
    { feld: "strasse", code: "hausnummer_in_strasse" },
    { feld: "hausnummer", code: "fehlt" },
    { feld: "plz", code: "format" },
    { feld: "handynummer", code: "kein_mobil" },
  ]);
  assert.deepEqual(r.hinweise, [{ feld: "bic", code: "bic_land" }]);
  assert.equal(r.ersterFehler, "Hausnummer bitte ins eigene Feld.");
  assert.equal(r.gueltig, false);
});

test("Gesamtprüfung: Auslandsadresse mit Land-Feld, Hausnummer optional", () => {
  const at = { ...GUT, land: "AT", plz: "1010", ort: "Wien", hausnummer: "", strasse: "Stephansplatz" };
  assert.deepEqual(pruefeMitgliederdaten(at, MITGLIED), []);
  assert.deepEqual(pruefeMitgliederdaten({ ...at, plz: "93047" }, MITGLIED), [{ feld: "plz", code: "format" }]);
});

test("Gesamtprüfung: Vorname/Nachname/E-Mail nur, wenn übergeben", () => {
  assert.deepEqual(pruefeMitgliederdaten({ ...GUT, vorname: "Anna", nachname: "Muster", email: "anna@example.org" }, MITGLIED), []);
  assert.deepEqual(pruefeMitgliederdaten({ ...GUT, email: "kaputt" }, MITGLIED), [{ feld: "email", code: "format" }]);
  const r = pruefeFormular({ ...GUT, vorname: "Anna" }, MITGLIED);
  assert.equal(r.werte.vorname, "Anna");
  assert.equal("email" in r.werte, false);
});

test("Gesamtprüfung: Handy-Land getrennt vom Land der Anschrift", () => {
  assert.deepEqual(pruefeMitgliederdaten({ ...GUT, handynummer: "0664 1234567", handyLand: "AT" }, MITGLIED), []);
  assert.deepEqual(pruefeMitgliederdaten({ ...GUT, handynummer: "0664 1234567" }, MITGLIED), [
    { feld: "handynummer", code: "kein_mobil" },
  ]);
});

test("Pflichtfelder je Kontext", () => {
  assert.equal(istPflicht("iban", MITGLIED), true);
  assert.equal(istPflicht("iban", ALUMNI), false);
  assert.equal(istPflicht("bic", REGISTRIERUNG), false);
  assert.equal(istPflicht("hausnummer", MITGLIED, "AT"), false);
  assert.equal(istPflicht("geburtsdatum", VORSTAND), true);
  for (const feld of STAMMFELDER.filter((f) => f !== "geburtsdatum")) assert.equal(istPflicht(feld, VORSTAND), false, feld);
});

test("Vorstand: nur geänderte Felder zählen, Altdaten blockieren nicht", () => {
  const alt = { ...GUT, handynummer: "+49 0176 12345678", plz: "9304", iban: "", bic: "COBADEF", geburtsdatum: "" };
  // Ort korrigieren: die kaputten Altfelder blockieren nicht.
  const r = pruefeVorstandskorrektur({ ort: "Neumarkt i.d.OPf." }, alt, HEUTE);
  assert.equal(r.gueltig, true);
  assert.deepEqual(r.werte, { ort: "Neumarkt i.d.OPf." });
  // Leeren erlaubt, außer Geburtsdatum.
  assert.equal(pruefeVorstandskorrektur({ handynummer: "", iban: "", strasse: "" }, GUT, HEUTE).gueltig, true);
  const geb = pruefeVorstandskorrektur({ geburtsdatum: "" }, GUT, HEUTE);
  assert.deepEqual(geb.maengel, [{ feld: "geburtsdatum", code: "fehlt" }]);
  assert.equal(geb.ersterFehler, "Das Geburtsdatum kann nicht gelöscht werden. Bitte ein vollständiges Datum eingeben.");
  // Geänderte Felder werden geprüft (Format, Querbezug aus den bestehenden Werten).
  assert.deepEqual(pruefeVorstandskorrektur({ plz: "9304" }, GUT, HEUTE).maengel, [{ feld: "plz", code: "format" }]);
  const bicFremd = pruefeVorstandskorrektur({ bic: "COBADEFF" }, { ...GUT, iban: IBAN_AT }, HEUTE);
  assert.equal(bicFremd.gueltig, true);
  assert.deepEqual(bicFremd.hinweise, [{ feld: "bic", code: "bic_land" }]);
  assert.deepEqual(pruefeVorstandskorrektur({ strasse: "Hauptstraße 5" }, { ...GUT, hausnummer: "" }, HEUTE).maengel, [
    { feld: "strasse", code: "hausnummer_in_strasse" },
  ]);
  // Auslandsadresse mit lockerer Regel.
  assert.equal(pruefeVorstandskorrektur({ land: "AT", plz: "10101", hausnummer: "" }, GUT, HEUTE).gueltig, true);
  // Normalisierte Werte der geänderten Felder.
  assert.equal(pruefeVorstandskorrektur({ handynummer: "0176 12345678" }, alt, HEUTE).werte.handynummer, "+4917612345678");
});

// ---------------------------------------------------------------------------------------------------
// Reparatur
// ---------------------------------------------------------------------------------------------------

test("Reparatur Handy: sicher, Vorschlag, offen", () => {
  const tabelle = [
    ["+49 0176 12345678", "sicher", "+4917612345678"],
    ["+49 (0)176 12345678", "sicher", "+4917612345678"],
    ["0049 176 12345678", "sicher", "+4917612345678"],
    ["0176 12345678", "sicher", "+4917612345678"],
    ["+49 176 12345678", "sicher", "+4917612345678"], // seit 19.11.: 15/16/17 nach +49 gilt als deutsch
    ["+4917612345678", "gueltig", "+4917612345678"],
    [" +4917612345678 ", "sicher", "+4917612345678"],
    ["+43 664 1234567", "vorschlag", "+436641234567"], // R2: Land weicht vom Standardland ab
    ["17612345678", "sicher", "+4917612345678"],
    ["176 12345678", "sicher", "+4917612345678"],
    ["1511 2345678", "sicher", "+4915112345678"],
    ["max@example.org", "offen", "max@example.org"],
    ["0941 123456", "offen", "0941 123456"],
    ["941 123456", "offen", "941 123456"],
    ["0176 123", "offen", "0176 123"],
    ["", "offen", ""],
  ];
  for (const [eingabe, status, wert] of tabelle) {
    const r = repariereHandy(eingabe);
    assert.equal(r.status, status, eingabe);
    assert.equal(r.wert, wert, eingabe);
  }
  assert.equal(repariereHandy("max@example.org").code, "format");
  assert.equal(repariereHandy("0941 123456").code, "kein_mobil");
  assert.equal(repariereHandy("").code, "fehlt");
  assert.equal(repariereHandy("", "DE", VORSTAND).status, "gueltig");
});

test("Reparatur Handy: ohne Vorwahl nur 15/16/17 als deutsch „sicher“ (Entscheidung Hannes 19.11.2026)", () => {
  // Abwägung: Chinesische Nummern mit 15x/17x sehen genauso aus. Der Verein korrigiert trotzdem selbst
  // (Mitglieder haben sich mit vorausgewählter +49 registriert; jede Korrektur ist protokolliert).
  for (const eingabe of ["15912345678", "17012345678", "159 1234 5678"]) {
    const r = repariereHandy(eingabe);
    assert.equal(r.status, "sicher", eingabe);
    assert.ok(r.wert.startsWith("+4915") || r.wert.startsWith("+4917"), eingabe);
  }
  // Andere Anfänge (z. B. 138…, 188…, nur in China vergeben) bleiben unangetastet.
  for (const eingabe of ["13812345678", "18812345678"]) assert.equal(repariereHandy(eingabe).status, "offen", eingabe);
});

test("Reparatur Handy: Grenzen der 15/16/17-Regel (Review 19.11.2026)", () => {
  // Standardland AT: ohne Präfix bleibt offen, +49-Zweig nur Vorschlag.
  assert.equal(repariereHandy("17612345678", "AT").status, "offen");
  assert.equal(repariereHandy("+49 176 12345678", "AT").status, "vorschlag");
  // Klammern und Trenner im +49- bzw. Ohne-Präfix-Zweig.
  for (const eingabe of ["+49 (151) 12345678", "(+49) 176 12345678", "+49-176-12345678", "+49/176/12345678", "+ 49 176 12345678", "(176) 12345678"]) {
    const r = repariereHandy(eingabe);
    assert.equal(r.status, "sicher", eingabe);
    assert.match(r.wert, /^\+4915|^\+4917/, eingabe);
  }
  // 10-stellige 15er sind keine gültige deutsche Mobilnummer; 11-stellige schon.
  assert.equal(repariereHandy("1512345678").status, "offen");
  assert.equal(repariereHandy("15112345678").status, "sicher");
  // Pager (168) ist nicht MOBILE.
  assert.equal(repariereHandy("16812345678").status, "offen");
  assert.equal(repariereHandy("+49 168 1234567").status, "offen");
  // Festnetz und Sonderrufnummern nach +49 ohne 0.
  assert.equal(repariereHandy("+49 30 1234567").status, "offen");
  assert.equal(repariereHandy("+49 800 1234567").status, "offen");
  // „49“ ohne + darf nicht sicher werden.
  assert.equal(repariereHandy("49 176 12345678").status, "offen");
  assert.equal(repariereHandy("4917612345678").status, "offen");
});

test("Reparatur Handy: akzeptiertes Restrisiko USA/Kanada und China (Entscheidung Hannes 19.11.2026)", () => {
  // Dokumentiertes Verhalten, keine Wunschlösung: Nummern mit Vorwahl 1 ohne „+“ bzw. hinter „+49“ und
  // chinesische Mobilnummern sehen wie deutsche aus und werden „sicher“ als deutsche Nummer umgeschrieben.
  assert.deepEqual(repariereHandy("1 602 555 1234"), { status: "sicher", wert: "+4916025551234", code: null });
  assert.equal(repariereHandy("1-702-555-1234").status, "sicher");
  assert.equal(repariereHandy("+49 1 602 555 1234").status, "sicher");
  assert.equal(repariereHandy("15112345678").status, "sicher"); // China 15x
});

test("Reparatur IBAN, BIC, Straße", () => {
  assert.deepEqual(repariereIban("de89 3704 0044 0532 0130 00"), { status: "sicher", wert: IBAN_DE, code: null });
  assert.deepEqual(repariereIban(IBAN_DE), { status: "gueltig", wert: IBAN_DE, code: null });
  assert.equal(repariereIban("DE89370400440532013001").status, "offen");
  assert.equal(repariereIban("DE89370400440532013001").code, "pruefziffer");
  assert.equal(repariereIban("", ALUMNI).status, "gueltig");
  assert.equal(repariereIban("", MITGLIED).status, "offen");

  assert.deepEqual(repariereBic("coba deff xxx", IBAN_DE), { status: "sicher", wert: "COBADEFFXXX", code: null });
  assert.deepEqual(repariereBic("COBADEFF", IBAN_DE), { status: "gueltig", wert: "COBADEFF", code: null });
  assert.deepEqual(repariereBic("COBADEF", IBAN_DE), { status: "sicher", wert: "", code: "format" });
  assert.deepEqual(repariereBic("COBADEFF", IBAN_AT), { status: "gueltig", wert: "COBADEFF", code: null });
  assert.deepEqual(repariereBic("", IBAN_DE), { status: "gueltig", wert: "", code: null });

  assert.deepEqual(repariereStrasse("Hauptstraße 12a", ""), { status: "sicher", strasse: "Hauptstraße", hausnummer: "12a" });
  assert.deepEqual(repariereStrasse("Hauptstr.5", ""), { status: "sicher", strasse: "Hauptstr.", hausnummer: "5" });
  assert.deepEqual(repariereStrasse("Am Ring 3/1", " "), { status: "sicher", strasse: "Am Ring", hausnummer: "3/1" });
  assert.deepEqual(repariereStrasse("Hauptstraße 12", "12"), { status: "gueltig", strasse: "Hauptstraße 12", hausnummer: "12" });
  assert.deepEqual(repariereStrasse("Hauptstraße", ""), { status: "gueltig", strasse: "Hauptstraße", hausnummer: "" });
  assert.equal(repariereStrasse("A 5", "").status, "offen");
});

test("Reparatur ist idempotent (zweimal anwenden = gleiches Ergebnis)", () => {
  const handys = ["+49 0176 12345678", "0176 12345678", "17612345678", "13812345678", "max@example.org", "", "0941 123456"];
  for (const h of handys) {
    const einmal = repariereHandy(h);
    const zweimal = repariereHandy(einmal.wert);
    assert.equal(zweimal.wert, einmal.wert, h);
    assert.ok(zweimal.status === einmal.status || zweimal.status === "gueltig", h);
    assert.deepEqual(repariereHandy(zweimal.wert), zweimal, h);
  }
  for (const b of ["coba deff xxx", "COBADEF", ""]) {
    const einmal = repariereBic(b, IBAN_DE);
    assert.equal(repariereBic(einmal.wert, IBAN_DE).wert, einmal.wert, b);
  }
  for (const i of ["de89 3704 0044 0532 0130 00", "DE89370400440532013001"]) {
    const einmal = repariereIban(i);
    assert.equal(repariereIban(einmal.wert).wert, einmal.wert, i);
  }
  const s1 = repariereStrasse("Hauptstraße 12a", "");
  const s2 = repariereStrasse(s1.strasse, s1.hausnummer);
  assert.deepEqual([s2.strasse, s2.hausnummer], [s1.strasse, s1.hausnummer]);
  assert.equal(s2.status, "gueltig");

  const alt = { ...GUT, handynummer: "+49 0176 12345678", iban: "de89 3704 0044 0532 0130 00", bic: "COBADEF", strasse: "Hauptstraße 12a", hausnummer: "" };
  const r1 = repariereMitgliederdaten(alt);
  const repariert = { ...alt, ...r1.sicher };
  const r2 = repariereMitgliederdaten(repariert);
  assert.deepEqual(r2.sicher, {});
  assert.deepEqual({ ...repariert, ...r2.sicher }, repariert);
});

test("Reparatur Datensatz: sicher/Vorschlag getrennt, danach gültig", () => {
  const alt = { ...GUT, handynummer: "176 12345678", iban: "de89 3704 0044 0532 0130 00", bic: "COBADEFF", strasse: "Hauptstraße 12a", hausnummer: "" };
  const r = repariereMitgliederdaten(alt, MITGLIED);
  assert.deepEqual(r.sicher, { handynummer: "+4917612345678", iban: IBAN_DE, strasse: "Hauptstraße", hausnummer: "12a" });
  assert.deepEqual(r.vorschlaege, {});
  assert.deepEqual(r.status, { handynummer: "sicher", iban: "sicher", bic: "gueltig", strasse: "sicher" });
  // Nach sicherer Reparatur + bestätigtem Vorschlag ist der Datensatz gültig und im Zielformat.
  const fertig = { ...alt, ...r.sicher, ...r.vorschlaege };
  const pruefung = pruefeFormular(fertig, MITGLIED);
  assert.equal(pruefung.gueltig, true);
  assert.equal(pruefung.werte.handynummer, fertig.handynummer);
  assert.equal(pruefung.werte.iban, fertig.iban);
});

// ---------------------------------------------------------------------------------------------------
// Länderliste
// ---------------------------------------------------------------------------------------------------

test("Länderliste: eindeutiger ISO-Code, Deutschland zuerst, +1 CA/US eindeutig", () => {
  const codes = countryCodes.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(countryCodes[0].code, "DE");
  assert.equal(DEFAULT_COUNTRY, "DE");
  for (const c of countryCodes) {
    assert.match(c.code, /^[A-Z]{2}$/);
    assert.match(c.dialCode, /^\+\d{1,4}$/);
    assert.ok(c.name);
  }
  assert.equal(findCountry("CA").name, "Kanada");
  assert.equal(findCountry("us").name, "Vereinigte Staaten");
  assert.equal(dialCodeFor("CA"), "+1");
  assert.equal(dialCodeFor("US"), "+1");
  assert.equal(countryFromSelectValue("US"), "US");
  assert.equal(countryFromSelectValue("CA"), "CA");
  assert.equal(countryFromSelectValue("+49"), "DE"); // alter Formularwert
  assert.equal(countryFromSelectValue("XX"), null);
  assert.equal(countryFromSelectValue(""), null);
  assert.equal(isCountryCode("DE"), true);
  assert.equal(isCountryCode("de"), false);
});

test("Länderliste: alle SEPA-Länder mit eigenem Eintrag (Land-Feld der Anschrift)", () => {
  for (const land of Object.keys(SEPA_IBAN_LENGTHS)) {
    assert.ok(findCountry(land), land);
  }
});

// ---------------------------------------------------------------------------------------------------
// Alumni-Erkennung
// ---------------------------------------------------------------------------------------------------

test("Alumni: Rolle alumni (Freigabe) oder Status alumni (Altdaten)", () => {
  assert.equal(isAlumniProfile({ Rolle: "alumni", Status: "active" }), true);
  assert.equal(isAlumniProfile({ Rolle: "member", Status: "Alumni" }), true);
  assert.equal(isAlumniProfile({ Rolle: "board", Status: "active" }), false);
  assert.equal(isAlumniProfile(null), false);
});

// ---------------------------------------------------------------------------------------------------
// Client-Teil
// ---------------------------------------------------------------------------------------------------

test("Client: Handy-Eingabe formatieren, Vorwahl übertragen", () => {
  assert.deepEqual(formatiereHandyEingabe("017612345678", "DE"), { land: "DE", nummer: "176 12345678" });
  assert.deepEqual(formatiereHandyEingabe("+49 176 12345678", "DE"), { land: "DE", nummer: "176 12345678" });
  assert.deepEqual(formatiereHandyEingabe("+49 (0)176 12345678", "DE"), { land: "DE", nummer: "176 12345678" });
  assert.deepEqual(formatiereHandyEingabe("0043 664 1234567", "DE"), { land: "AT", nummer: "664 1234567" });
  assert.deepEqual(formatiereHandyEingabe("0664 1234567", "AT"), { land: "AT", nummer: "664 1234567" });
  assert.deepEqual(formatiereHandyEingabe("", "DE"), { land: "DE", nummer: "" });
  assert.deepEqual(formatiereHandyEingabe("max@", "DE"), { land: "DE", nummer: "max@" });
  // Italien: die 0 gehört zur Nummer.
  assert.equal(formatiereHandyEingabe("06 1234 5678", "IT").nummer.startsWith("06"), true);
});

test("Client: Platzhalter je Land", () => {
  assert.match(handyPlatzhalter("DE"), /^1\d/);
  assert.match(handyPlatzhalter("AT"), /^6/);
  assert.ok(handyPlatzhalter("US"));
  assert.equal(handyPlatzhalter("XX"), handyPlatzhalter("DE"));
});

test("Client: IBAN in Viererblöcken, gleiche Normalisierung wie normalizeIban", () => {
  assert.equal(ibanInViererbloecken("de89370400440532013000"), "DE89 3704 0044 0532 0130 00");
  assert.equal(ibanInViererbloecken("DE89 3704-0044"), "DE89 3704 0044");
  assert.equal(ibanInViererbloecken(""), "");
  for (const roh of ["de89 3704 0044 0532 0130 00", " DE89-3704.0044 ", "at61 1904 3002 3457 3201"]) {
    assert.equal(ibanInViererbloecken(roh).replace(/ /g, ""), normalizeIban(roh));
  }
});

test("Client: E-Mail-Tippfehler-Hinweis", () => {
  const tabelle = [
    ["max@gmial.com", "Meintest du gmail.com?"],
    ["max@gamil.com", "Meintest du gmail.com?"],
    ["max@gmail.con", "Meintest du gmail.com?"],
    ["max@gmx.dr", "Meintest du gmx.de?"],
    ["max@wbe.de", "Meintest du web.de?"],
    ["max@outlok.com", "Meintest du outlook.com?"],
    ["max@t-onlin.de", "Meintest du t-online.de?"],
    ["max@iclod.com", "Meintest du icloud.com?"],
    ["max@st.oth-regensbrug.de", "Meintest du st.oth-regensburg.de?"],
    ["max@stud.uni-regenburg.de", "Meintest du stud.uni-regensburg.de?"],
    ["max@gmail.com", null],
    ["max@gmx.at", null],
    ["max@mail.com", null],
    ["max@firma-beispiel.de", null],
    ["kein-at", null],
  ];
  for (const [mail, hinweis] of tabelle) assert.equal(emailTippfehler(mail), hinweis, mail);
});

test("Bundle-Grenze: Client lädt nur libphonenumber-js/min, nie max oder Server-Bausteine", () => {
  const quelle = readFileSync(new URL("../lib/member-rules-client.ts", import.meta.url), "utf8");
  const importe = modulPfade(quelle);
  assert.ok(importe.length > 0);
  for (const pfad of importe) {
    assert.ok(
      ["libphonenumber-js/min", "libphonenumber-js/mobile/examples"].includes(pfad),
      `unerlaubter Import im Client-Teil: ${pfad}`
    );
  }

  const server = readFileSync(new URL("../lib/member-rules.ts", import.meta.url), "utf8");
  assert.match(server, /^import "server-only";$/m);
  assert.match(server, /from "libphonenumber-js\/max"/);
});

/** Alle Modulpfade einer Quelldatei: statisch, nur für Seiteneffekt, Re-Export, import(), require(). */
function modulPfade(quelle) {
  const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const muster = [
    /^\s*import\s+(?:[^;'"]*?\sfrom\s+)?["']([^"']+)["']/gm,
    /^\s*export\s[^;'"]*?\sfrom\s+["']([^"']+)["']/gm,
    /\bimport\s*\(\s*(?:["'`]([^"'`]*)["'`])?/g,
    /\brequire\s*\(\s*(?:["'`]([^"'`]*)["'`])?/g,
  ];
  return muster.flatMap((re) => [...ohneKommentare.matchAll(re)].map((m) => m[1] ?? "<dynamisch>"));
}

// ---------------------------------------------------------------------------------------------------
// Fixrunde 1: Befunde aus den Reviews (review-pr1-fachlogik.md F1–F11, review-pr1-robustheit.md R1–R9)
// ---------------------------------------------------------------------------------------------------

test("R9: Grenz-Test erkennt Seiteneffekt-Import, import() und require()", () => {
  assert.deepEqual(modulPfade('import "libphonenumber-js/max";'), ["libphonenumber-js/max"]);
  assert.deepEqual(modulPfade("const m = await import('libphonenumber-js/max');"), ["libphonenumber-js/max"]);
  assert.deepEqual(modulPfade('const m = require("libphonenumber-js/max");'), ["libphonenumber-js/max"]);
  assert.deepEqual(modulPfade("const m = await import(pfad);"), ["<dynamisch>"]);
  assert.deepEqual(modulPfade('export { x } from "../lib/member-rules";'), ["../lib/member-rules"]);
  assert.deepEqual(modulPfade('import {\n  a,\n  type B,\n} from "libphonenumber-js/min";'), ["libphonenumber-js/min"]);
  assert.deepEqual(modulPfade('// import "x";\n/* require("y") */'), []);
});

test("F1/R1: Straßen-Reparatur trennt Wohnungs-/Zimmernummern, Postfach und Zusätze nie „sicher“ ab", () => {
  for (const s of [
    "Albertus-Magnus-Str. 6 App. 312",
    "Hauptstraße 5, Whg. 12",
    "Galgenbergstr. 24, Zimmer 112",
    "Universitätsstr. 31 Zi. 204",
    "Postfach 1234",
    "Hauptstraße 12 Zimmer 4",
    "Haus 5, Wohnung 3",
    "Bahnhofstr. 12, App. 7",
    "Wohnheim Galgenberg Zi. 214",
    "=Hauptstraße 12",
    "Hauptstraße 123456789012345678901234",
    "c/o Müller, Hauptstr. 5",
    "Straße des 17. Juni 5",
    "Hauptstraße 5 Top 3",
  ]) {
    const r = repariereStrasse(s, "");
    assert.equal(r.status, "offen", s);
    assert.equal(r.strasse, s, s);
    assert.equal(r.hausnummer, "", s);
  }
  // „12 1/2“ ist eine Hausnummer (F2) und wird als Ganzes abgetrennt.
  assert.deepEqual(repariereStrasse("Hauptstraße 12 1/2", ""), { status: "sicher", strasse: "Hauptstraße", hausnummer: "12 1/2" });
  assert.deepEqual(repariereStrasse("Dr.-Johann-Maier-Str. 12\u201314", ""), {
    status: "sicher",
    strasse: "Dr.-Johann-Maier-Str.",
    hausnummer: "12-14",
  });
  // Lange Eingaben: schnell und offen.
  assert.equal(repariereStrasse(" 1".repeat(50000) + "!", "").status, "offen");
});

test("F2: weitere echte Hausnummern gültig, Halbgeviertstrich normalisiert", () => {
  for (const nr of ["12 1/2", "4 1/2", "12½", "12a-c", "12a/b", "12-14", "12a-12c"]) {
    assert.ok(ok(pruefeHausnummer(nr, "DE", MITGLIED)), nr);
  }
  assert.equal(pruefeHausnummer("12\u201314", "DE", MITGLIED).wert, "12-14");
  assert.ok(ok(pruefeHausnummer("12\u201314", "DE", MITGLIED)));
  assert.equal(pruefeHausnummer("12\u201414", "DE", MITGLIED).wert, "12-14");
  for (const nr of ["a", "Hinterhaus", "½", "12 Hinterhaus"]) assert.equal(pruefeHausnummer(nr, "DE", MITGLIED).code, "format", nr);
  // Straße mit Bruch-Hausnummer am Ende wird erkannt.
  assert.equal(pruefeStrasse("Hauptstraße 12½", "", MITGLIED).code, "hausnummer_in_strasse");
});

test("F3/R2: Handy-Reparatur „sicher“ mit deutschem Beleg oder 15/16/17 ohne 0; 00-Nummern und Ausland nur Vorschlag", () => {
  const tabelle = [
    ["+49 15112345678", "sicher"], // seit 19.11.2026 (Mobilvorwahl 15/16/17)
    ["+49 17612345678", "sicher"],
    ["+49 1761234567", "sicher"],
    ["+49 0176 12345678", "sicher"],
    ["+49 (0)176 12345678", "sicher"],
    ["0049 176 12345678", "sicher"],
    ["0049 0176 12345678", "sicher"],
    ["0176 12345678", "sicher"],
    ["0015123456789", "vorschlag"], // 00 statt 0 → USA
    ["0016023456789", "vorschlag"],
    ["0017123456789", "vorschlag"],
    ["+43 664 1234567", "vorschlag"],
  ];
  for (const [eingabe, status] of tabelle) assert.equal(repariereHandy(eingabe, "DE").status, status, eingabe);
  assert.equal(repariereHandy("0015123456789").wert, "+15123456789");
  // Ausland mit führender 0 bei Standardland AT: kein deutscher Beleg → nur Vorschlag.
  assert.equal(repariereHandy("0664 1234567", "AT").status, "vorschlag");
  // Keine 00-Nummer wird je „sicher“ zu einem anderen Land als DE.
  for (const vorwahl of ["151", "152", "157", "159", "160", "162", "170", "171", "172", "176", "179"]) {
    for (const rest of ["2345678", "23456789"]) {
      const r = repariereHandy(`00${vorwahl}${rest}`, "DE");
      if (r.status === "sicher") assert.ok(r.wert.startsWith("+49"), `00${vorwahl}${rest}`);
    }
  }
});

test("F4: Hinweis vorwahl_ergaenzt tritt bei deutschen Nummern nicht mehr auf (Code bleibt, Abwärtskompatibilität)", () => {
  assert.deepEqual(HINWEIS_CODES, ["vorwahl_ergaenzt", "bic_land"]);
  // Seit 19.11.2026 werden 15/16/17 ohne 0 sicher korrigiert → kein Hinweis mehr (Hinweis ⇔ Vorschlag).
  for (const handy of ["17612345678", "176 12345678", "+49 15112345678"]) {
    const r = pruefeBestand({ ...GUT, handynummer: handy }, MITGLIED);
    assert.equal(r.gueltig, true, handy);
    assert.deepEqual(r.hinweise, [], handy);
    assert.match(r.werte.handynummer, /^\+49/, handy);
  }
  for (const handy of ["+4917612345678", "0176 12345678", "+49 0176 12345678", "0049 176 12345678", "+43 664 1234567"]) {
    assert.deepEqual(pruefeBestand({ ...GUT, handynummer: handy }, MITGLIED).hinweise, [], handy);
  }
  // Bestätigt (gespeichert als E.164) → kein Hinweis mehr.
  const bestaetigt = pruefeBestand({ ...GUT, handynummer: "17612345678" }, MITGLIED).werte.handynummer;
  assert.deepEqual(pruefeBestand({ ...GUT, handynummer: bestaetigt }, MITGLIED).hinweise, []);
  // Hinweis ⇔ Reparatur-Vorschlag (deutsche Nummern).
  for (const handy of ["17612345678", "+49 15112345678", "0176 12345678", "+4917612345678"]) {
    const hinweis = pruefeBestand({ ...GUT, handynummer: handy }, MITGLIED).hinweise.length > 0;
    assert.equal(hinweis, repariereHandy(handy).status === "vorschlag", handy);
  }
});

test("F5: Alumni – IBAN/BIC im Bestand nie ein Mangel, im Formular geprüft", () => {
  const alt = { ...GUT, iban: "DE89370400440532013001", bic: "COBADEF" };
  assert.deepEqual(pruefeMitgliederdaten(alt, ALUMNI), []);
  assert.equal(pruefeBestand(alt, ALUMNI).gueltig, true);
  assert.deepEqual(pruefeMitgliederdaten(alt, MITGLIED), [
    { feld: "iban", code: "pruefziffer" },
    { feld: "bic", code: "format" },
  ]);
  // Formular: eingegebene IBAN eines Alumnus wird geprüft.
  assert.deepEqual(pruefeFormular(alt, ALUMNI).maengel, [
    { feld: "iban", code: "pruefziffer" },
    { feld: "bic", code: "format" },
  ]);
  // Andere Mängel bleiben auch bei Alumni.
  const ohneOrt = pruefeBestand({ ...alt, ort: "" }, ALUMNI);
  assert.deepEqual(ohneOrt.maengel, [{ feld: "ort", code: "fehlt" }]);
  assert.equal(ohneOrt.ersterFehler, "Bitte trag den Ort ein.");
  // Reparatur: ungültige Alumni-IBAN wird nicht als „offen“ gemeldet.
  assert.equal(repariereMitgliederdaten(alt, ALUMNI).status.iban, undefined);
  assert.equal(repariereMitgliederdaten(alt, MITGLIED).status.iban, "offen");
});

test("F6/R3: BIC wird nur gegen eine gültige IBAN abgeglichen und nicht wegen kaputter IBAN geleert", () => {
  for (const iban of ["siehe Vorstand", "ED89370400440532013000", "DE89370400440532013001", ""]) {
    const r = pruefeBic("COBADEFFXXX", iban, MITGLIED);
    assert.ok(ok(r), iban);
    assert.equal(r.hinweis, undefined, iban);
    assert.deepEqual(repariereBic("COBADEFFXXX", iban), { status: "gueltig", wert: "COBADEFFXXX", code: null }, iban);
  }
});

test("F7: BIC-Land ≠ IBAN-Land ist nur Hinweis, wird nicht gelöscht; falsches Format wird geleert", () => {
  const IBAN_FR = "FR1420041010050500013M02606";
  const n26 = pruefeBic("NTSBDEB1XXX", IBAN_FR, MITGLIED);
  assert.equal(n26.code, null);
  assert.equal(n26.fehler, null);
  assert.equal(n26.hinweis, "bic_land");
  assert.equal(pruefeBic("REVOLT21", IBAN_DE, MITGLIED).hinweis, "bic_land");
  assert.deepEqual(repariereBic("NTSBDEB1XXX", IBAN_FR), { status: "gueltig", wert: "NTSBDEB1XXX", code: null });
  const r = pruefeFormular({ ...GUT, iban: IBAN_FR, bic: "NTSBDEB1XXX" }, MITGLIED);
  assert.equal(r.gueltig, true);
  assert.deepEqual(r.hinweise, [{ feld: "bic", code: "bic_land" }]);
  assert.deepEqual(repariereBic("COBADEF", IBAN_DE), { status: "sicher", wert: "", code: "format" });
});

test("F8: Vorstand ändert Land/IBAN – abhängige PLZ/BIC werden bewusst nicht neu geprüft", () => {
  assert.equal(pruefeVorstandskorrektur({ land: "AT" }, GUT, HEUTE).gueltig, true);
  assert.equal(pruefeVorstandskorrektur({ iban: IBAN_AT }, GUT, HEUTE).gueltig, true);
});

test("F9: PLZ Pflicht nur bei Ländern mit Muster, Länderpräfix wird entfernt", () => {
  for (const land of ["HK", "AE", "US"]) {
    assert.ok(ok(pruefePlz("", land, MITGLIED)), land);
    assert.equal(istPflicht("plz", MITGLIED, land), false, land);
  }
  assert.equal(pruefePlz("", "AT", MITGLIED).code, "fehlt");
  assert.equal(pruefePlz("", "DE", MITGLIED).code, "fehlt");
  const tabelle = [
    ["A-1010", "AT", "1010"],
    ["AT-1010", "AT", "1010"],
    ["CH-8001", "CH", "8001"],
    ["D-93047", "DE", "93047"],
    ["D - 93047", "DE", "93047"],
    ["DE-93047", "DE", "93047"],
    ["DK-1234", "DK", "1234"],
    ["L-1234", "LU", "1234"],
    ["LV-1050", "LV", "1050"],
    ["FL-9490", "LI", "9490"],
  ];
  for (const [plz, land, wert] of tabelle) {
    const r = pruefePlz(plz, land, MITGLIED);
    assert.ok(ok(r), `${land} ${plz}`);
    assert.equal(r.wert, wert, `${land} ${plz}`);
  }
  // Präfix eines ANDEREN Landes wird nicht entfernt.
  assert.equal(pruefePlz("A-1010", "DE", MITGLIED).code, "format");
  const hk = { ...GUT, land: "HK", plz: "", ort: "Hongkong", hausnummer: "" };
  assert.deepEqual(pruefeMitgliederdaten(hk, MITGLIED), []);
});

test("F10: Gebiete in der Länderliste; jedes Land aus der Handyprüfung steht in der Liste", async () => {
  for (const [code, vorwahl] of [["GG", "+44"], ["JE", "+44"], ["IM", "+44"], ["GI", "+350"], ["AX", "+358"]]) {
    assert.equal(dialCodeFor(code), vorwahl, code);
  }
  assert.equal(pruefeHandy("+44 7911 123456", "DE", MITGLIED).land, "GG");
  const { default: beispiele } = await import("libphonenumber-js/mobile/examples");
  const { getExampleNumber } = await import("libphonenumber-js/max");
  let geprueft = 0;
  for (const { code } of countryCodes) {
    const nummer = getExampleNumber(code, beispiele);
    if (!nummer) continue;
    const r = pruefeHandy(nummer.number, code, MITGLIED);
    if (r.code) continue;
    geprueft++;
    assert.ok(findCountry(r.land), `${code}: Land ${r.land} fehlt in der Liste`);
  }
  assert.ok(geprueft > 150, `nur ${geprueft} Länder geprüft`);
});

test("F11: BBAN-Aufbau DE (18 Ziffern) und AT (16 Ziffern)", () => {
  // Buchstabe in der DE-BBAN mit passender Prüfziffer.
  assert.equal(checkSepaIban("DE0537040044053201300A"), "format");
  assert.equal(pruefeIban("DE0537040044053201300A", MITGLIED).code, "format");
  assert.equal(checkSepaIban("AT611904300234573201"), "ok");
  assert.equal(checkSepaIban(IBAN_DE), "ok");
  // Andere Länder: Buchstaben in der BBAN erlaubt (z. B. GB, FR).
  assert.equal(checkSepaIban(IBAN_GB), "ok");
  assert.equal(checkSepaIban("FR1420041010050500013M02606"), "ok");
});

test("R4: Nicht-Strings sind immer `format`, nie „leer“", () => {
  const datei = typeof File !== "undefined" ? new File(["x"], "a.txt") : { toString: () => "[object File]" };
  for (const wert of [datei, 12345, true, {}, ["Hauptstraße"]]) {
    for (const kontext of [MITGLIED, ALUMNI, VORSTAND]) {
      assert.equal(pruefeStrasse(wert, "12", kontext).code, "format");
      assert.equal(pruefeOrt(wert, "DE", kontext).code, "format");
      assert.equal(pruefeHausnummer(wert, "AT", kontext).code, "format");
      assert.equal(pruefePlz(wert, "US", kontext).code, "format");
      assert.equal(pruefeHandy(wert, "DE", kontext).code, "format");
      assert.equal(pruefeIban(wert, kontext).code, "format");
      assert.equal(pruefeBic(wert, IBAN_DE, kontext).code, "format");
      assert.equal(pruefeGeburtsdatum(wert, kontext).code, "format");
      assert.equal(pruefeEmail(wert, kontext).code, "format");
      assert.equal(pruefeLand(wert).code, "format");
    }
    assert.equal(pruefeName(wert, "vorname").code, "format");
    assert.equal(repariereHandy(wert).status, "offen");
    assert.equal(repariereIban(wert).status, "offen");
    assert.equal(repariereStrasse(wert, "").status, "offen");
  }
  // null/undefined bleiben „leer“.
  assert.ok(ok(pruefeIban(null, ALUMNI)));
  assert.ok(ok(pruefeBic(undefined, IBAN_DE, MITGLIED)));
  assert.equal(pruefeStrasse(undefined, "", MITGLIED).code, "fehlt");
  // Gesamtprüfung: Datei im Feld → Mangel format (bei Alumni ist die IBAN kein Bestandsmangel).
  assert.deepEqual(pruefeMitgliederdaten({ ...GUT, ort: datei, iban: 42 }, ALUMNI), [{ feld: "ort", code: "format" }]);
  assert.deepEqual(pruefeMitgliederdaten({ ...GUT, ort: datei, iban: 42 }, MITGLIED), [
    { feld: "ort", code: "format" },
    { feld: "iban", code: "format" },
  ]);
});

test("R5: unsichtbare Zeichen → `zeichen`; NFC, außen getrimmt", () => {
  const unsichtbar = ["\u200C", "\u200D", "\u202A", "\u202E", "\u2066", "\u2069"];
  for (const z of unsichtbar) {
    const name = z.codePointAt(0).toString(16);
    assert.equal(pruefeStrasse(`Haupt${z}straße`, "1", MITGLIED).code, "zeichen", name);
    assert.equal(pruefeOrt(`Regens${z}burg`, "DE", MITGLIED).code, "zeichen", name);
    assert.equal(pruefeHausnummer(`12${z}a`, "AT", MITGLIED).code, "zeichen", name);
    assert.equal(pruefeName(`Max${z}i`, "vorname").code, "zeichen", name);
    assert.equal(pruefeEmail(`max${z}@gmail.com`, MITGLIED).code, "zeichen", name);
    assert.equal(pruefePlz(`930${z}47`, "US", MITGLIED).code, "zeichen", name);
  }
  assert.equal(pruefeStrasse("\u202EeßartstpuaH", "1", MITGLIED).code, "zeichen");
  assert.equal(pruefeHausnummer("\u200B", "AT", MITGLIED).code, null); // H1: still entfernt, im Ausland optional
  assert.equal(pruefeStrasse("Hauptstraße 12\u200B", "", MITGLIED).code, "hausnummer_in_strasse"); // H1
  // NFC: „u + Trema“ wird zu „ü“.
  assert.equal(pruefeOrt("Mu\u0308nchen", "DE", MITGLIED).wert, "München");
  // Außen: Leerraum (inkl. NBSP, BOM) weg.
  assert.equal(pruefeOrt("\uFEFF\u00A0Regensburg \n", "DE", MITGLIED).wert, "Regensburg");
  assert.equal(pruefeEmail(" max@gmail.com ", MITGLIED).wert, "max@gmail.com");
});

test("R6: Vorstandskorrektur übernimmt nur bekannte, eigene Feldnamen", () => {
  const aend = JSON.parse('{"__proto__": {"land": "AT"}, "plz": "1234"}');
  const r = pruefeVorstandskorrektur(aend, { plz: "93047" }, HEUTE);
  assert.deepEqual(r.maengel, [{ feld: "plz", code: "format" }]);
  assert.deepEqual(Object.keys(r.werte), ["plz"]);
  const fremd = pruefeVorstandskorrektur({ constructor: "x", toString: "y", unbekannt: "z", ort: "Wien" }, GUT, HEUTE);
  assert.deepEqual(Object.keys(fremd.werte), ["ort"]);
  // Geerbte Eigenschaften zählen nicht.
  const geerbt = Object.create({ plz: "1" });
  assert.deepEqual(pruefeVorstandskorrektur(geerbt, GUT, HEUTE).werte, {});
  // Ohne Prototyp funktioniert es auch.
  const ohne = Object.assign(Object.create(null), { ort: "Wien" });
  assert.equal(pruefeVorstandskorrektur(ohne, GUT, HEUTE).gueltig, true);
  // Bestand mit __proto__ ebenfalls ignoriert.
  const bestand = JSON.parse('{"__proto__": {"land": "AT"}, "hausnummer": "12"}');
  assert.deepEqual(pruefeVorstandskorrektur({ plz: "1234" }, bestand, HEUTE).maengel, [{ feld: "plz", code: "format" }]);
  // Gesamtprüfung ebenso: __proto__.land wirkt nicht.
  const mitProto = JSON.parse(`{"__proto__":{"land":"AT"},${JSON.stringify({ ...GUT, land: undefined, plz: "1234" }).slice(1)}`);
  assert.deepEqual(pruefeMitgliederdaten(mitProto, MITGLIED), [{ feld: "plz", code: "format" }]);
});

test("R7: Vorstand darf E-Mail und Namen nicht leeren", () => {
  assert.equal(pruefeEmail("", VORSTAND).code, "fehlt");
  assert.deepEqual(pruefeVorstandskorrektur({ email: "" }, GUT, HEUTE).maengel, [{ feld: "email", code: "fehlt" }]);
  assert.deepEqual(pruefeVorstandskorrektur({ vorname: " " }, GUT, HEUTE).maengel, [{ feld: "vorname", code: "fehlt" }]);
  assert.equal(istPflicht("email", VORSTAND), true);
});

test("R8: Tippfehler-Hinweis wertet überlange Eingaben nicht aus", () => {
  const start = Date.now();
  assert.equal(emailTippfehler(`max@${"g".repeat(20000)}mial.com`), null);
  assert.ok(Date.now() - start < 50);
  assert.equal(emailTippfehler(`${"a".repeat(250)}@gmial.com`), null); // 260 Zeichen > 254
  assert.equal(emailTippfehler(`${"a".repeat(200)}@gmial.com`), "Meintest du gmail.com?");
});

test("Altlast: Vatikanstadt hat die Vorwahl +39", () => {
  assert.equal(dialCodeFor("VA"), "+39");
  assert.equal(findCountry("VA").name, "Vatikanstadt");
});

// ---------------------------------------------------------------------------------------------------
// Fixrunde 2: Gegenprüfung 37f2a44 (N1–N4, G1–G4)
// ---------------------------------------------------------------------------------------------------

test("G1/N1, H2/M2: Land mit Regex-Zeichen wirft nicht, nur `land` ist land_unbekannt, kein ReDoS", () => {
  for (const land of ["(", "[", ".*", ".", "(A+)+B", "\\", "D|A", "__proto__", "constructor", "XX"]) {
    // H2/M2: PLZ wird bei unbekanntem Land nicht bewertet (kein Mangel, auch nicht `fehlt`).
    for (const kontext of [MITGLIED, REGISTRIERUNG, VORSTAND]) {
      const plz = pruefePlz("12345", land, kontext);
      assert.equal(plz.code, null, land);
      assert.equal(plz.wert, "12345", land);
      assert.equal(pruefePlz("", land, kontext).code, null, land);
    }
    assert.equal(pruefePlz("XYZ-93047", land, MITGLIED).wert, "XYZ-93047", land);
    assert.deepEqual(pruefeMitgliederdaten({ ...GUT, land, plz: "" }, MITGLIED), [{ feld: "land", code: "land_unbekannt" }], land);
    assert.doesNotThrow(() => pruefeFormular({ ...GUT, land, plz: "1" }, MITGLIED), land);
    assert.doesNotThrow(() => pruefeVorstandskorrektur({ plz: "1234" }, { land }, HEUTE), land);
    assert.doesNotThrow(() => pruefeHandy("0176 12345678", land, MITGLIED), land);
  }
  const r = pruefeFormular({ ...GUT, land: "(", plz: "1" }, MITGLIED);
  assert.deepEqual(r.maengel, [{ feld: "land", code: "land_unbekannt" }]);
  assert.deepEqual(pruefeVorstandskorrektur({ land: "XX", plz: "1" }, GUT, HEUTE).maengel, [
    { feld: "land", code: "land_unbekannt" },
  ]);
  // ReDoS-Muster: schnell.
  const start = Date.now();
  for (let n = 20; n <= 28; n++) pruefePlz("A".repeat(n), "(A+)+B", MITGLIED);
  pruefePlz("A".repeat(24), "(A+)+B", VORSTAND);
  assert.ok(Date.now() - start < 50, `${Date.now() - start} ms`);
  // Bekanntes Land: Länge wird weiter geprüft.
  assert.equal(pruefePlz("A".repeat(24), "DE", MITGLIED).code, "zu_lang");
  // Bekannte Länder: Präfix weiter entfernt, nur das eigene.
  assert.equal(pruefePlz("D-93047", "DE", MITGLIED).wert, "93047");
  assert.equal(pruefePlz("CH-8001", "CH", MITGLIED).wert, "8001");
  assert.equal(pruefePlz("CH-8001", "DE", MITGLIED).code, "format");
  // Handy: unbekanntes Land → DE als Standard.
  assert.equal(pruefeHandy("0176 12345678", "(", MITGLIED).wert, "+4917612345678");
});

test("G2/N2: vorwahl_ergaenzt nie im Formular (Land gewählt), nur im Bestand", () => {
  for (const kontext of [MITGLIED, REGISTRIERUNG, VORSTAND]) {
    for (const handy of ["176 12345678", "+49 176 12345678", "+49 15112345678", "17612345678"]) {
      assert.equal(pruefeHandy(handy, "DE", kontext).hinweis, undefined, handy);
      const r = pruefeFormular({ ...GUT, handynummer: handy, handyLand: "DE" }, kontext);
      assert.deepEqual(r.hinweise, [], handy);
      assert.deepEqual(pruefeFormular({ ...GUT, handynummer: handy }, kontext).hinweise, [], handy);
    }
    assert.deepEqual(pruefeVorstandskorrektur({ handynummer: "176 12345678", handyLand: "DE" }, GUT, HEUTE).hinweise, []);
  }
  // Ausgabe der Client-Hilfe → Formular → keine Hinweise.
  const client = formatiereHandyEingabe("0176 12345678", "DE");
  assert.deepEqual(pruefeFormular({ ...GUT, handynummer: client.nummer, handyLand: client.land }, MITGLIED).hinweise, []);
  // Bestand mit ausdrücklich gewähltem Land: auch kein Hinweis.
  assert.deepEqual(pruefeBestand({ ...GUT, handynummer: "176 12345678", handyLand: "DE" }, MITGLIED).hinweise, []);
  // Seit 19.11.2026 auch ohne gewähltes Land kein Hinweis: 15/16/17 wird sicher korrigiert.
  assert.deepEqual(pruefeBestand({ ...GUT, handynummer: "176 12345678" }, MITGLIED).hinweise, []);
});

test("G3: alle Format-Zeichen (Cf) werden abgelehnt; Quelltext ohne unsichtbare Zeichen", () => {
  // Ohne die harmlosen, still entfernten Zeichen (H1, eigener Test).
  const cf = [0x061c, 0x180e, 0x200c, 0x200d, 0x202a, 0x202e, 0x2061, 0x2064, 0x2066, 0x2069, 0x206a, 0x206f, 0xe0001];
  for (const cp of cf) {
    const z = String.fromCodePoint(cp);
    const name = cp.toString(16);
    assert.equal(pruefeStrasse(`Haupt${z}straße`, "1", MITGLIED).code, "zeichen", name);
    assert.equal(pruefeOrt(`Regens${z}burg`, "DE", MITGLIED).code, "zeichen", name);
    assert.equal(pruefeName(`Ma${z}x`, "vorname").code, "zeichen", name);
    assert.equal(pruefeEmail(`max${z}@gmail.com`, MITGLIED).code, "zeichen", name);
    assert.equal(pruefeHausnummer(`1${z}2`, "AT", MITGLIED).code, "zeichen", name);
  }
  // Umlaute, Akzente und Zeilentrenner bleiben normal.
  assert.ok(ok(pruefeName("Zoë", "vorname")));
  assert.equal(pruefeOrt(`Regens${String.fromCodePoint(0x2028)}burg`, "DE", MITGLIED).wert, "Regens burg");
  for (const datei of ["../lib/member-rules.ts", "../lib/member-rules-client.ts", "./member-rules.test.mjs"]) {
    const quelle = readFileSync(new URL(datei, import.meta.url), "utf8");
    assert.doesNotMatch(quelle, /[\p{Cf}\p{Zl}\p{Zp}]/u, datei);
  }
});

test("H1: harmlose Format-Zeichen still entfernt, Bidi weiter gemeldet", () => {
  const harmlos = [0x00ad, 0x200b, 0x200e, 0x200f, 0x2060, 0xfeff].map((c) => String.fromCodePoint(c));
  for (const z of harmlos) {
    const name = z.codePointAt(0).toString(16);
    assert.deepEqual(pruefeStrasse(`Haupt${z}straße`, "1", MITGLIED), { wert: "Hauptstraße", fehler: null, code: null }, name);
    assert.equal(pruefeOrt(`Regens${z}burg`, "DE", MITGLIED).wert, "Regensburg", name);
    assert.equal(pruefeName(`Ma${z}x`, "vorname").wert, "Max", name);
    assert.equal(pruefeEmail(`max${z}@gmail.com`, MITGLIED).wert, "max@gmail.com", name);
    assert.equal(pruefeHausnummer(`12${z}a`, "DE", MITGLIED).wert, "12a", name);
    assert.equal(pruefePlz(`930${z}47`, "DE", MITGLIED).wert, "93047", name);
    // R5-Fall: nach dem Entfernen greift die Hausnummer-Regel wieder.
    const r = pruefeStrasse(`Hauptstraße 12${z}`, "", MITGLIED);
    assert.equal(r.code, "hausnummer_in_strasse", name);
    assert.equal(r.fehler, "Hausnummer bitte ins eigene Feld.", name);
    // Nur aus harmlosen Zeichen = leer.
    assert.equal(pruefeOrt(z, "DE", MITGLIED).code, "fehlt", name);
  }
  // Gespeichert wird der bereinigte Wert (Gesamtprüfung).
  const weich = String.fromCodePoint(0x00ad);
  assert.equal(pruefeFormular({ ...GUT, ort: `Re${weich}gens${weich}burg` }, MITGLIED).werte.ort, "Regensburg");
  // Bidi-Embedding/Override/Isolates bleiben `zeichen`.
  for (const cp of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
    assert.equal(pruefeStrasse(`Haupt${String.fromCodePoint(cp)}straße`, "1", MITGLIED).code, "zeichen", cp.toString(16));
  }
});

test("M4: Bindestrich U+2010/U+2011 wird zu „-“ (Name, Straße, Ort)", () => {
  for (const cp of [0x2010, 0x2011]) {
    const s = String.fromCodePoint(cp);
    const name = pruefeName(`Müller${s}Lüdenscheidt`, "nachname");
    assert.ok(ok(name), cp.toString(16));
    assert.equal(name.wert, "Müller-Lüdenscheidt");
    assert.equal(pruefeStrasse(`Albertus${s}Magnus${s}Str.`, "6", MITGLIED).wert, "Albertus-Magnus-Str.");
    assert.equal(pruefeOrt(`Garmisch${s}Partenkirchen`, "DE", MITGLIED).wert, "Garmisch-Partenkirchen");
  }
});

test("G4: nur alumni === true macht zum Alumnus", () => {
  const ohneBank = { ...GUT, iban: "", bic: "" };
  for (const alumni of ["false", "true", 1, {}, null, undefined]) {
    const kontext = { alumni, wer: "mitglied", heute: HEUTE };
    assert.deepEqual(pruefeMitgliederdaten(ohneBank, kontext), [{ feld: "iban", code: "fehlt" }], String(alumni));
    assert.equal(istPflicht("iban", kontext), true, String(alumni));
  }
  assert.deepEqual(pruefeMitgliederdaten(ohneBank, ALUMNI), []);
  const alt = { ...GUT, iban: "DE89370400440532013001" };
  assert.deepEqual(pruefeMitgliederdaten(alt, { alumni: "true", wer: "mitglied", heute: HEUTE }), [
    { feld: "iban", code: "pruefziffer" },
  ]);
  assert.equal(repariereMitgliederdaten(alt, { alumni: "true", wer: "mitglied" }).status.iban, "offen");
});

test("N3: mehrdeutige Vorwahl → Hauptland wie libphonenumber", () => {
  const tabelle = [
    ["+44", "GB"],
    ["+1", "US"],
    ["+7", "RU"],
    ["+39", "IT"],
    ["+358", "FI"],
    ["+49", "DE"],
    ["+43", "AT"],
  ];
  for (const [vorwahl, land] of tabelle) assert.equal(countryFromSelectValue(vorwahl), land, vorwahl);
  const metadaten = createRequire(import.meta.url)("libphonenumber-js/metadata.min.json");
  const jeVorwahl = new Map();
  for (const { code, dialCode } of countryCodes) jeVorwahl.set(dialCode, [...(jeVorwahl.get(dialCode) ?? []), code]);
  let mehrdeutig = 0;
  for (const [dialCode, laender] of jeVorwahl) {
    if (laender.length < 2) continue;
    mehrdeutig++;
    const haupt = metadaten.country_calling_codes[dialCode.slice(1)][0];
    assert.equal(countryFromSelectValue(dialCode), haupt, dialCode);
  }
  assert.equal(mehrdeutig, 5);
});

test("N4: Haus, Gebäude, Block, Aufgang, Hinterhaus vor der Nummer → offen", () => {
  for (const s of ["Haus B 5", "Gebäude C 2", "Block 4", "Aufgang A 3", "Hinterhaus 2", "Hauptstraße Haus 5"]) {
    assert.equal(repariereStrasse(s, "").status, "offen", s);
  }
  // Wörter, die nur so anfangen, sind kein Zusatz.
  assert.deepEqual(repariereStrasse("Am Hausberg 5", ""), { status: "sicher", strasse: "Am Hausberg", hausnummer: "5" });
  assert.deepEqual(repariereStrasse("Blockstraße 7", ""), { status: "sicher", strasse: "Blockstraße", hausnummer: "7" });
});

// ---------------------------------------------------------------------------------------------------
// Kurzprüfung d35347b (K1–K3)
// ---------------------------------------------------------------------------------------------------

test("K1: PLZ-Länge, Steuerzeichen und Formelanfang auch bei unbekanntem Land", () => {
  for (const land of ["ZZ", "(", ""]) {
    for (const kontext of [MITGLIED, VORSTAND]) {
      assert.equal(pruefePlz("=1+1", land, kontext).code, "zeichen", land);
      assert.equal(pruefePlz("=HYPERLINK(1)", land, kontext).code, "zu_lang", land);
      assert.equal(pruefePlz("@1", land, kontext).code, "zeichen", land);
      assert.equal(pruefePlz("A".repeat(500), land, kontext).code, "zu_lang", land);
      assert.equal(pruefePlz(`1${String.fromCodePoint(0x202e)}2`, land, kontext).code, "zeichen", land);
    }
  }
  // Vorstand ändert nur die PLZ, gespeichertes Land ungültig: Formel wird nicht gespeichert.
  const r = pruefeVorstandskorrektur({ plz: "=1+1" }, { ...GUT, land: "ZZ" }, HEUTE);
  assert.equal(r.gueltig, false);
  assert.deepEqual(r.maengel, [{ feld: "plz", code: "zeichen" }]);
  // Harmlose PLZ bei unbekanntem Land bleibt unbewertet (H2).
  assert.deepEqual(pruefePlz("ABC 123", "ZZ", MITGLIED), { wert: "ABC 123", fehler: null, code: null });
});

test("K2: Reparatur meldet „sicher“ mit bereinigtem Wert, wenn sich der Rohwert ändert", () => {
  const weich = String.fromCodePoint(0x00ad);
  const zwsp = String.fromCodePoint(0x200b);
  assert.deepEqual(repariereStrasse(`Haupt${weich}straße`, "12"), { status: "sicher", strasse: "Hauptstraße", hausnummer: "12" });
  assert.deepEqual(repariereStrasse(`Mu${String.fromCodePoint(0x308)}hlweg`, "3"), { status: "sicher", strasse: "Mühlweg", hausnummer: "3" });
  assert.deepEqual(repariereStrasse(" Hauptstraße  ", " 12 "), { status: "sicher", strasse: "Hauptstraße", hausnummer: "12" });
  assert.deepEqual(repariereStrasse("Hauptstraße", `1${zwsp}2`), { status: "sicher", strasse: "Hauptstraße", hausnummer: "12" });
  assert.deepEqual(repariereStrasse("Hauptstraße", "12–14"), { status: "sicher", strasse: "Hauptstraße", hausnummer: "12-14" });
  // Schon bereinigt → gueltig; zweite Anwendung ist idempotent.
  assert.deepEqual(repariereStrasse("Hauptstraße", "12"), { status: "gueltig", strasse: "Hauptstraße", hausnummer: "12" });
  const einmal = repariereStrasse(`Haupt${weich}straße`, "12");
  assert.equal(repariereStrasse(einmal.strasse, einmal.hausnummer).status, "gueltig");
  // Datensatz: bereinigte Straße landet in `sicher`.
  assert.deepEqual(repariereMitgliederdaten({ ...GUT, strasse: `Haupt${weich}straße` }).sicher, {
    strasse: "Hauptstraße",
    hausnummer: GUT.hausnummer,
  });
  // Übrige Helfer vergleichen mit dem Rohwert.
  assert.equal(repariereIban(` ${IBAN_DE}`).status, "sicher");
  assert.equal(repariereBic("COBADEFF ", IBAN_DE).status, "sicher");
  assert.equal(repariereHandy(`+4917612345678${zwsp}`).status, "sicher");
});

test("K3: harmlose Format-Zeichen auch bei BIC, Handy und Geburtsdatum still entfernt", () => {
  for (const cp of [0x00ad, 0x200b, 0x200e, 0x200f, 0x2060, 0xfeff]) {
    const z = String.fromCodePoint(cp);
    const name = cp.toString(16);
    const bic = pruefeBic(`COBADEFF${z}XXX`, IBAN_DE, MITGLIED);
    assert.ok(ok(bic), name);
    assert.equal(bic.wert, "COBADEFFXXX", name);
    assert.deepEqual(repariereBic(`COBADEFF${z}XXX`, IBAN_DE), { status: "sicher", wert: "COBADEFFXXX", code: null }, name);
    const handy = pruefeHandy(`0176${z} 12345678`, "DE", MITGLIED);
    assert.ok(ok(handy), name);
    assert.equal(handy.wert, "+4917612345678", name);
    assert.equal(repariereHandy(`0176${z} 12345678`).status, "sicher", name);
    const geb = pruefeGeburtsdatum(`2001-05${z}-17`, MITGLIED);
    assert.ok(ok(geb), name);
    assert.equal(geb.wert, "2001-05-17", name);
    // Nur harmlose Zeichen = leer.
    assert.equal(pruefeHandy(z, "DE", MITGLIED).code, "fehlt", name);
    assert.equal(pruefeGeburtsdatum(z, MITGLIED).code, "fehlt", name);
    assert.ok(ok(pruefeBic(z, IBAN_DE, MITGLIED)), name);
  }
  // Bidi bleibt ein Fehler (BIC/Handy/Datum: Format).
  const rlo = String.fromCodePoint(0x202e);
  assert.equal(pruefeBic(`COBADEFF${rlo}XXX`, IBAN_DE, MITGLIED).code, "format");
  assert.equal(pruefeHandy(`0176${rlo}12345678`, "DE", MITGLIED).code, "format");
  assert.equal(pruefeGeburtsdatum(`2001-05-17${rlo}`, MITGLIED).code, "format");
});
