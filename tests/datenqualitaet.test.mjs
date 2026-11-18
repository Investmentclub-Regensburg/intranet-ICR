// Tests für scripts/lib/datenqualitaet.mjs (Paket „Mitgliederdaten“, PR 3). Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUSGABE_FELDER,
  GESPEICHERTE_FELDER,
  SCHREIBBARE_FELDER,
  bewerteProfil,
  fehlerOhneDaten,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  leseArgumente,
  liegtIn,
  listeTsv,
  mitVersionsSperre,
  neuesReparaturErgebnis,
  zaehleAlle,
} from "../scripts/lib/datenqualitaet.mjs";
import { SECRET_FIELDS } from "../lib/member-crypto.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEUTE = "2026-11-18";
const IBAN_DE = "DE89370400440532013000";
const IBAN_DE_FALSCH = "DE89370400440532013001";
const IBAN_AT = "AT611904300234573201";

const AKTIV = { Status: "active", Rolle: "member" };
const VORSTAND = { Status: "active", Rolle: "board" };
const ALUMNI = { Status: "active", Rolle: "alumni" };
const ALUMNI_ALT = { Status: "alumni", Rolle: "alumni" };
const GEKUENDIGT = { Status: "cancelled", Rolle: "member" };
const ANTRAG = { Status: "applicant", Rolle: "member" };

/** Sauberer Datensatz; `aenderung` überschreibt einzelne Felder. */
function daten(aenderung = {}) {
  return {
    iban: IBAN_DE,
    bic: "COBADEFFXXX",
    geburtsdatum: "2001-04-12",
    strasse: "Lindenweg",
    hausnummer: "7",
    plz: "93047",
    ort: "Regensburg",
    handynummer: "+4915112345678",
    ...aenderung,
  };
}

const bewerte = (profil, werte, hatZeile = true) => bewerteProfil({ profil, werte, hatZeile, heute: HEUTE });

test("Feldliste: gelesene Felder = SECRET_FIELDS, geschrieben werden nur die vier erlaubten", () => {
  assert.deepEqual([...GESPEICHERTE_FELDER].sort(), [...SECRET_FIELDS].filter((f) => f !== "land").sort());
  assert.deepEqual([...SCHREIBBARE_FELDER].sort(), ["bic", "handynummer", "hausnummer", "strasse"]);
  assert.ok(AUSGABE_FELDER.includes("land"));
});

test("sauberer Datensatz: alles gültig, nichts zu ändern", () => {
  const b = bewerte(AKTIV, daten());
  assert.equal(b.gruppe, "aktiv");
  assert.deepEqual(b.maengel, []);
  assert.deepEqual(b.aenderungen, {});
  for (const feld of AUSGABE_FELDER) assert.equal(b.status[feld], "gueltig", feld);
});

test("Land fehlt → gilt als DE (PLZ 4-stellig ist Mangel)", () => {
  const b = bewerte(AKTIV, daten({ plz: "9304" }));
  assert.deepEqual(b.maengel, [{ feld: "plz", code: "format" }]);
  assert.equal(b.status.land, "gueltig");
  assert.equal(b.status.plz, "offen");
});

test("Handy: deutsche Belege → sicher (E.164), Rest vorschlag oder offen", () => {
  for (const roh of ["+49 0176 12345678", "0049176 12345678", "0176 12345678"]) {
    const b = bewerte(AKTIV, daten({ handynummer: roh }));
    assert.equal(b.status.handynummer, "sicher", roh);
    assert.deepEqual(b.aenderungen, { handynummer: "+4917612345678" }, roh);
  }
  const ohneVorwahl = bewerte(AKTIV, daten({ handynummer: "17612345678" }));
  assert.equal(ohneVorwahl.status.handynummer, "vorschlag");
  assert.deepEqual(ohneVorwahl.aenderungen, {});
  assert.deepEqual(ohneVorwahl.hinweise, [{ feld: "handynummer", code: "vorwahl_ergaenzt" }]);

  const at = bewerte(AKTIV, daten({ handynummer: "+43 664 1234567" }));
  assert.equal(at.status.handynummer, "vorschlag");
  assert.deepEqual(at.aenderungen, {});

  for (const [roh, code] of [
    ["0941 123456", "kein_mobil"],
    ["0176 12", null],
    ["max.handy@example.org", "format"],
    [null, "fehlt"],
    ["13812345678", null],
  ]) {
    const b = bewerte(AKTIV, daten({ handynummer: roh }));
    assert.equal(b.status.handynummer, "offen", String(roh));
    assert.deepEqual(b.aenderungen, {}, String(roh));
    const m = b.maengel.find((x) => x.feld === "handynummer");
    assert.ok(m, String(roh));
    if (code) assert.equal(m.code, code, String(roh));
  }
});

test("BIC: falsches Format → sicher leeren; Länderabweichung nur Hinweis", () => {
  const format = bewerte(AKTIV, daten({ bic: "COBADE" }));
  assert.equal(format.status.bic, "sicher");
  assert.deepEqual(format.aenderungen, { bic: "" });

  const land = bewerte(AKTIV, daten({ bic: "GIBAATWWXXX" }));
  assert.equal(land.status.bic, "gueltig");
  assert.deepEqual(land.aenderungen, {});
  assert.deepEqual(land.hinweise, [{ feld: "bic", code: "bic_land" }]);

  const leer = bewerte(AKTIV, daten({ bic: null }));
  assert.equal(leer.status.bic, "gueltig");
  assert.deepEqual(leer.maengel, []);
});

test("Straße mit Hausnummer → sicher abtrennen; unklare Fälle offen", () => {
  const b = bewerte(AKTIV, daten({ strasse: "Hauptstraße 12", hausnummer: null }));
  assert.equal(b.status.strasse, "sicher");
  assert.equal(b.status.hausnummer, "sicher");
  assert.deepEqual(b.aenderungen, { strasse: "Hauptstraße", hausnummer: "12" });

  const zimmer = bewerte(AKTIV, daten({ strasse: "Hauptstraße 12 Zimmer 4", hausnummer: null }));
  assert.equal(zimmer.status.strasse, "offen");
  assert.deepEqual(zimmer.aenderungen, {});
});

test("IBAN wird nie geschrieben: Schreibweise gilt als gültig, Prüfziffer offen", () => {
  const schreibweise = bewerte(AKTIV, daten({ iban: "de89 3704 0044 0532 0130 00" }));
  assert.equal(schreibweise.status.iban, "gueltig");
  assert.deepEqual(schreibweise.aenderungen, {});

  const falsch = bewerte(AKTIV, daten({ iban: IBAN_DE_FALSCH }));
  assert.equal(falsch.status.iban, "offen");
  assert.deepEqual(falsch.maengel, [{ feld: "iban", code: "pruefziffer" }]);
  assert.deepEqual(falsch.aenderungen, {});

  const us = bewerte(AKTIV, daten({ iban: "US64SVBKUS6S3300958879", bic: "SVBKUS6SXXX" }));
  assert.ok(us.maengel.some((m) => m.feld === "iban" && m.code === "nicht_sepa"));

  const at = bewerte(AKTIV, daten({ iban: IBAN_AT, bic: "GIBAATWWXXX" }));
  assert.deepEqual(at.maengel, []);
});

test("Alumni: IBAN/BIC nie Mangel (auch alte Status-Schreibweise)", () => {
  for (const profil of [ALUMNI, ALUMNI_ALT]) {
    const b = bewerte(profil, daten({ iban: null, bic: null }));
    assert.equal(b.gruppe, "aktiv");
    assert.equal(b.alumni, true);
    assert.deepEqual(b.maengel, []);
    const falsch = bewerte(profil, daten({ iban: IBAN_DE_FALSCH }));
    assert.deepEqual(falsch.maengel, []);
    assert.equal(falsch.status.iban, "gueltig");
  }
});

test("gekündigt und Antrag offen: nur gezählt, nie geändert", () => {
  for (const [profil, gruppe] of [
    [GEKUENDIGT, "gekuendigt"],
    [ANTRAG, "antrag_offen"],
  ]) {
    const b = bewerte(profil, daten({ handynummer: "0176 12345678", bic: "COBADE" }));
    assert.equal(b.gruppe, gruppe);
    assert.deepEqual(b.aenderungen, {});
  }
});

test("ohne member_secrets-Zeile: Pflichtfelder fehlen, nichts zu schreiben", () => {
  const leer = Object.fromEntries(SECRET_FIELDS.map((f) => [f, null]));
  const b = bewerte(AKTIV, leer, false);
  assert.equal(b.hatZeile, false);
  const felder = b.maengel.map((m) => `${m.feld}:${m.code}`).sort();
  assert.deepEqual(felder, [
    "geburtsdatum:fehlt",
    "handynummer:fehlt",
    "hausnummer:fehlt",
    "iban:fehlt",
    "ort:fehlt",
    "plz:fehlt",
    "strasse:fehlt",
  ]);
  assert.deepEqual(b.aenderungen, {});
});

test("nicht lesbar: keine Bewertung, keine Änderung", () => {
  const b = bewerte(VORSTAND, "unreadable");
  assert.equal(b.lesbar, false);
  assert.deepEqual(b.aenderungen, {});
  const z = zaehleAlle([b]);
  assert.equal(z.nichtLesbar, 1);
  assert.equal(z.aktiv, 1);
});

test("idempotent: nach dem Anwenden der Änderungen ist nichts mehr zu tun", () => {
  const faelle = [
    daten({ handynummer: "+49 0176 12345678" }),
    daten({ handynummer: "0049176 12345678", bic: "COBADE" }),
    daten({ strasse: "Hauptstraße 12", hausnummer: null }),
    daten({ strasse: "Lindenallee 3", hausnummer: null, bic: "COBADE", handynummer: "0176 12", iban: null }),
  ];
  for (const werte of faelle) {
    const erst = bewerte(VORSTAND, werte);
    assert.ok(Object.keys(erst.aenderungen).length > 0);
    // saveMemberSecrets speichert "" als null.
    const gespeichert = { ...werte };
    for (const [feld, wert] of Object.entries(erst.aenderungen)) gespeichert[feld] = wert === "" ? null : wert;
    const zweit = bewerte(VORSTAND, gespeichert);
    assert.deepEqual(zweit.aenderungen, {});
    for (const feld of Object.keys(erst.aenderungen)) assert.equal(zweit.status[feld], "gueltig", feld);
  }
});

// ---------------------------------------------------------------------------------------------------
// Ausgabe ohne Werte
// ---------------------------------------------------------------------------------------------------

const ID = (n) => `0000000${n}-aaaa-4bbb-8ccc-${String(n).padStart(12, "d")}`;
const STICHPROBE = [
  { id: ID(1), profil: AKTIV, werte: daten({ handynummer: "+49 0176 12345678" }) },
  { id: ID(2), profil: AKTIV, werte: daten({ handynummer: "17698765432", bic: "COBADE" }) },
  { id: ID(3), profil: AKTIV, werte: daten({ strasse: "Hauptstraße 12", hausnummer: null, plz: "9304" }) },
  { id: ID(4), profil: VORSTAND, werte: daten({ iban: IBAN_DE_FALSCH, handynummer: "0941 123456" }) },
  { id: ID(5), profil: ALUMNI, werte: daten({ iban: null, bic: null, ort: "Neumarkt i.d.OPf." }) },
  { id: ID(6), profil: GEKUENDIGT, werte: daten({ handynummer: "max.handy@example.org" }) },
  { id: ID(7), profil: ANTRAG, werte: daten({ geburtsdatum: null }) },
  { id: ID(8), profil: AKTIV, werte: Object.fromEntries(SECRET_FIELDS.map((f) => [f, null])), hatZeile: false },
  { id: ID(9), profil: AKTIV, werte: "unreadable" },
];
const KLARTEXTE = new Set();
for (const s of STICHPROBE) {
  if (s.werte === "unreadable") continue;
  for (const v of Object.values(s.werte)) {
    // Kurze Werte (Hausnummer „7“) kommen zwangsläufig auch als Zahl vor; geprüft wird ab 4 Zeichen.
    if (!v || String(v).length < 4) continue;
    KLARTEXTE.add(v);
    // auch normalisierte Formen und Teilstücke (z. B. Ziffernfolgen, E.164)
    for (const teil of String(v).split(/[\s.,]+/)) if (teil.length >= 4) KLARTEXTE.add(teil);
    KLARTEXTE.add(String(v).replace(/\s/g, ""));
  }
}
KLARTEXTE.add("+4917612345678");
KLARTEXTE.add("+4917698765432");
KLARTEXTE.add("Hauptstraße");

function auswerten() {
  const eintraege = STICHPROBE.map((s) => ({
    id: s.id,
    bewertung: bewerteProfil({ profil: s.profil, werte: s.werte, hatZeile: s.hatZeile ?? true, heute: HEUTE }),
  }));
  return { eintraege, z: zaehleAlle(eintraege.map((e) => e.bewertung)) };
}

function ohneKlartext(text, { idsErlaubt = false } = {}) {
  for (const wert of KLARTEXTE) assert.ok(!text.includes(wert), `Ausgabe enthält einen Klartextwert (${wert.length} Zeichen)`);
  if (!idsErlaubt) for (const s of STICHPROBE) assert.ok(!text.includes(s.id), "Ausgabe enthält eine Profil-ID");
}

test("Zählungen der Stichprobe", () => {
  const { z } = auswerten();
  assert.equal(z.profile, 9);
  assert.equal(z.aktiv, 7);
  assert.equal(z.alumni, 1);
  assert.equal(z.gekuendigt, 1);
  assert.equal(z.antragOffen, 1);
  assert.equal(z.nichtBetroffenMitMangel, 2);
  assert.equal(z.ohneZeileAktiv, 1);
  assert.equal(z.ohneZeileGesamt, 1);
  assert.equal(z.nichtLesbar, 1);
  assert.equal(z.maengel.handynummer.kein_mobil, 1);
  assert.equal(z.maengel.handynummer.fehlt, 1);
  assert.equal(z.maengel.iban.pruefziffer, 1);
  assert.equal(z.maengel.plz.format, 1);
  assert.equal(z.maengel.strasse.hausnummer_in_strasse, 1);
  assert.equal(z.hinweise.handynummer.vorwahl_ergaenzt, 1);
  assert.equal(z.status.handynummer.sicher, 1);
  assert.equal(z.status.handynummer.vorschlag, 1);
  assert.equal(z.status.bic.sicher, 1);
  assert.equal(z.status.strasse.sicher, 1);
  assert.equal(z.zuAendern, 3);
  assert.deepEqual(z.aenderungenJeFeld, { handynummer: 1, bic: 1, strasse: 1, hausnummer: 1 });
  // Summe je Feld = aktive, lesbare Profile
  for (const feld of AUSGABE_FELDER) {
    const summe = Object.values(z.status[feld]).reduce((a, b) => a + b, 0);
    assert.equal(summe, 6, feld);
  }
});

test("Ausgaben enthalten keine Werte und keine Profil-IDs", () => {
  const { z, eintraege } = auswerten();
  const r = neuesReparaturErgebnis();
  r.geaendert = 3;
  r.felder = { handynummer: 1, bic: 1, strasse: 1, hausnummer: 1 };
  for (const text of [formatierePruefung(z), formatiereProbelauf(z), formatiereReparatur(r)]) {
    ohneKlartext(text);
    assert.match(text, /\d/);
  }
  const tsv = listeTsv(eintraege);
  ohneKlartext(tsv, { idsErlaubt: true });
  const zeilen = tsv.trim().split("\n");
  assert.equal(zeilen[0], "profil_id\tgruppe\tzeile\tmaengel\thinweise\tvorschlaege\tautomatisch");
  assert.ok(zeilen.some((l) => l.startsWith(`${ID(4)}\taktiv\tja\thandynummer:kein_mobil,iban:pruefziffer`)));
  assert.ok(zeilen.some((l) => l.startsWith(`${ID(9)}\taktiv\tnicht_lesbar`)));
  assert.ok(!zeilen.some((l) => l.startsWith(ID(5))), "Alumni ohne Bankdaten hat keinen Befund");
});

test("Fehlerausgabe enthält nie die Meldung", () => {
  const err = new Error(`Profil ${ID(1)} mit +4917612345678 nicht gefunden`);
  const text = fehlerOhneDaten(err);
  assert.ok(text.startsWith("Error"));
  ohneKlartext(text);
  assert.ok(!text.includes("nicht gefunden"));
  assert.equal(fehlerOhneDaten("irgendwas +4917612345678"), "Fehler");
});

// ---------------------------------------------------------------------------------------------------
// Versionssperre
// ---------------------------------------------------------------------------------------------------

test("Versionssperre: andere Version → Konflikt ohne Datenbankaufruf, gleiche Version → durchgereicht", async () => {
  const aufrufe = [];
  const fake = {
    name: "fake",
    rpc(fn, args) {
      aufrufe.push([fn, args.p_expected_version]);
      return Promise.resolve({ data: null, error: null });
    },
    from(tabelle) {
      return `${this.name}:${tabelle}`;
    },
  };
  const client = mitVersionsSperre(fake, 3);
  assert.equal(client.from("member_secrets"), "fake:member_secrets");
  const ok = await client.rpc("save_member_secrets", { p_expected_version: 3 });
  assert.equal(ok.error, null);
  const konflikt = await client.rpc("save_member_secrets", { p_expected_version: 4 });
  assert.match(konflikt.error.message, /member_secrets_conflict/);
  assert.deepEqual(aufrufe, [["save_member_secrets", 3]]);

  const neu = mitVersionsSperre(fake, null);
  assert.equal((await neu.rpc("save_member_secrets", { p_expected_version: null })).error, null);
  assert.match((await neu.rpc("save_member_secrets", { p_expected_version: 1 })).error.message, /conflict/);
});

// ---------------------------------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------------------------------

const VID = "11111111-2222-4333-8444-555555555555";
const DRAUSSEN = path.join(os.tmpdir(), "dq-liste.tsv");

test("Argumente: Ziel ausdrücklich, Cloud wie im Muster", () => {
  assert.deepEqual(
    pick(leseArgumente(["pruefen", "--projekt", "test"], {}, REPO)),
    { befehl: "pruefen", url: "https://rkegvieoejmyutkowwwf.supabase.co", ziel: "rkegvieoejmyutkowwwf" }
  );
  const lokal = leseArgumente(["reparieren", "--probelauf", "--projekt", "lokal", "--url", "http://127.0.0.1:56321/"], {}, REPO);
  assert.equal(lokal.url, "http://127.0.0.1:56321");
  assert.equal(lokal.ziel, "http://127.0.0.1:56321");
  assert.equal(lokal.probelauf, true);
  const prod = leseArgumente(["pruefen", "--projekt", "prod"], { ICR_SUPABASE_URL: "http://localhost:8100" }, REPO);
  assert.equal(prod.url, "http://localhost:8100");
});

function pick(a) {
  return { befehl: a.befehl, url: a.url, ziel: a.ziel };
}

test("Argumente: Abbrüche", () => {
  const fehler = (argv, env = {}) => leseArgumente(argv, env, REPO).fehler;
  assert.ok(fehler([]));
  assert.ok(fehler(["pruefen"]));
  assert.ok(fehler(["loeschen", "--projekt", "test"]));
  assert.ok(fehler(["pruefen", "reparieren", "--projekt", "test"]));
  assert.ok(fehler(["pruefen", "--projekt", "test", "--probelauf"]));
  assert.ok(fehler(["pruefen", "--projekt", "test", "--force"]));
  assert.ok(fehler(["pruefen", "--projekt", "test", "--url", "http://localhost:8100"]));
  assert.ok(fehler(["pruefen", "--projekt", "test"], { ICR_SUPABASE_URL: "http://localhost:8100" }));
  assert.ok(fehler(["pruefen", "--projekt", "lokal"]));
  assert.ok(fehler(["pruefen", "--projekt", "lokal", "--url", "http://100.78.25.9:56321"]));
  assert.ok(fehler(["pruefen", "--projekt", "prod", "--url", "ftp://x"]));
  assert.ok(fehler(["pruefen", "--projekt", "prod", "--url", "http://localhost:8100/rest"]));
  assert.ok(fehler(["reparieren", "--projekt", "test"]), "reparieren ohne --vorstand");
  assert.ok(fehler(["reparieren", "--projekt", "test", "--vorstand", "jemand"]));
  assert.ok(fehler(["pruefen", "--projekt", "test", "--vorstand", VID]));
  assert.ok(fehler(["pruefen", "--projekt", "test", "--projekt", "prod"]));
  assert.equal(fehler(["reparieren", "--projekt", "test", "--vorstand", VID]), undefined);
  assert.equal(fehler(["reparieren", "--probelauf", "--projekt", "test"]), undefined);
});

test("Argumente: --liste nur außerhalb des Repos und nicht beim Schreiben", () => {
  const ok = leseArgumente(["pruefen", "--projekt", "test", "--liste", DRAUSSEN], {}, REPO);
  assert.equal(ok.fehler, undefined);
  assert.equal(ok.liste, path.resolve(DRAUSSEN));
  for (const drinnen of [path.join(REPO, "liste.tsv"), path.join(REPO, "tests", "x.tsv"), REPO.toUpperCase() + "/y.tsv"]) {
    if (process.platform !== "win32" && drinnen.startsWith(REPO.toUpperCase())) continue;
    assert.ok(leseArgumente(["pruefen", "--projekt", "test", "--liste", drinnen], {}, REPO).fehler, "im Repo");
  }
  assert.ok(leseArgumente(["reparieren", "--projekt", "test", "--vorstand", VID, "--liste", DRAUSSEN], {}, REPO).fehler);
  assert.equal(
    leseArgumente(["reparieren", "--probelauf", "--projekt", "test", "--liste", DRAUSSEN], {}, REPO).fehler,
    undefined
  );
});

test("liegtIn: Windows ohne Groß-/Kleinschreibung, Nachbarordner nicht", () => {
  assert.ok(liegtIn("C:\\Repo\\a\\b.tsv", "c:\\repo", "win32"));
  assert.ok(!liegtIn("C:\\Repo2\\b.tsv", "C:\\Repo", "win32"));
  assert.ok(!liegtIn("C:\\b.tsv", "C:\\Repo", "win32"));
});
