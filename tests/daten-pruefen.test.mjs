// Tests für components/member/daten-pruefen.ts (Seite „Daten prüfen“, Design-Runde 19.11.2026). Daten erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anschriftOptional,
  dankeText,
  dankeTitel,
  datenTitel,
  geaenderteFelder,
  gruenNachPruefung,
  knopfText,
  markierungenNachPruefung,
  meldungsOrt,
  offeneAngaben,
  ohneFeld,
  zaehlerText,
  zuSendendeWerte,
} from "../components/member/daten-pruefen.ts";

const START = {
  vorname: "Erika",
  nachname: "Muster",
  geburtsdatum: "",
  strasse: "Musterstraße",
  hausnummer: "12",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handyLand: "DE",
  handynummer: "176 1234567",
  iban: "DE89 3704 0044 0532 0130 01",
};

test("Überschrift und Danke mit und ohne Vornamen", () => {
  assert.equal(datenTitel("Erika", false), "Hallo Erika, bitte aktualisiere deine Daten.");
  assert.equal(datenTitel(" Erika ", true), "Hallo Erika, stimmen deine Daten noch?");
  assert.equal(datenTitel("", false), "Bitte aktualisiere deine Daten.");
  assert.equal(datenTitel("  ", true), "Stimmen deine Daten noch?");
  assert.equal(dankeTitel("Erika"), "Danke, Erika.");
  assert.equal(dankeTitel(""), "Danke.");
  assert.equal(dankeText(true), "Deine Daten sind aktualisiert.");
  assert.equal(dankeText(false), "Deine Daten sind bestätigt.");
});

test("Zähler und Knopf wie in der Skizze", () => {
  assert.equal(zaehlerText(0), "Alles vollständig");
  assert.equal(zaehlerText(1), "1 Angabe fehlt noch");
  assert.equal(zaehlerText(3), "3 Angaben fehlen noch");
  assert.equal(offeneAngaben({ iban: "x", plz: "", ort: undefined, geburtsdatum: "y" }), 2);
  assert.equal(knopfText(false, 0), "Stimmt alles, bestätigen");
  assert.equal(knopfText(true, 0), "Speichern");
  assert.equal(knopfText(false, 2), "Speichern");
  assert.equal(knopfText(true, 1), "Speichern");
});

test("Geändert: Text getrimmt, Handy nach Formatierung, IBAN in Viererblöcken", () => {
  assert.deepEqual(geaenderteFelder(START, { ...START }), []);
  assert.deepEqual(geaenderteFelder(START, { ...START, vorname: "Erika " }), []);
  // Bloß umformatiert gilt nicht als Änderung.
  assert.deepEqual(geaenderteFelder(START, { ...START, iban: "DE89370400440532013001" }), []);
  assert.deepEqual(geaenderteFelder(START, { ...START, handynummer: "1761234567" }), []);
  assert.deepEqual(geaenderteFelder(START, { ...START, iban: "DE89 3704 0044 0532 0130 00" }), ["iban"]);
  assert.deepEqual(geaenderteFelder(START, { ...START, handyLand: "AT" }), ["handynummer"]);
  assert.deepEqual(geaenderteFelder(START, { ...START, geburtsdatum: "2001-04-12", plz: "93053" }), ["geburtsdatum", "plz"]);
});

test("Gesendet wird nur, was geändert ist; Handy immer als Paar", () => {
  assert.deepEqual(zuSendendeWerte(START, { ...START }), []);
  assert.deepEqual(zuSendendeWerte(START, { ...START, geburtsdatum: "2001-04-12" }), [["geburtsdatum", "2001-04-12"]]);
  assert.deepEqual(zuSendendeWerte(START, { ...START, handynummer: "151 2345678" }), [
    ["handyLand", "DE"],
    ["handynummer", "151 2345678"],
  ]);
  // Geleert wird als leere Zeichenkette geschickt (der Server liest das als Eingabe).
  assert.deepEqual(zuSendendeWerte(START, { ...START, strasse: "" }), [["strasse", ""]]);
  // Unveränderte IBAN geht nicht noch einmal an den Server.
  const gesendet = zuSendendeWerte(START, { ...START, ort: "Kelheim" }).map(([feld]) => feld);
  assert.deepEqual(gesendet, ["ort"]);
});

test("Markierungen nach der Prüfung: vollständig = Server, sonst bleiben Mängel unveränderter Felder", () => {
  const anfang = { geburtsdatum: "Bitte gib dein Geburtsdatum an.", handynummer: "Alte Nummer", iban: "Prüfziffer" };
  // Vollständig: genau die Meldungen des Servers.
  assert.deepEqual(
    markierungenNachPruefung({ anfang, pruefung: { iban: "Neu" }, vollstaendig: true, geaendert: ["geburtsdatum"] }),
    { iban: "Neu" },
  );
  // Nur Formularfehler: geänderte Felder nach Server, unveränderte behalten ihren Mangel.
  assert.deepEqual(
    markierungenNachPruefung({ anfang, pruefung: { iban: "Prüfziffer" }, vollstaendig: false, geaendert: ["geburtsdatum", "iban"] }),
    { handynummer: "Alte Nummer", iban: "Prüfziffer" },
  );
  assert.deepEqual(markierungenNachPruefung({ anfang: {}, pruefung: {}, vollstaendig: false, geaendert: [] }), {});
});

test("Grün nur für geprüfte Felder, die markiert oder geändert waren", () => {
  const anfang = { geburtsdatum: "fehlt", iban: "falsch" };
  assert.deepEqual(gruenNachPruefung(anfang, ["geburtsdatum"], { iban: "falsch" }), ["geburtsdatum"]);
  assert.deepEqual(gruenNachPruefung(anfang, ["geburtsdatum", "iban", "plz"], {}).sort(), ["geburtsdatum", "iban", "plz"]);
  assert.deepEqual(gruenNachPruefung({}, [], {}), []);
});

test("Beim Tippen fällt nur die Markierung des bearbeiteten Felds weg", () => {
  const m = { plz: "a", ort: "b", iban: "c" };
  assert.deepEqual(ohneFeld(m, "plz", "ort"), { iban: "c" });
  assert.equal(ohneFeld(m, "vorname"), m);
});

test("N1: gleiche Meldung an mehreren Anschriftteilen steht und zählt nur einmal, „optional“ dann weg", () => {
  const ewr = "Für eine IBAN außerhalb des EWR brauchen wir die Anschrift.";
  const m = { strasse: ewr, hausnummer: ewr, plz: ewr, ort: ewr, iban: "Prüfziffer", geburtsdatum: "fehlt" };
  assert.deepEqual(meldungsOrt(m), {
    iban: "iban",
    geburtsdatum: "geburtsdatum",
    strasse: "strasse",
    hausnummer: "strasse",
    plz: "strasse",
    ort: "strasse",
  });
  assert.equal(offeneAngaben(m), 3);
  assert.equal(zaehlerText(offeneAngaben(m)), "3 Angaben fehlen noch");
  assert.equal(anschriftOptional(m), false);
  // Verschiedene Meldungen bleiben einzeln (PLZ-Format und fehlender Ort).
  const zwei = { plz: "In Deutschland hat die PLZ 5 Ziffern.", ort: "Bitte trag den Ort ein." };
  assert.deepEqual(meldungsOrt(zwei), { plz: "plz", ort: "ort" });
  assert.equal(offeneAngaben(zwei), 2);
  assert.equal(anschriftOptional({ iban: "x" }), true);
  assert.equal(anschriftOptional({}), true);
});

test("M1: ohne vollständige Bewertung bleiben nur Bestandsmängel von Handy/Geburtsdatum aus der ersten Bewertung", () => {
  const anfang = { strasse: "EWR", plz: "EWR", handynummer: "Alt", geburtsdatum: "Ungültig" };
  assert.deepEqual(
    markierungenNachPruefung({ anfang, pruefung: { iban: "Neu" }, vollstaendig: false, geaendert: ["iban", "geburtsdatum"] }),
    { handynummer: "Alt", iban: "Neu" },
  );
});
