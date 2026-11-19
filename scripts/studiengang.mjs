// Studiengang vereinheitlichen (profiles."Studiengang / Fach", Klartext).
// Ordnet die Altwerte der Studiengangsliste zu (lib/studiengaenge.ts) und schreibt nur, was sicher ist.
// Aufbau, Ziel, Sicherungen und Bestätigung wie scripts/datenqualitaet.mjs; ohne Master Key (keine verschlüsselten
// Felder).
//
//   npm run studiengang -- <befehl> --projekt <prod|test|lokal> [--url <supabase-url>] [Optionen]
//
// Befehle:
//   pruefen                  Zählungen: richtig / sicher / leeren / vorschlag / offen / leer, je Zielwert, dazu die
//                            Registrierungsangaben, die liegen bleiben können (Konten mit Angaben in den Metadaten,
//                            offene Registrierungen). Nur Zahlen, nichts wird gelöscht.
//   reparieren --probelauf   Zählungen je Zielwert und wie viele Profile „reparieren“ ändern würde. Ändert nichts.
//   reparieren               Schreibt nur „sicher“ (Listenname, inkl. der Freigaben von Hannes für Altwerte) und
//                            „leeren“ (Sammelbegriffe), nur bei aktiven Profilen (inkl. Vorstand und Alumni). Über
//                            die Datenbankfunktion save_member_studiengang: Compare-and-set und Protokoll in
//                            member_data_corrections (Feld „studiengang“, Quelle „bereinigung“) in EINER Transaktion.
//                            Braucht --vorstand <Profil-ID> und das Bestätigungswort „REPARIEREN <ziel> <anzahl>“.
//                            Strg+C beendet nach dem laufenden Profil.
//
// Ziele (wie scripts/datenqualitaet.mjs, gleiche Argumente und Sicherungen):
//   --projekt lokal --url http://127.0.0.1:<port>   nur Loopback, nicht Port 8100, nur Testdatenbank (≤ 200 Profile,
//                                                    nur Konten @test.icr.local)
//   --projekt prod --url <adresse>                   eigener Server, nur mit ausdrücklichem --url (z. B. Tunnel)
//   --projekt test                                   Cloud-Testprojekt rkeg… – auch schreibend erreichbar, OHNE
//                                                    Testdatenbank-Prüfung. Laut RAHMEN.md werden Cloud-Projekte
//                                                    nicht angefasst; das Ziel bleibt nur für das gleiche Muster wie
//                                                    bei datenqualitaet bestehen.
// Braucht die Migration 20261119120000_member_studiengang.sql auf dem Ziel (sonst bricht „reparieren“ ab, bevor
// etwas geschrieben wird).
//
// Ausgabe nur Zahlen und Namen aus der Liste – nie Altwerte, Namen, E-Mails oder Profil-IDs, auch nicht bei Fehlern.
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  abbruchBeiSignal,
  bestaetigungswort,
  fehlerOhneDaten,
  ladeAlle,
  leseArgumente,
  pruefeTestziel,
  schreibeAlle,
} from "./lib/datenqualitaet.mjs";
import {
  PROTOKOLL_QUELLE,
  SPALTE,
  bewerteStudiengang,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  neuesReparaturErgebnis,
  schreibeProfil,
  zaehleAlle,
  zaehleRegistrierungsreste,
} from "./lib/studiengang.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Spaltenname für PostgREST (Leerzeichen und Schrägstrich → in Anführungszeichen). */
const SPALTE_SQL = `"${SPALTE}"`;

/** Gewollter Abbruch mit eigener (datenfreier) Meldung. Kein process.exit: offene Verbindungen schließen sauber. */
class Abbruch extends Error {}
function fail(message) {
  throw new Abbruch(message);
}

// Unerwartete Fehler nie mit Meldung ausgeben (könnte Werte oder IDs enthalten).
function letzterAusweg(err) {
  console.error(`\nFehler: Abgebrochen.\n${fehlerOhneDaten(err)}`);
  process.exit(1);
}
process.on("uncaughtException", letzterAusweg);
process.on("unhandledRejection", letzterAusweg);

// Eingabe wie in scripts/datenqualitaet.mjs: eine gemeinsame Eingabe, Zeilen gepuffert (auch für weitergeleitete
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
  const args = leseArgumente(process.argv.slice(2), process.env, REPO);
  if (args.fehler) fail(args.fehler);
  const { befehl, probelauf, projekt, url, ziel, vorstand, liste } = args;
  if (liste !== undefined) fail("--liste gibt es hier nicht (Ausgabe nur Zahlen).");

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (envUrl && envUrl.replace(/\/+$/, "") !== url) {
    fail(`NEXT_PUBLIC_SUPABASE_URL in der Umgebung zeigt auf ein anderes Ziel als --projekt ${projekt} bzw. --url.`);
  }

  const befehlText = befehl === "reparieren" && probelauf ? "reparieren --probelauf" : befehl;
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

  const SPALTEN = `id, "Status", "Rolle", ${SPALTE_SQL}`;

  async function ladeUndBewerte() {
    const profile = await ladeAlle(
      (von, bis) => admin.from("profiles").select(SPALTEN, { count: "exact" }).order("id").range(von, bis),
      "Profile"
    );
    return profile.map((p) => ({ id: String(p.id), bewertung: bewerteStudiengang(p) }));
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

  /** Registrierungsangaben, die liegen bleiben können (Review N6): nur zählen. */
  async function ladeRegistrierungsreste() {
    const konten = [];
    for (let seite = 1; ; seite++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
      if (error || !data) throw new Error("Konten nicht lesbar");
      for (const u of data.users) konten.push({ metadaten: u.user_metadata ?? null });
      if (data.users.length < 200 || seite >= 100) break;
    }
    const offene = await ladeAlle(
      (von, bis) =>
        admin.from("pending_registrations").select("user_id", { count: "exact" }).order("user_id").range(von, bis),
      "pending_registrations"
    );
    const profile = await ladeAlle(
      (von, bis) =>
        admin.from("profiles").select('id, user_id, "Status", "Rolle"', { count: "exact" }).order("id").range(von, bis),
      "Profile"
    );
    return zaehleRegistrierungsreste({ konten, offene, profile });
  }

  /** Datenbankzugriffe für schreibeProfil: Speichern + Protokoll in einer Transaktion (save_member_studiengang). */
  const db = {
    async lese(id) {
      const { data, error } = await admin.from("profiles").select(SPALTEN).eq("id", id).maybeSingle();
      if (error) throw new Error("Profil nicht lesbar");
      return data;
    },
    async speichere(id, alt, neu) {
      const { data, error } = await admin.rpc("save_member_studiengang", {
        p_profile_id: id,
        p_expected: alt ?? null,
        p_studiengang: neu,
        p_corrected_by: vorstand,
        p_quelle: PROTOKOLL_QUELLE,
      });
      if (error) throw new Error("Speichern fehlgeschlagen");
      return data === true;
    },
  };

  /** Gibt es die Datenbankfunktion? Aufruf mit einer Profil-ID, die es nicht gibt (schreibt nichts). */
  async function pruefeFunktion() {
    const { data, error } = await admin.rpc("save_member_studiengang", {
      p_profile_id: "00000000-0000-0000-0000-000000000000",
      p_expected: "a",
      p_studiengang: "b",
    });
    if (error || data !== false) fail("Datenbankfunktion save_member_studiengang fehlt (Migration 20261119120000).");
  }

  try {
    if (befehl === "pruefen") {
      const eintraege = await ladeUndBewerte();
      const reste = await ladeRegistrierungsreste();
      console.log(`\n${formatierePruefung(zaehleAlle(eintraege.map((e) => e.bewertung)), reste)}`);
    } else if (probelauf) {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
    } else {
      await pruefeVorstand();
      await pruefeFunktion();
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
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
        const ergebnis = await schreibeProfil(db, id);
        if (ergebnis === "geaendert") r.geaendert++;
        else if (ergebnis === "geleert") {
          r.geaendert++;
          r.geleert++;
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
      console.log(`\n${formatierePruefung(zaehleAlle(nachher.map((e) => e.bewertung)))}`);
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
