// Tests für lib/csv.ts und lib/sepa.ts – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeCsvCell, joinCsvRow, neutralizeFormula } from "../lib/csv.ts";
import { escapeXml, sepaDate } from "../lib/sepa.ts";

test("Formel-Anfänge werden entschärft", () => {
  for (const value of [
    "=HYPERLINK(\"https://example.org\";\"x\")",
    "+SUM(A1:A2)",
    "-2+3+cmd|' /C calc'!A0",
    "@SUM(1,2)",
    "\t=1+1",
    "\r=1+1",
  ]) {
    assert.ok(neutralizeFormula(value).startsWith("'"), JSON.stringify(value));
  }
});

test("Telefonnummern und Beträge bleiben unverändert", () => {
  for (const value of ["+49 170 1234567", "+49 (0)941 123-45", "-12,50", "93047", "Regensburg", ""]) {
    assert.equal(neutralizeFormula(value), value);
  }
});

test("CSV-Quoting nach Trennzeichen", () => {
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
  assert.equal(escapeCsvCell("a;b", ";"), '"a;b"');
  assert.equal(escapeCsvCell("a,b", ";"), "a,b");
  assert.equal(escapeCsvCell('Sag "Hallo"'), '"Sag ""Hallo"""');
  assert.equal(escapeCsvCell("Zeile1\nZeile2"), '"Zeile1\nZeile2"');
  assert.equal(escapeCsvCell("=1+1;x", ";"), "\"'=1+1;x\"");
  assert.equal(escapeCsvCell(null), "");
});

test("joinCsvRow kombiniert beides", () => {
  assert.equal(
    joinCsvRow(["Max Mustermann", "DE89370400440532013000", "=evil()", "15,00"], ";"),
    "Max Mustermann;DE89370400440532013000;'=evil();15,00"
  );
});

test("escapeXml escaped Sonderzeichen und entfernt ungültige Steuerzeichen", () => {
  assert.equal(escapeXml(`<Nm>&"'`), "&lt;Nm&gt;&amp;&quot;&apos;");
  assert.equal(escapeXml("A\u0000B\u0008C\u001FD"), "ABCD");
  assert.equal(escapeXml("Zeile\nTab\t"), "Zeile\nTab\t");
  assert.equal(escapeXml(null), "");
});

test("sepaDate akzeptiert nur YYYY-MM-DD", () => {
  assert.equal(sepaDate("2026-10-01", "2026-01-01"), "2026-10-01");
  assert.equal(sepaDate("2026-10-01</DtOfSgntr>", "2026-01-01"), "2026-01-01");
  assert.equal(sepaDate(null, "2026-01-01"), "2026-01-01");
});
