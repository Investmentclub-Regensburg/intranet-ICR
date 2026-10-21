// Tests für lib/bvh-phone.ts (Telefon im BVH-Mitglieder-Upload) – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BVH_PHONE_MAX_LENGTH, formatBvhPhone } from "../lib/bvh-phone.ts";
import { escapeCsvCell } from "../lib/csv.ts";

test("Leerzeichen und Trennzeichen fallen weg", () => {
  // So gespeichert seit der Registrierung („+49 “ + Eingabe): 16 Zeichen, beim BVH zu lang.
  assert.equal(formatBvhPhone("+49 176 20917089"), "+4917620917089");
  assert.equal(formatBvhPhone("+49 176/209-170 89"), "+4917620917089");
  assert.equal(formatBvhPhone(" 0176 20917089 "), "017620917089");
});

test("Die 0 der Vorwahl entfällt nach +49", () => {
  assert.equal(formatBvhPhone("+49 0176 20917089"), "+4917620917089");
  assert.equal(formatBvhPhone("+49 (0)941 123-45"), "+4994112345");
  assert.equal(formatBvhPhone("+490176 20917089"), "+4917620917089");
  assert.equal(formatBvhPhone("+49 (0) 0176 20917089"), "+4917620917089");
});

test("00 am Anfang gilt wie +", () => {
  assert.equal(formatBvhPhone("0049 176 20917089"), "+4917620917089");
  assert.equal(formatBvhPhone("0049 0176 20917089"), "+4917620917089");
  assert.equal(formatBvhPhone("0039 06 1234 5678"), "+390612345678");
});

test("Andere Länder behalten die 0 nach der Vorwahl", () => {
  assert.equal(formatBvhPhone("+39 06 1234 5678"), "+390612345678");
  assert.equal(formatBvhPhone("+225 07 12 34 56 78"), "+2250712345678");
});

test("Zu lange Nummern bleiben leer statt den Upload abzubrechen", () => {
  assert.equal(BVH_PHONE_MAX_LENGTH, 15);
  assert.equal(formatBvhPhone("+12 3456 7890 1234"), "+12345678901234");
  assert.equal(formatBvhPhone("+12 3456 7890 12345"), "");
  assert.equal(formatBvhPhone("1234 5678 9012 345"), "123456789012345");
  assert.equal(formatBvhPhone("1234 5678 9012 3456"), "");
});

test("Leere Angaben ergeben ein leeres Feld", () => {
  for (const value of [null, undefined, "", "   ", "+", "()", "00"]) {
    assert.equal(formatBvhPhone(value), "", JSON.stringify(value));
  }
});

test("Die Nummer geht ohne Apostroph in die CSV", () => {
  assert.equal(escapeCsvCell(formatBvhPhone("+49 176 20917089")), "+4917620917089");
});
