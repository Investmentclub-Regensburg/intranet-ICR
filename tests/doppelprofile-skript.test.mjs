// Tests für scripts/lib/doppelprofile.mjs (Doppelprofile zusammenführen). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CAS_SPALTEN,
  emailSchluessel,
  erwarteterStand,
  findePaare,
  formatiereErgebnis,
  formatierePruefung,
  formatiereProbelauf,
  kontoGesperrt,
  leseDoppelArgumente,
  listeTsv,
  neuesErgebnis,
  schreibePaar,
  secretsKurz,
  stufeEin,
  zaehleAlle,
} from "../scripts/lib/doppelprofile.mjs";

const UUID_A = "aaaaaaaa-0000-4000-a000-000000000001";
const UUID_B = "bbbbbbbb-0000-4000-a000-000000000001";

/** A: vom Konto angelegtes, leeres Profil (id = user_id). */
const kontoProfil = (extra = {}) => ({
  id: UUID_A,
  user_id: UUID_A,
  "E-Mail": "max.krause@example.org",
  Status: "active",
  Rolle: "member",
  Vorname: null,
  Nachname: null,
  Mitgliedsnummer: null,
  "Datum_Kündigung": null,
  Datum_Mandat: null,
  IBAN: null,
  letzter_news_aufruf: "2026-03-01T10:00:00+00:00",
  created_at: "2026-02-23T09:00:00+00:00",
  ...extra,
});

/** B: importiertes Profil mit Name (IBAN über secrets). */
const importProfil = (extra = {}) => ({
  id: UUID_B,
  user_id: null,
  "E-Mail": "Max.Krause@example.org",
  Status: "active",
  Rolle: "member",
  Vorname: "Max",
  Nachname: "Krause",
  Mitgliedsnummer: "123",
  "Datum_Kündigung": null,
  Datum_Mandat: "2020-10-01",
  IBAN: null,
  letzter_news_aufruf: "2000-01-01T00:00:00+00:00",
  created_at: "2026-02-18T09:00:00+00:00",
  ...extra,
});

const secretsMitIban = (hash = "h1.k1.aaa") => ({ daten: true, iban: true, ibanHash: hash });

function kontext({ a = kontoProfil(), b = importProfil(), konto = {}, secrets = {}, registrierungen = [] } = {}) {
  return {
    secrets: new Map([[String(b.id), secretsMitIban()], ...Object.entries(secrets)]),
    konten: new Map([[String(a.user_id), { email: "max.krause@example.org", gesperrt: false, ...konto }]]),
    registrierungen: new Set(registrierungen),
  };
}

test("Schlüssel: wie lower(btrim()) – nur Leerzeichen am Rand", () => {
  assert.equal(emailSchluessel("  Max.Krause@Example.ORG "), "max.krause@example.org");
  assert.equal(emailSchluessel("\tmax@example.org"), "\tmax@example.org");
  assert.equal(emailSchluessel(""), null);
  assert.equal(emailSchluessel("   "), null);
  assert.equal(emailSchluessel(null), null);
});

test("Kontosperre: nur die Kündigungssperre (ab 2999-12-31) zählt", () => {
  assert.equal(kontoGesperrt(null), false);
  assert.equal(kontoGesperrt(""), false);
  assert.equal(kontoGesperrt("2027-01-01T00:00:00Z"), false);
  assert.equal(kontoGesperrt("2999-12-31T00:00:00Z"), true);
  assert.equal(kontoGesperrt("2999-12-31T00:00:00+00:00"), true);
  assert.equal(kontoGesperrt("kaputt"), false);
});

test("secretsKurz: nur leer/nicht leer und Fingerabdruck", () => {
  assert.deepEqual(secretsKurz({ iban: "e1.x", iban_hash: "h1.k.a" }), { daten: true, iban: true, ibanHash: "h1.k.a" });
  assert.deepEqual(secretsKurz({ ort: "e1.x" }), { daten: true, iban: false, ibanHash: null });
  assert.deepEqual(secretsKurz({ iban: null, land: null }), { daten: false, iban: false, ibanHash: null });
});

test("Muster: aktiv/aktiv → zusammenführen, gekündigt/gekündigt → zusammenführen", () => {
  const { eintraege } = findePaare([importProfil(), kontoProfil()], kontext());
  assert.equal(eintraege.length, 1);
  assert.equal(eintraege[0].einstufung, "zusammenfuehren");
  assert.equal(eintraege[0].a.id, UUID_A);
  assert.equal(eintraege[0].b.id, UUID_B);
  assert.deepEqual(eintraege[0].ids, [UUID_A, UUID_B]);

  const a = kontoProfil({ Status: "cancelled", "Datum_Kündigung": "2026-05-01" });
  const b = importProfil({ Status: "cancelled", "Datum_Kündigung": "2026-04-30" });
  const r = findePaare([a, b], kontext({ a, b, konto: { gesperrt: true } }));
  assert.equal(r.eintraege[0].einstufung, "zusammenfuehren");
});

test("Muster: nur A gekündigt → Kündigung übernehmen", () => {
  const a = kontoProfil({ Status: "cancelled", "Datum_Kündigung": "2026-09-15" });
  const r = stufeEin(a, importProfil(), kontext({ a, konto: { gesperrt: true } }));
  assert.deepEqual(r, { einstufung: "kuendigung", gruende: [] });
  // ohne Datum oder bei Vorstand: prüfen
  const ohneDatum = kontoProfil({ Status: "cancelled" });
  assert.deepEqual(stufeEin(ohneDatum, importProfil(), kontext({ a: ohneDatum, konto: { gesperrt: true } })).gruende, [
    "kuendigung_ohne_datum",
  ]);
  const b = importProfil({ Rolle: "board" });
  assert.deepEqual(stufeEin(a, b, kontext({ a, b, konto: { gesperrt: true } })).gruende, ["kuendigung_vorstand"]);
});

test("Prüfen: jede Abweichung vom Muster einzeln", () => {
  const faelle = [
    ["a_id_ungleich_konto", { a: kontoProfil({ user_id: "cccccccc-0000-4000-a000-000000000001" }) }],
    ["a_hat_namen", { a: kontoProfil({ Vorname: "Max" }) }],
    ["a_hat_namen", { a: kontoProfil({ Nachname: "Krause" }) }],
    ["b_ohne_namen", { b: importProfil({ Vorname: " " }) }],
    ["a_hat_daten", { secrets: { [UUID_A]: { daten: true, iban: false, ibanHash: null } } }],
    ["a_hat_daten", { a: kontoProfil({ IBAN: "DE00" }) }],
    ["a_hat_stammdaten", { a: kontoProfil({ Mitgliedsnummer: "7" }) }],
    ["a_hat_stammdaten", { a: kontoProfil({ Datum_Mandat: "2026-02-23" }) }],
    ["b_ohne_iban", { secrets: { [UUID_B]: { daten: true, iban: false, ibanHash: null } } }],
    ["antrag_offen", { a: kontoProfil({ Status: "applicant" }) }],
    ["antrag_offen", { b: importProfil({ Status: " Applicant" }) }],
    ["b_gekuendigt", { b: importProfil({ Status: "cancelled", "Datum_Kündigung": "2025-09-30" }) }],
    ["rolle", { a: kontoProfil({ Rolle: "admin" }) }],
    ["reihenfolge", { b: importProfil({ created_at: "2026-03-01T00:00:00+00:00" }) }],
    ["konto_email", { konto: { email: "andere@example.org" } }],
    ["konto_sperre", { konto: { gesperrt: true } }],
    ["registrierung_offen", { registrierungen: [UUID_A] }],
  ];
  for (const [grund, k] of faelle) {
    const a = k.a ?? kontoProfil();
    const b = k.b ?? importProfil();
    const ctx = kontext({ ...k, a, b });
    const r = stufeEin(a, b, ctx);
    assert.equal(r.einstufung, "pruefen", grund);
    assert.deepEqual(r.gruende, [grund], grund);
  }
  // Konto fehlt
  const a = kontoProfil();
  const r = stufeEin(a, importProfil(), { ...kontext(), konten: new Map() });
  assert.deepEqual(r.gruende, ["konto_fehlt"]);
  // Rolle gleich bei beiden (nicht member) ist in Ordnung
  const ab = kontoProfil({ Rolle: "alumni" });
  const bb = importProfil({ Rolle: "alumni" });
  assert.equal(stufeEin(ab, bb, kontext({ a: ab, b: bb })).einstufung, "zusammenfuehren");
  // Rolle null bei A ist die Vorgabe
  const an = kontoProfil({ Rolle: null });
  assert.equal(stufeEin(an, importProfil(), kontext({ a: an })).einstufung, "zusammenfuehren");
});

test("Prüfen: IBAN-Fingerabdruck auch bei einem dritten Profil", () => {
  const dritter = "dddddddd-0000-4000-a000-000000000001";
  const ctx = kontext({ secrets: { [dritter]: secretsMitIban("h1.k1.aaa") } });
  const r = findePaare([kontoProfil(), importProfil(), { ...importProfil(), id: dritter, "E-Mail": "x@example.org" }], ctx);
  assert.equal(r.eintraege.length, 1);
  assert.deepEqual(r.eintraege[0].gruende, ["iban_gruppe"]);
  assert.equal(r.ibanGruppen.length, 1);
  assert.equal(r.ibanGruppen[0].mitPaar, true);
});

test("Gruppen: beide mit Konto, keins mit Konto, mehr als zwei Profile, verschiedene Adressen", () => {
  const zweiKonten = findePaare(
    [kontoProfil(), importProfil({ user_id: UUID_B })],
    kontext()
  ).eintraege[0];
  assert.deepEqual([zweiKonten.einstufung, zweiKonten.gruende, zweiKonten.a], ["pruefen", ["beide_konto"], null]);

  const keinKonto = findePaare([kontoProfil({ user_id: null }), importProfil()], kontext()).eintraege[0];
  assert.deepEqual(keinKonto.gruende, ["kein_konto"]);

  const drei = findePaare(
    [kontoProfil(), importProfil(), { ...importProfil(), id: "eeeeeeee-0000-4000-a000-000000000001", "E-Mail": " MAX.krause@example.org" }],
    kontext()
  ).eintraege;
  assert.equal(drei.length, 1);
  assert.equal(drei[0].art, "gruppe");
  assert.deepEqual(drei[0].gruende, ["gruppe_groesse"]);
  assert.equal(drei[0].ids.length, 3);

  // Andere Adresse, Tab statt Leerzeichen (btrim entfernt nur Leerzeichen): kein Paar.
  assert.equal(findePaare([kontoProfil(), importProfil({ "E-Mail": "max.krause@example.com" })], kontext()).eintraege.length, 0);
  assert.equal(findePaare([kontoProfil(), importProfil({ "E-Mail": "max.krause@example.org\t" })], kontext()).eintraege.length, 0);
});

test("Zählung, Ausgaben ohne IDs/Adressen/Namen", () => {
  const a2 = kontoProfil({ id: "a2a2a2a2-0000-4000-a000-000000000001", user_id: "a2a2a2a2-0000-4000-a000-000000000001", "E-Mail": "erika.beispiel@example.org", Status: "cancelled", "Datum_Kündigung": "2026-06-01" });
  const b2 = importProfil({ id: "b2b2b2b2-0000-4000-a000-000000000001", "E-Mail": "Erika.Beispiel@example.org", Vorname: "Erika", Nachname: "Beispiel" });
  const a3 = kontoProfil({ id: "a3a3a3a3-0000-4000-a000-000000000001", user_id: "a3a3a3a3-0000-4000-a000-000000000001", "E-Mail": "lena.probe@example.org" });
  const b3 = importProfil({ id: "b3b3b3b3-0000-4000-a000-000000000001", "E-Mail": "LENA.probe@example.org", Status: "cancelled", Vorname: "Lena", Nachname: "Probe" });
  const profile = [kontoProfil(), importProfil(), a2, b2, a3, b3, { ...importProfil(), id: "ffffffff-0000-4000-a000-000000000001", "E-Mail": "solo@example.org" }];
  const ctx = {
    secrets: new Map([
      [UUID_B, secretsMitIban("h1.k1.1")],
      [b2.id, secretsMitIban("h1.k1.2")],
      [b3.id, secretsMitIban("h1.k1.3")],
      ["ffffffff-0000-4000-a000-000000000001", secretsMitIban("h1.k1.3")],
    ]),
    konten: new Map([
      [UUID_A, { email: "max.krause@example.org", gesperrt: false }],
      [a2.id, { email: "erika.beispiel@example.org", gesperrt: true }],
      [a3.id, { email: "lena.probe@example.org", gesperrt: false }],
    ]),
    registrierungen: new Set(),
  };
  const ergebnis = findePaare(profile, ctx);
  const z = zaehleAlle(profile, ergebnis);
  assert.equal(z.profile, 7);
  assert.equal(z.paare, 3);
  assert.deepEqual(z.einstufung, { zusammenfuehren: 1, kuendigung: 1, pruefen: 1 });
  assert.equal(z.gruende.b_gekuendigt, 1);
  assert.equal(z.gruende.iban_gruppe, 1);
  assert.equal(z.zuAendern, 2);
  assert.equal(z.ibanGruppen, 1);
  assert.equal(z.ibanGruppenMitPaar, 1);

  const r = { ...neuesErgebnis(), geplant: 2, zusammengefuehrt: 2, kuendigung: 1 };
  const texte = [formatierePruefung(z), formatiereProbelauf(z), formatiereErgebnis(r)];
  for (const t of texte) {
    for (const verboten of ["Max", "Krause", "Erika", "Lena", "example.org", "aaaaaaaa", "bbbbbbbb", "a2a2", "b3b3", "h1.k1"]) {
      assert.ok(!t.includes(verboten), verboten);
    }
  }
  assert.match(formatiereProbelauf(z), /„zusammenfuehren“ ändern würde\s+2$/m);
  assert.match(formatierePruefung(z), /Import-Profil gekündigt, Konto-Profil aktiv\s+1$/m);

  // Liste: IDs, Einstufung und Gründe, keine Namen oder Adressen.
  const tsv = listeTsv(ergebnis);
  const zeilen = tsv.trimEnd().split("\n");
  assert.equal(zeilen[0], "art\teinstufung\tgruende\tkonto_profil_id\timport_profil_id\tprofil_ids");
  assert.equal(zeilen.length, 5);
  assert.ok(zeilen.includes(`paar\tzusammenfuehren\t\t${UUID_A}\t${UUID_B}\t${UUID_A},${UUID_B}`));
  assert.ok(zeilen.includes(`paar\tkuendigung\t\t${a2.id}\t${b2.id}\t${a2.id},${b2.id}`));
  assert.ok(zeilen.some((l) => l.startsWith("paar\tpruefen\tiban_gruppe,b_gekuendigt\t")));
  assert.ok(zeilen.some((l) => l.startsWith("iban_gruppe\tpruefen\tmit_doppelprofil\t\t\t")));
  for (const verboten of ["Max", "Erika", "example.org", "h1.k1"]) assert.ok(!tsv.includes(verboten), verboten);
});

test("Erwarteter Stand: genau die CAS-Spalten, fehlende als null", () => {
  const s = erwarteterStand(importProfil());
  assert.deepEqual(Object.keys(s), [...CAS_SPALTEN]);
  assert.equal(s.user_id, null);
  assert.equal(s["E-Mail"], "Max.Krause@example.org");
  assert.equal(s.IBAN, undefined);
  assert.equal(erwarteterStand({}).Status, null);
});

test("Argumente: zusammenfuehren statt reparieren, --vorstand, --liste nur außerhalb des Repos", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "doppel-repo-"));
  const draussen = mkdtempSync(path.join(os.tmpdir(), "doppel-liste-"));
  try {
    const basis = ["--projekt", "lokal", "--url", "http://127.0.0.1:54321"];
    const p = leseDoppelArgumente(["zusammenfuehren", "--probelauf", ...basis], {}, repo);
    assert.equal(p.fehler, undefined);
    assert.equal(p.befehl, "zusammenfuehren");
    assert.equal(p.probelauf, true);
    assert.equal(leseDoppelArgumente(["pruefen", ...basis], {}, repo).befehl, "pruefen");
    assert.match(leseDoppelArgumente(["reparieren", ...basis], {}, repo).fehler, /pruefen, zusammenfuehren/);
    assert.match(leseDoppelArgumente(["zusammenfuehren", ...basis], {}, repo).fehler, /„zusammenfuehren“ braucht --vorstand/);
    assert.match(leseDoppelArgumente(["pruefen", "--probelauf", ...basis], {}, repo).fehler, /nur bei „zusammenfuehren“/);
    const v = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    assert.equal(leseDoppelArgumente(["zusammenfuehren", "--vorstand", v, ...basis], {}, repo).vorstand, v);
    assert.equal(leseDoppelArgumente(["pruefen", "--liste", path.join(draussen, "l.tsv"), ...basis], {}, repo).fehler, undefined);
    assert.match(leseDoppelArgumente(["pruefen", "--liste", path.join(repo, "l.tsv"), ...basis], {}, repo).fehler, /außerhalb/);
    assert.match(
      leseDoppelArgumente(["zusammenfuehren", "--vorstand", v, "--liste", path.join(draussen, "l.tsv"), ...basis], {}, repo).fehler,
      /--liste gibt es nur bei „pruefen“ und „zusammenfuehren --probelauf“/
    );
    assert.match(leseDoppelArgumente(["pruefen", "--projekt", "prod"], {}, repo).fehler, /--url/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(draussen, { recursive: true, force: true });
  }
});

test("schreibePaar: Codes der Datenbankfunktion zählen, prüfen nie schreiben", async () => {
  const { eintraege } = findePaare([kontoProfil(), importProfil()], kontext());
  const aufrufe = [];
  const db = (code) => ({
    async zusammenfuehren(a, b, erwartet) {
      aufrufe.push([a, b, erwartet]);
      if (code instanceof Error) throw code;
      return code;
    },
  });
  const r = neuesErgebnis();
  assert.equal(await schreibePaar(db("zusammengefuehrt"), eintraege[0], r), "zusammengefuehrt");
  assert.deepEqual(aufrufe[0].slice(0, 2), [UUID_A, UUID_B]);
  assert.equal(aufrufe[0][2].a["E-Mail"], "max.krause@example.org");
  assert.equal(aufrufe[0][2].b.user_id, null);
  await schreibePaar(db("zusammengefuehrt_kuendigung"), eintraege[0], r);
  await schreibePaar(db("konflikt"), eintraege[0], r);
  await schreibePaar(db("muster"), eintraege[0], r);
  await schreibePaar(db("verweise"), eintraege[0], r);
  await schreibePaar(db("fehlt"), eintraege[0], r);
  await schreibePaar(db("unbekannt"), eintraege[0], r);
  await schreibePaar(db(new Error("x")), eintraege[0], r);
  assert.deepEqual(
    [r.zusammengefuehrt, r.kuendigung, r.konflikt, r.muster, r.verweise, r.inzwischenErledigt, r.fehler],
    [2, 1, 1, 1, 1, 1, 2]
  );
  const vorher = aufrufe.length;
  await schreibePaar(db("zusammengefuehrt"), { ...eintraege[0], einstufung: "pruefen" }, r);
  assert.equal(aufrufe.length, vorher);
});
