// Tests für die Mitgliederliste in Verwaltung › Mitglieder (Design-Runde 19.11.2026): Filter-Standard und
// Zähler, Filtern, Sortieren und die Zuordnung Rolle/Status → updateMemberRole. Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  angezeigteRolle,
  ariaSort,
  datenGeaendert,
  filterAbweichungen,
  filtereMitglieder,
  mitgliedschaftAufruf,
  mitgliedschaftGesperrt,
  mitgliedschaftNachAufruf,
  mitgliedschaftVon,
  naechsteSortierung,
  rolleGesperrt,
  rolleVon,
  sortiereMitglieder,
  standardFilter,
  STANDARD_SORTIERUNG,
  umschalten,
} from "../components/admin/member-list.ts";

const zeile = (name, extra = {}) => ({
  name,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@beispiel.de`,
  rolle: "member",
  status: "active",
  bestaetigungOffen: false,
  datenMaengel: [],
  ...extra,
});

const LISTE = [
  zeile("Lena Hofmann"),
  zeile("Jonas Berger", { bestaetigungOffen: true }),
  zeile("Sophie Wagner", { rolle: "board" }),
  zeile("Max Huber", { rolle: "admin" }),
  zeile("Clara Schmid", { rolle: "alumni" }),
  zeile("Felix Neumann", { status: "applicant" }),
  zeile("Anna Keller", { datenMaengel: ["Handy", "PLZ"] }),
  zeile("David Richter", { status: "cancelled" }),
  zeile("Alt Daten", { rolle: "", status: "alumni" }),
];

test("Standard: alle Rollen, Aktiv + Antrag offen, Daten alle; Ausgetretene ausgeblendet", () => {
  const f = standardFilter();
  assert.equal(filterAbweichungen(f), 0);
  const namen = filtereMitglieder(LISTE, "", f).map((m) => m.name);
  assert.ok(!namen.includes("David Richter"));
  assert.ok(namen.includes("Felix Neumann"));
  // Unbekannte Rolle zählt als Mitglied, Altstatus „alumni“ als aktiv: bleibt sichtbar.
  assert.ok(namen.includes("Alt Daten"));
  assert.equal(namen.length, LISTE.length - 1);
});

test("Zähler am Knopf: je abweichender Gruppe eins, Reihenfolge egal", () => {
  const f = standardFilter();
  assert.equal(filterAbweichungen({ ...f, status: ["applicant", "active"] }), 0);
  assert.equal(filterAbweichungen({ ...f, rollen: umschalten(f.rollen, "admin") }), 1);
  assert.equal(filterAbweichungen({ ...f, status: [...f.status, "cancelled"] }), 1);
  assert.equal(filterAbweichungen({ ...f, status: ["active"], daten: "unbestaetigt" }), 2);
  assert.equal(
    filterAbweichungen({ rollen: ["board"], status: ["cancelled"], daten: "unvollstaendig" }),
    3,
  );
});

test("Filter: Rolle, Status, Daten und Suche (Name oder E-Mail)", () => {
  const f = standardFilter();
  assert.deepEqual(
    filtereMitglieder(LISTE, "", { ...f, rollen: ["board"] }).map((m) => m.name),
    ["Sophie Wagner"],
  );
  assert.deepEqual(
    filtereMitglieder(LISTE, "", { ...f, status: ["cancelled"] }).map((m) => m.name),
    ["David Richter"],
  );
  assert.deepEqual(
    filtereMitglieder(LISTE, "", { ...f, daten: "unbestaetigt" }).map((m) => m.name),
    ["Jonas Berger"],
  );
  assert.deepEqual(
    filtereMitglieder(LISTE, "", { ...f, daten: "unvollstaendig" }).map((m) => m.name),
    ["Anna Keller"],
  );
  assert.deepEqual(filtereMitglieder(LISTE, "  HUBER ", f).map((m) => m.name), ["Max Huber"]);
  assert.deepEqual(filtereMitglieder(LISTE, "lena.hofmann@", f).map((m) => m.name), ["Lena Hofmann"]);
  assert.deepEqual(filtereMitglieder(LISTE, "", { ...f, rollen: [] }), []);
});

test("rolleVon: unbekannt oder leer → Mitglied", () => {
  assert.equal(rolleVon({ rolle: "board" }), "board");
  assert.equal(rolleVon({ rolle: " Admin " }), "admin");
  assert.equal(rolleVon({ rolle: "" }), "member");
  assert.equal(rolleVon({ rolle: "kassenwart" }), "member");
});

test("Sortierung: erster Klick A–Z, zweiter Z–A, andere Spalte wieder A–Z", () => {
  assert.deepEqual(STANDARD_SORTIERUNG, { spalte: "name", richtung: "asc" });
  const a = naechsteSortierung(STANDARD_SORTIERUNG, "name");
  assert.deepEqual(a, { spalte: "name", richtung: "desc" });
  assert.deepEqual(naechsteSortierung(a, "name"), { spalte: "name", richtung: "asc" });
  assert.deepEqual(naechsteSortierung(a, "rolle"), { spalte: "rolle", richtung: "asc" });
  assert.equal(ariaSort(a, "name"), "descending");
  assert.equal(ariaSort(STANDARD_SORTIERUNG, "name"), "ascending");
  assert.equal(ariaSort(a, "status"), "none");
});

test("Sortieren nach Name (deutsch), Rolle und Status; Gleichstand nach Name A–Z", () => {
  const rows = [
    zeile("Zoe Ost", { rolle: "admin" }),
    zeile("Ärne Bach", { rolle: "board", status: "cancelled" }),
    zeile("Bert Acker", { rolle: "admin", status: "applicant" }),
    zeile("Anton Zeh"),
  ];
  assert.deepEqual(
    sortiereMitglieder(rows, { spalte: "name", richtung: "asc" }).map((m) => m.name),
    ["Anton Zeh", "Ärne Bach", "Bert Acker", "Zoe Ost"],
  );
  assert.deepEqual(
    sortiereMitglieder(rows, { spalte: "name", richtung: "desc" }).map((m) => m.name),
    ["Zoe Ost", "Bert Acker", "Ärne Bach", "Anton Zeh"],
  );
  // Rolle nach Anzeige: Admin, Admin, Mitglied, Vorstand; Gleichstand (Admin) nach Name.
  assert.deepEqual(
    sortiereMitglieder(rows, { spalte: "rolle", richtung: "asc" }).map((m) => m.name),
    ["Bert Acker", "Zoe Ost", "Anton Zeh", "Ärne Bach"],
  );
  // Z–A dreht nur die Spalte, der Gleichstand bleibt Name A–Z.
  assert.deepEqual(
    sortiereMitglieder(rows, { spalte: "rolle", richtung: "desc" }).map((m) => m.name),
    ["Ärne Bach", "Anton Zeh", "Bert Acker", "Zoe Ost"],
  );
  // Status nach Anzeige: Aktiv, Aktiv, Antrag offen, Ausgetreten.
  assert.deepEqual(
    sortiereMitglieder(rows, { spalte: "status", richtung: "asc" }).map((m) => m.name),
    ["Anton Zeh", "Zoe Ost", "Bert Acker", "Ärne Bach"],
  );
  // Eingabe bleibt unverändert.
  assert.equal(rows[0].name, "Zoe Ost");
});

const ms = (rolle, status) => ({ rolle, status });

test("Mitgliedschaft: Ausgangswerte aus der Zeile", () => {
  assert.deepEqual(mitgliedschaftVon({ rolle: "Board", status: "active" }), ms("board", "active"));
  assert.deepEqual(mitgliedschaftVon({ rolle: "", status: "alumni" }), ms("member", "active"));
  assert.deepEqual(mitgliedschaftVon({ rolle: "member", status: "cancelled" }), ms("member", "cancelled"));
  assert.deepEqual(mitgliedschaftVon({ rolle: "member", status: "applicant" }), ms("member", "applicant"));
});

test("Zuordnung Auswahl → updateMemberRole: nichts geändert → kein Aufruf", () => {
  assert.equal(mitgliedschaftAufruf(ms("admin", "active"), ms("admin", "active")), null);
  assert.equal(mitgliedschaftAufruf(ms("member", "cancelled"), ms("member", "cancelled")), null);
});

test("Zuordnung: nur Rolle geändert → neue Rolle", () => {
  assert.equal(mitgliedschaftAufruf(ms("member", "active"), ms("board", "active")), "board");
  assert.equal(mitgliedschaftAufruf(ms("board", "active"), ms("alumni", "active")), "alumni");
});

test("Zuordnung: Austritt → cancelled, egal welche Rolle gewählt war", () => {
  assert.equal(mitgliedschaftAufruf(ms("admin", "active"), ms("admin", "cancelled")), "cancelled");
  assert.equal(mitgliedschaftAufruf(ms("member", "active"), ms("board", "cancelled")), "cancelled");
});

test("Zuordnung: Wiederaufnahme → gewählte Rolle, auch unverändert", () => {
  assert.equal(mitgliedschaftAufruf(ms("member", "cancelled"), ms("member", "active")), "member");
  assert.equal(mitgliedschaftAufruf(ms("member", "cancelled"), ms("alumni", "active")), "alumni");
});

test("Zuordnung: Antrag offen ist gesperrt, nie ein Aufruf", () => {
  const basis = ms("member", "applicant");
  assert.equal(mitgliedschaftGesperrt(basis), true);
  assert.equal(mitgliedschaftAufruf(basis, ms("admin", "active")), null);
  assert.equal(mitgliedschaftAufruf(basis, ms("member", "cancelled")), null);
  assert.equal(rolleGesperrt(basis, basis), true);
});

test("Zuordnung: ungültige Werte senden nichts", () => {
  assert.equal(mitgliedschaftAufruf(ms("member", "active"), ms("kassenwart", "active")), null);
  assert.equal(mitgliedschaftAufruf(ms("member", "active"), ms("member", "applicant")), null);
});

test("Rollenfeld bei Austritt: zeigt Mitglied und ist gesperrt; zurück auf Aktiv zeigt die Auswahl", () => {
  const basis = ms("admin", "active");
  assert.equal(angezeigteRolle(basis, ms("admin", "cancelled")), "member");
  assert.equal(rolleGesperrt(basis, ms("admin", "cancelled")), true);
  assert.equal(angezeigteRolle(basis, ms("admin", "active")), "admin");
  assert.equal(rolleGesperrt(basis, ms("admin", "active")), false);
  // Schon ausgetreten: zeigt die gespeicherte Rolle.
  assert.equal(angezeigteRolle(ms("board", "cancelled"), ms("board", "cancelled")), "board");
});

test("Nach dem Aufruf: neue Ausgangswerte wie der Server sie setzt", () => {
  assert.deepEqual(mitgliedschaftNachAufruf("cancelled"), ms("member", "cancelled"));
  assert.deepEqual(mitgliedschaftNachAufruf("board"), ms("board", "active"));
  const basis = mitgliedschaftNachAufruf("board");
  assert.equal(mitgliedschaftAufruf(basis, ms("board", "active")), null);
});

test("datenGeaendert: nur Rolle geändert → Datenfelder laufen nicht mit", () => {
  const felder = ["vorname", "plz"];
  const basis = { vorname: "Lena", plz: "93053" };
  assert.equal(datenGeaendert({ vorname: "Lena", plz: "93053", iban: "" }, basis, felder), false);
  assert.equal(datenGeaendert({ vorname: "Lena", plz: "93053", iban: "  " }, basis, felder), false);
  assert.equal(datenGeaendert({ vorname: "Lea", plz: "93053", iban: "" }, basis, felder), true);
  assert.equal(datenGeaendert({ vorname: "Lena", plz: "93053", iban: "DE89 3704" }, basis, felder), true);
});
