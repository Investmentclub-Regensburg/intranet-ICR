// Statische Prüfungen der Migrationen rund um save_member_name_bereinigung. Hintergrund: In
// 20261120100000_member_name_bereinigung.sql stand coalesce(b."Rolle", ''). "Rolle" ist das Enum public.user_role,
// '' ist kein gültiger Wert → jeder Schreibversuch brach ab. plpgsql prüft Funktionskörper erst beim Aufruf, deshalb
// fällt das weder beim Einspielen der Migrationen (CI: supabase db reset) noch bei der Funktionsprobe auf, die vor
// der fehlerhaften Stelle endete. Korrektur: 20261120110000_member_name_bereinigung_rolle.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORDNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/migrations");
/** Durch eine spätere Migration ersetzt (eingespielt, darf nicht geändert werden). */
const ERSETZT = new Set(["20261120100000_member_name_bereinigung.sql"]);
const ohneKommentare = (sql) => sql.replace(/--.*$/gm, "");
const dateien = readdirSync(ORDNER).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();

test('"Rolle" (Enum user_role) nie ohne ::text mit Text-Funktionen oder leerem Text', () => {
  // coalesce("Rolle", '…'), btrim/trim/lower/upper("Rolle") – alles wandelt Text in das Enum bzw. erwartet Text.
  const muster = [
    /coalesce\(\s*(?:\w+\.)?"Rolle"\s*,/i,
    /\b(?:btrim|trim|lower|upper)\(\s*(?:\w+\.)?"Rolle"\s*\)/i,
    /(?:\w+\.)?"Rolle"\s*(?:=|<>|!=)\s*''/i,
  ];
  const treffer = [];
  for (const f of dateien) {
    if (ERSETZT.has(f)) continue;
    const sql = ohneKommentare(readFileSync(path.join(ORDNER, f), "utf8"));
    for (const m of muster) if (m.test(sql)) treffer.push(`${f}: ${m}`);
  }
  assert.deepEqual(treffer, []);
  // Gegenprobe: Die ersetzte Datei enthält den Fehler wirklich (das Muster erkennt ihn).
  const alt = ohneKommentare(readFileSync(path.join(ORDNER, "20261120100000_member_name_bereinigung.sql"), "utf8"));
  assert.match(alt, muster[0]);
});

test("save_member_name_bereinigung: letzte Fassung vergleicht Rolle als Text und prüft den Vorstand vor dem Update", () => {
  const mit = dateien.filter((f) => /function public\.save_member_name_bereinigung\(/.test(readFileSync(path.join(ORDNER, f), "utf8")));
  assert.ok(mit.length >= 2, "Korrektur-Migration fehlt");
  const letzte = mit.at(-1);
  assert.equal(letzte, "20261120110000_member_name_bereinigung_rolle.sql");
  const sql = ohneKommentare(readFileSync(path.join(ORDNER, letzte), "utf8"));
  assert.match(sql, /b\."Rolle"::text = 'board'/);
  const vorstand = sql.indexOf("kein aktives Vorstandsprofil");
  const update = sql.indexOf("update public.profiles");
  assert.ok(vorstand > 0 && update > 0 && vorstand < update, "Vorstandsprüfung muss vor dem Update stehen");
  // Rechte unverändert: nur service_role.
  assert.match(sql, /revoke execute on function public\.save_member_name_bereinigung\([^)]*\)\s+from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.save_member_name_bereinigung\([^)]*\)\s+to service_role;/);
});
