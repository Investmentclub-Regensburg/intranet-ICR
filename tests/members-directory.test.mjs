// Tests für das Mitgliederverzeichnis (Verein › Mitglieder, Design-Runde 19.11.2026). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtereVerzeichnis, initialen } from "../components/members/directory.ts";

const LISTE = [
  { name: "Lena Hofmann", studiengang: "BWL" },
  { name: "Jonas Berger", studiengang: "VWL" },
  { name: "Leon Koch", studiengang: "" },
];

test("leere Suche zeigt alle", () => {
  assert.equal(filtereVerzeichnis(LISTE, "").length, 3);
  assert.equal(filtereVerzeichnis(LISTE, "   ").length, 3);
});

test("filtert nach Teil des Namens, Groß-/Kleinschreibung egal", () => {
  assert.deepEqual(filtereVerzeichnis(LISTE, " LE ").map((m) => m.name), ["Lena Hofmann", "Leon Koch"]);
  assert.deepEqual(filtereVerzeichnis(LISTE, "berger").map((m) => m.name), ["Jonas Berger"]);
  assert.deepEqual(filtereVerzeichnis(LISTE, "BWL"), []);
});

test("Initialen", () => {
  assert.equal(initialen("Lena Hofmann"), "LH");
  assert.equal(initialen("anna maria keller"), "AM");
  assert.equal(initialen("—"), "—");
  assert.equal(initialen(""), "");
});
