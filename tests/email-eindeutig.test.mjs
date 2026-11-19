// Absicherung gegen neue Doppelprofile (Entscheidung Hannes 20.11.2026): Die Profil-Verknüpfung bei Registrierung und
// Bestätigung vergleicht Adressen ohne Groß-/Kleinschreibung und ohne Leerzeichen am Rand. (Der Unique-Index auf
// lower(btrim("E-Mail")) kommt als eigener PR feat/email-index erst nach dem Zusammenführen.) Geprüft wird jeweils die zuletzt gültige Fassung in supabase/migrations
// (das Verhalten selbst ist im Wegwerf-Container geprüft, siehe Bericht).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const dateien = readdirSync(MIG)
  .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
  .sort();

/** Letzte Fassung einer Funktion (Text zwischen „create or replace function public.<name>(“ und dem Ende „$$;“). */
function letzteFassung(name) {
  let fassung = null;
  for (const f of dateien) {
    const sql = readFileSync(path.join(MIG, f), "utf8");
    const re = new RegExp(`create or replace function "?public"?\\."?${name}"?\\s*\\(`, "gi");
    let m;
    while ((m = re.exec(sql))) {
      const start = m.index;
      const beginn = sql.indexOf("$$", start);
      const ende = sql.indexOf("$$", beginn + 2);
      const alt = sql.indexOf("$_$", start);
      // Die Basis nutzt teils $_$ als Begrenzer.
      if (alt !== -1 && (beginn === -1 || alt < beginn)) {
        fassung = { datei: f, text: sql.slice(start, sql.indexOf("$_$", alt + 3)) };
      } else {
        fassung = { datei: f, text: sql.slice(start, ende) };
      }
    }
  }
  return fassung;
}

test("provision_profile_for_auth_user vergleicht Adressen nur mit lower(btrim())", () => {
  const f = letzteFassung("provision_profile_for_auth_user");
  assert.ok(f, "Funktion nicht gefunden");
  const vergleiche = f.text.match(/[^\n]*"E-Mail"[^\n]*=[^\n]*u\.email[^\n]*/g) ?? [];
  assert.equal(vergleiche.length, 2, `${f.datei}: erwartet zwei Vergleiche (Prüfen, Verknüpfen)`);
  for (const v of vergleiche) {
    assert.match(v, /lower\(btrim\(p2?\."E-Mail"\)\) = lower\(btrim\(u\.email\)\)/, `${f.datei}: ${v.trim()}`);
  }
  // Ein zweites Profil zur selben Adresse wird nie angelegt.
  assert.match(f.text, /Kein zweites Profil mit derselben E-Mail-Adresse anlegen\.\s*\n\s*return;/);
});

test("E-Mail-Abgleich aus dem Konto scheitert nie an einer belegten Adresse", () => {
  const f = letzteFassung("sync_profile_email_from_auth");
  assert.ok(f, "Funktion nicht gefunden");
  assert.match(f.text, /when unique_violation then/);
});
