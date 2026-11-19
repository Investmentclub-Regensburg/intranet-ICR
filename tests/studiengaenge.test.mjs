// Tests für lib/studiengaenge.ts (Studiengang als Auswahl). Schreibweisen aus der Zählung vom 19.11.2026
// (studiengang-auswahl.md, nur Schreibweisen, keine Personen).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEIN_STUDIUM,
  SONSTIGES,
  STUDIENGAENGE,
  STUDIENGANG_NAMEN,
  auswahlAusWert,
  eindeutigerTreffer,
  istLeer,
  normalisiereStudiengang,
  pruefeStudiengang,
  schluessel,
  sucheStudiengaenge,
  tippAbstand,
} from "../lib/studiengaenge.ts";

/** Alle 48 Schreibweisen der Produktion → erwartete Zuordnung. */
const SCHREIBWEISEN = [
  ["BWL", "sicher", "BWL"],
  ["Betriebswirtschaftslehre", "sicher", "BWL"],
  ["Bwl", "sicher", "BWL"],
  ["Betriebswirtschaft", "sicher", "BWL"],
  ["BW", "vorschlag", "BWL"],
  ["Betriebswirtschaftlehre", "sicher", "BWL"],
  ["BWL - Finance", "vorschlag", "BWL"],
  ["BWL/Finance", "vorschlag", "BWL"],
  ["BWL/ Medienwissenschaften", "vorschlag", "BWL"],
  ["Business Management", "sicher", "Business Management"],
  ["Business Managment", "sicher", "Business Management"],
  ["Busines Management", "sicher", "Business Management"],
  ["Business-Management", "sicher", "Business Management"],
  ["BM", "vorschlag", "Business Management"],
  ["Immobilienwirtschaft", "sicher", "Immobilienwirtschaft"],
  ["Immmobilienwirtschaft", "sicher", "Immobilienwirtschaft"],
  ["Wirtschaftsinformatik", "sicher", "Wirtschaftsinformatik"],
  ["Angewandte Wirtschaftsinformatik", "vorschlag", "Wirtschaftsinformatik"],
  ["VWL", "sicher", "VWL"],
  ["Digital Business", "sicher", "Digital Business"],
  ["Digital Business Management", "sicher", "Digital Business Management"],
  ["Digital Business Managment", "sicher", "Digital Business Management"],
  ["Digital Buisness", "sicher", "Digital Business"],
  ["DBM", "vorschlag", "Digital Business Management"],
  ["IVWL", "sicher", "Internationale VWL"],
  ["Internationale VWL", "sicher", "Internationale VWL"],
  ["Internationale Volkswirtschaftslehre", "sicher", "Internationale VWL"],
  ["Business, Economics & Psychology", "sicher", "Business, Economics & Psychology"],
  ["Business, Economics and Psychology", "sicher", "Business, Economics & Psychology"],
  ["Mathematik", "sicher", "Mathematik"],
  ["Jura", "sicher", "Jura"],
  ["Rechtswissenschaften", "sicher", "Jura"],
  ["International Relations and Management", "sicher", "International Relations and Management"],
  ["International relations and management", "sicher", "International Relations and Management"],
  ["Sonstiges", "sicher", SONSTIGES],
  ["Sonstige", "sicher", SONSTIGES],
  ["Geisteswissenschaften", "offen", "Geisteswissenschaften"],
  ["Naturwissenschaften", "offen", "Naturwissenschaften"],
  ["International Business Management", "sicher", "International Business Management"],
  ["Architektur", "sicher", "Architektur"],
  ["Elektronik", "vorschlag", "Elektro- und Informationstechnik"],
  ["KI & Data Science", "sicher", "KI und Data Science"],
  ["Wirtschaftschemie", "sicher", "Wirtschaftschemie"],
  ["Wirtschaftswissenschaften", "offen", "Wirtschaftswissenschaften"],
  ["Diplom-Finanzwirt (FH)", "offen", "Diplom-Finanzwirt (FH)"],
  ["Kein Student", "sicher", KEIN_STUDIUM],
  ["", "offen", null],
  ["-", "offen", null],
];

test("alle 48 Schreibweisen der Zählung", () => {
  assert.equal(SCHREIBWEISEN.length, 48);
  for (const [roh, sicherheit, wert] of SCHREIBWEISEN) {
    assert.deepEqual(normalisiereStudiengang(roh), { wert, sicherheit }, roh);
    if (wert && sicherheit !== "offen") assert.ok(STUDIENGANG_NAMEN.includes(wert), wert);
  }
});

test("unklare Fälle sind nie sicher", () => {
  for (const roh of [
    "BWL/ Medienwissenschaften",
    "BWL / Medienwissenschaften",
    "bwl/medienwissenschaften",
    "Geisteswissenschaften",
    "geisteswissenschaften ",
    "Naturwissenschaften",
    "Wirtschaftswissenschaften",
    "BWL - Finance",
    "BW",
    "BM",
    "DBM",
  ]) {
    assert.notEqual(normalisiereStudiengang(roh).sicherheit, "sicher", roh);
  }
});

test("Groß-/Kleinschreibung, Bindestriche und Leerzeichen", () => {
  assert.deepEqual(normalisiereStudiengang("  bwl  "), { wert: "BWL", sicherheit: "sicher" });
  assert.deepEqual(normalisiereStudiengang("WIRTSCHAFTSINFORMATIK"), { wert: "Wirtschaftsinformatik", sicherheit: "sicher" });
  assert.deepEqual(normalisiereStudiengang("Business  -  Management"), { wert: "Business Management", sicherheit: "sicher" });
  assert.deepEqual(normalisiereStudiengang("business, economics und psychology"), {
    wert: "Business, Economics & Psychology",
    sicherheit: "sicher",
  });
  assert.deepEqual(normalisiereStudiengang("Humanmedizin"), { wert: "Medizin", sicherheit: "sicher" });
  assert.equal(schluessel("Business-Management"), schluessel("business management"));
});

test("Tippfehler: ein Zeichen sicher, zwei Zeichen nur Vorschlag, kurze Werte nie", () => {
  assert.equal(tippAbstand("digital buisness", "digital business"), 1);
  assert.equal(tippAbstand("abc", "abcdefgh", 2), 3);
  // Plural = zwei Zeichen: nur Vorschlag.
  assert.deepEqual(normalisiereStudiengang("Medienwissenschaften"), { wert: "Medienwissenschaft", sicherheit: "vorschlag" });
  assert.deepEqual(normalisiereStudiengang("Wirtschaftsinformatk"), { wert: "Wirtschaftsinformatik", sicherheit: "sicher" });
  assert.deepEqual(normalisiereStudiengang("Wirtschftsinformatk"), { wert: "Wirtschaftsinformatik", sicherheit: "vorschlag" });
  // „Physk“ ist zu kurz für eine Tippfehler-Zuordnung.
  assert.equal(normalisiereStudiengang("Physk").sicherheit, "offen");
  // Gibt es zwei ähnliche Listennamen, ist nichts sicher.
  assert.notEqual(normalisiereStudiengang("Medieninformatk").sicherheit, "offen");
});

test("Liste: eindeutig, Reihenfolge, Sonstiges und Kein Studium am Ende", () => {
  assert.equal(new Set(STUDIENGANG_NAMEN).size, STUDIENGANG_NAMEN.length);
  assert.deepEqual(STUDIENGANG_NAMEN.slice(0, 6), [
    "BWL",
    "Business Management",
    "Immobilienwirtschaft",
    "Wirtschaftsinformatik",
    "VWL",
    "Digital Business",
  ]);
  assert.deepEqual(STUDIENGANG_NAMEN.slice(-2), [SONSTIGES, KEIN_STUDIUM]);
  // Nach den bisher angegebenen: alphabetisch.
  const start = STUDIENGANG_NAMEN.indexOf("Wirtschaftschemie") + 1;
  const rest = STUDIENGANG_NAMEN.slice(start, -2);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, "de")));
  assert.ok(rest.includes("Lehramt") && rest.includes("Informatik") && rest.includes("Soziale Arbeit"));
  // Gespeicherte Namen halten die Längengrenze und beginnen nicht wie eine Formel.
  for (const s of STUDIENGAENGE) {
    assert.ok(s.name.length <= 150 && !/^[=+\-@]/.test(s.name), s.name);
  }
});

test("Suche: Langform und Abkürzung finden denselben Eintrag", () => {
  assert.equal(sucheStudiengaenge("Betriebs")[0].name, "BWL");
  assert.equal(sucheStudiengaenge("bwl")[0].name, "BWL");
  assert.equal(sucheStudiengaenge("Volkswirt")[0].name, "VWL");
  assert.ok(sucheStudiengaenge("informatik").some((s) => s.name === "Medieninformatik"));
  // Sonstiges steht bei jeder Suche am Ende, auch ohne Treffer.
  assert.deepEqual(
    sucheStudiengaenge("xyzxyz").map((s) => s.name),
    [SONSTIGES]
  );
  assert.equal(sucheStudiengaenge("bwl").at(-1).name, SONSTIGES);
  // Ohne Text: ganze Liste; „Kein Studium“ lässt sich ausblenden.
  assert.equal(sucheStudiengaenge("").length, STUDIENGAENGE.length);
  assert.ok(!sucheStudiengaenge("", { ohneKeinStudium: true }).some((s) => s.name === KEIN_STUDIUM));
  assert.ok(!sucheStudiengaenge("kein", { ohneKeinStudium: true }).some((s) => s.name === KEIN_STUDIUM));
});

test("eindeutiger Treffer beim Verlassen des Felds", () => {
  assert.equal(eindeutigerTreffer("betriebswirtschaftslehre"), "BWL");
  assert.equal(eindeutigerTreffer("BW"), null);
  assert.equal(eindeutigerTreffer("Kein Student"), KEIN_STUDIUM);
  assert.equal(eindeutigerTreffer("Kein Student", { ohneKeinStudium: true }), null);
  assert.equal(eindeutigerTreffer(""), null);
});

test("Prüfung auf dem Server: nur Liste oder Sonstiges mit Freitext", () => {
  assert.deepEqual(pruefeStudiengang("BWL", ""), { ok: true, wert: "BWL" });
  // Freitext wird bei einem Listennamen ignoriert.
  assert.deepEqual(pruefeStudiengang("VWL", "irgendwas"), { ok: true, wert: "VWL" });
  assert.equal(pruefeStudiengang("", "").ok, false);
  assert.equal(pruefeStudiengang("bwl", "").ok, false); // nur exakte Listennamen
  assert.equal(pruefeStudiengang("Erfundenes Fach", "").ok, false);
  assert.equal(pruefeStudiengang(["BWL"], "").ok, false);
  assert.equal(pruefeStudiengang(KEIN_STUDIUM, "", { ohneKeinStudium: true }).ok, false);
  assert.deepEqual(pruefeStudiengang(KEIN_STUDIUM, ""), { ok: true, wert: KEIN_STUDIUM });

  // Sonstiges: Freitext Pflicht, Längengrenze und Formelanfang wie bisher.
  assert.equal(pruefeStudiengang(SONSTIGES, "").ok, false);
  assert.equal(pruefeStudiengang(SONSTIGES, "   ").ok, false);
  assert.equal(pruefeStudiengang(SONSTIGES, "-").ok, false);
  assert.deepEqual(pruefeStudiengang(SONSTIGES, "  Sport   und Medien "), { ok: true, wert: "Sport und Medien" });
  assert.equal(pruefeStudiengang(SONSTIGES, "x".repeat(151)).ok, false);
  assert.equal(pruefeStudiengang(SONSTIGES, "x".repeat(150)).ok, true);
  assert.equal(pruefeStudiengang(SONSTIGES, "=HYPERLINK()").ok, false);
  // Freitext, der sicher einem Listennamen entspricht, wird als Listenname gespeichert.
  assert.deepEqual(pruefeStudiengang(SONSTIGES, "bwl"), { ok: true, wert: "BWL" });
  // „Sonstige“ im Freitext bleibt Freitext (sonst entstünde „Sonstiges“ ohne Angabe).
  assert.deepEqual(pruefeStudiengang(SONSTIGES, "Sonstige"), { ok: true, wert: "Sonstige" });
  // „Kein Student“ im Freitext nach „Ja, ich studiere“ wird nicht zu „Kein Studium“.
  assert.deepEqual(pruefeStudiengang(SONSTIGES, "Kein Student", { ohneKeinStudium: true }), {
    ok: true,
    wert: "Kein Student",
  });
});

test("gespeicherten Wert in der Auswahl anzeigen", () => {
  assert.deepEqual(auswahlAusWert("BWL"), { auswahl: "BWL", freitext: "" });
  assert.deepEqual(auswahlAusWert("Diplom-Finanzwirt (FH)"), { auswahl: SONSTIGES, freitext: "Diplom-Finanzwirt (FH)" });
  assert.deepEqual(auswahlAusWert(null), { auswahl: "", freitext: "" });
  assert.deepEqual(auswahlAusWert("-"), { auswahl: "", freitext: "" });
  assert.equal(istLeer(" - "), true);
  assert.equal(istLeer("BWL"), false);
});
