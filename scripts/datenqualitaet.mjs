// Datenqualität der Mitgliederdaten (Paket „Mitgliederdaten“, PR 3; Doku: docs/datenqualitaet.md).
// Prüft die verschlüsselten Felder aller Profile mit den Regeln aus lib/member-rules.ts und korrigiert nur,
// was sicher ist. Aufbau, Zugangsdaten und Ziel wie scripts/verschluesselung.mjs.
//
//   npm run datenqualitaet -- <befehl> --projekt <prod|test|lokal> [--url <supabase-url>] [Optionen]
//
// Befehle:
//   pruefen                  Zählungen je Feld und Mängel-Code, Hinweise, Profile ohne member_secrets-Zeile.
//   reparieren --probelauf   Zählungen je Feld: gueltig / sicher / vorschlag / offen. Ändert nichts.
//   reparieren               Schreibt nur „sicher“ (Handy → E.164, Straße/Hausnummer abtrennen, BIC mit
//                            falschem Format leeren) über saveMemberSecrets. Braucht --vorstand <Profil-ID>
//                            (Korrekturprotokoll member_data_corrections) und das Bestätigungswort.
// Optionen:
//   --liste <datei>          TSV mit Profil-ID + Mängel-Codes (keine Werte), nur außerhalb des Repos.
//
// Ausgabe nur Zahlen, Feldnamen und Codes – nie Werte, Namen, E-Mails oder Profil-IDs, auch nicht bei Fehlern.
// Betroffen sind nur aktive Profile (inkl. Vorstand und Alumni); gekündigte und offene Anträge werden nur gezählt.
import { writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  bewerteProfil,
  fehlerOhneDaten,
  formatierePruefung,
  formatiereProbelauf,
  formatiereReparatur,
  leseArgumente,
  listeTsv,
  mitVersionsSperre,
  neuesReparaturErgebnis,
  zaehleAlle,
} from "./lib/datenqualitaet.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Seitengröße beim Laden (unter dem PostgREST-Limit max_rows = 1000). */
const SEITE = 500;

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

// Eingabe wie in scripts/verschluesselung.mjs: eine gemeinsame Eingabe, Zeilen gepuffert (auch für
// weitergeleitete Eingaben), verdeckte Eingabe gibt nur die Frage aus.
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

async function secretFromEnvOrPrompt(name, label) {
  if (process.env[name]) return;
  const value = await ask(`${label}: `, { hidden: true });
  if (!value) fail(`${label} fehlt.`);
  process.env[name] = value;
}

// ---------------------------------------------------------------------------------------------------
// Ziel und Zugang
// ---------------------------------------------------------------------------------------------------

async function main() {
  const args = leseArgumente(process.argv.slice(2), process.env, REPO);
  if (args.fehler) fail(args.fehler);
  const { befehl, probelauf, projekt, url, ziel, vorstand, liste } = args;

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (envUrl && envUrl.replace(/\/+$/, "") !== url) {
    fail(`NEXT_PUBLIC_SUPABASE_URL in der Umgebung zeigt auf ein anderes Ziel als --projekt ${projekt} bzw. --url.`);
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;

  const befehlText = befehl === "reparieren" && probelauf ? "reparieren --probelauf" : befehl;
  console.log(
    ziel === url ? `Projekt: ${projekt} (Adresse: ${url})  Befehl: ${befehlText}` : `Projekt: ${projekt} (${ziel})  Befehl: ${befehlText}`
  );
  await secretFromEnvOrPrompt("SUPABASE_SERVICE_ROLE_KEY", "Supabase Service-Role-Key");
  await secretFromEnvOrPrompt("MEMBER_DATA_MASTER_KEY", "Master Key (Base64)");
  if (!process.env.MEMBER_DATA_MASTER_KEY_ID) {
    process.env.MEMBER_DATA_MASTER_KEY_ID = await ask("Master-Key-ID (z. B. prod-2026-10): ");
  }

  // Erst jetzt laden: die Bibliotheken lesen die Umgebung.
  const { createClient } = await import("@supabase/supabase-js");
  const { getKeyring } = await import("../lib/member-crypto-server.ts");
  const {
    MemberSecretsConflictError,
    assertKeyRegistered,
    emptySecretValues,
    readMemberSecretsMany,
    readMemberSecretsWithMeta,
    saveMemberSecrets,
  } = await import("../lib/member-secrets-server.ts");

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    getKeyring();
  } catch {
    fail("Master Key ungültig.");
  }
  try {
    await assertKeyRegistered(admin);
  } catch {
    fail("Key-Prüfung fehlgeschlagen – falscher Key, falsches Projekt oder falscher Service-Role-Key.");
  }
  console.log("Key passt zum registrierten Prüfwert.");

  // ---------------------------------------------------------------------------------------------------
  // Laden und Bewerten
  // ---------------------------------------------------------------------------------------------------

  /** Alle Zeilen seitenweise; Abbruch, wenn die Zahl nicht zur Gesamtzahl passt. */
  async function ladeAlle(abfrage, label) {
    const zeilen = [];
    let gesamt = null;
    for (let von = 0; ; von += SEITE) {
      const { data, error, count } = await abfrage(von, von + SEITE - 1);
      if (error) throw new Error(`${label} nicht lesbar`);
      if (gesamt === null) gesamt = count;
      zeilen.push(...(data ?? []));
      if (!data || data.length < SEITE) break;
    }
    if (gesamt === null || zeilen.length !== gesamt) throw new Error(`${label} unvollständig geladen`);
    return zeilen;
  }

  async function ladeUndBewerte() {
    const profile = await ladeAlle(
      (von, bis) => admin.from("profiles").select('id, "Status", "Rolle"', { count: "exact" }).order("id").range(von, bis),
      "Profile"
    );
    const mitZeile = new Set(
      (
        await ladeAlle(
          (von, bis) =>
            admin.from("member_secrets").select("profile_id", { count: "exact" }).order("profile_id").range(von, bis),
          "member_secrets"
        )
      ).map((r) => String(r.profile_id))
    );
    const werte = await readMemberSecretsMany(admin, profile.map((p) => ({ id: String(p.id) })));
    return profile.map((p) => {
      const id = String(p.id);
      return {
        id,
        profil: p,
        bewertung: bewerteProfil({ profil: p, werte: werte.get(id) ?? "unreadable", hatZeile: mitZeile.has(id) }),
      };
    });
  }

  function schreibeListe(eintraege) {
    if (!liste) return;
    writeFileSync(liste, listeTsv(eintraege), { encoding: "utf8", mode: 0o600 });
    console.log(`\nListe geschrieben (${eintraege.length} Profile geprüft).`);
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

  // ---------------------------------------------------------------------------------------------------
  // Befehle
  // ---------------------------------------------------------------------------------------------------

  try {
    if (befehl === "pruefen") {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatierePruefung(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
      schreibeListe(eintraege);
    } else if (probelauf) {
      const eintraege = await ladeUndBewerte();
      console.log(`\n${formatiereProbelauf(zaehleAlle(eintraege.map((e) => e.bewertung)))}`);
      schreibeListe(eintraege);
    } else {
      await pruefeVorstand();
      const eintraege = await ladeUndBewerte();
      const vorher = zaehleAlle(eintraege.map((e) => e.bewertung));
      console.log(`\n${formatiereProbelauf(vorher)}`);
      const offen = eintraege.filter((e) => Object.keys(e.bewertung.aenderungen).length > 0);
      if (offen.length === 0) {
        console.log("\nNichts zu reparieren: 0 Profile geändert.");
      } else {
        console.log(`\nSchreibt ${offen.length} Profile über saveMemberSecrets (protokolliert in member_data_corrections).`);
        const antwort = await ask(`Zum Bestätigen „REPARIEREN ${ziel}“ eingeben: `);
        if (antwort !== `REPARIEREN ${ziel}`) fail("Nicht bestätigt – nichts geändert.");

        const r = neuesReparaturErgebnis();
        for (const { id, profil } of offen) {
          // Frisch lesen und neu bewerten: geschrieben wird genau der geprüfte Stand (Version).
          let frisch;
          try {
            frisch = await readMemberSecretsWithMeta(admin, id);
          } catch {
            r.nichtLesbar++;
            continue;
          }
          const b = bewerteProfil({ profil, werte: frisch ? frisch.values : emptySecretValues(), hatZeile: Boolean(frisch) });
          const aenderungen = b.aenderungen;
          if (Object.keys(aenderungen).length === 0) {
            r.inzwischenErledigt++;
            continue;
          }
          try {
            await saveMemberSecrets(mitVersionsSperre(admin, frisch ? frisch.version : null), id, aenderungen, {
              correctedBy: vorstand,
            });
            r.geaendert++;
            for (const feld of Object.keys(aenderungen)) r.felder[feld] = (r.felder[feld] ?? 0) + 1;
          } catch (err) {
            if (err instanceof MemberSecretsConflictError) r.konflikt++;
            else r.fehler++;
          }
          process.stdout.write(`\r  bearbeitet: ${r.geaendert + r.konflikt + r.fehler + r.nichtLesbar + r.inzwischenErledigt} von ${offen.length}   `);
        }
        console.log(`\n\n${formatiereReparatur(r)}`);
        const nachher = await ladeUndBewerte();
        console.log(`\n${formatierePruefung(zaehleAlle(nachher.map((e) => e.bewertung)))}`);
        if (r.fehler > 0) fail(`${r.fehler} Profile nicht gespeichert – erneut ausführen ist unbedenklich.`);
      }
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
