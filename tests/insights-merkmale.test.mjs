// Tests für lib/insights-merkmale.ts und components/insights/insights-tabs.ts – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  altersgruppe,
  median,
  normalizeAbschluss,
  normalizeHochschule,
  phpSerialisiertAuspacken,
  volleMonate,
} from "../lib/insights-merkmale.ts";
import {
  anteil,
  balkenBreite,
  insightsTab,
  naechsterTab,
  saeulenHoehe,
} from "../components/insights/insights-tabs.ts";

test("Hochschule: Altwerte vereinheitlichen", () => {
  for (const v of [
    "Universität",
    "Universität Regensburg",
    " universität  regensburg ",
    "Uni Regensburg",
    "Universitaet Regensburg",
    'a:1:{i:0;s:23:"Universität Regensburg";}',
    'a:1:{i:0;s:12:"Universität";}',
  ]) {
    assert.equal(normalizeHochschule(v), "Universität Regensburg", v);
  }
  for (const v of [
    "OTH",
    "oth regensburg",
    "OTH Regensburg",
    "OTH-Regensburg",
    "Ostbayerische Technische Hochschule",
    "Ostbayerische Technische Hochschule Regensburg",
    'a:1:{i:0;s:3:"OTH";}',
  ]) {
    assert.equal(normalizeHochschule(v), "OTH Regensburg", v);
  }
  assert.equal(normalizeHochschule("sonstige"), "Sonstige");
  assert.equal(normalizeHochschule("TU München"), "Sonstige");
  assert.equal(normalizeHochschule(""), null);
  assert.equal(normalizeHochschule("  "), null);
  assert.equal(normalizeHochschule(null), null);
  assert.equal(normalizeHochschule("-"), null);
  assert.equal(normalizeHochschule("a:0:{}"), null);
  assert.equal(phpSerialisiertAuspacken("Universität"), "Universität");
});

test("Abschluss: Varianten und Tippfehler", () => {
  for (const v of ["Bachelor", "bachelor", "Bachelor of Science", "B.Sc.", "BSc", "B.A.", "BA", "Bachlor", "Bachelro", "Batchelor", "Bacheler", "Bachelorstudium", "bachelor "]) {
    assert.equal(normalizeAbschluss(v), "Bachelor", v);
  }
  for (const v of ["Master", "master", "M.Sc.", "MSc", "M.A.", "Masters", "Mster", "Master of Arts"]) {
    assert.equal(normalizeAbschluss(v), "Master", v);
  }
  for (const v of ["Staatsexamen", "staatsexamen", "Erstes Staatsexamen", "Lehramt (Staatsexamen)", "Staats Examen"]) {
    assert.equal(normalizeAbschluss(v), "Staatsexamen", v);
  }
  assert.equal(normalizeAbschluss("Diplom"), "Sonstige");
  assert.equal(normalizeAbschluss("Promotion"), "Sonstige");
  assert.equal(normalizeAbschluss(""), null);
  assert.equal(normalizeAbschluss("-"), null);
  assert.equal(normalizeAbschluss(null), null);
});

test("Altersgruppen am Stichtag, nicht lesbar = ohne Angabe", () => {
  const heute = "2026-11-19";
  assert.equal(altersgruppe("2007-11-20", heute), "unter 20"); // 18
  assert.equal(altersgruppe("2006-11-19", heute), "20 bis 22"); // genau 20
  assert.equal(altersgruppe("2004-01-01", heute), "20 bis 22"); // 22
  assert.equal(altersgruppe("2003-11-19", heute), "23 bis 25"); // 23
  assert.equal(altersgruppe("2001-01-01", heute), "23 bis 25"); // 25
  assert.equal(altersgruppe("2000-11-18", heute), "26 bis 29"); // 26
  assert.equal(altersgruppe("1997-01-01", heute), "26 bis 29"); // 29
  assert.equal(altersgruppe("1996-11-19", heute), "30 und älter"); // 30
  assert.equal(altersgruppe("19.11.1996", heute), "30 und älter"); // Altformat
  assert.equal(altersgruppe("1.2.2004", heute), "20 bis 22");
  assert.equal(altersgruppe("2005-02-29", heute), null); // kein Kalendertag
  assert.equal(altersgruppe("2030-01-01", heute), null); // Zukunft
  assert.equal(altersgruppe("1890-01-01", heute), null); // über 120
  assert.equal(altersgruppe("", heute), null);
  assert.equal(altersgruppe(null, heute), null);
  assert.equal(altersgruppe("irgendwas", heute), null);
});

test("Monate und Median", () => {
  assert.equal(volleMonate("2024-05-01", "2026-10-10"), 29);
  assert.equal(volleMonate("2024-05-10", "2024-06-09"), 0);
  assert.equal(volleMonate("2024-05-10", "2024-06-10"), 1);
  assert.equal(volleMonate("2026-01-01", "2025-01-01"), null);
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test("Reiter aus dem Link und Pfeiltasten", () => {
  assert.equal(insightsTab(undefined), "ueberblick");
  assert.equal(insightsTab("mitglieder"), "mitglieder");
  assert.equal(insightsTab(" Austritte "), "austritte");
  assert.equal(insightsTab(["austritte", "x"]), "austritte");
  assert.equal(insightsTab("aktivitaet"), "ueberblick");
  assert.equal(naechsterTab("ueberblick", "ArrowRight"), "mitglieder");
  assert.equal(naechsterTab("austritte", "ArrowRight"), "ueberblick");
  assert.equal(naechsterTab("ueberblick", "ArrowLeft"), "austritte");
  assert.equal(naechsterTab("mitglieder", "Home"), "ueberblick");
  assert.equal(naechsterTab("mitglieder", "End"), "austritte");
  assert.equal(naechsterTab("mitglieder", "Enter"), null);
});

test("Balkenbreite, Säulenhöhe, Anteil", () => {
  assert.equal(balkenBreite(0, 10), 0);
  assert.equal(balkenBreite(10, 10), 100);
  assert.equal(balkenBreite(1, 1000), 2);
  assert.equal(saeulenHoehe(null, 10), 0);
  assert.equal(saeulenHoehe(5, 10), 80);
  assert.equal(saeulenHoehe(1, 1000), 2);
  assert.equal(anteil(1, 3), 33);
  assert.equal(anteil(1, 0), 0);
});
