// Tests für lib/member-names-server.ts (Name ändern mit Compare-and-set, Protokoll, Konto-Metadaten).
// Nachgebauter Supabase-Client, erfundene Daten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { speichereNamen } from "../lib/member-names-server.ts";

const PROFIL = "00000000-0000-4000-a000-000000000021";
const KONTO = "00000000-0000-4000-a000-000000000022";
const VORSTAND = "00000000-0000-4000-a000-000000000023";

/** Datenbank mit einer Profilzeile; update greift nur, wenn alle eq/is-Bedingungen passen. */
function fakeAdmin(zeile) {
  const protokoll = [];
  const konten = new Map([[KONTO, { id: KONTO, user_metadata: { Vorname: zeile.Vorname, Nachname: zeile.Nachname, andere: 1 } }]]);
  const from = (tabelle) => {
    if (tabelle === "member_data_corrections") {
      return { insert: async (row) => (protokoll.push(row), { error: null }) };
    }
    let patch = null;
    const bedingungen = [];
    const q = {
      update: (p) => ((patch = p), q),
      eq: (spalte, wert) => (bedingungen.push([spalte, wert]), q),
      is: (spalte, wert) => (bedingungen.push([spalte, wert]), q),
      select: async () => {
        const passt = bedingungen.every(([k, v]) => (k === "id" ? v === PROFIL : (zeile[k] ?? null) === v));
        if (!passt) return { data: [], error: null };
        Object.assign(zeile, patch);
        return { data: [{ id: PROFIL }], error: null };
      },
    };
    return q;
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
  return { from, auth, protokoll, konten, zeile };
}

test("Name ändern: nur bei unverändertem Stand, Konto-Metadaten mitziehen", async () => {
  const admin = fakeAdmin({ Vorname: "Erika", Nachname: "Muster" });
  const r = await speichereNamen(admin, PROFIL, KONTO, { vorname: "Erika", nachname: "Muster" }, { nachname: "Muster-Schmidt" });
  assert.equal(r, "ok");
  assert.equal(admin.zeile.Nachname, "Muster-Schmidt");
  assert.equal(admin.zeile.Vorname, "Erika");
  assert.deepEqual(admin.konten.get(KONTO).user_metadata, { Vorname: "Erika", Nachname: "Muster-Schmidt", andere: 1 });
  assert.equal(admin.protokoll.length, 0, "Mitglied: kein Korrekturprotokoll");
});

test("Name ändern: inzwischen geändert → Konflikt, nichts geschrieben", async () => {
  const admin = fakeAdmin({ Vorname: "Erika", Nachname: "Anders" });
  const r = await speichereNamen(admin, PROFIL, KONTO, { vorname: "Erika", nachname: "Muster" }, { vorname: "Eri" });
  assert.equal(r, "konflikt");
  assert.equal(admin.zeile.Vorname, "Erika");
});

test("Vorstand: Protokoll nur mit Feldnamen; leerer Name im Bestand (null) wird verglichen", async () => {
  const admin = fakeAdmin({ Vorname: null, Nachname: "Muster" });
  const r = await speichereNamen(admin, PROFIL, null, { vorname: null, nachname: "Muster" }, { vorname: "Erika", nachname: "Muster" }, { correctedBy: VORSTAND });
  assert.equal(r, "ok");
  assert.deepEqual(admin.protokoll, [{ profile_id: PROFIL, corrected_by: VORSTAND, fields: ["nachname", "vorname"] }]);
  assert.ok(!JSON.stringify(admin.protokoll).includes("Erika"));
});
