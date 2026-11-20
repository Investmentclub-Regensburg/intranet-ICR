// Tests für lib/insights.ts – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_FEE_PER_SEMESTER } from "../lib/membership-fee.ts";
import { readFileSync } from "node:fs";
import {
  FEE_PER_SEMESTER,
  einzugHerleitung,
  einzugIbanBedarf,
  naechsterEinzug,
  naechstesEinzugsSemester,
  nextPeriod,
  eintritteImSemester,
  istMitglied,
  mitgliedsart,
  computeInsights,
  festeBalken,
  freieBalken,
  gruendeBalken,
  lastPeriods,
  normalizeFach,
  periodLabel,
  periodOf,
  periodShort,
  semesterSaeulen,
} from "../lib/insights.ts";

test("Semester nach den Stichtagen 15.03. und 01.10.", () => {
  assert.deepEqual(periodOf("2026-03-14"), { semester: "WiSe", year: 2025 });
  assert.deepEqual(periodOf("2026-03-15"), { semester: "SoSe", year: 2026 });
  assert.deepEqual(periodOf("2026-09-30"), { semester: "SoSe", year: 2026 });
  assert.deepEqual(periodOf("2026-10-01"), { semester: "WiSe", year: 2026 });
  assert.deepEqual(periodOf("2027-01-10"), { semester: "WiSe", year: 2026 });
  assert.equal(periodLabel({ semester: "WiSe", year: 2026 }), "WiSe 2026/27");
  assert.equal(periodLabel({ semester: "SoSe", year: 2026 }), "SoSe 2026");
  assert.equal(periodShort({ semester: "WiSe", year: 2026 }), "Wi 26");
  assert.equal(periodShort({ semester: "SoSe", year: 2023 }), "So 23");
});

test("letzte 8 Semester, ältestes zuerst", () => {
  const p = lastPeriods(periodOf("2026-11-19"), 8).map(periodLabel);
  assert.deepEqual(p, [
    "SoSe 2023",
    "WiSe 2023/24",
    "SoSe 2024",
    "WiSe 2024/25",
    "SoSe 2025",
    "WiSe 2025/26",
    "SoSe 2026",
    "WiSe 2026/27",
  ]);
});

test("Studiengang vereinheitlichen", () => {
  assert.equal(normalizeFach(" bwl "), "BWL");
  assert.equal(normalizeFach("Betriebswirtschaftslehre"), "BWL");
  // Gleiche Gruppen wie Auswahl und Bereinigung (lib/studiengaenge.ts): Digital Business Management ist eigener
  // Studiengang (Entscheidung Hannes 1), Vorschläge zählen beim Listennamen.
  assert.equal(normalizeFach("DBM"), "Digital Business Management");
  assert.equal(normalizeFach("Digital Buisness"), "Digital Business");
  assert.equal(normalizeFach("BW"), "BWL");
  assert.equal(normalizeFach("Kein Student"), "Kein Studium");
  assert.equal(normalizeFach("Rechtswissenschaft"), "Jura");
  assert.equal(normalizeFach("Mathematik"), "Mathematik");
  assert.equal(normalizeFach("Diplom-Finanzwirt (FH)"), "Diplom-Finanzwirt (FH)");
  assert.equal(normalizeFach("-"), null);
  assert.equal(normalizeFach(null), null);
});

test("Insights: Studiengänge in sinnvollen Gruppen", () => {
  const fach = ["BWL", "Bwl", "Betriebswirtschaftslehre", "BW", "BWL/Finance", "Business Managment", "Business Management",
    "Digital Business", "DBM", "Kein Student", "Kein Studium", "Sonstige", "Sonstiges", "Diplom-Finanzwirt (FH)", "", "-", null];
  const profiles = fach.map((f, i) => ({
    id: `p${i}`, status: "active", rolle: "member", datumAntrag: "2025-01-10", datumKuendigung: null, fach: f,
  }));
  const d = computeInsights(profiles, "2026-10-13");
  // Balkenform aus Insights je Semester (freieBalken): Gruppen wie Auswahl und Bereinigung, „ohne Angabe“ grau am Ende.
  assert.deepEqual(d.fach, [
    { label: "BWL", n: 5 },
    { label: "Business Management", n: 2 },
    { label: "Kein Studium", n: 2 },
    { label: "Sonstiges", n: 2 },
    { label: "Digital Business", n: 1 },
    { label: "Digital Business Management", n: 1 },
    { label: "Diplom-Finanzwirt (FH)", n: 1 },
    { label: "ohne Angabe", n: 3, grau: true },
  ]);
});

const base = {
  rolle: "member",
  datumKuendigung: null,
  fach: null,
  hochschule: null,
  abschluss: null,
  altersgruppe: null,
};

// Nächster Einzug (Klickrunde 20.11.2026): profiles-Zeilen wie im Finanzexport gelesen, erfundene Daten.
const IBAN_DE = "DE89370400440532013000";
const IBAN_CH = "CH9300762011623852957";
const zeile = (id, x = {}) => ({ id, Status: "active", Rolle: "member", Datum_Antrag: "2025-01-10", "Datum_Kündigung": null, ...x });

test("Nächstes Einzugs-Semester: das Semester nach dem laufenden, Stichtag selbst schon das folgende", () => {
  assert.deepEqual(naechstesEinzugsSemester("2026-11-20"), { semester: "SoSe", year: 2027 });
  assert.deepEqual(naechstesEinzugsSemester("2027-01-10"), { semester: "SoSe", year: 2027 });
  assert.deepEqual(naechstesEinzugsSemester("2027-03-14"), { semester: "SoSe", year: 2027 });
  assert.deepEqual(naechstesEinzugsSemester("2027-03-15"), { semester: "WiSe", year: 2027 });
  assert.deepEqual(naechstesEinzugsSemester("2027-09-30"), { semester: "WiSe", year: 2027 });
  assert.deepEqual(naechstesEinzugsSemester("2027-10-01"), { semester: "SoSe", year: 2028 });
  assert.deepEqual(nextPeriod({ semester: "SoSe", year: 2027 }), { semester: "WiSe", year: 2027 });
});

test("Nächster Einzug: nur, was der Finanzexport als Lastschrift führen würde", () => {
  const semester = naechstesEinzugsSemester("2026-11-20"); // SoSe 2027, Stichtag 15.03.2027
  const profiles = [
    zeile("a"), // zahlend
    zeile("b", { Datum_Antrag: "2026-10-05" }), // heute im Freisemester, ab SoSe 2027 zahlend
    zeile("c", { Datum_Antrag: "2027-03-15" }), // Eintritt am Stichtag: erstes Semester frei
    zeile("d", { Rolle: "alumni" }), // Alumni zahlen nicht
    zeile("e", { Status: "alumni" }), // Altstatus Alumni
    zeile("f", { Status: "cancelled", "Datum_Kündigung": "2027-03-14" }), // vor dem Stichtag gekündigt
    zeile("g", { Status: "cancelled", "Datum_Kündigung": "2027-03-15" }), // am Stichtag gekündigt: zahlt SoSe 2027 noch
    zeile("o", { Status: "applicant", Datum_Antrag: "2026-11-01" }), // offener Antrag: nie
    zeile("p", { Status: "cancelled" }), // gekündigt ohne Datum: nie
    zeile("h"), // keine IBAN
    zeile("i"), // ungültige IBAN
    zeile("j"), // Konto außerhalb des EWR: manuell, nicht in der Lastschrift
    zeile("k"), // Anpassung „Freisemester“ für SoSe 2027
    zeile("l", { Rolle: "alumni" }), // Anpassung „aufnehmen“
    zeile("m"), // Anpassung „entfernen“
    zeile("n"), // keine member_secrets-Zeile (nicht in der IBAN-Liste)
  ];
  const anpassungen = new Map([
    ["k", "free_semester"],
    ["l", "include"],
    ["m", "exclude"],
  ]);
  // Entschlüsselt wird nur, wo die IBAN entscheidet.
  const bedarf = einzugIbanBedarf(profiles, semester, anpassungen);
  assert.deepEqual(bedarf, ["a", "b", "g", "h", "i", "j", "l", "n"]);
  const ibans = new Map([
    ["a", IBAN_DE],
    ["b", "de89 3704 0044 0532 0130 00"],
    ["g", IBAN_DE],
    ["o", IBAN_DE],
    ["p", IBAN_DE],
    ["h", null],
    ["i", "DE89370400440532013001"],
    ["j", IBAN_CH],
    ["l", IBAN_DE],
  ]);
  const e = naechsterEinzug(profiles, semester, anpassungen, ibans);
  assert.deepEqual(e, { label: "SoSe 2027", stichtag: "2027-03-15", zahlend: 4, total: 4 * FEE_PER_SEMESTER, nichtLesbar: 0 });
  assert.equal(
    einzugHerleitung(e),
    "4 Lastschriften × 15 € zum 15.03.2027, wie im Finanzexport: ohne Alumni, Gekündigte, Erstsemester (erstes Semester frei), fehlende oder ungültige IBAN und Konten außerhalb des EWR",
  );
  // Nicht lesbare IBAN: Betrag unbekannt (der Export bricht dann ab).
  const kaputt = naechsterEinzug(profiles, semester, anpassungen, new Map([...ibans, ["a", "unreadable"]]));
  assert.equal(kaputt.nichtLesbar, 1);
  assert.match(einzugHerleitung(kaputt), /Bankdaten von 1 Mitglied nicht lesbar/);
  assert.match(einzugHerleitung(null), /Bankdaten nicht lesbar/);
});

test("Nächster Einzug nutzt dieselbe Einordnung wie der Finanzexport (keine Nachbildung)", () => {
  const insights = readFileSync(new URL("../lib/insights.ts", import.meta.url), "utf8");
  assert.match(insights, /financeKategorieFuerProfil\(/);
  assert.doesNotMatch(insights, /function zahltBeitrag|budgetNaechstesJahr|budgetJahr/);
  const finance = readFileSync(new URL("../app/(intranet)/admin/actions/finance.ts", import.meta.url), "utf8");
  assert.match(finance, /financeKategorieFuerProfil\(profile, ibanClean, override, periodStartDay\)/);
  const action = readFileSync(new URL("../app/(intranet)/insights/actions.ts", import.meta.url), "utf8");
  // IBAN nur für die Profile, bei denen sie entscheidet, und nur als Zählung weiter.
  assert.match(action, /readMemberSecretFieldMany\(admin, einzugIbanBedarf\(/);
  assert.match(action, /ibans\.clear\(\)/);
  const ansicht = readFileSync(new URL("../components/insights/InsightsView.tsx", import.meta.url), "utf8");
  assert.match(ansicht, /`Nächster Einzug \$\{einzug\.label\}`/);
  assert.match(ansicht, /title=\{einzugHerleitung\(einzug\)\}/);
  assert.doesNotMatch(ansicht, /Budget/);
});

test("Säulen je Semester; Austritte vor dem ersten Wert gelten als nicht erfasst", () => {
  const perioden = lastPeriods(periodOf("2026-11-19"), 4);
  const aktuell = periodOf("2026-11-19");
  const ein = semesterSaeulen(perioden, ["2025-04-01", "2025-10-01", "2026-11-01", "2026-10-02"], aktuell);
  assert.deepEqual(
    ein.map((s) => s.n),
    [1, 1, 0, 2],
  );
  assert.equal(ein[3].aktuell, true);
  assert.equal(ein[0].aktuell, false);
  const aus = semesterSaeulen(perioden, ["2026-05-01", "2026-10-20"], aktuell, true);
  assert.deepEqual(
    aus.map((s) => s.n),
    [null, null, 1, 1],
  );
  assert.deepEqual(
    semesterSaeulen(perioden, [], aktuell, true).map((s) => s.n),
    [0, 0, 0, 0],
  );
});

test("Balken: frei mit Weitere und ohne Angabe, fest in fester Reihenfolge, Gründe", () => {
  const frei = freieBalken(["BWL", "bwl", "VWL", "A", "B", null, null], 3);
  assert.deepEqual(frei, [
    { label: "BWL", n: 2 },
    { label: "A", n: 1 },
    { label: "Weitere", n: 2 },
    { label: "ohne Angabe", n: 2, grau: true },
  ]);
  assert.deepEqual(festeBalken(["x", "y", "z"], ["z", "x", "z", null]), [
    { label: "x", n: 1 },
    { label: "z", n: 2 },
    { label: "ohne Angabe", n: 1, grau: true },
  ]);
  assert.deepEqual(festeBalken(["x", "y"], ["x"], true), [
    { label: "x", n: 1 },
    { label: "y", n: 0 },
  ]);
  assert.deepEqual(gruendeBalken(["keine_zeit", "sonstiges", "keine_zeit", null, "unbekannt"]), [
    { label: "Keine Zeit mehr", n: 2 },
    { label: "Sonstiges", n: 1 },
    { label: "ohne Angabe", n: 2, grau: true },
  ]);
});

test("Kennzahlen aus den Profilen", () => {
  const profiles = [
    { ...base, id: "a", status: "active", datumAntrag: "2025-01-10", fach: "bwl", hochschule: "OTH", abschluss: "B.Sc.", altersgruppe: "20 bis 22" },
    { ...base, id: "b", status: "active", datumAntrag: "2026-10-05", fach: "BWL", hochschule: "Universität" },
    { ...base, id: "c", status: "cancelled", datumAntrag: "2024-05-01", datumKuendigung: "2026-10-10" },
    { ...base, id: "d", status: "cancelled", datumAntrag: "2024-05-01", datumKuendigung: "2026-09-01" },
    { ...base, id: "e", status: "active", rolle: "alumni", datumAntrag: "2020-01-01", abschluss: "Master" },
    { ...base, id: "f", status: "applicant", datumAntrag: "2026-11-01" },
    { ...base, id: "g", status: "cancelled", datumAntrag: "2025-01-10", rolle: "alumni", datumKuendigung: "2026-11-02" },
  ];
  const d = computeInsights(profiles, "2026-11-19");

  assert.equal(d.period.label, "WiSe 2026/27");
  assert.equal(d.studierende, 2);
  assert.equal(d.alumni, 1);
  assert.equal(d.mitglieder, 3);
  assert.equal(d.eintritte.length, 8);
  assert.equal(d.eintritteAktuell, 1); // b; f ist offener Antrag
  assert.equal(d.austritteAktuell, 2); // c, g
  assert.deepEqual(
    d.austritte.slice(-2).map((s) => s.n),
    [1, 2],
  );
  assert.equal(d.austritte[0].n, null); // vor der ersten erfassten Kündigung
  // Monate: c 29, d 28, g 21 → Median 28
  assert.equal(d.medianMonate, 28);
  assert.deepEqual(d.fach, [
    { label: "BWL", n: 2 },
    { label: "ohne Angabe", n: 1, grau: true },
  ]);
  assert.deepEqual(d.hochschule, [
    { label: "Universität Regensburg", n: 1 },
    { label: "OTH Regensburg", n: 1 },
    { label: "ohne Angabe", n: 1, grau: true },
  ]);
  assert.deepEqual(d.abschluss, [
    { label: "Bachelor", n: 1 },
    { label: "Master", n: 1 },
    { label: "ohne Angabe", n: 1, grau: true },
  ]);
  assert.equal(d.alter.length, 6);
  assert.deepEqual(d.alter[1], { label: "20 bis 22", n: 1 });
  assert.deepEqual(d.alter[5], { label: "ohne Angabe", n: 2, grau: true });
  assert.equal(d.einzug, null); // vom Server gezählt (mit IBAN), hier nicht übergeben
});

test("Mitgliedsart: eine Regel für Kacheln und Verteilungen", () => {
  assert.equal(mitgliedsart({ status: "cancelled", rolle: "alumni" }), "ausgetreten");
  assert.equal(mitgliedsart({ status: " Applicant ", rolle: "member" }), "antrag");
  assert.equal(mitgliedsart({ status: "active", rolle: "Alumni" }), "alumni");
  assert.equal(mitgliedsart({ status: "alumni", rolle: "member" }), "alumni");
  assert.equal(mitgliedsart({ status: "active", rolle: "board" }), "studierend");
  assert.equal(mitgliedsart({ status: "", rolle: "member" }), "studierend"); // leerer Altstatus
  assert.equal(mitgliedsart({ status: "pending", rolle: "member" }), "studierend"); // unbekannter Altstatus
  assert.equal(istMitglied({ status: "", rolle: "" }), true);
  assert.equal(istMitglied({ status: "cancelled", rolle: "" }), false);

  // Unbekannter Status zählt in der Kachel; im nächsten Einzug wie im Finanzexport (zahlend mit gültiger IBAN).
  const profiles = [
    { ...base, id: "a", status: "active", datumAntrag: "2025-01-10" },
    { ...base, id: "b", status: "", datumAntrag: "2025-01-10" },
  ];
  const d = computeInsights(profiles, "2026-11-19");
  assert.equal(d.studierende, 2);
  const zeilen = [zeile("a"), zeile("b", { Status: "" })];
  const ibans = new Map([["a", IBAN_DE], ["b", IBAN_DE]]);
  assert.equal(naechsterEinzug(zeilen, naechstesEinzugsSemester("2026-11-19"), new Map(), ibans).zahlend, 2);
});

test("Eintritte im Semester (auch Startseite): ohne offene Anträge, Ausgetretene zählen", () => {
  const profiles = [
    { status: "active", rolle: "member", datumAntrag: "2026-10-05" },
    { status: "cancelled", rolle: "member", datumAntrag: "2026-10-02" },
    { status: "applicant", rolle: "member", datumAntrag: "2026-10-10" },
    { status: "active", rolle: "member", datumAntrag: "2026-09-30" }, // Vorsemester
    { status: "active", rolle: "member", datumAntrag: null },
  ];
  assert.equal(eintritteImSemester(profiles, "2026-11-19"), 2);
  // SoSe beginnt am 15.03. (nicht 01.04.)
  assert.equal(eintritteImSemester([{ status: "active", rolle: "", datumAntrag: "2026-03-20" }], "2026-03-25"), 1);
  // Gleich wie die Säule des laufenden Semesters in Insights.
  const ins = computeInsights(profiles.map((p, i) => ({ ...base, ...p, id: String(i) })), "2026-11-19");
  assert.equal(ins.eintritteAktuell, 2);
});

test("Beitrag gleich wie im Finanzexport", () => {
  assert.equal(FEE_PER_SEMESTER, MEMBERSHIP_FEE_PER_SEMESTER);
});
