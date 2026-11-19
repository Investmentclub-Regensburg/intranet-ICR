// Studiengang vereinheitlichen (profiles."Studiengang / Fach", Klartext).
// Ordnet die Altwerte der Studiengangsliste zu (lib/studiengaenge.ts) und schreibt nur, was sicher ist.
// Aufbau, Ziel, Sicherungen und Bestätigung wie scripts/datenqualitaet.mjs; ohne Master Key (keine verschlüsselten
// Felder).
//
//   npm run studiengang -- <befehl> --projekt <prod|test|lokal> [--url <supabase-url>] [Optionen]
//
// Befehle:
//   pruefen                  Zählungen: richtig / sicher / vorschlag / offen / leer, je Zielwert.
//   reparieren --probelauf   Zählungen je Zielwert und wie viele Profile „reparieren“ ändern würde. Ändert nichts.
//   reparieren               Schreibt nur „sicher“, nur bei aktiven Profilen (inkl. Vorstand und Alumni). Braucht
//                            --vorstand <Profil-ID> (Protokoll in member_data_corrections, Feld „studiengang“) und
//                            das Bestätigungswort „REPARIEREN <ziel> <anzahl>“. Strg+C beendet nach dem laufenden
//                            Profil.
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
  PROTOKOLL_FELD,
  SPALTE,
  bewerteStudiengang,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  neuesReparaturErgebnis,
  schreibeProfil,
  zaehleAlle,
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

  /** Datenbankzugriffe für schreibeProfil (Compare-and-set auf die Spalte, Protokoll nur mit Feldnamen). */
  const db = {
    async lese(id) {
      const { data, error } = await admin.from("profiles").select(SPALTEN).eq("id", id).maybeSingle();
      if (error) throw new Error("Profil nicht lesbar");
      return data;
    },
    async schreibe(id, frisch, neu) {
      const { data, error } = await admin
        .from("profiles")
        .update({ [SPALTE]: neu })
        .eq("id", id)
        .eq(SPALTE_SQL, frisch[SPALTE])
        .select("id");
      if (error) throw new Error("Speichern fehlgeschlagen");
      return Array.isArray(data) ? data.length : 0;
    },
    async protokolliere(id) {
      const { error } = await admin
        .from("member_data_corrections")
        .insert({ profile_id: id, corrected_by: vorstand, fields: [PROTOKOLL_FELD] });
      if (error) throw new Error("Protokoll fehlgeschlagen");
    },
  };

  try {
    if (befehl === "pruefen") {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatierePruefung(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
    } else if (probelauf) {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
    } else {
      await pruefeVorstand();
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
      const offen = eintraege.filter((e) => e.bewertung.neu);
      if (offen.length === 0) {
        console.log("\nNichts zu reparieren: 0 Profile geändert.");
        return;
      }
      console.log(`\nSchreibt ${offen.length} Profile (protokolliert in member_data_corrections, Feld „${PROTOKOLL_FELD}“).`);
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
        else if (ergebnis === "erledigt") r.inzwischenErledigt++;
        else if (ergebnis === "konflikt") r.konflikt++;
        else if (ergebnis === "protokoll") {
          r.geaendert++;
          r.protokollFehler++;
        } else r.fehler++;
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
      if (r.protokollFehler > 0) fail(`${r.protokollFehler} Profile geändert, aber ohne Protokolleintrag.`);
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
