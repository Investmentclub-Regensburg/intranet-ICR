// Ein Versprechen, drei Stellen (Klickrunde 20.11.2026): Für dieselbe Kündigung ergeben Finanzexport
// (financeKategorieFuerProfil), Insights-Kachel „Nächster Einzug“ (naechsterEinzug) und das Profil bzw. die
// Kündigungsmail (nextFeeStop: „ab <Stichtag> kein Beitrag mehr“) dasselbe letzte zahlende Semester.
// Erfundene Daten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { financeKategorieFuerProfil, financeStichtag } from "../lib/finance-category.ts";
import { naechsterEinzug, naechstesEinzugsSemester, nextPeriod, periodLabel, periodOf } from "../lib/insights.ts";
import { nextFeeStop } from "../components/profile/profile-format.ts";

const IBAN_DE = "DE89370400440532013000";

/** Mittag Berliner Zeit an einem Tag (eindeutig, auch bei Zeitumstellung). */
const mittag = (ymd) => new Date(`${ymd}T12:00:00+01:00`);
const deutsch = (ymd) => ymd.split("-").reverse().join(".");

test("Kündigung: Export, Kachel und nextFeeStop nennen dasselbe letzte zahlende Semester", () => {
  const tage = [
    "2026-03-14", // Tag vor dem Stichtag SoSe
    "2026-03-15", // Stichtag SoSe
    "2026-06-30",
    "2026-09-30", // Tag vor dem Stichtag WiSe
    "2026-10-01", // Stichtag WiSe
    "2026-11-20",
    "2026-12-31",
    "2027-01-01",
    "2027-03-14",
  ];
  for (const tag of tage) {
    const profil = { id: "x", Status: "cancelled", Rolle: "member", Datum_Antrag: "2024-01-10", "Datum_Kündigung": tag };
    const letztes = periodOf(tag); // Semester, in dem gekündigt wurde: wird noch gezahlt
    const erstesFreies = nextPeriod(letztes);

    // Export: laufendes Semester Lastschrift, folgendes nicht mehr.
    const imLetzten = financeKategorieFuerProfil(profil, IBAN_DE, null, financeStichtag(letztes.semester, letztes.year));
    const imFreien = financeKategorieFuerProfil(profil, IBAN_DE, null, financeStichtag(erstesFreies.semester, erstesFreies.year));
    assert.equal(imLetzten, "debit", tag);
    assert.equal(imFreien, "cancelled", tag);
    // „aufnehmen“ ändert am freien Semester nichts.
    assert.equal(
      financeKategorieFuerProfil(profil, IBAN_DE, "include", financeStichtag(erstesFreies.semester, erstesFreies.year)),
      "cancelled",
      tag,
    );

    // Profil/Kündigungsmail: „ab <Stichtag des ersten freien Semesters> kein Beitrag mehr“.
    const stop = nextFeeStop(mittag(tag));
    assert.equal(stop.stichtag, deutsch(financeStichtag(erstesFreies.semester, erstesFreies.year)), tag);
    assert.equal(stop.semester, periodLabel(erstesFreies), tag);

    // Kachel am Kündigungstag: der nächste Einzug ist das erste freie Semester, das Profil zählt nicht.
    assert.deepEqual(naechstesEinzugsSemester(tag), erstesFreies, tag);
    const einzug = naechsterEinzug([profil], naechstesEinzugsSemester(tag), new Map(), new Map([["x", IBAN_DE]]));
    assert.equal(einzug.zahlend, 0, tag);
    assert.equal(einzug.label, stop.semester, tag);
  }
});

test("Gekündigt ohne Datum und offene Anträge: in keinem Semester eingezogen (Export und Kachel)", () => {
  const ohneDatum = { id: "a", Status: "cancelled", Rolle: "member", Datum_Antrag: "2024-01-10", "Datum_Kündigung": null };
  const antrag = { id: "b", Status: "applicant", Rolle: "member", Datum_Antrag: "2024-01-10" };
  const ibans = new Map([
    ["a", IBAN_DE],
    ["b", IBAN_DE],
  ]);
  for (const tag of ["2026-03-15", "2026-10-01", "2026-11-20"]) {
    const s = periodOf(tag);
    for (const override of [null, "include"]) {
      assert.equal(financeKategorieFuerProfil(ohneDatum, IBAN_DE, override, financeStichtag(s.semester, s.year)), "cancelled");
      assert.equal(financeKategorieFuerProfil(antrag, IBAN_DE, override, financeStichtag(s.semester, s.year)), "applicant");
    }
    const anpassungen = new Map([
      ["a", "include"],
      ["b", "include"],
    ]);
    assert.equal(naechsterEinzug([ohneDatum, antrag], naechstesEinzugsSemester(tag), anpassungen, ibans).zahlend, 0);
  }
});
