// Verschlüsselung der Bestandsdaten (docs/verschluesselung.md) von der Kommandozeile – ersetzt die frühere Seite
// „Verwaltung → Verschlüsselung“. Gleiche Logik (lib/member-secrets-backfill.ts), nur ohne Oberfläche, damit
// niemand im Intranet Klartext leeren kann.
//
//   npm run verschluesselung -- <befehl> --projekt <prod|test>
//
// Befehle:
//   pruefen        Prüflauf, ändert nichts.
//   verschluesseln Backfill: fehlende verschlüsselte Zeilen anlegen und sofort gegen den Klartext prüfen.
//   leeren         Klartext leeren (nur wenn der Prüflauf keine Befunde meldet, mit Bestätigung).
//   abschliessen   Endzustand setzen: ab dann kein Klartext mehr (mit Bestätigung).
//
// Geheimnisse: SUPABASE_SERVICE_ROLE_KEY, MEMBER_DATA_MASTER_KEY und MEMBER_DATA_MASTER_KEY_ID werden aus der
// Umgebung gelesen oder verdeckt abgefragt (nie ausgegeben). Die Supabase-URL ergibt sich aus --projekt.
import readline from "node:readline";

const PROJECTS = {
  prod: "vxcwtfktnefreboejgpw",
  test: "rkegvieoejmyutkowwwf",
};
const COMMANDS = ["pruefen", "verschluesseln", "leeren", "abschliessen"];
const BATCH_SIZE = 25;
const MAX_ROUNDS = 400;

function fail(message) {
  console.error(`\nFehler: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const command = argv.find((a) => !a.startsWith("--"));
  const i = argv.indexOf("--projekt");
  const project = i >= 0 ? argv[i + 1] : undefined;
  if (!COMMANDS.includes(command ?? "")) fail(`Befehl fehlt oder unbekannt. Erlaubt: ${COMMANDS.join(", ")}`);
  if (!Object.hasOwn(PROJECTS, project ?? "")) fail("--projekt prod oder --projekt test angeben.");
  return { command, project };
}

// Eine gemeinsame Eingabe für alle Fragen; Zeilen werden gepuffert, damit auch weitergeleitete Eingaben
// (mehrere Zeilen auf einmal) nicht verloren gehen.
let rl = null;
let muted = false;
let currentPrompt = "";
let inputClosed = false;
const bufferedLines = [];
const waiting = [];

function input() {
  if (rl) return rl;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  // Verdeckte Eingabe: nur die Frage ausgeben, nie die getippten Zeichen.
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

async function confirm(word, ref) {
  const answer = await ask(`Zum Bestätigen „${word} ${ref}“ eingeben: `);
  if (answer !== `${word} ${ref}`) fail("Nicht bestätigt – nichts geändert.");
}

function list(label, items) {
  if (!items.length) return;
  console.log(`  ${label}:`);
  for (const item of items) console.log(`    - ${typeof item === "string" ? item : `${item.id}: ${item.fields ?? item.reason}`}`);
}

function printVerify(r) {
  console.log("\nPrüflauf");
  console.log(`  Profile:                         ${r.profiles}`);
  console.log(`  Mit sensiblen Daten (Klartext):  ${r.withSensitivePlain}`);
  console.log(`  Verschlüsselt:                   ${r.secretsRows}`);
  console.log(`  Klartext geleert:                ${r.cleared}`);
  console.log(`  Ohne Verschlüsselung:            ${r.missing}`);
  console.log(`  Abgeschlossen seit:              ${r.finishedAt ?? "–"}`);
  list("IBAN prüfen (Profil-ID)", r.ibanReview);
  list("Nicht lesbar", r.unreadable);
  list("Abweichungen", r.mismatches.map((m) => ({ id: m.id, fields: m.fields.join(", ") })));
  list("Konto-Metadaten mit Daten (user_id)", r.authMeta);
  list("Registrierung nur Klartext (user_id)", r.pendingPlainOnly);
  list("Registrierung nicht übernommen, nur Hinweis (user_id)", r.pendingUnadopted);
  const status = r.finishedAt
    ? "abgeschlossen"
    : canFinish(r)
      ? "bereit zum Abschließen"
      : canClear(r) && r.withSensitivePlain > 0
        ? "bereit zum Leeren"
        : "noch nicht bereit (Befunde oben)";
  console.log(`  Status:                          ${status}`);
}

/** Gleiche Bedingungen wie früher auf der Seite. */
function canClear(r) {
  return r.missing === 0 && r.ibanReview.length === 0 && r.unreadable.length === 0 && r.mismatches.length === 0;
}
function canFinish(r) {
  return (
    canClear(r) && r.authMeta.length === 0 && r.pendingPlainOnly.length === 0 && r.withSensitivePlain === 0
  );
}

const { command, project } = parseArgs(process.argv.slice(2));
const ref = PROJECTS[project];
const url = `https://${ref}.supabase.co`;
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (envUrl && envUrl.replace(/\/+$/, "") !== url) {
  fail(`NEXT_PUBLIC_SUPABASE_URL in der Umgebung zeigt auf ein anderes Projekt als --projekt ${project}.`);
}
process.env.NEXT_PUBLIC_SUPABASE_URL = url;

console.log(`Projekt: ${project} (${ref})  Befehl: ${command}`);
await secretFromEnvOrPrompt("SUPABASE_SERVICE_ROLE_KEY", "Supabase Service-Role-Key");
await secretFromEnvOrPrompt("MEMBER_DATA_MASTER_KEY", "Master Key (Base64)");
if (!process.env.MEMBER_DATA_MASTER_KEY_ID) {
  process.env.MEMBER_DATA_MASTER_KEY_ID = await ask("Master-Key-ID (z. B. prod-2026-10): ");
}

// Erst jetzt laden: die Bibliotheken lesen die Umgebung.
const { createClient } = await import("@supabase/supabase-js");
const { keyCheckValue } = await import("../lib/member-crypto.ts");
const { getKeyring } = await import("../lib/member-crypto-server.ts");
const { assertKeyRegistered } = await import("../lib/member-secrets-server.ts");
const { backfillMemberSecrets, clearPlaintextBatch, finishPlainClearing, verifyMemberSecrets } = await import(
  "../lib/member-secrets-backfill.ts"
);

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let keyring;
try {
  keyring = getKeyring();
} catch (err) {
  fail(`Master Key ungültig (${err instanceof Error ? err.message : "unbekannt"}).`);
}
console.log(`Key: ${keyring.currentId}  Prüfwert: ${keyCheckValue(keyring)}`);
try {
  await assertKeyRegistered(admin);
} catch (err) {
  fail(`${err instanceof Error ? err.message : "Key-Prüfung fehlgeschlagen"} – falscher Key, falsches Projekt oder falscher Service-Role-Key.`);
}
console.log("Key passt zum registrierten Prüfwert.");

try {
  if (command === "pruefen") {
    printVerify(await verifyMemberSecrets(admin));
  } else if (command === "verschluesseln") {
    const totals = { created: 0, ibanReview: [], pending: [], rolledBack: [], failed: [], unverified: [] };
    let cursor = null;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const r = await backfillMemberSecrets(admin, BATCH_SIZE, cursor);
      totals.created += r.created;
      for (const k of ["ibanReview", "pending", "rolledBack", "failed", "unverified"]) totals[k].push(...r[k]);
      process.stdout.write(`\r  neu verschlüsselt: ${totals.created}, noch offen: ${r.remaining}   `);
      if (!r.cursor) break;
      cursor = r.cursor;
      if (round === MAX_ROUNDS - 1) console.log("\n  Abbruch nach der Höchstzahl an Durchläufen – erneut ausführen.");
    }
    console.log("\n\nVerschlüsseln fertig");
    console.log(`  Neu verschlüsselt: ${totals.created}`);
    list("IBAN prüfen (übersprungen)", totals.ibanReview);
    list("Registrierung offen (übersprungen)", totals.pending);
    list("Zurückgenommen (Abweichung)", totals.rolledBack.map((x) => ({ id: x.id, fields: x.fields.join(", ") })));
    list("Fehlgeschlagen", totals.failed);
    list("Nicht bestätigt", totals.unverified);
    printVerify(await verifyMemberSecrets(admin));
  } else if (command === "leeren") {
    const before = await verifyMemberSecrets(admin);
    printVerify(before);
    if (before.finishedAt) fail("Bereits abgeschlossen.");
    if (before.withSensitivePlain === 0) fail("Kein Klartext mehr vorhanden – weiter mit „abschliessen“.");
    if (!canClear(before)) fail("Der Prüflauf meldet Befunde – erst beheben.");
    console.log(`\nLeert den Klartext von bis zu ${before.withSensitivePlain} Profilen. Ohne Backup nicht umkehrbar.`);
    await confirm("LEEREN", ref);
    let cleared = 0;
    const skipped = [];
    let cursor = null;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const r = await clearPlaintextBatch(admin, BATCH_SIZE, cursor);
      cleared += r.cleared;
      skipped.push(...r.skipped);
      process.stdout.write(`\r  geleert: ${cleared}, noch offen: ${r.remaining}   `);
      if (!r.cursor) break;
      cursor = r.cursor;
      if (round === MAX_ROUNDS - 1) console.log("\n  Abbruch nach der Höchstzahl an Durchläufen – erneut ausführen.");
    }
    console.log(`\n\nLeeren fertig: ${cleared} geleert, ${skipped.length} übersprungen.`);
    list("Übersprungen", skipped);
    printVerify(await verifyMemberSecrets(admin));
  } else if (command === "abschliessen") {
    const before = await verifyMemberSecrets(admin);
    printVerify(before);
    if (before.finishedAt) fail("Bereits abgeschlossen.");
    if (!canFinish(before)) fail("Noch nicht bereit: Klartext übrig oder Befunde offen.");
    console.log("\nAb dann speichert die Datenbank keinen Klartext mehr.");
    await confirm("ABSCHLIESSEN", ref);
    const { error } = await finishPlainClearing(admin);
    if (error) fail(error);
    console.log("Abgeschlossen.");
    printVerify(await verifyMemberSecrets(admin));
  }
} catch (err) {
  fail(`Abgebrochen: ${err instanceof Error ? err.message : "unbekannter Fehler"} – erneut ausführen ist unbedenklich.`);
}

rl?.close();
