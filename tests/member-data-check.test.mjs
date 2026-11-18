// Tests für lib/member-data-check.ts (Paket „Mitgliederdaten“, PR 4): Stichtage 1.3./15.9. nach Berliner Datum.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  berlinTagesbeginn,
  istBestaetigungOffen,
  letzterStichtag,
} from "../lib/member-data-check.ts";

const z = (iso) => new Date(iso);

test("Stichtag 1.3.: 28.2. 23:59 Berlin (MEZ) noch alter Stichtag, 1.3. 00:00 neuer", () => {
  assert.equal(letzterStichtag(z("2027-02-28T22:59:59Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2027-02-28T23:00:00Z")), "2027-03-01");
  // UTC-Mitternacht: in Berlin schon 1 Uhr am 1.3.
  assert.equal(letzterStichtag(z("2027-03-01T00:00:00Z")), "2027-03-01");
  // UTC noch 28.2., Berlin schon 1.3.
  assert.equal(letzterStichtag(z("2027-02-28T23:30:00Z")), "2027-03-01");
});

test("Stichtag 15.9.: 14.9. 23:59 Berlin (MESZ) noch 1.3., 15.9. 00:00 neuer", () => {
  assert.equal(letzterStichtag(z("2026-09-14T21:59:59Z")), "2026-03-01");
  assert.equal(letzterStichtag(z("2026-09-14T22:00:00Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2026-09-15T00:00:00Z")), "2026-09-15");
});

test("Jahreswechsel und Schaltjahr", () => {
  assert.equal(letzterStichtag(z("2026-12-31T22:59:59Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2026-12-31T23:30:00Z")), "2026-09-15"); // Berlin 1.1.2027
  assert.equal(letzterStichtag(z("2027-01-15T12:00:00Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2028-02-29T12:00:00Z")), "2027-09-15");
  assert.equal(letzterStichtag(z("2026-11-18T12:00:00Z")), "2026-09-15");
  assert.equal(letzterStichtag(z("2027-06-30T12:00:00Z")), "2027-03-01");
});

test("berlinTagesbeginn: Mitternacht Berlin in MEZ und MESZ, auch an Umstellungstagen", () => {
  assert.equal(berlinTagesbeginn("2027-03-01").toISOString(), "2027-02-28T23:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-09-15").toISOString(), "2026-09-14T22:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-03-29").toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-03-30").toISOString(), "2026-03-29T22:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-10-25").toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(berlinTagesbeginn("2026-10-26").toISOString(), "2026-10-25T23:00:00.000Z");
});

test("istBestaetigungOffen: leer oder ungültig = offen", () => {
  const jetzt = z("2026-11-18T12:00:00Z");
  for (const leer of [null, undefined, "", "  ", "kaputt", new Date(Number.NaN)]) {
    assert.equal(istBestaetigungOffen({ bestaetigtAm: leer, jetzt }), true, String(leer));
  }
});

test("istBestaetigungOffen: vor dem letzten Stichtag offen, ab dem Stichtag (Berliner Datum) erledigt", () => {
  const jetzt = z("2027-04-10T12:00:00Z"); // letzter Stichtag 1.3.2027
  assert.equal(istBestaetigungOffen({ bestaetigtAm: "2027-02-28T22:59:59+00:00", jetzt }), true); // 28.2. 23:59 Berlin
  assert.equal(istBestaetigungOffen({ bestaetigtAm: "2027-02-28T23:00:00+00:00", jetzt }), false); // 1.3. 00:00 Berlin
  assert.equal(istBestaetigungOffen({ bestaetigtAm: z("2027-03-20T08:00:00Z"), jetzt }), false);
  assert.equal(istBestaetigungOffen({ bestaetigtAm: "2026-09-20T08:00:00Z", jetzt }), true);
});

test("istBestaetigungOffen: am Stichtag selbst wird eine ältere Bestätigung fällig", () => {
  const bestaetigtAm = "2026-10-01T10:00:00Z";
  assert.equal(istBestaetigungOffen({ bestaetigtAm, jetzt: z("2027-02-28T22:59:59Z") }), false);
  assert.equal(istBestaetigungOffen({ bestaetigtAm, jetzt: z("2027-02-28T23:00:00Z") }), true);
});

test("Migration: Spalten additiv, ohne Standardwert, kein Schreibrecht für Mitglieder, Registrierung bestätigt", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261118140000_member_data_confirmation.sql", import.meta.url), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.match(code, /add column if not exists daten_bestaetigt_am timestamptz,/);
  assert.match(code, /add column if not exists daten_erinnern_ab timestamptz;/);
  assert.doesNotMatch(code, /\bdefault\b/i);
  assert.doesNotMatch(code, /\bgrant\b/i);
  assert.doesNotMatch(code, /create policy/i);
  assert.match(code, /from anon, authenticated;/);
  assert.match(code, /set daten_bestaetigt_am = now\(\)\s+where p\.id = p_user_id\s+and p\.user_id = p_user_id/);
  assert.match(code, /revoke execute on function public\.adopt_pending_secrets\(uuid\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /\b(truncate|delete from|drop table|drop column)\b/i);
});
