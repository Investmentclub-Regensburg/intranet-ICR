// Doppelprofile zusammenführen (Entscheidung Hannes 20.11.2026): Paare aus Konto-Profil (A, leer) und
// Import-Profil (B, mit Name und IBAN) mit derselben Adresse ohne Groß-/Kleinschreibung. Das Konto kommt an B, A wird
// gelöscht. Einstufung in scripts/lib/doppelprofile.mjs, Schreiben über die Datenbankfunktion
// merge_member_doppelprofil (Migration 20261121100000). Aufbau, Ziel, Sicherungen und Bestätigung wie
// scripts/namen.mjs; ohne Master Key (verschlüsselte Felder werden nur auf „leer/nicht leer“ geprüft).
//
//   npm run doppelprofile -- <befehl> --projekt <prod|test|lokal> [--url <supabase-url>] [Optionen]
//
// Befehle:
//   pruefen                       Zählungen: Paare, Einstufung (zusammenführen / + Kündigung / prüfen), Gründe,
//                                 IBAN-Gruppen. Nur Zahlen, nichts wird geändert.
//   zusammenfuehren --probelauf   Dieselben Zählungen und wie viele Paare „zusammenfuehren“ ändern würde.
//   zusammenfuehren               Führt nur Paare zusammen, die exakt dem Muster entsprechen (Einstufung
//                                 „zusammenfuehren“ oder „kuendigung“). Je Paar EINE Transaktion mit Compare-and-set
//                                 und Protokoll in member_data_corrections (Quelle „bereinigung“). Braucht
//                                 --vorstand <Profil-ID> und das Bestätigungswort „REPARIEREN <ziel> <anzahl>“.
//                                 Strg+C beendet nach dem laufenden Paar.
// Optionen:
//   --liste <datei>               (pruefen, zusammenfuehren --probelauf) TSV mit Profil-IDs, Einstufung und Gründen
//                                 für den Vorstand. Nur außerhalb des Repos; der Inhalt erscheint nie in der Ausgabe.
//
// Ziele wie scripts/datenqualitaet.mjs (gleiche Argumente und Sicherungen): lokal nur Loopback und Testdatenbank,
// prod nur mit ausdrücklichem --url. Laut RAHMEN.md werden Cloud-Projekte nicht angefasst.
//
// Reihenfolge am Umzugsabend: Migration 20261121100000 → dieses Skript → „prüfen“-Fälle von Hand → Migration
// 20261121110000 (Unique-Index auf lower(btrim("E-Mail")), eigener PR feat/email-index; bricht ab, solange noch
// Adressen mehrfach vorkommen) → scripts/namen.mjs.
//
// Ausgabe nur Zahlen – nie Namen, E-Mails oder Profil-IDs, auch nicht bei Fehlern.
import { writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  abbruchBeiSignal,
  bestaetigungswort,
  fehlerOhneDaten,
  ladeAlle,
  pruefeTestziel,
  schreibeAlle,
} from "./lib/datenqualitaet.mjs";
import {
  PROFIL_SPALTEN,
  PROTOKOLL_QUELLE,
  SECRET_SPALTEN,
  emailSchluessel,
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
  zaehleAlle,
} from "./lib/doppelprofile.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Gewollter Abbruch mit eigener (datenfreier) Meldung. Kein process.exit: offene Verbindungen schließen sauber. */
class Abbruch extends Error {}
function fail(message) {
  throw new Abbruch(message);
}

// Unerwartete Fehler nie mit Meldung ausgeben (könnte Namen, Adressen oder IDs enthalten).
function letzterAusweg(err) {
  console.error(`\nFehler: Abgebrochen.\n${fehlerOhneDaten(err)}`);
  process.exit(1);
}
process.on("uncaughtException", letzterAusweg);
process.on("unhandledRejection", letzterAusweg);

// Eingabe wie in scripts/namen.mjs: eine gemeinsame Eingabe, Zeilen gepuffert (auch für weitergeleitete Eingaben),
// verdeckte Eingabe gibt nur die Frage aus.
let rl = null;
let muted = false;
let currentPrompt = "";
let inputClosed = false;
const bufferedLines = [];
const waiting = [];

function input() {
  if (rl) return rl;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (text) => {
    if (!muted) write(text);
    else if (text.startsWith(currentPrompt)) write(currentPrompt);
  };
  rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : bufferedLines.push(line)));
  rl.on("close", () => {
    inputClosed = true;
    while (waiting.length) waiting.shift()("");
  });
  return rl;
}

function ask(question, { hidden = false } = {}) {
  const r = input();
  currentPrompt = question;
  muted = hidden;
  r.setPrompt(question);
  r.prompt();
  return new Promise((resolve) => {
    const done = (answer) => {
      muted = false;
      if (hidden || !process.stdin.isTTY) process.stdout.write("\n");
      resolve(answer.trim());
    };
    if (bufferedLines.length) done(bufferedLines.shift());
    else if (inputClosed) done("");
    else waiting.push(done);
  });
}

async function main() {
  const args = leseDoppelArgumente(process.argv.slice(2), process.env, REPO);
  if (args.fehler) fail(args.fehler);
  const { befehl, probelauf, projekt, url, ziel, vorstand, liste } = args;

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (envUrl && envUrl.replace(/\/+$/, "") !== url) {
    fail(`NEXT_PUBLIC_SUPABASE_URL in der Umgebung zeigt auf ein anderes Ziel als --projekt ${projekt} bzw. --url.`);
  }

  const befehlText = befehl === "zusammenfuehren" && probelauf ? "zusammenfuehren --probelauf" : befehl;
  console.log(
    ziel === url ? `Projekt: ${projekt} (Adresse: ${url})  Befehl: ${befehlText}` : `Projekt: ${projekt} (${ziel})  Befehl: ${befehlText}`
  );
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const key = await ask("Supabase Service-Role-Key: ", { hidden: true });
    if (!key) fail("Supabase Service-Role-Key fehlt.");
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // „lokal“ nur gegen eine Testdatenbank wie seed.sql (wie datenqualitaet).
  if (projekt === "lokal") {
    const grund = await pruefeTestziel(admin);
    if (grund) fail(`${grund} Für die Produktion --projekt prod verwenden.`);
    console.log("Testdatenbank bestätigt (höchstens 200 Profile, nur Testkonten).");
  }

  /** Konten: user_id → { email (nur als Vergleichsschlüssel), gesperrt }. */
  async function ladeKonten() {
    const konten = new Map();
    for (let seite = 1; ; seite++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
      if (error || !data) throw new Error("Konten nicht lesbar");
      for (const u of data.users) {
        konten.set(String(u.id), {
          email: emailSchluessel(u.email),
          gesperrt: kontoGesperrt(u.banned_until),
          bestaetigt: Boolean(u.email_confirmed_at),
        });
      }
      if (data.users.length < 200) break;
      if (seite >= 100) throw new Error("Zu viele Konten");
    }
    return konten;
  }

  async function ladeUndStufeEin() {
    const profile = await ladeAlle(
      (von, bis) => admin.from("profiles").select(PROFIL_SPALTEN, { count: "exact" }).order("id").range(von, bis),
      "Profile"
    );
    const zeilen = await ladeAlle(
      (von, bis) =>
        admin
          .from("member_secrets")
          .select(`profile_id, iban_hash, ${SECRET_SPALTEN.join(", ")}`, { count: "exact" })
          .order("profile_id")
          .range(von, bis),
      "member_secrets"
    );
    // Verschlüsselte Werte sofort verwerfen: nur „leer/nicht leer“ und der Fingerabdruck bleiben.
    const secrets = new Map(zeilen.map((z) => [String(z.profile_id), secretsKurz(z)]));
    zeilen.length = 0;
    const offen = await ladeAlle(
      (von, bis) =>
        admin.from("pending_registrations").select("user_id", { count: "exact" }).order("user_id").range(von, bis),
      "Registrierungen"
    );
    const registrierungen = new Set(offen.map((r) => String(r.user_id)));
    // Selbstkündigungen (Grund-Eintrag): nur damit wird eine Kündigung von A automatisch übernommen.
    const gruende = await ladeAlle(
      (von, bis) =>
        admin.from("membership_cancellations").select("id, profile_id", { count: "exact" }).order("id").range(von, bis),
      "Kündigungen"
    );
    const kuendigungen = new Set(gruende.map((r) => String(r.profile_id)));
    const konten = await ladeKonten();
    const ergebnis = findePaare(profile, { secrets, konten, registrierungen, kuendigungen });
    return { profile, ergebnis };
  }

  function schreibeListe(ergebnis) {
    if (!liste) return;
    // Nur außerhalb des Repos (leseArgumente prüft), nie überschreiben, nur für den eigenen Benutzer lesbar.
    writeFileSync(liste, listeTsv(ergebnis), { encoding: "utf8", mode: 0o600, flag: "wx" });
    console.log("\nListe geschrieben (außerhalb des Repos, enthält Profil-IDs – nach dem Durchsehen löschen).");
  }

  /** Der Vorstand für das Protokoll muss ein nicht gekündigtes Profil mit Rolle board sein. */
  async function pruefeVorstand() {
    const { data, error } = await admin.from("profiles").select('"Status", "Rolle"').eq("id", vorstand).maybeSingle();
    if (error) fail("Profil für --vorstand nicht lesbar.");
    const rolle = String(data?.Rolle ?? "").trim().toLowerCase();
    const status = String(data?.Status ?? "").trim().toLowerCase();
    if (!data || rolle !== "board" || status === "cancelled") {
      fail("--vorstand ist kein aktives Vorstandsprofil (Rolle board).");
    }
  }

  const db = {
    async zusammenfuehren(aId, bId, erwartet) {
      const { data, error } = await admin.rpc("merge_member_doppelprofil", {
        p_konto_profil: aId,
        p_import_profil: bId,
        p_expected: erwartet,
        p_corrected_by: vorstand,
      });
      if (error) throw new Error("Zusammenführen fehlgeschlagen");
      return data;
    },
  };

  /** Gibt es die Datenbankfunktion? Aufruf mit Profil-IDs, die es nicht gibt (schreibt nichts, liefert „fehlt“). */
  async function pruefeFunktion() {
    let code;
    try {
      code = await db.zusammenfuehren("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", {
        a: {},
        b: {},
      });
    } catch {
      code = null;
    }
    if (code !== "fehlt") fail("Datenbankfunktion merge_member_doppelprofil fehlt (Migration 20261121100000).");
  }

  try {
    if (befehl === "pruefen") {
      const { profile, ergebnis } = await ladeUndStufeEin();
      console.log(`\n${formatierePruefung(zaehleAlle(profile, ergebnis))}`);
      schreibeListe(ergebnis);
    } else if (probelauf) {
      const { profile, ergebnis } = await ladeUndStufeEin();
      console.log(`\n${formatiereProbelauf(zaehleAlle(profile, ergebnis))}`);
      schreibeListe(ergebnis);
    } else {
      await pruefeVorstand();
      await pruefeFunktion();
      const { profile, ergebnis } = await ladeUndStufeEin();
      console.log(`\n${formatiereProbelauf(zaehleAlle(profile, ergebnis))}`);
      const offen = ergebnis.eintraege.filter((e) => e.einstufung !== "pruefen");
      if (offen.length === 0) {
        console.log("\nNichts zusammenzuführen: 0 Paare geändert.");
        return;
      }
      console.log(
        `\nFührt ${offen.length} Paare zusammen (je Paar eine Transaktion, protokolliert in member_data_corrections, Quelle „${PROTOKOLL_QUELLE}“).`
      );
      const wort = bestaetigungswort(ziel, offen.length);
      const antwort = await ask(`Zum Bestätigen „${wort}“ eingeben: `);
      if (antwort !== wort) fail("Nicht bestätigt – nichts geändert.");
      // Eingabe sofort schließen, damit Strg+C beim Prozess ankommt.
      rl?.close();
      rl = null;

      const r = neuesErgebnis();
      r.geplant = offen.length;
      const abbruch = abbruchBeiSignal();
      const lauf = await schreibeAlle(offen, (eintrag) => schreibePaar(db, eintrag, r), abbruch, (n) =>
        process.stdout.write(`\r  bearbeitet: ${n} von ${offen.length}   `)
      );
      abbruch.aufheben();
      r.bearbeitet = lauf.bearbeitet;
      r.abgebrochen = lauf.abgebrochen;
      console.log(`\n\n${formatiereErgebnis(r)}`);
      const nachher = await ladeUndStufeEin();
      console.log(`\n${formatierePruefung(zaehleAlle(nachher.profile, nachher.ergebnis))}`);
      if (r.fehler > 0) fail(`${r.fehler} Paare nicht zusammengeführt – erneut ausführen ist unbedenklich.`);
    }
  } catch (err) {
    if (err instanceof Abbruch) throw err;
    fail(`Abgebrochen – erneut ausführen ist unbedenklich.\n${fehlerOhneDaten(err)}`);
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Abbruch ? `\nFehler: ${err.message}` : `\nFehler: Abgebrochen.\n${fehlerOhneDaten(err)}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}
