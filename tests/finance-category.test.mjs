// Tests für lib/finance-category.ts: Einordnung im Beitragseinzug und Debitor-BIC fürs SEPA-XML (Review
// Pflichtfelder M1/M2). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FINANCE_CATEGORIES,
  debitorBic,
  financeBrauchtIban,
  financeDatum,
  financeIban,
  financeKategorie,
  financeKategorieFuerProfil,
  financeStichtag,
} from "../lib/finance-category.ts";
import { NICHT_EWR_SEPA_LAENDER, istNichtEwrIban } from "../lib/iban.ts";
import { NICHT_EWR_SEPA_LAENDER as AUS_DEN_REGELN } from "../lib/member-rules.ts";

const IBAN_DE = "DE89370400440532013000";
const IBAN_AT = "AT611904300234573201";
const IBAN_CH = "CH9300762011623852957";
const IBAN_GB = "GB82WEST12345698765432";

const basis = (extra = {}) => ({
  override: null,
  status: "active",
  role: "member",
  joinedAt: "2025-01-10",
  cancelledAt: null,
  periodStartDay: "2026-10-01",
  iban: IBAN_DE,
  ...extra,
});

test("M1: bei EWR-IBANs nie eine gespeicherte BIC (NOTPROVIDED), auch keine gültige", () => {
  for (const iban of [IBAN_DE, IBAN_AT, "FR1420041010050500013M02606", "NO9386011117947"]) {
    for (const bic of ["COBADEFFXXX", "NTSBDEB1XXX", "COBADEF", "", null, undefined]) {
      assert.equal(debitorBic(iban, bic), "", `${iban} / ${bic}`);
    }
  }
  // Außerhalb des EWR: nur eine BIC im gültigen Format (für das spätere Export-Paket).
  assert.equal(debitorBic(IBAN_CH, "ubsw ch zh 80a"), "UBSWCHZH80A");
  assert.equal(debitorBic(IBAN_CH, "UBSW"), "");
  assert.equal(debitorBic(IBAN_GB, null), "");
});

test("M1: XML nutzt bei leerer BIC Othr/Id NOTPROVIDED (pain.008.001.02)", () => {
  const xml = readFileSync(new URL("../components/admin/FinanceExport.tsx", import.meta.url), "utf8");
  assert.match(xml, /pain\.008\.001\.02/);
  assert.match(xml, /<Othr>\s*<Id>NOTPROVIDED<\/Id>\s*<\/Othr>/);
  const server = readFileSync(new URL("../app/(intranet)/admin/actions/finance.ts", import.meta.url), "utf8");
  assert.match(server, /debitorBic\(ibanClean/);
});

test("M2: Konto außerhalb des EWR → eigene Kategorie, nie Lastschrift (auch nicht mit „aufnehmen“)", () => {
  assert.equal(financeKategorie(basis()), "debit");
  for (const iban of [IBAN_CH, IBAN_GB]) {
    assert.equal(financeKategorie(basis({ iban })), "non_eea", iban);
    assert.equal(financeKategorie(basis({ iban, override: "include" })), "non_eea", iban);
  }
  // Vorrang wie bisher: Anpassungen, Alumni, Kündigung, Freisemester, fehlende/ungültige IBAN.
  assert.equal(financeKategorie(basis({ iban: IBAN_CH, override: "exclude" })), "removed");
  assert.equal(financeKategorie(basis({ iban: IBAN_CH, role: "alumni" })), "alumni");
  assert.equal(financeKategorie(basis({ iban: IBAN_CH, joinedAt: "2026-10-05" })), "free_semester");
  assert.equal(financeKategorie(basis({ iban: "CH9300762011623852958" })), "invalid");
  assert.equal(financeKategorie(basis({ iban: "" })), "no_iban");
  assert.ok(FINANCE_CATEGORIES.includes("non_eea"));
});

test("M2: Vorschau kennt die Kategorie „Konto außerhalb des EWR – manuell“", () => {
  const vorschau = readFileSync(new URL("../components/admin/FinancePreview.tsx", import.meta.url), "utf8");
  assert.match(vorschau, /non_eea: \{\s*label: "Konto außerhalb des EWR – manuell"/);
});

test("Bisherige Regeln unverändert (Alumni, Kündigung, Freisemester, Anpassungen)", () => {
  assert.equal(financeKategorie(basis({ status: "alumni" })), "alumni");
  assert.equal(financeKategorie(basis({ role: "alumni", override: "include" })), "debit");
  assert.equal(financeKategorie(basis({ cancelledAt: "2026-09-30" })), "cancelled");
  assert.equal(financeKategorie(basis({ cancelledAt: "2026-10-01" })), "debit");
  assert.equal(financeKategorie(basis({ joinedAt: "2026-10-01" })), "free_semester");
  assert.equal(financeKategorie(basis({ override: "free_semester" })), "free_semester");
  assert.equal(financeKategorie(basis({ iban: "DE89370400440532013001" })), "invalid");
});

test("Nicht-EWR-Liste liegt in lib/iban.ts, die Regeln exportieren dieselbe", () => {
  assert.equal(AUS_DEN_REGELN, NICHT_EWR_SEPA_LAENDER);
  assert.equal(istNichtEwrIban(IBAN_CH), true);
  assert.equal(istNichtEwrIban(" ch93 0076"), true);
  assert.equal(istNichtEwrIban(IBAN_DE), false);
  assert.equal(istNichtEwrIban(""), false);
});

test("Einordnung direkt aus der profiles-Zeile (Finanzexport und Insights, eine Funktion)", () => {
  const start = financeStichtag("WiSe", 2026);
  assert.equal(start, "2026-10-01");
  assert.equal(financeStichtag("SoSe", 2027), "2027-03-15");
  const zeile = (x = {}) => ({ Status: " Active ", Rolle: "Member", Datum_Antrag: "2025-01-10", "Datum_Kündigung": null, ...x });
  assert.equal(financeKategorieFuerProfil(zeile(), " de89 3704 0044 0532 0130 00 ", null, start), "debit");
  assert.equal(financeKategorieFuerProfil(zeile({ Rolle: "ALUMNI" }), IBAN_DE, null, start), "alumni");
  assert.equal(financeKategorieFuerProfil(zeile({ Datum_Antrag: "2026-10-01T08:00:00Z" }), IBAN_DE, null, start), "free_semester");
  assert.equal(financeKategorieFuerProfil(zeile({ "Datum_Kündigung": "2026-09-30" }), IBAN_DE, null, start), "cancelled");
  assert.equal(financeKategorieFuerProfil(zeile(), IBAN_CH, null, start), "non_eea");
  assert.equal(financeKategorieFuerProfil(zeile(), null, null, start), "no_iban");
  assert.equal(financeKategorieFuerProfil(zeile(), IBAN_DE, "exclude", start), "removed");
  // IBAN nur nötig, wenn sie entscheidet.
  assert.equal(financeBrauchtIban(zeile(), null, start), true);
  assert.equal(financeBrauchtIban(zeile({ Rolle: "alumni" }), null, start), false);
  assert.equal(financeBrauchtIban(zeile({ Rolle: "alumni" }), "include", start), true);
  assert.equal(financeBrauchtIban(zeile(), "free_semester", start), false);
  assert.equal(financeDatum("2026-10-01"), "2026-10-01");
  assert.equal(financeDatum(""), null);
  assert.equal(financeDatum("kein Datum"), null);
  assert.equal(financeIban(" at61 1904 3002 3457 3201 "), IBAN_AT);
});

test("Gekündigt ohne Datum oder vor dem Stichtag und offene Anträge: nie eingezogen, auch nicht mit „aufnehmen“", () => {
  assert.ok(FINANCE_CATEGORIES.includes("applicant"));
  // Bis 20.11.2026 (auch origin/dev) wäre jeder dieser Fälle eine Lastschrift gewesen.
  for (const extra of [
    { status: "cancelled", cancelledAt: null }, // ohne Kündigungsdatum
    { status: "cancelled", cancelledAt: null, override: "include" },
    { status: "cancelled", cancelledAt: "2026-09-30", override: "include" }, // „aufnehmen“ hebt nicht auf
    { status: "cancelled", cancelledAt: null, role: "alumni", override: "include" },
  ]) {
    assert.equal(financeKategorie(basis(extra)), "cancelled", JSON.stringify(extra));
  }
  // Gekündigt am oder nach dem Stichtag: das laufende Semester wird noch eingezogen (wie Kündigungsmail/Profil).
  assert.equal(financeKategorie(basis({ status: "cancelled", cancelledAt: "2026-10-01" })), "debit");
  assert.equal(financeKategorie(basis({ status: "cancelled", cancelledAt: "2026-11-15" })), "debit");
  // ... aber die übrigen Regeln gelten weiter (Alumni, Freisemester, entfernen, IBAN).
  assert.equal(financeKategorie(basis({ status: "cancelled", cancelledAt: "2026-11-15", role: "alumni" })), "alumni");
  assert.equal(financeKategorie(basis({ status: "cancelled", cancelledAt: "2026-11-15", override: "exclude" })), "removed");
  assert.equal(financeKategorie(basis({ status: "cancelled", cancelledAt: "2026-11-15", iban: "" })), "no_iban");
  for (const extra of [
    { status: "applicant" },
    { status: "applicant", joinedAt: "2025-01-10" }, // Antrag vor dem Stichtag
    { status: "applicant", override: "include" },
  ]) {
    assert.equal(financeKategorie(basis(extra)), "applicant", JSON.stringify(extra));
  }
  // Aktives Mitglied mit Kündigungsdatum ab dem Stichtag (Status noch nicht umgestellt): Regel nach Datum wie bisher.
  assert.equal(financeKategorie(basis({ cancelledAt: "2026-10-01" })), "debit");
  // Auch über die profiles-Zeile (Groß-/Kleinschreibung, Leerraum).
  const start = financeStichtag("WiSe", 2026);
  assert.equal(financeKategorieFuerProfil({ Status: " Cancelled " }, IBAN_DE, "include", start), "cancelled");
  assert.equal(financeKategorieFuerProfil({ Status: "APPLICANT", Datum_Antrag: "2025-01-10" }, IBAN_DE, null, start), "applicant");
  assert.equal(financeBrauchtIban({ Status: "cancelled" }, "include", start), false);
  assert.equal(financeBrauchtIban({ Status: "cancelled", "Datum_Kündigung": "2026-10-02" }, null, start), true);
  // Export zählt die Kategorie, Vorschau zeigt sie (nur mit Treffern).
  const server = readFileSync(new URL("../app/(intranet)/admin/actions/finance.ts", import.meta.url), "utf8");
  assert.equal((server.match(/applicant: 0,/g) ?? []).length, 2);
  const vorschau = readFileSync(new URL("../components/admin/FinancePreview.tsx", import.meta.url), "utf8");
  assert.match(vorschau, /applicant: \{ label: "Antrag offen"/);
});
