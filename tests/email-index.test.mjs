// Unique-Index auf lower(btrim("E-Mail")) (Entscheidung Hannes 20.11.2026, eigener PR nach dem Zusammenführen der
// Doppelprofile): Abbruch, solange Adressen mehrfach vorkommen; der alte case-sensitive Constraint entfällt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const dateien = readdirSync(MIG)
  .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
  .sort();

test("Unique-Index auf lower(btrim(\"E-Mail\")) mit Abbruch bei Dubletten, alter Constraint entfällt", () => {
  const f = dateien.find((d) => /create unique index if not exists profiles_email_lower_key/i.test(readFileSync(path.join(MIG, d), "utf8")));
  assert.ok(f, "Migration mit profiles_email_lower_key fehlt");
  const sql = readFileSync(path.join(MIG, f), "utf8");
  assert.match(sql, /on public\.profiles \(lower\(btrim\("E-Mail"\)\)\)/);
  const pruefung = sql.indexOf("raise exception");
  assert.ok(pruefung !== -1 && pruefung < sql.indexOf("create unique index"), "Abbruch bei Dubletten muss vor dem Index stehen");
  assert.match(sql, /group by lower\(btrim\(p\."E-Mail"\)\)\s*having count\(\*\) > 1/);
  assert.match(sql, /drop constraint if exists "profiles_Email_key"/);
  // Danach legt keine Migration wieder einen Unique-Constraint nur auf "E-Mail" an.
  for (const d of dateien.filter((x) => x > f)) {
    assert.doesNotMatch(readFileSync(path.join(MIG, d), "utf8"), /unique\s*\(\s*"E-Mail"\s*\)/i, d);
  }
});
