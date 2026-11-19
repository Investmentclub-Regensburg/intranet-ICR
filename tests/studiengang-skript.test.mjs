// Tests für scripts/lib/studiengang.mjs (Bereinigung der Altwerte). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPALTE,
  bewerteStudiengang,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  neuesReparaturErgebnis,
  schreibeProfil,
  zaehleAlle,
} from "../scripts/lib/studiengang.mjs";

const aktiv = (wert, extra = {}) => ({ Status: "active", Rolle: "member", [SPALTE]: wert, ...extra });

test("Bewertung je Profil", () => {
  assert.deepEqual(bewerteStudiengang(aktiv("BWL")), { gruppe: "aktiv", status: "richtig", ziel: "BWL", neu: null });
  assert.deepEqual(bewerteStudiengang(aktiv("Bwl")), { gruppe: "aktiv", status: "sicher", ziel: "BWL", neu: "BWL" });
  assert.deepEqual(bewerteStudiengang(aktiv(" BWL ")), { gruppe: "aktiv", status: "sicher", ziel: "BWL", neu: "BWL" });
  assert.deepEqual(bewerteStudiengang(aktiv("BW")), { gruppe: "aktiv", status: "vorschlag", ziel: "BWL", neu: null });
  assert.deepEqual(bewerteStudiengang(aktiv("Geisteswissenschaften")), {
    gruppe: "aktiv",
    status: "offen",
    ziel: null,
    neu: null,
  });
  assert.equal(bewerteStudiengang(aktiv(null)).status, "leer");
  assert.equal(bewerteStudiengang(aktiv("-")).status, "leer");
  // Vorstand und Alumni sind betroffen.
  assert.equal(bewerteStudiengang(aktiv("Bwl", { Rolle: "board" })).neu, "BWL");
  assert.equal(bewerteStudiengang(aktiv("Bwl", { Rolle: "alumni" })).neu, "BWL");
  // Gekündigt und Antrag offen: nur gezählt, nie geändert.
  const gekuendigt = bewerteStudiengang(aktiv("Bwl", { Status: "cancelled" }));
  assert.equal(gekuendigt.gruppe, "gekuendigt");
  assert.equal(gekuendigt.status, "sicher");
  assert.equal(gekuendigt.neu, null);
  const antrag = bewerteStudiengang(aktiv("Bwl", { Status: "applicant" }));
  assert.equal(antrag.gruppe, "antrag_offen");
  assert.equal(antrag.neu, null);
});

/** Erfundene Altdaten: Schreibweisen wie in der Zählung, Werte ohne Bezug zu echten Personen. */
const FREITEXT = "Erfundenes Spezialfach Xylophonkunde";
const PROFILE = [
  aktiv("BWL"),
  aktiv("BWL"),
  aktiv("Betriebswirtschaftslehre"),
  aktiv("Bwl", { Rolle: "board" }),
  aktiv("BWL/ Medienwissenschaften"),
  aktiv("Business Managment"),
  aktiv("DBM"),
  aktiv(FREITEXT),
  aktiv(null),
  aktiv("Kein Student", { Rolle: "alumni" }),
  aktiv("Immmobilienwirtschaft", { Status: "cancelled" }),
  aktiv("VWL", { Status: "applicant" }),
];

test("Zählung und Ausgabe nur mit Zahlen und Listennamen", () => {
  const z = zaehleAlle(PROFILE.map(bewerteStudiengang));
  assert.equal(z.profile, 12);
  assert.equal(z.aktiv, 10);
  assert.equal(z.gekuendigt, 1);
  assert.equal(z.antragOffen, 1);
  assert.deepEqual(z.status, { richtig: 2, sicher: 4, vorschlag: 2, offen: 1, leer: 1 });
  assert.deepEqual(z.ziele.BWL, { richtig: 2, sicher: 2, vorschlag: 1 });
  assert.deepEqual(z.ziele["Kein Studium"], { richtig: 0, sicher: 1, vorschlag: 0 });
  assert.equal(z.zuAendern, 4);
  assert.deepEqual(z.nichtBetroffen, { richtig: 1, sicher: 1, vorschlag: 0, offen: 0, leer: 0 });

  const pruefung = formatierePruefung(z);
  const probelauf = formatiereProbelauf(z);
  for (const text of [pruefung, probelauf]) {
    // Nie Altwerte (Freitext, Tippfehler-Schreibweisen) in der Ausgabe.
    for (const roh of [FREITEXT, "Betriebswirtschaftslehre", "Business Managment", "Medienwissenschaften", "DBM", "Kein Student", "Immmobilien"]) {
      assert.ok(!text.includes(roh), roh);
    }
  }
  assert.match(probelauf, /Profile, die „reparieren“ ändern würde\s+4/);
  assert.match(pruefung, /BWL\s+2\s+2\s+1/);
  // Zielwerte in Listenreihenfolge.
  assert.ok(probelauf.indexOf("BWL") < probelauf.indexOf("Business Management"));
  assert.ok(probelauf.indexOf("Business Management") < probelauf.indexOf("Digital Business Management"));
});

test("Reparatur-Ausgabe", () => {
  const r = neuesReparaturErgebnis();
  r.geplant = 4;
  r.geaendert = 3;
  r.konflikt = 1;
  r.bearbeitet = 4;
  const text = formatiereReparatur(r);
  assert.match(text, /Reparatur fertig/);
  assert.match(text, /Profile geändert\s+3/);
  assert.match(formatiereReparatur({ ...r, abgebrochen: true, bearbeitet: 2 }), /abgebrochen nach 2 von 4/);
});

/** Fake-Datenbank im Speicher: Compare-and-set wie im Skript (Update nur, wenn die Spalte noch passt). */
function fakeDb(profile, { fehlerBeim } = {}) {
  const zeilen = new Map(profile.map((p, i) => [`id-${i}`, { ...p }]));
  const protokoll = [];
  return {
    zeilen,
    protokoll,
    async lese(id) {
      if (fehlerBeim === "lese") throw new Error("x");
      const z = zeilen.get(id);
      return z ? { ...z } : null;
    },
    async schreibe(id, frisch, neu) {
      if (fehlerBeim === "schreibe") throw new Error("x");
      const z = zeilen.get(id);
      if (!z || z[SPALTE] !== frisch[SPALTE]) return 0;
      z[SPALTE] = neu;
      return 1;
    },
    async protokolliere(id) {
      if (fehlerBeim === "protokoll") throw new Error("x");
      protokoll.push(id);
    },
  };
}

async function repariereAlle(db) {
  const ergebnisse = [];
  for (const [id, p] of db.zeilen) {
    if (bewerteStudiengang(p).neu) ergebnisse.push(await schreibeProfil(db, id));
  }
  return ergebnisse;
}

test("Reparatur schreibt nur sicher, nur aktive; zweiter Lauf ändert nichts", async () => {
  const db = fakeDb(PROFILE);
  const vorher = [...db.zeilen.values()].map((z) => z[SPALTE]);
  const erster = await repariereAlle(db);
  assert.deepEqual(erster, ["geaendert", "geaendert", "geaendert", "geaendert"]);
  assert.equal(db.protokoll.length, 4);
  const nachher = [...db.zeilen.values()].map((z) => z[SPALTE]);
  assert.deepEqual(nachher, [
    "BWL",
    "BWL",
    "BWL",
    "BWL",
    "BWL/ Medienwissenschaften", // vorschlag: bleibt
    "Business Management",
    "DBM", // vorschlag: bleibt
    FREITEXT, // offen: bleibt
    null,
    "Kein Studium",
    "Immmobilienwirtschaft", // gekündigt: bleibt
    "VWL",
  ]);
  assert.notDeepEqual(vorher, nachher);
  // Zweiter Lauf: nichts mehr zu tun.
  assert.deepEqual(await repariereAlle(db), []);
  assert.equal(zaehleAlle([...db.zeilen.values()].map(bewerteStudiengang)).zuAendern, 0);
  assert.equal(db.protokoll.length, 4);
});

test("Schreiben: inzwischen geändert, erledigt, Fehler, Protokoll", async () => {
  // Wert zwischen Lesen und Schreiben geändert → Konflikt, nichts geschrieben.
  const db = fakeDb([aktiv("Bwl")]);
  const konflikt = { ...db, async schreibe() { return 0; } };
  assert.equal(await schreibeProfil(konflikt, "id-0"), "konflikt");
  assert.equal(db.zeilen.get("id-0")[SPALTE], "Bwl");
  assert.equal(db.protokoll.length, 0);
  // Inzwischen richtig oder gekündigt → erledigt.
  assert.equal(await schreibeProfil(fakeDb([aktiv("BWL")]), "id-0"), "erledigt");
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl", { Status: "cancelled" })]), "id-0"), "erledigt");
  assert.equal(await schreibeProfil(fakeDb([]), "id-0"), "erledigt");
  // Fehler beim Lesen/Schreiben, Protokoll fehlt.
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl")], { fehlerBeim: "lese" }), "id-0"), "fehler");
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl")], { fehlerBeim: "schreibe" }), "id-0"), "fehler");
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl")], { fehlerBeim: "protokoll" }), "id-0"), "protokoll");
});
