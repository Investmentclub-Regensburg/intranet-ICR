// Tests für lib/member-rules.ts, lib/member-rules-client.ts, lib/iban.ts und lib/country-codes.ts
// (Paket „Mitgliederdaten“, PR 1). Ausführen mit `npm test`. Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  pruefeVorstandskorrektur,
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
  assert.equal(pruefeBic("COBADEFF", IBAN_AT, MITGLIED).code, "bic_land");
  assert.equal(pruefeBic("COBADEFF", IBAN_AT, MITGLIED).fehler, "Die BIC passt nicht zum Land der IBAN.");
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
    { feld: "bic", code: "bic_land" },
  ]);
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
  assert.deepEqual(pruefeVorstandskorrektur({ bic: "COBADEFF" }, { ...GUT, iban: IBAN_AT }, HEUTE).maengel, [
    { feld: "bic", code: "bic_land" },
  ]);
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
    ["+49 176 12345678", "sicher", "+4917612345678"],
    ["+4917612345678", "gueltig", "+4917612345678"],
    ["+43 664 1234567", "sicher", "+436641234567"],
    ["17612345678", "vorschlag", "+4917612345678"],
    ["176 12345678", "vorschlag", "+4917612345678"],
    ["1511 2345678", "vorschlag", "+4915112345678"],
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

test("Reparatur Handy: chinesische/mehrdeutige Nummern ohne Vorwahl nie „sicher“", () => {
  for (const eingabe of ["13812345678", "15912345678", "17012345678", "15012345678", "159 1234 5678"]) {
    const r = repariereHandy(eingabe);
    assert.notEqual(r.status, "sicher", eingabe);
    assert.ok(["vorschlag", "offen"].includes(r.status), eingabe);
  }
  assert.equal(repariereHandy("13812345678").status, "offen");
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
  assert.deepEqual(repariereBic("COBADEFF", IBAN_AT), { status: "sicher", wert: "", code: "bic_land" });
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
  assert.deepEqual(r.sicher, { iban: IBAN_DE, strasse: "Hauptstraße", hausnummer: "12a" });
  assert.deepEqual(r.vorschlaege, { handynummer: "+4917612345678" });
  assert.deepEqual(r.status, { handynummer: "vorschlag", iban: "sicher", bic: "gueltig", strasse: "sicher" });
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
  for (const land of Object.keys(SEPA_IBAN_LENGTHS).filter((l) => l !== "GI")) {
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
  const importe = [...quelle.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.ok(importe.length > 0);
  for (const pfad of importe) {
    assert.ok(
      ["libphonenumber-js/min", "libphonenumber-js/mobile/examples"].includes(pfad),
      `unerlaubter Import im Client-Teil: ${pfad}`
    );
  }
  // Auch keine dynamischen Importe oder Re-Exporte, die die Grenze umgehen.
  assert.doesNotMatch(quelle, /\bimport\s*\(|\brequire\s*\(|^\s*export\s[^;]*\sfrom\s/m);

  const server = readFileSync(new URL("../lib/member-rules.ts", import.meta.url), "utf8");
  assert.match(server, /^import "server-only";$/m);
  assert.match(server, /from "libphonenumber-js\/max"/);
});
