// Tests für lib/member-names-server.ts (Name ändern über save_member_name: Compare-and-set + Protokoll in einer
// Transaktion, Konto-Metadaten). Nachgebauter Supabase-Client; die RPC bildet die SQL-Funktion aus Migration
// 20261118130000 nach (Prüfung der Datei unten). Erfundene Daten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { speichereNamen } from "../lib/member-names-server.ts";

const PROFIL = "00000000-0000-4000-a000-000000000021";
const KONTO = "00000000-0000-4000-a000-000000000022";
const VORSTAND = "00000000-0000-4000-a000-000000000023";

function fakeAdmin(zeile, { rpcFehler = false } = {}) {
  const protokoll = [];
  const aufrufe = [];
  const konten = new Map([[KONTO, { id: KONTO, user_metadata: { Vorname: zeile.Vorname, Nachname: zeile.Nachname, andere: 1 } }]]);
  const rpc = async (name, a) => {
    aufrufe.push({ name, a });
    if (rpcFehler) return { data: null, error: { code: "XX000" } };
    // wie save_member_name: Felder bestimmen, Compare-and-set, Protokoll nur bei Vorstand – alles oder nichts
    const felder = [];
    if (a.p_nachname !== a.p_expected_nachname) felder.push("nachname");
    if (a.p_vorname !== a.p_expected_vorname) felder.push("vorname");
    if (felder.length === 0) return { data: true, error: null };
    if (zeile.Vorname !== a.p_expected_vorname || zeile.Nachname !== a.p_expected_nachname) return { data: false, error: null };
    zeile.Vorname = a.p_vorname;
    zeile.Nachname = a.p_nachname;
    if (a.p_corrected_by) protokoll.push({ profile_id: a.p_profile_id, corrected_by: a.p_corrected_by, fields: felder });
    return { data: true, error: null };
  };
  const auth = {
    admin: {
      getUserById: async (id) => ({ data: { user: konten.get(id) ?? null }, error: null }),
      updateUserById: async (id, { user_metadata }) => {
        konten.get(id).user_metadata = user_metadata;
        return { error: null };
      },
    },
  };
  return { rpc, auth, protokoll, aufrufe, konten, zeile };
}

test("Name ändern: nur bei unverändertem Stand, Konto-Metadaten mitziehen, kein Protokoll beim Mitglied", async () => {
  const admin = fakeAdmin({ Vorname: "Erika", Nachname: "Muster" });
  const r = await speichereNamen(admin, PROFIL, KONTO, { vorname: "Erika", nachname: "Muster" }, { nachname: "Muster-Schmidt" });
  assert.equal(r, "ok");
  assert.equal(admin.aufrufe[0].name, "save_member_name");
  assert.equal(admin.aufrufe[0].a.p_vorname, "Erika", "unveränderter Vorname wird wie gelesen übergeben");
  assert.equal(admin.zeile.Nachname, "Muster-Schmidt");
  assert.deepEqual(admin.konten.get(KONTO).user_metadata, { Vorname: "Erika", Nachname: "Muster-Schmidt", andere: 1 });
  assert.equal(admin.protokoll.length, 0);
});

test("Name ändern: inzwischen geändert → Konflikt, nichts geschrieben, Metadaten unverändert", async () => {
  const admin = fakeAdmin({ Vorname: "Erika", Nachname: "Anders" });
  const r = await speichereNamen(admin, PROFIL, KONTO, { vorname: "Erika", nachname: "Muster" }, { vorname: "Eri" });
  assert.equal(r, "konflikt");
  assert.equal(admin.zeile.Vorname, "Erika");
  assert.equal(admin.konten.get(KONTO).user_metadata.Vorname, "Erika");
});

test("Vorstand: Protokoll mit Feldnamen in derselben Funktion; leerer Name im Bestand (null) wird verglichen", async () => {
  const admin = fakeAdmin({ Vorname: null, Nachname: "Muster" });
  const r = await speichereNamen(admin, PROFIL, null, { vorname: null, nachname: "Muster" }, { vorname: "Erika" }, { correctedBy: VORSTAND });
  assert.equal(r, "ok");
  assert.equal(admin.aufrufe[0].a.p_corrected_by, VORSTAND);
  assert.deepEqual(admin.protokoll, [{ profile_id: PROFIL, corrected_by: VORSTAND, fields: ["vorname"] }]);
});

test("Fehler der Datenbank → „fehler“, keine Metadaten", async () => {
  const admin = fakeAdmin({ Vorname: "Erika", Nachname: "Muster" }, { rpcFehler: true });
  const r = await speichereNamen(admin, PROFIL, KONTO, { vorname: "Erika", nachname: "Muster" }, { vorname: "Eri" });
  assert.equal(r, "fehler");
  assert.equal(admin.konten.get(KONTO).user_metadata.Vorname, "Erika");
});

test("Migration: CAS und Protokoll in einer Funktion, nur service_role", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261118130000_member_name_correction.sql", import.meta.url), "utf8");
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /is not distinct from p_expected_vorname/);
  assert.match(sql, /insert into public\.member_data_corrections/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /\b(truncate|delete from|drop table)\b/i);
});
