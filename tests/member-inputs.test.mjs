// Tests für lib/member-inputs.ts (Eingabehilfen der Mitgliederformulare, Fixrunde PR 2). Daten erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bicLandHinweis,
  gleicheHandyEingabe,
  handyBeimTippen,
  handyBeimVerlassen,
  ibanBeimTippen,
  plzInputMode,
} from "../lib/member-inputs.ts";
import { pruefeBic } from "../lib/member-rules.ts";

test("U1: bloßer Fokus ändert die Handynummer nicht", () => {
  for (const alt of ["0176 12", "+49 0176 1234567", "176 1234567", "+43 664 1234567", "max@example.org", ""]) {
    assert.deepEqual(handyBeimVerlassen({ land: "DE", nummer: alt }, false), { land: "DE", nummer: alt });
  }
  // Selbst bearbeitet → formatiert.
  assert.deepEqual(handyBeimVerlassen({ land: "DE", nummer: "0176 12345678" }, true), { land: "DE", nummer: "176 12345678" });
  assert.deepEqual(handyBeimVerlassen({ land: "DE", nummer: "+43 664 1234567" }, true), { land: "AT", nummer: "664 1234567" });
});

test("U3: Handy wird beim Tippen formatiert, nur mit Cursor am Ende und nicht beim Löschen", () => {
  assert.deepEqual(handyBeimTippen("017612345678", "DE", true, false), { land: "DE", nummer: "176 12345678" });
  assert.deepEqual(handyBeimTippen("+436641234567", "DE", true, false), { land: "AT", nummer: "664 1234567" });
  // Cursor mittendrin oder Löschen: roh lassen.
  assert.deepEqual(handyBeimTippen("0176123", "DE", false, false), { land: "DE", nummer: "0176123" });
  assert.deepEqual(handyBeimTippen("176 1234567 ", "DE", true, true), { land: "DE", nummer: "176 1234567 " });
  // Unvollständig bleibt stehen.
  assert.deepEqual(handyBeimTippen("0", "DE", true, false), { land: "DE", nummer: "0" });
});

test("U1: gleiche Handy-Eingabe nach Formatierung", () => {
  assert.ok(gleicheHandyEingabe({ land: "DE", nummer: "0176 12" }, { land: "DE", nummer: "176 12" }));
  assert.ok(gleicheHandyEingabe({ land: "DE", nummer: "+49 0176 1234567" }, { land: "DE", nummer: "176 1234567" }));
  assert.ok(!gleicheHandyEingabe({ land: "DE", nummer: "176 1234567" }, { land: "DE", nummer: "176 7654321" }));
  assert.ok(!gleicheHandyEingabe({ land: "AT", nummer: "664 1234567" }, { land: "DE", nummer: "664 1234567" }));
});

test("U3: IBAN in Viererblöcken nur mit Cursor am Ende", () => {
  assert.deepEqual(ibanBeimTippen("DE8937040044", 12), { wert: "DE89 3704 0044", cursor: 14 });
  assert.deepEqual(ibanBeimTippen("DE89 37X04 0044", 7), { wert: "DE89 37X04 0044", cursor: 7 });
});

test("U4: BIC-Länderhinweis im Browser deckt sich mit der Regel auf dem Server", () => {
  const faelle = [
    ["DE89370400440532013000", "COBADEFFXXX"],
    ["FR1420041010050500013M02606", "NTSBDEB1XXX"],
    ["AT611904300234573201", "COBADEFFXXX"],
    ["GB82WEST12345698765432", "ABCDJESHXXX"],
    ["FI2112345600000785", "ABCDAXHHXXX"],
    ["DE89370400440532013001", "COBAATWWXXX"], // ungültige IBAN: kein Abgleich
    ["DE89370400440532013000", "COBA"], // ungültige BIC: kein Hinweis
  ];
  for (const [iban, bic] of faelle) {
    const server = pruefeBic(bic, iban, { alumni: false, wer: "mitglied" }).hinweis === "bic_land";
    assert.equal(bicLandHinweis(iban, bic) !== null, server, `${iban} / ${bic}`);
  }
  assert.equal(bicLandHinweis("", ""), null);
});

test("U4: Gebietsliste der BIC-Länder gleich wie in lib/member-rules.ts", () => {
  const block = (datei) => {
    const text = readFileSync(new URL(datei, import.meta.url), "utf8");
    return text.match(/const BIC_LAENDER_ZU_IBAN[^{]*\{([^}]*)\}/)[1].replace(/\s+/g, "");
  };
  assert.equal(block("../lib/member-inputs.ts"), block("../lib/member-rules.ts"));
});

test("U5: Ziffern-Tastatur für rein numerische PLZ", () => {
  for (const land of ["DE", "AT", "CH", "", null]) assert.equal(plzInputMode(land), "numeric");
  for (const land of ["GB", "NL", "PT", "PL", "MT", "US"]) assert.equal(plzInputMode(land), "text");
});
