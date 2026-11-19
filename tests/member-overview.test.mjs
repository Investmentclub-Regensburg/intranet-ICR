// Tests für die Vorstandsübersicht in admin/members (Paket „Mitgliederdaten“, PR 5): lib/member-overview.ts und
// passtDatenFilter. Der Browser bekommt nur Feldnamen (nur der Vorstand), nie Werte. Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FELD_NAMEN, adminMitgliederZeilen, maengelFelder } from "../lib/member-overview.ts";
import { datenLesbarkeit, passtDatenFilter } from "../components/admin/format.ts";

const JETZT = new Date("2026-11-18T12:00:00Z"); // letzter Stichtag 15.9.2026
const HEUTE = "2026-11-18";

const gueltig = (extra = {}) => ({
  iban: "DE89370400440532013000",
  bic: "COBADEFFXXX",
  geburtsdatum: "2001-04-12",
  strasse: "Musterstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  handynummer: "+491761234567",
  land: "DE",
  ...extra,
});

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

const profil = (id, extra = {}) => ({
  id,
  Vorname: `Vor${id}`,
  Nachname: `Nach${id}`,
  "Studiengang / Fach": "BWL",
  "E-Mail": `${id}@example.org`,
  Rolle: "member",
  Status: "active",
  daten_bestaetigt_am: "2026-10-01T10:00:00Z",
  ...extra,
});

// Fake-Bestand: Profile + entschlüsselte Werte (Werte mit auffälligen Zeichenketten für den Payload-Test).
const FAELLE = [
  { p: profil("vorstand", { Rolle: "board" }), w: gueltig() },
  {
    p: profil("kaputt", { daten_bestaetigt_am: null }),
    w: gueltig({ iban: "DE89370400440532013001", handynummer: "+499411234567", ort: "Probeort-Kaputt" }),
  },
  { p: profil("alumni", { Rolle: "alumni" }), w: gueltig({ iban: null, bic: null, strasse: null, hausnummer: null }) },
  // IBAN außerhalb des EWR: Anschrift Pflicht, das unbekannte Land ist dann ein Mangel.
  {
    p: profil("ausland", { daten_bestaetigt_am: "2026-09-14T21:00:00Z" }),
    w: gueltig({ land: "XX", plz: "ZZ-777", iban: "CH9300762011623852957" }),
  },
  // Freiwillige Anschrift unbekanntes Land: kein Mangel (Klickrunde 20.11.2026).
  { p: profil("auslandfrei"), w: gueltig({ land: "XX", plz: "ZZ-777" }) },
  { p: profil("vorwahl"), w: gueltig({ handynummer: "1761234567" }) },
  { p: profil("ohnezeile", { daten_bestaetigt_am: null }), w: leer() },
  { p: profil("gekuendigt", { Status: "cancelled", daten_bestaetigt_am: null }), w: leer() },
  { p: profil("antrag", { Status: "applicant", daten_bestaetigt_am: null }), w: gueltig({ iban: "XX00" }) },
  { p: profil("unlesbar", { daten_bestaetigt_am: null }), w: "unreadable" },
  { p: profil("altstatus", { Rolle: "member", Status: "alumni" }), w: gueltig({ iban: "", bic: "" }) },
];

const profiles = FAELLE.map((f) => f.p);
const secrets = new Map(FAELLE.map((f) => [f.p.id, f.w]));
const zeilen = (vorstand, opts = {}) =>
  adminMitgliederZeilen(profiles, secrets, { vorstand, jetzt: JETZT, heute: HEUTE, ...opts });
const nachId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test("Vorstand: Feldnamen je aktivem Mitglied, Alumni ohne Bank, land_unbekannt nur am Land, Hinweise nicht", () => {
  const r = nachId(zeilen(true));
  assert.deepEqual(r.vorstand.datenMaengel, []);
  // Handy und freiwillige Anschrift sind nie ein Mangel, auch angegeben und ungültig (Klickrunde 20.11.2026).
  assert.deepEqual(r.kaputt.datenMaengel, ["IBAN"]);
  assert.deepEqual(r.alumni.datenMaengel, []);
  assert.deepEqual(r.ausland.datenMaengel, ["Land"]);
  assert.deepEqual(r.auslandfrei.datenMaengel, []);
  // vorwahl_ergaenzt ist ein Hinweis, kein Mangel → kein Symbol
  assert.deepEqual(r.vorwahl.datenMaengel, []);
  // Handy und Anschrift sind freiwillig (seit 20.11.2026): ohne Daten fehlen nur IBAN und Geburtsdatum.
  assert.deepEqual(r.ohnezeile.datenMaengel, ["IBAN", "Geburtsdatum"]);
  // Status „alumni“ (Altdaten) zählt als Alumni: leere Bankdaten kein Mangel
  assert.deepEqual(r.altstatus.datenMaengel, []);
  // Nicht aktiv oder nicht lesbar: keine Aussage, Eigenschaft fehlt
  for (const id of ["gekuendigt", "antrag", "unlesbar"]) {
    assert.equal(Object.hasOwn(r[id], "datenMaengel"), false, id);
  }
  assert.equal(r.unlesbar.secretsUnreadable, true);
});

test("admin: keine Mängel im Payload (Eigenschaft fehlt ganz)", () => {
  const rows = zeilen(false);
  for (const row of rows) assert.equal(Object.hasOwn(row, "datenMaengel"), false, row.id);
  const json = JSON.stringify(rows);
  for (const name of Object.values(FELD_NAMEN)) {
    // Nur Feldnamen prüfen, die nicht zufällig in anderen Spalten vorkommen
    if (["Ort", "Land", "Handy", "PLZ", "IBAN", "BIC", "Geburtsdatum", "Hausnummer"].includes(name)) {
      assert.equal(json.includes(`"${name}"`), false, name);
    }
  }
  assert.equal(json.includes("datenMaengel"), false);
});

test("Payload: nur Feldnamen, keine Werte (gegen alle Testwerte)", () => {
  for (const vorstand of [true, false]) {
    const rows = zeilen(vorstand);
    const erlaubt = new Set(Object.values(FELD_NAMEN));
    for (const row of rows) for (const f of row.datenMaengel ?? []) assert.ok(erlaubt.has(f), f);
    // Die Handynummer zeigt die Liste schon immer an (eigene Spalte); alles andere darf nicht vorkommen.
    const ohneHandy = JSON.stringify(rows.map((row) => ({ ...row, handynummer: "" })));
    const werte = new Set();
    for (const { w } of FAELLE) {
      if (w === "unreadable") continue;
      for (const wert of Object.values(w)) if (typeof wert === "string" && wert.length >= 2) werte.add(wert);
    }
    for (const wert of werte) {
      assert.equal(ohneHandy.includes(wert), false, `Wert im Payload (vorstand=${vorstand})`);
    }
    // Keine Mängel- oder Hinweis-Codes
    for (const code of ["pruefziffer", "kein_mobil", "land_unbekannt", "fehlt", "vorwahl_ergaenzt", "bic_land"]) {
      assert.equal(ohneHandy.includes(code), false, code);
    }
  }
});

test("Nicht bestätigt: nur aktive, leer oder vor dem letzten Stichtag (15.9.2026)", () => {
  const r = nachId(zeilen(false));
  assert.equal(r.vorstand.bestaetigungOffen, false); // 1.10.2026
  assert.equal(r.kaputt.bestaetigungOffen, true); // nie
  assert.equal(r.ausland.bestaetigungOffen, true); // 14.9.2026 23 Uhr Berlin
  assert.equal(r.ohnezeile.bestaetigungOffen, true);
  assert.equal(r.unlesbar.bestaetigungOffen, true); // Bestätigung unabhängig von lesbaren Daten
  assert.equal(r.gekuendigt.bestaetigungOffen, false);
  assert.equal(r.antrag.bestaetigungOffen, false);
  assert.equal(r.alumni.bestaetigungOffen, false);
});

test("Spalte daten_bestaetigt_am fehlt: Bestätigungsstand unbekannt (null)", () => {
  const rows = zeilen(true, { bestaetigtBekannt: false });
  for (const row of rows) assert.equal(row.bestaetigungOffen, null);
  assert.equal(rows.filter((m) => passtDatenFilter(m, "unbestaetigt")).length, 0);
});

test("Zähler der Filter stimmen mit den Fake-Daten", () => {
  const zaehle = (rows, f) => rows.filter((m) => passtDatenFilter(m, f)).length;
  const board = zeilen(true);
  assert.equal(zaehle(board, "all"), FAELLE.length);
  assert.equal(zaehle(board, "unbestaetigt"), 4); // kaputt, ausland, ohnezeile, unlesbar
  assert.equal(zaehle(board, "unvollstaendig"), 3); // kaputt, ausland, ohnezeile
  const admin = zeilen(false);
  assert.equal(zaehle(admin, "unbestaetigt"), 4);
  assert.equal(zaehle(admin, "unvollstaendig"), 0);
});

test("member_secrets nicht lesbar: alle nicht lesbar, keine Mängel", () => {
  const rows = adminMitgliederZeilen(profiles, null, { vorstand: true, jetzt: JETZT, heute: HEUTE });
  for (const row of rows) {
    assert.equal(row.secretsUnreadable, true);
    assert.equal(row.handynummer, "");
    assert.equal(Object.hasOwn(row, "datenMaengel"), false);
  }
});

test("maengelFelder: ohne handyLand (Altnummer ohne Vorwahl ist kein Mangel), Reihenfolge fest", () => {
  assert.deepEqual(maengelFelder(gueltig({ handynummer: "01761234567" }), { Rolle: "member" }, HEUTE), []);
  // BIC wird nicht mehr bewertet: auch eine kaputte BIC ist kein Mangel.
  assert.deepEqual(
    maengelFelder(gueltig({ geburtsdatum: "2030-01-01", bic: "XYZ", iban: "DE89370400440532013001" }), { Rolle: "member" }, HEUTE),
    ["iban", "geburtsdatum"]
  );
  assert.equal(Object.hasOwn(FELD_NAMEN, "bic"), false);
});

test("maengelFelder: Handy/Anschrift nur Mangel, wenn Pflicht wegen IBAN außerhalb des EWR (Klickrunde 20.11.2026)", () => {
  const ohne = { handynummer: null, strasse: null, hausnummer: null, plz: null, ort: null, land: null };
  assert.deepEqual(maengelFelder(gueltig(ohne), { Rolle: "member" }, HEUTE), []);
  // Angegeben, aber ungültig: freiwillig, kein Mangel.
  assert.deepEqual(maengelFelder(gueltig({ handynummer: "+499411234567" }), { Rolle: "member" }, HEUTE), []);
  assert.deepEqual(maengelFelder(gueltig({ handynummer: "kaputt" }), { Rolle: "member" }, HEUTE), []);
  assert.deepEqual(maengelFelder(gueltig({ ort: "" }), { Rolle: "member" }, HEUTE), []);
  assert.deepEqual(maengelFelder(gueltig({ plz: "9304" }), { Rolle: "member" }, HEUTE), []);
  assert.deepEqual(maengelFelder(gueltig({ plz: "9304", iban: "CH9300762011623852957" }), { Rolle: "member" }, HEUTE), ["plz"]);
  assert.deepEqual(
    maengelFelder(gueltig({ ...ohne, iban: "CH9300762011623852957" }), { Rolle: "member" }, HEUTE),
    ["strasse", "hausnummer", "plz", "ort"]
  );
  // Alumni: keine Pflicht-Anschrift.
  assert.deepEqual(maengelFelder(gueltig({ ...ohne, iban: "CH9300762011623852957" }), { Rolle: "alumni" }, HEUTE), []);
});

test("Bestehende Felder der Liste unverändert (Name, Rolle, Status)", () => {
  const rows = adminMitgliederZeilen(
    [{ id: "a", Vorname: " Max ", Nachname: null, "E-Mail": " m@example.org ", Rolle: "Board", Status: "" }],
    new Map(),
    { vorstand: false, jetzt: JETZT }
  );
  assert.equal(rows[0].name, "Max");
  assert.equal(rows[0].email, "m@example.org");
  assert.equal(rows[0].rolle, "board");
  assert.equal(rows[0].status, "");
  assert.equal(rows[0].secretsUnreadable, false);
});

test("Nicht bestätigt (einmal berechneter Stichtag) = istBestaetigungOffen, auch an Stichtag- und Zeitumstellungsgrenzen", async () => {
  const { istBestaetigungOffen } = await import("../lib/member-data-check.ts");
  const jetzte = ["2026-11-18T12:00:00Z", "2027-03-01T00:30:00Z", "2027-02-28T22:59:59Z", "2026-09-15T05:00:00Z", "2026-03-29T03:00:00Z"];
  const zeitpunkte = [];
  for (const basis of ["2026-09-14T21:59:59Z", "2026-09-14T22:00:00Z", "2026-02-28T22:59:59Z", "2026-02-28T23:00:00Z", "2027-02-28T23:00:00Z"]) {
    const t = new Date(basis).getTime();
    for (const d of [-3600e3, -1000, 0, 1000, 3600e3, 86400e3 * 30]) zeitpunkte.push(new Date(t + d).toISOString());
  }
  zeitpunkte.push(null, "", "kein Datum");
  for (const j of jetzte) {
    const jetzt = new Date(j);
    const rows = adminMitgliederZeilen(
      zeitpunkte.map((z, i) => profil(`z${i}`, { daten_bestaetigt_am: z })),
      new Map(),
      { vorstand: false, jetzt }
    );
    rows.forEach((row, i) => {
      assert.equal(row.bestaetigungOffen, istBestaetigungOffen({ bestaetigtAm: zeitpunkte[i], jetzt }), `${j} ${zeitpunkte[i]}`);
    });
  }
});

test("Nicht lesbar: Zahl nur aktiver, Prüfung unmöglich nur, wenn nichts lesbar ist", () => {
  assert.deepEqual(datenLesbarkeit(zeilen(true)), { nichtLesbar: 1, pruefungMoeglich: true });
  const nichts = adminMitgliederZeilen(profiles, null, { vorstand: true, jetzt: JETZT, heute: HEUTE });
  // 9 aktive (gekündigt und Antrag zählen nicht), Prüfung nicht möglich → kein „0“ beim Filter
  assert.deepEqual(datenLesbarkeit(nichts), { nichtLesbar: 9, pruefungMoeglich: false });
  assert.deepEqual(datenLesbarkeit([]), { nichtLesbar: 0, pruefungMoeglich: true });
});
