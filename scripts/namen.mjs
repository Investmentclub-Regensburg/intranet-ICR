// Fehlende Namen aus der E-Mail-Adresse setzen (profiles."Vorname"/"Nachname", Klartext; Entscheidung Hannes
// 20.11.2026). Ableitung in lib/name-aus-email.ts, Auswertung in scripts/lib/namen.mjs. Aufbau, Ziel, Sicherungen
// und Bestätigung wie scripts/studiengang.mjs; ohne Master Key (keine verschlüsselten Felder).
//
//   npm run namen -- <befehl> --projekt <prod|test|lokal> [--url <supabase-url>] [Optionen]
//
// Befehle:
//   pruefen                  Zählungen: Namen eingetragen / nur einer / beide leer (sicher, vorschlag, offen, Konto hat
//                            einen Namen), Gründe, mögliche Doppelprofile. Nur Zahlen, nichts wird geändert.
//   reparieren --probelauf   Dieselben Zählungen und wie viele Profile „reparieren“ ändern würde. Ändert nichts.
//   reparieren               Schreibt nur bei AKTIVEN Profilen (inkl. Vorstand und Alumni), bei denen Vor- UND
//                            Nachname leer sind, und nur „sicher“ – mit --mit-vorschlaegen auch „vorschlag“
//                            (Umschrift ae/oe/ue → ä/ö/ü, Namenszusatz). Über die Datenbankfunktion
//                            save_member_name_bereinigung: Compare-and-set (nur wenn noch leer) und Protokoll in
//                            member_data_corrections (Felder vorname/nachname, Quelle „bereinigung“) in EINER
//                            Transaktion. Braucht --vorstand <Profil-ID> und das Bestätigungswort
//                            „REPARIEREN <ziel> <anzahl>“. Strg+C beendet nach dem laufenden Profil.
// Optionen:
//   --liste <datei>          (pruefen, reparieren --probelauf) TSV mit Profil-ID, vorgeschlagenem Vor-/Nachnamen,
//                            sicherheit, Gründen – damit der Vorstand die Fälle vor dem Schreiben ansieht. Nur
//                            außerhalb des Repos; der Inhalt erscheint nie in der Ausgabe.
//   --mit-vorschlaegen       (reparieren) auch „vorschlag“ schreiben. Vorher die Liste durchsehen lassen.
//
// Ziele wie scripts/datenqualitaet.mjs (gleiche Argumente und Sicherungen): lokal nur Loopback und Testdatenbank,
// prod nur mit ausdrücklichem --url. Laut RAHMEN.md werden Cloud-Projekte nicht angefasst.
// Braucht die Migration 20261120100000_member_name_bereinigung.sql auf dem Ziel (sonst bricht „reparieren“ ab,
// bevor etwas geschrieben wird).
//
// Profile, deren Login-Konto schon einen Namen in den Metadaten hat, bleiben unverändert (sonst wären zwei
// verschiedene Namen im Umlauf); das Skript schreibt nie in die Konto-Metadaten.
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
  PROTOKOLL_QUELLE,
  bewerteAlle,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  kontoHatNamen,
  leseNamenArgumente,
  listeTsv,
  neuesReparaturErgebnis,
  schreibeProfil,
  zaehleAlle,
} from "./lib/namen.mjs";

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

// Eingabe wie in scripts/studiengang.mjs: eine gemeinsame Eingabe, Zeilen gepuffert (auch für weitergeleitete
// Eingaben), verdeckte Eingabe gibt nur die Frage aus.
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
  const args = leseNamenArgumente(process.argv.slice(2), process.env, REPO);
  if (args.fehler) fail(args.fehler);
  const { befehl, probelauf, projekt, url, ziel, vorstand, liste, mitVorschlaegen } = args;

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (envUrl && envUrl.replace(/\/+$/, "") !== url) {
    fail(`NEXT_PUBLIC_SUPABASE_URL in der Umgebung zeigt auf ein anderes Ziel als --projekt ${projekt} bzw. --url.`);
  }

  const befehlText =
    (befehl === "reparieren" && probelauf ? "reparieren --probelauf" : befehl) + (mitVorschlaegen ? " --mit-vorschlaegen" : "");
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

  const SPALTEN = 'id, user_id, "Status", "Rolle", "Vorname", "Nachname", "E-Mail"';

  /** Konto-IDs, deren Metadaten einen Vor- oder Nachnamen enthalten (nur die IDs bleiben im Speicher). */
  async function ladeKontenMitNamen() {
    const ids = new Set();
    for (let seite = 1; ; seite++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
      if (error || !data) throw new Error("Konten nicht lesbar");
      for (const u of data.users) if (kontoHatNamen(u.user_metadata)) ids.add(String(u.id));
      if (data.users.length < 200) break;
      if (seite >= 100) throw new Error("Zu viele Konten");
    }
    return ids;
  }

  async function ladeUndBewerte() {
    const profile = await ladeAlle(
      (von, bis) => admin.from("profiles").select(SPALTEN, { count: "exact" }).order("id").range(von, bis),
      "Profile"
    );
    return bewerteAlle(profile, await ladeKontenMitNamen(), { mitVorschlaegen });
  }

  function schreibeListe(eintraege) {
    if (!liste) return;
    // Nur außerhalb des Repos (leseArgumente prüft), nie überschreiben, nur für den eigenen Benutzer lesbar.
    writeFileSync(liste, listeTsv(eintraege), { encoding: "utf8", mode: 0o600, flag: "wx" });
    console.log("\nListe geschrieben (außerhalb des Repos, enthält Namen – nach dem Durchsehen löschen).");
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

  /** Datenbankzugriffe für schreibeProfil: Speichern + Protokoll in einer Transaktion. */
  const db = {
    async lese(id) {
      const { data, error } = await admin.from("profiles").select(SPALTEN).eq("id", id).maybeSingle();
      if (error) throw new Error("Profil nicht lesbar");
      return data;
    },
    async kontoHatNamen(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        // Kein Konto (z. B. importiertes Profil): dann gibt es auch keinen zweiten Namen.
        if (error.status === 404) return false;
        throw new Error("Konto nicht lesbar");
      }
      return kontoHatNamen(data?.user?.user_metadata);
    },
    async speichere(id, altVorname, altNachname, vorname, nachname) {
      const { data, error } = await admin.rpc("save_member_name_bereinigung", {
        p_profile_id: id,
        p_expected_vorname: altVorname,
        p_expected_nachname: altNachname,
        p_vorname: vorname,
        p_nachname: nachname,
        p_corrected_by: vorstand,
      });
      if (error) throw new Error("Speichern fehlgeschlagen");
      return data === true;
    },
  };

  /** Gibt es die Datenbankfunktion? Aufruf mit einer Profil-ID, die es nicht gibt (schreibt nichts). */
  async function pruefeFunktion() {
    const { data, error } = await admin.rpc("save_member_name_bereinigung", {
      p_profile_id: "00000000-0000-0000-0000-000000000000",
      p_expected_vorname: null,
      p_expected_nachname: null,
      p_vorname: "Test",
      p_nachname: "Test",
      p_corrected_by: vorstand,
    });
    if (error || data !== false) fail("Datenbankfunktion save_member_name_bereinigung fehlt (Migration 20261120100000).");
  }

  try {
    if (befehl === "pruefen") {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatierePruefung(zaehleAlle(eintraege))}`);
      schreibeListe(eintraege);
    } else if (probelauf) {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege), mitVorschlaegen)}`);
      schreibeListe(eintraege);
    } else {
      await pruefeVorstand();
      await pruefeFunktion();
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege), mitVorschlaegen)}`);
      const offen = eintraege.filter((e) => e.bewertung.aendern);
      if (offen.length === 0) {
        console.log("\nNichts zu reparieren: 0 Profile geändert.");
        return;
      }
      console.log(`\nSchreibt ${offen.length} Profile (protokolliert in member_data_corrections, Quelle „${PROTOKOLL_QUELLE}“).`);
      const wort = bestaetigungswort(ziel, offen.length);
      const antwort = await ask(`Zum Bestätigen „${wort}“ eingeben: `);
      if (antwort !== wort) fail("Nicht bestätigt – nichts geändert.");
      // Eingabe sofort schließen, damit Strg+C beim Prozess ankommt.
      rl?.close();
      rl = null;

      const r = neuesReparaturErgebnis();
      r.geplant = offen.length;
      const abbruch = abbruchBeiSignal();
      const schritt = async ({ id }) => {
        const ergebnis = await schreibeProfil(db, id, { mitVorschlaegen });
        if (ergebnis === "sicher" || ergebnis === "vorschlag") {
          r.geaendert++;
          r[ergebnis]++;
        } else if (ergebnis === "erledigt") r.inzwischenErledigt++;
        else if (ergebnis === "konflikt") r.konflikt++;
        else r.fehler++;
      };
      const lauf = await schreibeAlle(offen, schritt, abbruch, (n) =>
        process.stdout.write(`\r  bearbeitet: ${n} von ${offen.length}   `)
      );
      abbruch.aufheben();
      r.bearbeitet = lauf.bearbeitet;
      r.abgebrochen = lauf.abgebrochen;
      console.log(`\n\n${formatiereReparatur(r)}`);
      const nachher = await ladeUndBewerte();
      console.log(`\n${formatierePruefung(zaehleAlle(nachher))}`);
      if (r.fehler > 0) fail(`${r.fehler} Profile nicht gespeichert – erneut ausführen ist unbedenklich.`);
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
