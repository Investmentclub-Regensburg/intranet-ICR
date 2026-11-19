// Tests für lib/insights.ts – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_FEE_PER_SEMESTER } from "../lib/membership-fee.ts";
import {
  FEE_PER_SEMESTER,
  budgetHerleitung,
  budgetNaechstesJahr,
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
  zahltBeitrag,
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
  assert.equal(normalizeFach("DBM"), "Digital Business");
  assert.equal(normalizeFach("Mathematik"), "Mathematik");
  assert.equal(normalizeFach("-"), null);
});

const base = {
  rolle: "member",
  datumKuendigung: null,
  fach: null,
  hochschule: null,
  abschluss: null,
  altersgruppe: null,
};

test("Beitragspflicht je Semester wie im Finanzexport", () => {
  const start = "2026-10-01";
  const p = (x) => ({ ...base, id: "x", status: "active", datumAntrag: "2025-01-10", ...x });
  assert.equal(zahltBeitrag(p({}), start, null), true);
  assert.equal(zahltBeitrag(p({ datumAntrag: "2026-10-01" }), start, null), false); // Freisemester
  assert.equal(zahltBeitrag(p({ rolle: "alumni" }), start, null), false);
  assert.equal(zahltBeitrag(p({ status: "alumni" }), start, null), false);
  assert.equal(zahltBeitrag(p({ rolle: "alumni" }), start, "include"), true);
  assert.equal(zahltBeitrag(p({}), start, "exclude"), false);
  assert.equal(zahltBeitrag(p({}), start, "free_semester"), false);
  assert.equal(zahltBeitrag(p({ status: "cancelled", datumKuendigung: "2026-10-01" }), start, null), true); // am Stichtag
  assert.equal(zahltBeitrag(p({ status: "cancelled", datumKuendigung: "2026-09-30" }), start, null), false);
});

test("Budget nächstes Jahr: 2 Semester × zahlende × Beitrag", () => {
  const profiles = [
    { ...base, id: "a", status: "active", datumAntrag: "2025-01-10" },
    { ...base, id: "b", status: "active", datumAntrag: "2026-10-05" }, // heute Freisemester, nächstes Jahr zahlend
    { ...base, id: "c", status: "cancelled", datumAntrag: "2024-05-01", datumKuendigung: "2026-10-10" },
    { ...base, id: "d", status: "cancelled", datumAntrag: "2024-05-01" }, // ohne Datum: zählt nicht
    { ...base, id: "e", status: "active", rolle: "alumni", datumAntrag: "2020-01-01" },
    { ...base, id: "f", status: "applicant", datumAntrag: "2026-11-01" }, // offener Antrag: zählt nicht
    { ...base, id: "g", status: "active", datumAntrag: "2025-06-01" }, // Freisemester SoSe 2027 per Anpassung
  ];
  const overrides = new Map([["2027-SoSe", new Map([["g", "free_semester"]])]]);
  const b = budgetNaechstesJahr(profiles, "2026-11-19", overrides);
  assert.equal(b.year, 2027);
  assert.deepEqual(b.semester, [
    { label: "SoSe 2027", zahlend: 2 },
    { label: "WiSe 2027/28", zahlend: 3 },
  ]);
  assert.equal(b.total, 5 * FEE_PER_SEMESTER);
  assert.equal(budgetHerleitung(b), "SoSe 2027: 2 × 15 € + WiSe 2027/28: 3 × 15 €");

  const gleich = budgetNaechstesJahr(profiles, "2026-11-19");
  assert.equal(gleich.total, 2 * 3 * FEE_PER_SEMESTER);
  assert.equal(budgetHerleitung(gleich), "2 Semester × 3 zahlende Mitglieder × 15 €");
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
  assert.equal(d.budget.total, 2 * 2 * FEE_PER_SEMESTER); // a, b
});

test("Beitrag gleich wie im Finanzexport", () => {
  assert.equal(FEE_PER_SEMESTER, MEMBERSHIP_FEE_PER_SEMESTER);
});
