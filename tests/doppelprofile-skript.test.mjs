// Tests für scripts/lib/doppelprofile.mjs (Doppelprofile zusammenführen). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BEHANDELTE_SPALTEN,
  FREIGEBBARE_GRUENDE,
  freigabeSchluessel,
  leseFreigaben,
  CAS_SPALTEN,
  emailSchluessel,
  erwarteterStand,
  findePaare,
  formatiereErgebnis,
  formatierePruefung,
  formatiereProbelauf,
  gesetzt,
  kontoGesperrt,
  leseDoppelArgumente,
  listeTsv,
  neuesErgebnis,
  schreibePaar,
  secretsKurz,
  stufeEin,
  weitereDatenVonA,
  zaehleAlle,
} from "../scripts/lib/doppelprofile.mjs";

const MIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const MERGE_SQL = readFileSync(path.join(MIG, "20261121100000_member_doppelprofil_merge.sql"), "utf8");
const FREIGABE_SQL = readFileSync(path.join(MIG, "20261121105000_member_doppelprofil_freigabe.sql"), "utf8");

/** Spalten von public.profiles laut Migrationen (Basis-CREATE TABLE + spätere „add column“). */
function profilSpaltenAusSchema() {
  const spalten = new Set();
  for (const f of readdirSync(MIG).filter((d) => /^\d{14}_[a-z0-9_]+\.sql$/.test(d)).sort()) {
    const sql = readFileSync(path.join(MIG, f), "utf8");
    const create = sql.match(/CREATE TABLE IF NOT EXISTS "public"\."profiles" \(([\s\S]*?)\n\);/);
    if (create) {
      for (const m of create[1].matchAll(/^\s+"([^"]+)" /gm)) spalten.add(m[1]);
    }
    for (const stmt of sql.matchAll(/alter table (?:only )?"?public"?\."?profiles"?\s+([\s\S]*?);/gi)) {
      for (const m of stmt[1].matchAll(/add column if not exists\s+"?([^"\s,]+)"?/gi)) spalten.add(m[1]);
      for (const m of stmt[1].matchAll(/drop column (?:if exists )?"?([^"\s,;]+)"?/gi)) spalten.delete(m[1]);
    }
  }
  return spalten;
}

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

function kontext({
  a = kontoProfil(),
  b = importProfil(),
  konto = {},
  secrets = {},
  registrierungen = [],
  kuendigungen = [UUID_A],
} = {}) {
  return {
    secrets: new Map([[String(b.id), secretsMitIban()], ...Object.entries(secrets)]),
    konten: new Map([[String(a.user_id), { email: "max.krause@example.org", gesperrt: false, bestaetigt: true, ...konto }]]),
    registrierungen: new Set(registrierungen),
    kuendigungen: new Set(kuendigungen),
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

test("Muster: nur A gekündigt → Kündigung übernehmen, nur mit Selbstkündigung (Review M1)", () => {
  const a = kontoProfil({ Status: "cancelled", "Datum_Kündigung": "2026-09-15" });
  const r = stufeEin(a, importProfil(), kontext({ a, konto: { gesperrt: true } }));
  assert.deepEqual(r, { einstufung: "kuendigung", gruende: [], freigabe: [] });
  // ohne Grund-Eintrag in membership_cancellations (z. B. vom Vorstand auf „ausgetreten“ gesetzt): prüfen
  assert.deepEqual(stufeEin(a, importProfil(), kontext({ a, konto: { gesperrt: true }, kuendigungen: [] })).gruende, [
    "kuendigung_ohne_nachweis",
  ]);
  // Grund-Eintrag zu einem anderen Profil zählt nicht
  assert.deepEqual(
    stufeEin(a, importProfil(), kontext({ a, konto: { gesperrt: true }, kuendigungen: [UUID_B] })).gruende,
    ["kuendigung_ohne_nachweis"]
  );
  // ohne Datum: prüfen
  const ohneDatum = kontoProfil({ Status: "cancelled" });
  assert.deepEqual(stufeEin(ohneDatum, importProfil(), kontext({ a: ohneDatum, konto: { gesperrt: true } })).gruende, [
    "kuendigung_ohne_datum",
  ]);
  // beide gekündigt: kein Nachweis nötig (Status von B ändert sich nicht)
  const b = importProfil({ Status: "cancelled", "Datum_Kündigung": "2026-08-01" });
  assert.equal(stufeEin(a, b, kontext({ a, b, konto: { gesperrt: true }, kuendigungen: [] })).einstufung, "zusammenfuehren");
});

test("Prüfen: B mit Rolle board/admin immer (Review M2)", () => {
  for (const rolle of ["board", "admin"]) {
    const b = importProfil({ Rolle: rolle });
    assert.deepEqual(stufeEin(kontoProfil(), b, kontext({ b })).gruende, ["rolle_b_vorstand"], rolle);
    const a = kontoProfil({ Rolle: rolle });
    assert.deepEqual(stufeEin(a, b, kontext({ a, b })).gruende, ["rolle_b_vorstand"], `${rolle} beide`);
    const ak = kontoProfil({ Status: "cancelled", "Datum_Kündigung": "2026-09-15" });
    assert.deepEqual(stufeEin(ak, b, kontext({ a: ak, b, konto: { gesperrt: true } })).gruende, ["rolle_b_vorstand"]);
  }
  const alumni = importProfil({ Rolle: "alumni" });
  assert.equal(stufeEin(kontoProfil(), alumni, kontext({ b: alumni })).einstufung, "zusammenfuehren");
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
    ["a_hat_weitere_daten", { a: kontoProfil({ "Studiengang / Fach": "Informatik" }) }],
    ["a_hat_weitere_daten", { a: kontoProfil({ "Sepa-Bestätigung": true }), b: importProfil({ "Sepa-Bestätigung": false }) }],
    ["a_hat_weitere_daten", { a: kontoProfil({ daten_bestaetigt_am: "2026-11-19T10:00:00+00:00" }) }],
    ["a_hat_weitere_daten", { a: kontoProfil({ Semester: 0 }) }],
    ["status_unklar", { a: kontoProfil({ Status: "applicant" }) }],
    ["status_unklar", { b: importProfil({ Status: " Applicant" }) }],
    ["status_unklar", { a: kontoProfil({ Status: "alumni" }) }],
    ["status_unklar", { b: importProfil({ Status: "alumni" }) }],
    ["status_unklar", { b: importProfil({ Status: null }) }],
    ["konto_unbestaetigt", { konto: { bestaetigt: false } }],
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
  // Status mit Großschreibung/Leerzeichen ist in Ordnung
  const as = kontoProfil({ Status: " Active " });
  assert.equal(stufeEin(as, importProfil(), kontext({ a: as })).einstufung, "zusammenfuehren");
  // Weitere Daten: gleicher Wert bei B, leer oder false bei A → in Ordnung
  const gleich = { "Studiengang / Fach": "BWL", "Sepa-Bestätigung": true, Anrede: " ", Abschluss: null, "Vereinsatzung-Bestätigung": false };
  const ag = kontoProfil(gleich);
  const bg = importProfil({ "Studiengang / Fach": "BWL", "Sepa-Bestätigung": true });
  assert.equal(stufeEin(ag, bg, kontext({ a: ag, b: bg })).einstufung, "zusammenfuehren");
  // Datum_Antrag von A (Anlagetag) wird bewusst nicht übernommen und blockiert nicht
  const aa = kontoProfil({ Datum_Antrag: "2026-02-23" });
  assert.equal(stufeEin(aa, importProfil({ Datum_Antrag: "2019-10-01" }), kontext({ a: aa })).einstufung, "zusammenfuehren");
});

test("Weitere Daten von A: Spalten aus dem Schema abgeleitet, Liste in DB und Skript gleich (Review N2)", () => {
  const schema = profilSpaltenAusSchema();
  assert.ok(schema.size >= 30, `nur ${schema.size} Spalten erkannt`);
  for (const s of ["Studiengang / Fach", "Sepa-Bestätigung", "Vereinsatzung-Bestätigung", "daten_bestaetigt_am", "daten_erinnern_ab"]) {
    assert.ok(schema.has(s), s);
  }
  // Jede behandelte Spalte gibt es wirklich (kein Tippfehler, der still eine Spalte durchlässt).
  for (const s of BEHANDELTE_SPALTEN) assert.ok(schema.has(s), s);
  // Alle übrigen Spalten des Schemas gelten als „weitere Daten“.
  const a = Object.fromEntries([...schema].map((s) => [s, "x"]));
  const erwartet = [...schema].filter((s) => !BEHANDELTE_SPALTEN.includes(s)).sort();
  assert.deepEqual(weitereDatenVonA(a, {}), erwartet);
  assert.ok(erwartet.includes("Studiengang / Fach") && erwartet.includes("daten_bestaetigt_am") && erwartet.includes("Anrede"));
  // Dieselbe Liste in merge_member_doppelprofil.
  const m = MERGE_SQL.match(/w\.k <> all \(array\[([^\]]+)\]\)/);
  assert.ok(m, "Liste in der DB-Funktion nicht gefunden");
  const sqlListe = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual([...sqlListe].sort(), [...BEHANDELTE_SPALTEN].sort());
  // … und in der Fassung mit Freigabe (20261121105000).
  const m2 = FREIGABE_SQL.match(/w\.k <> all \(array\[([^\]]+)\]\)/);
  assert.ok(m2, "Liste in der DB-Funktion (Freigabe) nicht gefunden");
  assert.deepEqual([...m2[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort(), [...BEHANDELTE_SPALTEN].sort());
  // gesetzt: wie in SQL (null, leerer Text und false zählen nicht)
  for (const w of [null, undefined, false, "", "  \t"]) assert.equal(gesetzt(w), false, JSON.stringify(w));
  for (const w of [true, 0, 3, "x", "2026-01-01"]) assert.equal(gesetzt(w), true, JSON.stringify(w));
});

test("DB-Funktion prüft dieselben neuen Regeln (Review M1, M2, N1, N3, N4)", () => {
  assert.match(MERGE_SQL, /not exists \(select 1 from public\.membership_cancellations mc where mc\.profile_id = a\.id\)/);
  assert.match(MERGE_SQL, /or b\."Rolle"::text in \('board', 'admin'\)/);
  assert.match(MERGE_SQL, /lower\(btrim\(coalesce\(a\."Status", ''\)\)\) not in \('active', 'cancelled'\)/);
  assert.match(MERGE_SQL, /lower\(btrim\(coalesce\(b\."Status", ''\)\)\) not in \('active', 'cancelled'\)/);
  assert.match(MERGE_SQL, /from public\.member_secrets ms\s+where ms\.profile_id in \(p_konto_profil, p_import_profil\) order by ms\.profile_id for update/);
  assert.match(MERGE_SQL, /or u\.email_confirmed_at is null/);
  // Sperren vor der Musterprüfung
  assert.ok(MERGE_SQL.indexOf("ms.profile_id for update") < MERGE_SQL.indexOf("-- ---- Muster"));
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
      [UUID_A, { email: "max.krause@example.org", gesperrt: false, bestaetigt: true }],
      [a2.id, { email: "erika.beispiel@example.org", gesperrt: true, bestaetigt: true }],
      [a3.id, { email: "lena.probe@example.org", gesperrt: false, bestaetigt: true }],
    ]),
    registrierungen: new Set(),
    kuendigungen: new Set([a2.id]),
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
  assert.equal(zeilen[0], "art\teinstufung\tgruende\tkonto_profil_id\timport_profil_id\tprofil_ids\tfreigabe");
  assert.equal(zeilen.length, 5);
  assert.ok(zeilen.includes(`paar\tzusammenfuehren\t\t${UUID_A}\t${UUID_B}\t${UUID_A},${UUID_B}\t`));
  assert.ok(zeilen.includes(`paar\tkuendigung\t\t${a2.id}\t${b2.id}\t${a2.id},${b2.id}\t`));
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

// ---------------------------------------------------------------------------------------------------
// Ausdrückliche Freigabe (--freigabe <A-ID>:<B-ID>, Entscheidung Hannes 20.11.2026)
// ---------------------------------------------------------------------------------------------------

const FREI = freigabeSchluessel(UUID_A, UUID_B);

test("Freigabe: Argumente – Format, mehrfach, nur bei zusammenfuehren", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "doppel-repo-"));
  try {
    const basis = ["--projekt", "lokal", "--url", "http://127.0.0.1:54321"];
    const a2 = "a2a2a2a2-0000-4000-a000-000000000001";
    const b2 = "b2b2b2b2-0000-4000-a000-000000000001";
    const p = leseDoppelArgumente(
      ["zusammenfuehren", "--probelauf", "--freigabe", `${UUID_A.toUpperCase()}:${UUID_B}`, "--freigabe", `${a2}:${b2}`, ...basis],
      {},
      repo
    );
    assert.equal(p.fehler, undefined);
    assert.deepEqual([...p.freigaben].sort(), [FREI, freigabeSchluessel(a2, b2)].sort());
    // ohne Freigabe: leere Menge
    assert.equal(leseDoppelArgumente(["zusammenfuehren", "--probelauf", ...basis], {}, repo).freigaben.size, 0);
    // nur bei zusammenfuehren
    assert.match(leseDoppelArgumente(["pruefen", "--freigabe", FREI, ...basis], {}, repo).fehler, /nur bei „zusammenfuehren“/);
    // Format
    for (const falsch of [undefined, "", UUID_A, `${UUID_A}:`, `${UUID_A}:${UUID_B}:x`, `${UUID_A},${UUID_B}`, "--probelauf"]) {
      const argv = ["zusammenfuehren", "--probelauf", ...basis, "--freigabe"];
      if (falsch !== undefined) argv.push(falsch);
      assert.match(leseDoppelArgumente(argv, {}, repo).fehler ?? "", /--freigabe braucht/, String(falsch));
    }
    assert.match(leseFreigaben(["--freigabe", `${UUID_A}:${UUID_A}`]).fehler, /gleich/);
    // eine ID in zwei Freigaben (auch vertauscht oder doppelt) → Fehler
    assert.match(leseFreigaben(["--freigabe", FREI, "--freigabe", FREI]).fehler, /mehreren Freigaben/);
    assert.match(leseFreigaben(["--freigabe", FREI, "--freigabe", `${UUID_B}:${a2}`]).fehler, /mehreren Freigaben/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("Freigabe: hebt genau die drei Gründe auf, nur für genau dieses Paar", () => {
  assert.deepEqual([...FREIGEBBARE_GRUENDE].sort(), ["a_hat_namen", "iban_gruppe", "rolle_b_vorstand"]);
  const dritter = "dddddddd-0000-4000-a000-000000000001";
  const faelle = [
    // rolle_b_vorstand: beide Vorstand (wie im Befund)
    { a: kontoProfil({ Rolle: "board" }), b: importProfil({ Rolle: "board" }), secrets: {}, grund: ["rolle_b_vorstand"] },
    // a_hat_namen
    { a: kontoProfil({ Vorname: "Max", Nachname: "Krause" }), b: importProfil(), secrets: {}, grund: ["a_hat_namen"] },
    // iban_gruppe: dritter Profil mit gleichem Fingerabdruck
    { a: kontoProfil(), b: importProfil(), secrets: { [dritter]: secretsMitIban("h1.k1.aaa") }, grund: ["iban_gruppe"] },
  ];
  for (const f of faelle) {
    const ohne = kontext({ a: f.a, b: f.b, secrets: f.secrets });
    const ibanAnzahl = new Map([["h1.k1.aaa", 1 + Object.keys(f.secrets).length]]);
    assert.deepEqual(stufeEin(f.a, f.b, { ...ohne, ibanAnzahl }), { einstufung: "pruefen", gruende: f.grund, freigabe: [] });
    const mit = stufeEin(f.a, f.b, { ...ohne, ibanAnzahl, freigaben: new Set([FREI]) });
    assert.deepEqual(mit, { einstufung: "zusammenfuehren", gruende: [], freigabe: f.grund });
    // Freigabe für ein anderes Paar oder vertauscht: wirkt nicht
    for (const anders of [freigabeSchluessel(UUID_B, UUID_A), freigabeSchluessel(UUID_A, dritter)]) {
      assert.equal(stufeEin(f.a, f.b, { ...ohne, ibanAnzahl, freigaben: new Set([anders]) }).einstufung, "pruefen");
    }
  }
  // alle drei zugleich
  const a = kontoProfil({ Rolle: "board", Vorname: "Max" });
  const b = importProfil({ Rolle: "board" });
  const ctx = { ...kontext({ a, b }), ibanAnzahl: new Map([["h1.k1.aaa", 2]]), freigaben: new Set([FREI]) };
  assert.deepEqual(stufeEin(a, b, ctx), {
    einstufung: "zusammenfuehren",
    gruende: [],
    freigabe: ["a_hat_namen", "iban_gruppe", "rolle_b_vorstand"],
  });
});

test("Freigabe: jeder andere Grund sperrt weiter (Sicherungen unverändert)", () => {
  const frei = new Set([FREI]);
  const andere = [
    { a: kontoProfil({ Rolle: "board" }), b: importProfil({ Rolle: "admin" }), grund: "rolle" },
    { a: kontoProfil({ Vorname: "Max" }), b: importProfil({ Status: "cancelled", "Datum_Kündigung": "2026-01-01" }), grund: "b_gekuendigt" },
    { a: kontoProfil({ Vorname: "Max", Mitgliedsnummer: "7" }), b: importProfil(), grund: "a_hat_stammdaten" },
    { a: kontoProfil({ Vorname: "Max", "Studiengang / Fach": "BWL" }), b: importProfil(), grund: "a_hat_weitere_daten" },
    { a: kontoProfil({ Vorname: "Max", id: UUID_A, user_id: "cccccccc-0000-4000-a000-000000000001" }), b: importProfil(), grund: "a_id_ungleich_konto" },
    { a: kontoProfil({ Rolle: "board" }), b: importProfil({ Rolle: "board", Vorname: "" }), grund: "b_ohne_namen" },
    { a: kontoProfil({ Vorname: "Max", created_at: "2026-01-01T00:00:00+00:00" }), b: importProfil(), grund: "reihenfolge" },
  ];
  for (const f of andere) {
    const r = stufeEin(f.a, f.b, { ...kontext({ a: f.a, b: f.b }), freigaben: frei });
    assert.equal(r.einstufung, "pruefen", f.grund);
    assert.ok(r.gruende.includes(f.grund), `${f.grund}: ${r.gruende}`);
    assert.deepEqual(r.freigabe, [], f.grund);
  }
  // Konto nicht bestätigt / Sperre passt nicht / offene Registrierung / Kontoadresse anders
  const a = kontoProfil({ Vorname: "Max" });
  for (const [ctx, grund] of [
    [kontext({ a, konto: { bestaetigt: false } }), "konto_unbestaetigt"],
    [kontext({ a, konto: { gesperrt: true } }), "konto_sperre"],
    [kontext({ a, registrierungen: [UUID_A] }), "registrierung_offen"],
    [kontext({ a, konto: { email: "andere@example.org" } }), "konto_email"],
    [kontext({ a, secrets: { [UUID_A]: { daten: true, iban: false, ibanHash: null } } }), "a_hat_daten"],
  ]) {
    const r = stufeEin(a, importProfil(), { ...ctx, freigaben: frei });
    assert.equal(r.einstufung, "pruefen", grund);
    assert.ok(r.gruende.includes(grund), grund);
  }
});

test("Freigabe: Zählung, Ausgabe ohne IDs, Liste mit aufgehobenen Gründen", () => {
  const a = kontoProfil({ Rolle: "board" });
  const b = importProfil({ Rolle: "board" });
  const ohnePaar = freigabeSchluessel("eeeeeeee-0000-4000-a000-000000000001", "ffffffff-0000-4000-a000-000000000001");
  const ergebnis = findePaare([a, b], { ...kontext({ a, b }), freigaben: new Set([FREI, ohnePaar]) });
  assert.equal(ergebnis.eintraege[0].einstufung, "zusammenfuehren");
  assert.deepEqual(ergebnis.freigaben, { angegeben: 2, angewendet: 1, weiterPruefen: 0, unnoetig: 0, ohnePaar: 1 });
  const z = zaehleAlle([a, b], ergebnis);
  assert.equal(z.zuAendern, 1);
  const text = formatiereProbelauf(z);
  assert.match(text, /angewendet \(Paar wird zusammengeführt\)\s+1$/m);
  assert.match(text, /ohne Paar \(schon erledigt oder falsche IDs\)\s+1$/m);
  for (const verboten of ["aaaaaaaa", "bbbbbbbb", "eeeeeeee", "Max", "example.org"]) assert.ok(!text.includes(verboten), verboten);
  // ohne Freigaben keine Freigabe-Zeilen
  assert.ok(!formatiereProbelauf(zaehleAlle([a, b], findePaare([a, b], kontext({ a, b })))).includes("Freigaben"));
  // Liste
  const tsv = listeTsv(ergebnis).trimEnd().split("\n");
  assert.ok(tsv.includes(`paar\tzusammenfuehren\t\t${UUID_A}\t${UUID_B}\t${UUID_A},${UUID_B}\trolle_b_vorstand`));
  // wirkungslos (andere Gründe) und nicht nötig
  const b2 = importProfil({ Rolle: "board", Status: "cancelled", "Datum_Kündigung": "2026-01-01" });
  assert.equal(findePaare([a, b2], { ...kontext({ a, b: b2 }), freigaben: new Set([FREI]) }).freigaben.weiterPruefen, 1);
  const a3 = kontoProfil();
  const b3 = importProfil();
  assert.equal(findePaare([a3, b3], { ...kontext(), freigaben: new Set([FREI]) }).freigaben.unnoetig, 1);
});

test("Freigabe: schreibePaar übergibt nur die aufgehobenen Gründe, sonst null", async () => {
  const a = kontoProfil({ Vorname: "Max" });
  const b = importProfil();
  const mit = findePaare([a, b], { ...kontext({ a, b }), freigaben: new Set([FREI]) }).eintraege[0];
  const ohne = findePaare([kontoProfil(), importProfil()], kontext()).eintraege[0];
  const aufrufe = [];
  const db = { async zusammenfuehren(...args) { aufrufe.push(args); return "zusammengefuehrt"; } };
  const r = neuesErgebnis();
  await schreibePaar(db, mit, r);
  await schreibePaar(db, ohne, r);
  assert.deepEqual(aufrufe[0][3], ["a_hat_namen"]);
  assert.equal(aufrufe[1][3], null);
  assert.deepEqual([r.zusammengefuehrt, r.freigabe], [2, 1]);
  assert.match(formatiereErgebnis(r), /davon mit ausdrücklicher Freigabe\s+1$/m);
  // unbekannter Grund in der Freigabe → nie an die DB
  const vorher = aufrufe.length;
  assert.equal(await schreibePaar(db, { ...mit, freigabe: ["konto_sperre"] }, r), "fehler");
  assert.equal(aufrufe.length, vorher);
});

test("Freigabe: DB-Funktion (20261121105000) – nur die drei Codes, Regeln für Namen, Rolle, IBAN, E-Mail, Protokoll", () => {
  // ersetzt die Fassung mit 4 Parametern, neuer optionaler Parameter, nur service_role
  assert.match(FREIGABE_SQL, /drop function if exists public\.merge_member_doppelprofil\(uuid, uuid, jsonb, uuid\);/);
  assert.match(FREIGABE_SQL, /p_freigabe\s+text\[\] default null/);
  assert.match(FREIGABE_SQL, /revoke all on function public\.merge_member_doppelprofil\(uuid, uuid, jsonb, uuid, text\[\]\) from public, anon, authenticated;/);
  assert.match(FREIGABE_SQL, /grant execute on function public\.merge_member_doppelprofil\(uuid, uuid, jsonb, uuid, text\[\]\) to service_role;/);
  assert.doesNotMatch(FREIGABE_SQL, /to (anon|authenticated)\b/);
  // dieselben drei Codes wie im Skript
  const m = FREIGABE_SQL.match(/f\.code not in \(([^)]+)\)/);
  assert.ok(m);
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort(), [...FREIGEBBARE_GRUENDE].sort());
  // die drei Sperren sind nur mit Freigabe aufgehoben, alle anderen unverändert wie in 20261121100000
  assert.match(FREIGABE_SQL, /or \(not v_frei_namen and \(coalesce\(a\."Vorname", ''\) !~/);
  assert.match(FREIGABE_SQL, /or \(not v_frei_rolle and b\."Rolle"::text in \('board', 'admin'\)\)/);
  assert.match(FREIGABE_SQL, /if not v_frei_iban and v_b_hash is not null and exists \(/);
  for (const sicherung of [
    /or coalesce\(b\."Vorname", ''\) ~ '\^\\s\*\$' or coalesce\(b\."Nachname", ''\) ~ '\^\\s\*\$'/,
    /or \(a\."Rolle" is not null and a\."Rolle"::text <> 'member' and a\."Rolle" is distinct from b\."Rolle"\)/,
    /or b\.created_at > a\.created_at/,
    /or u\.email_confirmed_at is null/,
    /not public\.merge_member_doppelprofil_stand\(a, p_expected->'a'\)/,
    /not exists \(select 1 from public\.membership_cancellations mc where mc\.profile_id = a\.id\)/,
  ]) {
    assert.match(FREIGABE_SQL, sicherung);
    assert.match(MERGE_SQL, sicherung);
  }
  // E-Mail = Adresse des Kontos; Namen von B, von A nur wo B leer; Rolle und IBAN werden nicht geschrieben
  assert.match(FREIGABE_SQL, /"E-Mail" = u\.email,/);
  assert.match(FREIGABE_SQL, /v_vorname\s+:= case when coalesce\(b\."Vorname", ''\) ~ '\^\\s\*\$' then a\."Vorname" else b\."Vorname" end;/);
  assert.match(FREIGABE_SQL, /v_nachname := case when coalesce\(b\."Nachname", ''\) ~ '\^\\s\*\$' then a\."Nachname" else b\."Nachname" end;/);
  const update = FREIGABE_SQL.match(/update public\.profiles p\s+set ([\s\S]*?)\s+where p\.id = b\.id;/);
  assert.ok(update);
  assert.doesNotMatch(update[1], /Rolle|IBAN/);
  assert.doesNotMatch(FREIGABE_SQL, /update public\.member_secrets/);
  // Protokoll
  assert.match(FREIGABE_SQL, /if u\.email is distinct from b\."E-Mail" then v_fields := v_fields \|\| 'email'::text; end if;/);
  assert.match(FREIGABE_SQL, /'freigabe'::text\s+\|\| array\(select 'freigabe_' \|\| f\.code/);
});
