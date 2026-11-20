// Tests für scripts/lib/studiengang.mjs (Bereinigung der Altwerte). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeStudiengang, SONSTIGES } from "../lib/studiengaenge.ts";
import {
  ALTWERT_FREIGABEN,
  SPALTE,
  bewerteStudiengang,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  neuesReparaturErgebnis,
  schreibeProfil,
  zaehleAlle,
  zaehleRegistrierungsreste,
} from "../scripts/lib/studiengang.mjs";

const aktiv = (wert, extra = {}) => ({ Status: "active", Rolle: "member", [SPALTE]: wert, ...extra });
const nichts = { aendern: false, neu: null };

test("Bewertung je Profil", () => {
  assert.deepEqual(bewerteStudiengang(aktiv("BWL")), { gruppe: "aktiv", status: "richtig", ziel: "BWL", ...nichts });
  assert.deepEqual(bewerteStudiengang(aktiv("Bwl")), {
    gruppe: "aktiv",
    status: "sicher",
    ziel: "BWL",
    aendern: true,
    neu: "BWL",
  });
  assert.equal(bewerteStudiengang(aktiv(" BWL ")).neu, "BWL");
  assert.deepEqual(bewerteStudiengang(aktiv("Economics")), {
    gruppe: "aktiv",
    status: "vorschlag",
    ziel: "VWL",
    ...nichts,
  });
  assert.deepEqual(bewerteStudiengang(aktiv("Diplom-Finanzwirt (FH)")), {
    gruppe: "aktiv",
    status: "offen",
    ziel: null,
    ...nichts,
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
  assert.equal(gekuendigt.aendern, false);
  const antrag = bewerteStudiengang(aktiv("Geisteswissenschaften", { Status: "applicant" }));
  assert.equal(antrag.gruppe, "antrag_offen");
  assert.equal(antrag.status, "leeren");
  assert.equal(antrag.aendern, false);
});

/** Die 48 Schreibweisen der Zählung → Status im Skript (mit den Freigaben von Hannes). */
const SKRIPT_48 = [
  ["BWL", "richtig", "BWL"],
  ["Betriebswirtschaftslehre", "sicher", "BWL"],
  ["Bwl", "sicher", "BWL"],
  ["Betriebswirtschaft", "sicher", "BWL"],
  ["BW", "sicher", "BWL"],
  ["Betriebswirtschaftlehre", "sicher", "BWL"],
  ["BWL - Finance", "sicher", "BWL"],
  ["BWL/Finance", "sicher", "BWL"],
  ["BWL/ Medienwissenschaften", "sicher", "BWL"],
  ["Business Management", "richtig", "Business Management"],
  ["Business Managment", "sicher", "Business Management"],
  ["Busines Management", "sicher", "Business Management"],
  ["Business-Management", "sicher", "Business Management"],
  ["BM", "sicher", "Business Management"],
  ["Immobilienwirtschaft", "richtig", "Immobilienwirtschaft"],
  ["Immmobilienwirtschaft", "sicher", "Immobilienwirtschaft"],
  ["Wirtschaftsinformatik", "richtig", "Wirtschaftsinformatik"],
  ["Angewandte Wirtschaftsinformatik", "sicher", "Wirtschaftsinformatik"],
  ["VWL", "richtig", "VWL"],
  ["Digital Business", "richtig", "Digital Business"],
  ["Digital Business Management", "richtig", "Digital Business Management"],
  ["Digital Business Managment", "sicher", "Digital Business Management"],
  ["Digital Buisness", "sicher", "Digital Business"],
  ["DBM", "sicher", "Digital Business Management"],
  ["IVWL", "sicher", "Internationale VWL"],
  ["Internationale VWL", "richtig", "Internationale VWL"],
  ["Internationale Volkswirtschaftslehre", "sicher", "Internationale VWL"],
  ["Business, Economics & Psychology", "richtig", "Business, Economics & Psychology"],
  ["Business, Economics and Psychology", "sicher", "Business, Economics & Psychology"],
  ["Mathematik", "richtig", "Mathematik"],
  ["Jura", "richtig", "Jura"],
  ["Rechtswissenschaften", "sicher", "Jura"],
  ["International Relations and Management", "richtig", "International Relations and Management"],
  ["International relations and management", "sicher", "International Relations and Management"],
  ["Sonstiges", "richtig", SONSTIGES],
  ["Sonstige", "sicher", SONSTIGES],
  ["Geisteswissenschaften", "leeren", null],
  ["Naturwissenschaften", "leeren", null],
  ["International Business Management", "richtig", "International Business Management"],
  ["Architektur", "richtig", "Architektur"],
  ["Elektronik", "sicher", "Elektro- und Informationstechnik"],
  ["KI & Data Science", "sicher", "KI und Data Science"],
  ["Wirtschaftschemie", "richtig", "Wirtschaftschemie"],
  ["Wirtschaftswissenschaften", "leeren", null],
  ["Diplom-Finanzwirt (FH)", "offen", null],
  ["Kein Student", "sicher", "Kein Studium"],
  ["", "leer", null],
  ["-", "leer", null],
];

test("alle 48 Schreibweisen im Skript (Entscheidungen Hannes 1–4)", () => {
  assert.equal(SKRIPT_48.length, 48);
  for (const [roh, status, ziel] of SKRIPT_48) {
    const b = bewerteStudiengang(aktiv(roh));
    assert.equal(b.status, status, roh);
    assert.equal(b.ziel, ziel, roh);
    assert.equal(b.aendern, status === "sicher" || status === "leeren", roh);
    if (status === "sicher") assert.equal(b.neu, ziel, roh);
    if (status === "leeren") assert.equal(b.neu, null, roh);
  }
  // Zehn Freigaben (8 Schreibweisen → Listenname mit 7 Schlüsseln, 3 Sammelbegriffe → leeren).
  assert.equal(ALTWERT_FREIGABEN.size, 10);
});

test("Freigaben gelten nur im Skript, nie bei der Registrierung (Review M2)", () => {
  for (const roh of ["BWL/ Medienwissenschaften", "Elektronik", "DBM", "BW", "BM", "Angewandte Wirtschaftsinformatik"]) {
    assert.equal(bewerteStudiengang(aktiv(roh)).status, "sicher", roh);
    assert.deepEqual(pruefeStudiengang(SONSTIGES, roh), { ok: true, wert: roh }, roh);
  }
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
  aktiv("Economics"),
  aktiv(FREITEXT),
  aktiv(null),
  aktiv("Kein Student", { Rolle: "alumni" }),
  aktiv("Naturwissenschaften"),
  aktiv("Immmobilienwirtschaft", { Status: "cancelled" }),
  aktiv("VWL", { Status: "applicant" }),
];

test("Zählung und Ausgabe nur mit Zahlen und Listennamen", () => {
  const z = zaehleAlle(PROFILE.map(bewerteStudiengang));
  assert.equal(z.profile, 13);
  assert.equal(z.aktiv, 11);
  assert.equal(z.gekuendigt, 1);
  assert.equal(z.antragOffen, 1);
  assert.deepEqual(z.status, { richtig: 2, sicher: 5, leeren: 1, vorschlag: 1, offen: 1, leer: 1 });
  assert.deepEqual(z.ziele.BWL, { richtig: 2, sicher: 3, vorschlag: 0 });
  assert.deepEqual(z.ziele.VWL, { richtig: 0, sicher: 0, vorschlag: 1 });
  assert.deepEqual(z.ziele["Kein Studium"], { richtig: 0, sicher: 1, vorschlag: 0 });
  assert.equal(z.zuAendern, 6);
  assert.deepEqual(z.nichtBetroffen, { richtig: 1, sicher: 1, leeren: 0, vorschlag: 0, offen: 0, leer: 0 });

  const reste = { kontenMitAngaben: 7, offeneGesamt: 3, offeneAktiv: 2 };
  const pruefung = formatierePruefung(z, reste);
  const probelauf = formatiereProbelauf(z);
  for (const text of [pruefung, probelauf]) {
    // Nie Altwerte (Freitext, Tippfehler-Schreibweisen, Sammelbegriffe) in der Ausgabe.
    for (const roh of [
      FREITEXT,
      "Betriebswirtschaftslehre",
      "Business Managment",
      "Medienwissenschaften",
      "Kein Student",
      "Immmobilien",
      "Naturwissenschaften",
      "Economics",
    ]) {
      assert.ok(!text.includes(roh), roh);
    }
  }
  assert.match(probelauf, /Profile, die „reparieren“ ändern würde\s+6/);
  assert.match(probelauf, /leeren \(Sammelbegriff\)\s+1/);
  assert.match(pruefung, /BWL\s+2\s+3\s+0/);
  assert.match(pruefung, /Konten mit Registrierungsangaben in den Metadaten\s+7/);
  assert.match(pruefung, /davon zu aktiven Profilen\s+2/);
  // Zielwerte in Listenreihenfolge.
  assert.ok(probelauf.indexOf("BWL") < probelauf.indexOf("Business Management"));
});

test("Registrierungsreste nur zählen", () => {
  const r = zaehleRegistrierungsreste({
    konten: [
      { metadaten: { Vorname: "A", Fach: "x" } },
      { metadaten: { Vorname: "B" } },
      { metadaten: { "Uni/OTH": "y" } },
      { metadaten: null },
    ],
    offene: [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u9" }],
    profile: [
      { user_id: "u1", Status: "active", Rolle: "member" },
      { user_id: "u2", Status: "applicant", Rolle: "member" },
      { user_id: "u3", Status: "active", Rolle: "alumni" },
    ],
  });
  assert.deepEqual(r, { kontenMitAngaben: 2, offeneGesamt: 3, offeneAktiv: 1 });
});

test("Reparatur-Ausgabe", () => {
  const r = neuesReparaturErgebnis();
  r.geplant = 4;
  r.geaendert = 3;
  r.geleert = 1;
  r.konflikt = 1;
  r.bearbeitet = 4;
  const text = formatiereReparatur(r);
  assert.match(text, /Reparatur fertig/);
  assert.match(text, /Profile geändert \(mit Protokoll\)\s+3/);
  assert.match(text, /davon geleert\s+1/);
  assert.match(formatiereReparatur({ ...r, abgebrochen: true, bearbeitet: 2 }), /abgebrochen nach 2 von 4/);
});

/**
 * Fake-Datenbank im Speicher, verhält sich wie save_member_studiengang: Compare-and-set auf den alten Wert, Protokoll
 * nur bei Erfolg (gleiche Transaktion).
 */
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
    async speichere(id, alt, neu) {
      if (fehlerBeim === "speichere") throw new Error("x");
      const z = zeilen.get(id);
      if (!z || (z[SPALTE] ?? null) !== (alt ?? null)) return false;
      z[SPALTE] = neu;
      protokoll.push(id);
      return true;
    },
  };
}

async function repariereAlle(db) {
  const ergebnisse = [];
  for (const [id, p] of db.zeilen) {
    if (bewerteStudiengang(p).aendern) ergebnisse.push(await schreibeProfil(db, id));
  }
  return ergebnisse;
}

test("Reparatur schreibt nur sicher und leeren, nur aktive; zweiter Lauf ändert nichts", async () => {
  const db = fakeDb(PROFILE);
  const erster = await repariereAlle(db);
  assert.deepEqual(erster, ["geaendert", "geaendert", "geaendert", "geaendert", "geaendert", "geleert"]);
  assert.equal(db.protokoll.length, 6);
  assert.deepEqual(
    [...db.zeilen.values()].map((z) => z[SPALTE]),
    [
      "BWL",
      "BWL",
      "BWL",
      "BWL",
      "BWL", // Freigabe von Hannes
      "Business Management",
      "Economics", // vorschlag: bleibt
      FREITEXT, // offen: bleibt
      null,
      "Kein Studium",
      null, // Sammelbegriff geleert
      "Immmobilienwirtschaft", // gekündigt: bleibt
      "VWL",
    ]
  );
  // Zweiter Lauf: nichts mehr zu tun.
  assert.deepEqual(await repariereAlle(db), []);
  assert.equal(zaehleAlle([...db.zeilen.values()].map(bewerteStudiengang)).zuAendern, 0);
  assert.equal(db.protokoll.length, 6);
});

test("Schreiben: inzwischen geändert, erledigt, Fehler", async () => {
  // Wert zwischen Lesen und Schreiben geändert → Konflikt, nichts geschrieben, kein Protokoll.
  const db = fakeDb([aktiv("Bwl")]);
  const konflikt = { ...db, async speichere() { return false; } };
  assert.equal(await schreibeProfil(konflikt, "id-0"), "konflikt");
  assert.equal(db.zeilen.get("id-0")[SPALTE], "Bwl");
  assert.equal(db.protokoll.length, 0);
  // Inzwischen richtig oder gekündigt → erledigt.
  assert.equal(await schreibeProfil(fakeDb([aktiv("BWL")]), "id-0"), "erledigt");
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl", { Status: "cancelled" })]), "id-0"), "erledigt");
  assert.equal(await schreibeProfil(fakeDb([]), "id-0"), "erledigt");
  // Fehler beim Lesen/Speichern.
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl")], { fehlerBeim: "lese" }), "id-0"), "fehler");
  assert.equal(await schreibeProfil(fakeDb([aktiv("Bwl")], { fehlerBeim: "speichere" }), "id-0"), "fehler");
  // Leeren meldet „geleert“.
  assert.equal(await schreibeProfil(fakeDb([aktiv("Geisteswissenschaften")]), "id-0"), "geleert");
});
