// Tests für lib/member-secrets-server.ts und lib/member-secrets-backfill.ts mit dem Feld `land`
// (Paket „Mitgliederdaten“, PR 2). Kein Netz, keine Datenbank: der Supabase-Client ist nachgebaut.
// Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECRET_FIELDS,
  createDataKey,
  createKeyring,
  decryptField,
  encryptField,
  generateMasterKey,
  keyCheckValue,
  withDataKey,
} from "../lib/member-crypto.ts";

const MASTER = generateMasterKey();
process.env.MEMBER_DATA_MASTER_KEY = MASTER;
process.env.MEMBER_DATA_MASTER_KEY_ID = "test1";
delete process.env.MEMBER_DATA_OLD_MASTER_KEYS;

const {
  saveMemberSecrets,
  buildRegistrationSecrets,
  plainToSecretValues,
  emptySecretValues,
  readMemberSecrets,
  readMemberSecretsMany,
  MemberSecretsConflictError,
  PLAIN_COLUMNS,
  PLAIN_SECRET_FIELDS,
  _resetLandSpalte,
} = await import("../lib/member-secrets-server.ts");
const { differingFields } = await import("../lib/member-secrets-backfill.ts");

const ring = createKeyring("test1", { test1: MASTER });
const ALICE = "00000000-0000-4000-a000-000000000011";

/** Zeile wie in member_secrets, verschlüsselt mit `ring`. */
function row(values, version = 3) {
  const { dek, wrapped } = createDataKey(ring, ALICE);
  const out = { profile_id: ALICE, wrapped_dek: wrapped, version, iban_hash: null, iban_last4: null };
  for (const f of SECRET_FIELDS) out[f] = encryptField(dek, ALICE, f, values[f] ?? null);
  dek.fill(0);
  return out;
}

/**
 * Nachgebauter Service-Role-Client: liefert `stored` und merkt sich RPC-Aufrufe und abgefragte Spalten.
 * `ohneLandSpalte`: wie eine Datenbank vor der Migration (Abfrage mit `land` → Fehler 42703).
 */
function fakeAdmin(stored, { ohneLandSpalte = false } = {}) {
  const calls = [];
  const selects = [];
  const query = (table) => {
    let spalten = "";
    const antwort = () => {
      if (table === "member_crypto_keys") return { data: { kcv: keyCheckValue(ring), retired_at: null }, error: null };
      selects.push(spalten);
      if (ohneLandSpalte && /\bland\b/.test(spalten)) {
        return { data: null, error: { code: "42703", message: "column member_secrets.land does not exist" } };
      }
      const zeile = stored && ohneLandSpalte ? Object.fromEntries(Object.entries(stored).filter(([k]) => k !== "land")) : stored;
      return { data: zeile, error: null };
    };
    const q = {
      select: (s) => {
        spalten = s ?? "";
        return q;
      },
      eq: () => q,
      in: async () => {
        const r = antwort();
        return { data: r.data ? [r.data] : [], error: r.error };
      },
      maybeSingle: async () => antwort(),
    };
    return q;
  };
  return {
    calls,
    selects,
    from: query,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { error: null };
    },
  };
}

function decryptSecrets(wrapped, secrets) {
  return withDataKey(ring, ALICE, wrapped, (dek) => {
    const out = {};
    for (const f of SECRET_FIELDS) out[f] = decryptField(dek, ALICE, f, secrets[f]);
    return out;
  });
}

test("SECRET_FIELDS enthält land, die Klartextspalten nicht", () => {
  assert.ok(SECRET_FIELDS.includes("land"));
  assert.equal(SECRET_FIELDS.length, 9);
  assert.ok(!("land" in PLAIN_COLUMNS));
  assert.deepEqual([...PLAIN_SECRET_FIELDS], SECRET_FIELDS.filter((f) => f !== "land"));
  assert.equal(emptySecretValues().land, null);
});

test("land verschlüsseln und entschlüsseln", () => {
  const { dek } = createDataKey(ring, ALICE);
  const c = encryptField(dek, ALICE, "land", "AT");
  assert.match(c, /^e1\.[A-Za-z0-9_-]+$/);
  assert.equal(decryptField(dek, ALICE, "land", c), "AT");
  // An den Feldnamen gebunden: als Ort nicht lesbar.
  assert.throws(() => decryptField(dek, ALICE, "ort", c));
  dek.fill(0);
});

test("Speichern ohne land lässt das gespeicherte Land stehen", async () => {
  const stored = row({ ort: "Wien", land: "AT", handynummer: "+436641234567" });
  const admin = fakeAdmin(stored);
  await saveMemberSecrets(admin, ALICE, { ort: "Graz" });
  assert.equal(admin.calls.length, 1);
  const { args } = admin.calls[0];
  assert.ok("land" in args.p_secrets, "land wird immer übergeben");
  const plain = decryptSecrets(args.p_wrapped_dek, args.p_secrets);
  assert.equal(plain.land, "AT");
  assert.equal(plain.ort, "Graz");
  assert.equal(plain.handynummer, "+436641234567");
  assert.deepEqual(Object.keys(args.p_plain), ["ort"]);
  assert.equal(args.p_expected_version, 3);
});

test("Speichern mit land ändert nur das Land und protokolliert den Feldnamen", async () => {
  const stored = row({ ort: "Wien", land: null });
  const admin = fakeAdmin(stored);
  await saveMemberSecrets(admin, ALICE, { land: "CH" }, { correctedBy: "00000000-0000-4000-a000-000000000099" });
  const { args } = admin.calls[0];
  const plain = decryptSecrets(args.p_wrapped_dek, args.p_secrets);
  assert.equal(plain.land, "CH");
  assert.equal(plain.ort, "Wien");
  assert.deepEqual(Object.keys(args.p_plain), ["land"]);
});

test("Altzeile ohne land (null) bleibt ohne Land, wenn nichts übergeben wird", async () => {
  const stored = row({ ort: "Regensburg" });
  const admin = fakeAdmin(stored);
  await saveMemberSecrets(admin, ALICE, { ort: "Neutraubling" });
  const { args } = admin.calls[0];
  assert.equal(args.p_secrets.land, null);
});

test("Backfill: plainToSecretValues ohne land, Vergleich ignoriert land", () => {
  const plain = plainToSecretValues({ Ort: "Regensburg", Handynummer: "+49 176 1234567" });
  assert.ok(!("land" in plain));
  const secret = { ...emptySecretValues(), ort: "Regensburg", handynummer: "+49 176 1234567", land: "DE" };
  assert.deepEqual(differingFields(secret, plain), []);
  assert.deepEqual(differingFields({ ...secret, ort: "Wien" }, plain), ["ort"]);
});

test("Registrierung: land landet verschlüsselt in den Chiffraten", async () => {
  const admin = fakeAdmin(null);
  const secrets = await buildRegistrationSecrets(admin, ALICE, { ort: "Regensburg", land: "DE", iban: "DE89 3704 0044 0532 0130 00" });
  assert.ok(secrets);
  assert.deepEqual(Object.keys(secrets.fields).sort(), [...SECRET_FIELDS].sort());
  const plain = decryptSecrets(secrets.wrapped_dek, secrets.fields);
  assert.equal(plain.land, "DE");
  assert.equal(plain.iban, "DE89370400440532013000");
});

test("S3: erwartete Version passt → speichert mit genau dieser Version", async () => {
  const admin = fakeAdmin(row({ ort: "Regensburg" }, 7));
  await saveMemberSecrets(admin, ALICE, { ort: "Wien" }, { erwarteteVersion: 7 });
  assert.equal(admin.calls[0].args.p_expected_version, 7);
});

test("S3: erwartete Version weicht ab → nichts gespeichert", async () => {
  const admin = fakeAdmin(row({ ort: "Regensburg" }, 8));
  await assert.rejects(saveMemberSecrets(admin, ALICE, { ort: "Wien" }, { erwarteteVersion: 7 }), MemberSecretsConflictError);
  assert.equal(admin.calls.length, 0);
  // Formular ohne Zeile (Version 0), inzwischen gibt es eine.
  await assert.rejects(saveMemberSecrets(fakeAdmin(row({}, 1)), ALICE, { ort: "Wien" }, { erwarteteVersion: 0 }), MemberSecretsConflictError);
  // Zeile fehlt und Formular erwartet 0 → legt an.
  const neu = fakeAdmin(null);
  await saveMemberSecrets(neu, ALICE, { ort: "Wien" }, { erwarteteVersion: 0 });
  assert.equal(neu.calls[0].args.p_expected_version, null);
});

test("S1: ohne Spalte land lesen und speichern (Übergang vor der Migration)", async (t) => {
  _resetLandSpalte();
  t.after(() => _resetLandSpalte());
  const warnungen = [];
  t.mock.method(console, "warn", (...a) => warnungen.push(a.join(" ")));
  const stored = row({ ort: "Regensburg", land: "AT", handynummer: "+491761234567" });
  const admin = fakeAdmin(stored, { ohneLandSpalte: true });
  const werte = await readMemberSecrets(admin, ALICE);
  assert.equal(werte.ort, "Regensburg");
  assert.equal(werte.land, null);
  assert.equal(warnungen.length, 1);
  assert.ok(!/Regensburg|1761234567/.test(warnungen[0]), "keine Werte im Log");
  // Weitere Lesevorgänge gleich ohne land, ohne neue Warnung.
  const viele = await readMemberSecretsMany(admin, [{ id: ALICE }]);
  assert.equal(viele.get(ALICE).ort, "Regensburg");
  assert.equal(warnungen.length, 1);
  // Speichern ohne land (die alte Funktion nimmt 8 Felder).
  await saveMemberSecrets(admin, ALICE, { ort: "Wien", land: "DE" });
  const { args } = admin.calls[0];
  assert.ok(!("land" in args.p_secrets));
  assert.ok(!("land" in args.p_plain));
  assert.deepEqual(Object.keys(args.p_secrets).sort(), [...PLAIN_SECRET_FIELDS].sort());
});

test("G1: ohne land gelesene Zeile → ohne land speichern, auch wenn der Rückfall-Merker schon abgelaufen ist", async () => {
  _resetLandSpalte();
  // Zeile kommt ohne Schlüssel land zurück (z. B. veralteter Schema-Cache), der Merker ist nicht gesetzt.
  const stored = row({ ort: "Wien", land: "AT" });
  delete stored.land;
  const admin = fakeAdmin(stored);
  await saveMemberSecrets(admin, ALICE, { ort: "Graz", land: "DE" });
  const { args } = admin.calls[0];
  assert.ok(!("land" in args.p_secrets), "kein land an eine Zeile, deren Land nicht gelesen wurde");
  assert.ok(!("land" in args.p_plain));
  const { readMemberSecretsWithMeta } = await import("../lib/member-secrets-server.ts");
  assert.equal((await readMemberSecretsWithMeta(fakeAdmin(stored), ALICE)).landBekannt, false);
  assert.equal((await readMemberSecretsWithMeta(fakeAdmin(row({ land: "AT" })), ALICE)).landBekannt, true);
});
