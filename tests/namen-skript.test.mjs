// Tests für scripts/lib/namen.mjs (Bereinigung fehlender Namen). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MIT_VORSCHLAEGEN,
  PROBE_PROFIL,
  bewerteAlle,
  bewerteNamen,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  funktionsProbe,
  istLeer,
  kontoHatNamen,
  leseNamenArgumente,
  listeTsv,
  neuesReparaturErgebnis,
  schreibeProfil,
  zaehleAlle,
} from "../scripts/lib/namen.mjs";
import { pruefeName } from "../lib/member-rules.ts";

/** Probe-Werte müssen die Werteprüfung der Datenbankfunktion bestehen (sonst Fehler statt false). */
const nameAusEmailGueltig = (w) => pruefeName(w, "vorname").code === null && !/[0-9]/.test(w);

const profil = (email, extra = {}) => ({
  id: extra.id ?? "p-1",
  user_id: null,
  Status: "active",
  Rolle: "member",
  Vorname: null,
  Nachname: null,
  "E-Mail": email,
  ...extra,
});

test("leer: null, leerer Text, nur Leerraum", () => {
  for (const w of [null, undefined, "", "  ", "\t\n"]) assert.equal(istLeer(w), true, JSON.stringify(w));
  for (const w of ["A", " Max "]) assert.equal(istLeer(w), false);
});

test("Konto-Metadaten mit Namen", () => {
  assert.equal(kontoHatNamen(null), false);
  assert.equal(kontoHatNamen({}), false);
  assert.equal(kontoHatNamen({ Vorname: "", Nachname: " " }), false);
  assert.equal(kontoHatNamen({ Vorname: "Max" }), true);
  assert.equal(kontoHatNamen({ Nachname: "Mustermann" }), true);
});

test("Bewertung: nur aktive Profile mit leerem Vor- UND Nachnamen werden geschrieben", () => {
  const s = bewerteNamen(profil("max.mustermann@example.org"));
  assert.deepEqual(s, {
    gruppe: "aktiv",
    status: "sicher",
    vorname: "Max",
    nachname: "Mustermann",
    gruende: [],
    aendern: true,
  });
  assert.equal(bewerteNamen(profil("max.mustermann@example.org", { Vorname: "  ", Nachname: "" })).aendern, true);

  // Name schon da oder nur einer leer: nichts tun.
  assert.equal(bewerteNamen(profil("max.mustermann@example.org", { Vorname: "Max", Nachname: "M" })).status, "hat_namen");
  const teil = bewerteNamen(profil("max.mustermann@example.org", { Vorname: "Max" }));
  assert.equal(teil.status, "teilweise");
  assert.equal(teil.aendern, false);
  assert.equal(teil.vorname, null);

  // Vorstand und Alumni sind aktiv.
  assert.equal(bewerteNamen(profil("max.mustermann@example.org", { Rolle: "board" })).aendern, true);
  assert.equal(bewerteNamen(profil("max.mustermann@example.org", { Rolle: "alumni" })).aendern, true);

  // Gekündigt und Antrag offen: nur gezählt.
  const gek = bewerteNamen(profil("max.mustermann@example.org", { Status: "cancelled" }));
  assert.equal(gek.gruppe, "gekuendigt");
  assert.equal(gek.status, "sicher");
  assert.equal(gek.aendern, false);
  assert.equal(bewerteNamen(profil("max.mustermann@example.org", { Status: "applicant" })).aendern, false);
});

test("Bewertung: vorschlag nur mit --mit-vorschlaegen, offen nie", () => {
  const p = profil("anna-lena.mueller@example.org");
  const ohne = bewerteNamen(p);
  assert.equal(ohne.status, "vorschlag");
  assert.equal(ohne.vorname, "Anna-Lena");
  assert.equal(ohne.nachname, "Müller");
  assert.deepEqual(ohne.gruende, ["umschrift"]);
  assert.equal(ohne.aendern, false);
  assert.equal(bewerteNamen(p, { mitVorschlaegen: true }).aendern, true);

  for (const email of ["info.verein@example.org", "max.mustermann2@example.org", "a.b@example.org", "maria.von.der.heide@example.org"]) {
    const o = bewerteNamen(profil(email), { mitVorschlaegen: true });
    assert.equal(o.status, "offen", email);
    assert.equal(o.aendern, false);
    assert.equal(o.vorname, null);
  }
});

test("Bewertung: Konto mit Namen in den Metadaten bleibt", () => {
  const b = bewerteNamen(profil("max.mustermann@example.org"), { kontoMitNamen: true, mitVorschlaegen: true });
  assert.equal(b.status, "konto_hat_namen");
  assert.equal(b.aendern, false);
});

test("bewerteAlle: Konten und mögliche Doppelprofile", () => {
  const profile = [
    profil("max.mustermann@example.org", { id: "p-1", user_id: "u-1" }),
    profil("max.mustermann@uni.example", { id: "p-2", user_id: "u-2" }),
    profil("lukas.bauer@example.org", { id: "p-3", user_id: "u-3" }),
    profil("x@example.org", { id: "p-4", Vorname: "Lukas", Nachname: "Bauer" }),
    profil("erik.lang@example.org", { id: "p-5", user_id: "u-5" }),
  ];
  const e = bewerteAlle(profile, new Set(["u-5"]));
  assert.deepEqual(
    e.map((x) => [x.id, x.bewertung.status, x.doppelt]),
    [
      ["p-1", "sicher", true],
      ["p-2", "sicher", true],
      ["p-3", "sicher", true],
      ["p-4", "hat_namen", false],
      ["p-5", "konto_hat_namen", false],
    ]
  );
  const z = zaehleAlle(e);
  assert.equal(z.doppelt, 3);
  assert.equal(z.zuAendern, 3);
  assert.equal(z.status.konto_hat_namen, 1);
});

test("Zählung und Gründe", () => {
  const profile = [
    profil("max.mustermann@example.org"),
    profil("anna-lena.mueller@example.org"),
    profil("maria.von-der-heide@example.org"),
    profil("tom.oetker@example.org"),
    profil("info.verein@example.org"),
    profil("max.mustermann2@example.org"),
    profil("a.b@example.org"),
    profil("maria.von.der.heide@example.org"),
    profil("max.mustermann@example.org", { Vorname: "Max" }),
    profil("max.mustermann@example.org", { Vorname: "Max", Nachname: "Mustermann" }),
    profil("lukas.bauer@example.org", { Status: "cancelled" }),
    profil("lukas.bauer@example.org", { Status: "applicant" }),
  ].map((p, i) => ({ ...p, id: `p-${i}` }));
  const z = zaehleAlle(bewerteAlle(profile));
  assert.equal(z.profile, 12);
  assert.equal(z.aktiv, 10);
  assert.equal(z.gekuendigt, 1);
  assert.equal(z.antragOffen, 1);
  assert.deepEqual(z.status, { hat_namen: 1, teilweise: 1, sicher: 1, vorschlag: 3, offen: 4, konto_hat_namen: 0 });
  assert.deepEqual(z.vorschlagGruende, { umschrift: 1, anfang: 1, partikel: 1 });
  assert.equal(z.offenGruende.rolle, 1);
  assert.equal(z.offenGruende.ziffern, 1);
  assert.equal(z.offenGruende.kurz, 1);
  assert.equal(z.offenGruende.teile, 1);
  assert.equal(z.nichtBetroffen.sicher, 2);
  assert.equal(z.zuAendern, 1);
  assert.equal(zaehleAlle(bewerteAlle(profile, new Set(), { mitVorschlaegen: true })).zuAendern, 4);
});

test("Ausgaben enthalten nur Zahlen – keine Namen, Adressen, IDs", () => {
  const profile = [
    profil("lennart.zimmermann@example.org", { id: "11111111-2222-3333-4444-555555555555" }),
    profil("josefine.koehler@example.org", { id: "66666666-2222-3333-4444-555555555555" }),
  ];
  const z = zaehleAlle(bewerteAlle(profile));
  const r = { ...neuesReparaturErgebnis(), geplant: 2, geaendert: 1, sicher: 1 };
  const texte = [formatierePruefung(z), formatiereProbelauf(z, false), formatiereProbelauf(z, true), formatiereReparatur(r)];
  for (const t of texte) {
    for (const verboten of ["Lennart", "Zimmermann", "Josefine", "Köhler", "koehler", "example.org", "11111111", "66666666"]) {
      assert.ok(!t.includes(verboten), verboten);
    }
  }
  assert.match(formatiereProbelauf(z, false), /„reparieren“ ändern würde\s+1$/m);
  assert.match(formatiereProbelauf(z, true), /--mit-vorschlaegen/);
});

test("Liste (TSV): nur betroffene Profile mit leerem Namen, mit Vorschlag und sicherheit", () => {
  const profile = [
    profil("max.mustermann@example.org", { id: "p-1" }),
    profil("joerg.neuer@example.org", { id: "p-2" }),
    profil("info.verein@example.org", { id: "p-3" }),
    profil("erik.lang@example.org", { id: "p-4", user_id: "u-4" }),
    profil("x@example.org", { id: "p-5", Vorname: "A", Nachname: "B" }),
    profil("lukas.bauer@example.org", { id: "p-6", Status: "cancelled" }),
  ];
  const tsv = listeTsv(bewerteAlle(profile, new Set(["u-4"])));
  assert.equal(
    tsv,
    [
      "profil_id\tvorname\tnachname\tsicherheit\tgruende\tdoppelt",
      "p-1\tMax\tMustermann\tsicher\t\tnein",
      "p-2\tJörg\tNeuer\tvorschlag\tumschrift\tnein",
      "p-3\t\t\toffen\trolle\tnein",
      "p-4\tErik\tLang\tkonto_hat_namen\t\tnein",
      "",
    ].join("\n")
  );
});

test("Argumente: --mit-vorschlaegen nur bei reparieren, --liste nur außerhalb des Repos", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "namen-repo-"));
  const draussen = mkdtempSync(path.join(os.tmpdir(), "namen-liste-"));
  try {
    const basis = ["--projekt", "lokal", "--url", "http://127.0.0.1:54321"];
    const a = leseNamenArgumente(["reparieren", "--probelauf", MIT_VORSCHLAEGEN, ...basis], {}, repo);
    assert.equal(a.fehler, undefined);
    assert.equal(a.mitVorschlaegen, true);
    assert.equal(a.probelauf, true);
    assert.equal(leseNamenArgumente(["pruefen", ...basis], {}, repo).mitVorschlaegen, false);
    assert.match(leseNamenArgumente(["pruefen", MIT_VORSCHLAEGEN, ...basis], {}, repo).fehler, /nur bei „reparieren“/);
    assert.match(
      leseNamenArgumente(["reparieren", "--probelauf", MIT_VORSCHLAEGEN, MIT_VORSCHLAEGEN, ...basis], {}, repo).fehler,
      /doppelt/
    );
    assert.match(leseNamenArgumente(["pruefen", "--mit-vorschlag", ...basis], {}, repo).fehler, /--mit-vorschlaegen/);
    // reparieren braucht --vorstand
    assert.match(leseNamenArgumente(["reparieren", MIT_VORSCHLAEGEN, ...basis], {}, repo).fehler, /--vorstand/);
    const v = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const w = leseNamenArgumente(["reparieren", MIT_VORSCHLAEGEN, "--vorstand", v, ...basis], {}, repo);
    assert.equal(w.vorstand, v);
    assert.equal(w.mitVorschlaegen, true);
    // Liste: außerhalb erlaubt, im Repo nicht, nicht beim Schreiben.
    const ok = leseNamenArgumente(["pruefen", "--liste", path.join(draussen, "l.tsv"), ...basis], {}, repo);
    assert.equal(ok.fehler, undefined);
    assert.match(leseNamenArgumente(["pruefen", "--liste", path.join(repo, "l.tsv"), ...basis], {}, repo).fehler, /außerhalb/);
    assert.match(
      leseNamenArgumente(["reparieren", "--vorstand", v, "--liste", path.join(draussen, "l.tsv"), ...basis], {}, repo).fehler,
      /--liste/
    );
    // Ziel-Sicherungen wie datenqualitaet.
    assert.match(leseNamenArgumente(["pruefen", "--projekt", "prod"], {}, repo).fehler, /--url/);
    assert.match(leseNamenArgumente(["pruefen", "--projekt", "lokal", "--url", "http://127.0.0.1:8100"], {}, repo).fehler, /8100/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(draussen, { recursive: true, force: true });
  }
});

/** Erfundene Datenbank für schreibeProfil. */
function testDb(zeilen, { konten = {}, speichern = true, fehler = {} } = {}) {
  const aufrufe = [];
  return {
    aufrufe,
    async lese(id) {
      if (fehler.lese) throw new Error("x");
      return zeilen[id] ?? null;
    },
    async kontoHatNamen(userId) {
      if (fehler.konto) throw new Error("x");
      return Boolean(konten[userId]);
    },
    async speichere(...args) {
      aufrufe.push(args);
      if (fehler.speichere) throw new Error("x");
      return speichern;
    },
  };
}

test("schreibeProfil: frisch lesen, neu bewerten, Compare-and-set", async () => {
  const p = profil("max.mustermann@example.org", { id: "p-1", user_id: "u-1", Vorname: "", Nachname: null });
  const db = testDb({ "p-1": p });
  assert.equal(await schreibeProfil(db, "p-1"), "sicher");
  assert.deepEqual(db.aufrufe, [["p-1", "", null, "Max", "Mustermann"]]);

  // inzwischen eingetragen → erledigt, nichts gespeichert
  const db2 = testDb({ "p-1": { ...p, Vorname: "Maximilian", Nachname: "Muster" } });
  assert.equal(await schreibeProfil(db2, "p-1"), "erledigt");
  assert.equal(db2.aufrufe.length, 0);

  // Profil weg → erledigt
  assert.equal(await schreibeProfil(testDb({}), "p-1"), "erledigt");

  // inzwischen gekündigt → erledigt
  assert.equal(await schreibeProfil(testDb({ "p-1": { ...p, Status: "cancelled" } }), "p-1"), "erledigt");

  // Konto hat inzwischen einen Namen → erledigt
  const db3 = testDb({ "p-1": p }, { konten: { "u-1": true } });
  assert.equal(await schreibeProfil(db3, "p-1"), "erledigt");
  assert.equal(db3.aufrufe.length, 0);

  // Datenbank meldet „nicht mehr leer“ → konflikt
  assert.equal(await schreibeProfil(testDb({ "p-1": p }, { speichern: false }), "p-1"), "konflikt");

  // Fehler beim Lesen, Konto, Speichern → fehler
  assert.equal(await schreibeProfil(testDb({ "p-1": p }, { fehler: { lese: true } }), "p-1"), "fehler");
  assert.equal(await schreibeProfil(testDb({ "p-1": p }, { fehler: { konto: true } }), "p-1"), "fehler");
  assert.equal(await schreibeProfil(testDb({ "p-1": p }, { fehler: { speichere: true } }), "p-1"), "fehler");
});

test("schreibeProfil: vorschlag nur mit --mit-vorschlaegen", async () => {
  const p = profil("joerg.neuer@example.org", { id: "p-1" });
  const ohne = testDb({ "p-1": p });
  assert.equal(await schreibeProfil(ohne, "p-1"), "erledigt");
  assert.equal(ohne.aufrufe.length, 0);
  const mit = testDb({ "p-1": p });
  assert.equal(await schreibeProfil(mit, "p-1", { mitVorschlaegen: true }), "vorschlag");
  assert.deepEqual(mit.aufrufe, [["p-1", null, null, "Jörg", "Neuer"]]);
  // offen nie
  const o = testDb({ "p-1": profil("info.verein@example.org", { id: "p-1" }) });
  assert.equal(await schreibeProfil(o, "p-1", { mitVorschlaegen: true }), "erledigt");
  assert.equal(o.aufrufe.length, 0);
});

test("Funktionsprobe: echter Vorstand, Profil-ID, die es nicht gibt (läuft durch die Vorstandsprüfung)", () => {
  const v = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const a = funktionsProbe(v);
  // Vorher fehlte p_corrected_by nicht, aber die Funktion prüfte den Vorstand erst nach dem Update – die Probe endete
  // davor. Seit 20261120110000 kommt die Vorstandsprüfung zuerst; die Probe muss dafür den echten Vorstand tragen.
  assert.equal(a.p_corrected_by, v);
  assert.equal(a.p_profile_id, PROBE_PROFIL);
  assert.equal(a.p_expected_vorname, null);
  assert.equal(a.p_expected_nachname, null);
  assert.equal(nameAusEmailGueltig(a.p_vorname) && nameAusEmailGueltig(a.p_nachname), true);
});
