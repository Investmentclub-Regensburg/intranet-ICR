// Tests für lib/insights.ts – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_FEE_PER_SEMESTER } from "../lib/membership-fee.ts";
import {
  FEE_PER_SEMESTER,
  computeInsights,
  normalizeFach,
  normalizeHochschule,
  periodLabel,
  periodOf,
  sixMonthsBefore,
} from "../lib/insights.ts";

test("Semester nach den Stichtagen 15.03. und 01.10.", () => {
  assert.deepEqual(periodOf("2026-03-14"), { semester: "WiSe", year: 2025 });
  assert.deepEqual(periodOf("2026-03-15"), { semester: "SoSe", year: 2026 });
  assert.deepEqual(periodOf("2026-09-30"), { semester: "SoSe", year: 2026 });
  assert.deepEqual(periodOf("2026-10-01"), { semester: "WiSe", year: 2026 });
  assert.equal(periodLabel({ semester: "WiSe", year: 2026 }), "WiSe 2026/27");
  assert.equal(periodLabel({ semester: "SoSe", year: 2026 }, true), "SoSe 26");
});

test("sechs Monate zurück, auch am Monatsende", () => {
  assert.equal(sixMonthsBefore("2026-10-13"), "2026-04-13");
  assert.equal(sixMonthsBefore("2026-03-15"), "2025-09-15");
  assert.equal(sixMonthsBefore("2026-08-31"), "2026-02-28");
});

test("Hochschule und Studiengang vereinheitlichen", () => {
  assert.equal(normalizeHochschule('a:1:{i:0;s:14:"OTH Regensburg";}'), "OTH Regensburg");
  assert.equal(normalizeHochschule("Ostbayerische Technische Hochschule"), "OTH Regensburg");
  assert.equal(normalizeHochschule('a:1:{i:0;s:23:"Universität Regensburg";}'), "Universität Regensburg");
  assert.equal(normalizeHochschule("Universität"), "Universität Regensburg");
  assert.equal(normalizeHochschule("sonstige"), "Sonstige");
  assert.equal(normalizeHochschule("OTH"), "OTH Regensburg");
  assert.equal(normalizeHochschule("TU München"), "Sonstige");
  assert.equal(normalizeHochschule("University of Southampton"), "Sonstige");
  assert.equal(normalizeHochschule("andere Hochschule"), "Sonstige");
  assert.equal(normalizeHochschule("  "), null);
  assert.equal(normalizeFach(" bwl "), "BWL");
  assert.equal(normalizeFach("Betriebswirtschaftslehre"), "BWL");
  assert.equal(normalizeFach("DBM"), "Digital Business");
  assert.equal(normalizeFach("Mathematik"), "Mathematik");
  assert.equal(normalizeFach("-"), null);
});

const base = { rolle: "member", datumKuendigung: null, fach: null, hochschule: null };

test("Kennzahlen und Beitragspflicht wie im Finanzexport", () => {
  const profiles = [
    { ...base, id: "a", status: "active", datumAntrag: "2025-01-10", fach: "bwl", hochschule: "OTH" },
    { ...base, id: "b", status: "active", datumAntrag: "2026-10-05", fach: "BWL" }, // Freisemester
    { ...base, id: "c", status: "cancelled", datumAntrag: "2024-05-01", datumKuendigung: "2026-10-10" }, // zahlt noch
    { ...base, id: "d", status: "cancelled", datumAntrag: "2024-05-01", datumKuendigung: "2026-09-01" }, // vor Stichtag
    { ...base, id: "e", status: "active", rolle: "alumni", datumAntrag: "2020-01-01" },
    { ...base, id: "f", status: "active", datumAntrag: "2025-06-01" }, // per Anpassung entfernt
    { ...base, id: "g", status: "active", datumAntrag: "2026-10-02" }, // per Anpassung aufgenommen
  ];
  const overrides = new Map([
    ["f", "exclude"],
    ["g", "include"],
  ]);
  const d = computeInsights(profiles, "2026-10-13", overrides);

  assert.equal(d.period.label, "WiSe 2026/27");
  assert.equal(d.activeTotal, 4);
  assert.equal(d.alumniTotal, 1);
  assert.equal(d.cancelledTotal, 2);
  assert.equal(d.payingCount, 3); // a, c, g
  assert.equal(d.expectedFees, 45);
  assert.equal(d.newInLast6Months, 2); // b, g
  assert.equal(d.cancellationsInLast6Months, 2); // c, d
  assert.equal(d.joinsBySemester.length, 8);
  assert.deepEqual(d.joinsBySemester.at(-1), { name: "WiSe 26/27", value: 2 });
  assert.deepEqual(d.joinsBySemester.at(-2), { name: "SoSe 26", value: 0 });
  assert.deepEqual(d.fach, { items: [{ name: "BWL", value: 2 }], missing: 2 });
  assert.deepEqual(d.hochschule, { items: [{ name: "OTH Regensburg", value: 1 }], missing: 3 });
});

test("Sonderfälle der Beitragspflicht", () => {
  const profiles = [
    { ...base, id: "a", status: " Active ", datumAntrag: "2025-01-10" },
    { ...base, id: "b", status: "active", datumAntrag: "2025-01-10" }, // Freisemester per Anpassung
    { ...base, id: "c", status: "active", rolle: "alumni", datumAntrag: "2020-01-01" }, // aufgenommen
    { ...base, id: "d", status: "cancelled", datumAntrag: "2024-01-01", datumKuendigung: "2026-10-01" }, // am Stichtag
    { ...base, id: "e", status: "cancelled", datumAntrag: "2024-01-01", datumKuendigung: "2026-09-30" }, // vorher
  ];
  const d = computeInsights(profiles, "2026-10-13", new Map([["b", "free_semester"], ["c", "include"]]));
  assert.equal(d.activeTotal, 2);
  assert.equal(d.payingCount, 3); // a, c, d
});

test("Beitrag gleich wie im Finanzexport", () => {
  assert.equal(FEE_PER_SEMESTER, MEMBERSHIP_FEE_PER_SEMESTER);
});
