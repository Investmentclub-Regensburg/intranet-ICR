// Tests für lib/member-crypto.ts – Ausführen mit `npm test` (Node >= 22.18, TypeScript-Typ-Stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECRET_FIELDS,
  MemberCryptoError,
  blindIndex,
  createDataKey,
  createKeyring,
  decryptField,
  encryptField,
  generateMasterKey,
  blindIndexChanged,
  ibanChanged,
  ibanIndex,
  keyCheckValue,
  normalizeIban,
  withDataKeyAsync,
  parseKeyringEnv,
  rewrapDataKey,
  unwrapDataKey,
  withDataKey,
  wrappedKeyId,
} from "../lib/member-crypto.ts";

const K1 = generateMasterKey();
const K2 = generateMasterKey();
const ring1 = createKeyring("k1", { k1: K1 });
const ring12 = createKeyring("k2", { k1: K1, k2: K2 });
const ALICE = "00000000-0000-4000-a000-000000000001";
const BOB = "00000000-0000-4000-a000-000000000002";

const isCryptoError = (err) => err instanceof MemberCryptoError;

test("Feld verschlüsseln und wieder entschlüsseln (alle Felder, Umlaute, Emoji)", () => {
  const { dek } = createDataKey(ring1, ALICE);
  for (const field of SECRET_FIELDS) {
    const plain = `${field}: Müllerstraße 12a 🏠 DE89 3704 0044 0532 0130 00`;
    const enc = encryptField(dek, ALICE, field, plain);
    assert.match(enc, /^e1\.[A-Za-z0-9_-]+$/);
    assert.ok(!enc.includes("Müller") && !enc.includes("DE89"), "kein Klartext im Chiffrat");
    assert.equal(decryptField(dek, ALICE, field, enc), plain);
  }
});

test("leere Werte werden nicht gespeichert, null bleibt null", () => {
  const { dek } = createDataKey(ring1, ALICE);
  assert.equal(encryptField(dek, ALICE, "iban", ""), null);
  assert.equal(encryptField(dek, ALICE, "iban", null), null);
  assert.equal(encryptField(dek, ALICE, "iban", undefined), null);
  assert.equal(decryptField(dek, ALICE, "iban", null), null);
});

test("gleicher Klartext ergibt jedes Mal ein anderes Chiffrat (zufälliger IV)", () => {
  const { dek } = createDataKey(ring1, ALICE);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(encryptField(dek, ALICE, "iban", "DE89370400440532013000"));
  assert.equal(seen.size, 200);
});

test("Manipulation am Chiffrat fällt auf (jedes Byte)", () => {
  const { dek } = createDataKey(ring1, ALICE);
  const enc = encryptField(dek, ALICE, "iban", "DE89370400440532013000");
  const raw = Buffer.from(enc.slice(3), "base64url");
  for (let i = 0; i < raw.length; i++) {
    const tampered = Buffer.from(raw);
    tampered[i] ^= 0x01;
    assert.throws(() => decryptField(dek, ALICE, "iban", `e1.${tampered.toString("base64url")}`), isCryptoError, `Byte ${i}`);
  }
  assert.throws(() => decryptField(dek, ALICE, "iban", "e1."), isCryptoError);
  assert.throws(() => decryptField(dek, ALICE, "iban", "e1.!!!"), isCryptoError);
  assert.throws(() => decryptField(dek, ALICE, "iban", "DE89370400440532013000"), isCryptoError, "Klartext ist kein gültiges Format");
});

test("Wert lässt sich nicht in ein anderes Feld oder zu einem anderen Mitglied kopieren", () => {
  const { dek } = createDataKey(ring1, ALICE);
  const enc = encryptField(dek, ALICE, "iban", "DE89370400440532013000");
  assert.throws(() => decryptField(dek, ALICE, "bic", enc), isCryptoError, "anderes Feld");
  assert.throws(() => decryptField(dek, BOB, "iban", enc), isCryptoError, "anderes Mitglied");
});

test("Datenschlüssel: nur mit richtigem Master Key und für das richtige Mitglied", () => {
  const { dek, wrapped } = createDataKey(ring1, ALICE);
  assert.match(wrapped, /^w2\.k1\.[0-9a-f]{16}\.[A-Za-z0-9_-]+$/);
  assert.ok(!wrapped.includes(dek.toString("base64url")), "Datenschlüssel nicht im Klartext");
  assert.deepEqual(unwrapDataKey(ring1, ALICE, wrapped), dek);
  assert.throws(() => unwrapDataKey(ring1, BOB, wrapped), isCryptoError, "anderes Mitglied");
  const otherRing = createKeyring("k1", { k1: generateMasterKey() });
  assert.throws(() => unwrapDataKey(otherRing, ALICE, wrapped), isCryptoError, "anderer Master Key");
  assert.throws(() => unwrapDataKey(createKeyring("k2", { k2: K2 }), ALICE, wrapped), isCryptoError, "Key-ID fehlt");
  assert.throws(() => unwrapDataKey(ring1, ALICE, "w1.k1.abc"), isCryptoError, "unbekannte Version");
  // Key-ID oder Prüfwert im gespeicherten Wert manipuliert
  const [, , kcv, payload] = wrapped.split(".");
  assert.throws(() => unwrapDataKey(ring12, ALICE, `w2.k2.${kcv}.${payload}`), isCryptoError, "Key-ID getauscht");
  assert.throws(() => unwrapDataKey(ring1, ALICE, `w2.k1.0000000000000000.${payload}`), isCryptoError, "Prüfwert falsch");
});

test("Rotation: alter Datenschlüssel bleibt lesbar, wird mit neuem Master Key neu verschlüsselt", () => {
  const { dek, wrapped } = createDataKey(ring1, ALICE);
  const enc = encryptField(dek, ALICE, "strasse", "Teststraße");
  const rewrapped = rewrapDataKey(ring12, ALICE, wrapped);
  assert.equal(wrappedKeyId(wrapped), "k1");
  assert.equal(wrappedKeyId(rewrapped), "k2");
  // Feldwerte bleiben unverändert lesbar
  assert.equal(decryptField(unwrapDataKey(ring12, ALICE, rewrapped), ALICE, "strasse", enc), "Teststraße");
  // Nach der Rotation reicht der neue Key allein
  const ring2only = createKeyring("k2", { k2: K2 });
  assert.equal(decryptField(unwrapDataKey(ring2only, ALICE, rewrapped), ALICE, "strasse", enc), "Teststraße");
  assert.throws(() => unwrapDataKey(ring2only, ALICE, wrapped), isCryptoError, "alter Schlüssel braucht k1");
});

test("Fingerabdruck: deterministisch, je Feld und Master Key verschieden", () => {
  const a = ibanIndex(ring1, "DE89370400440532013000");
  assert.match(a, /^h1\.k1\.[0-9a-f]{64}$/);
  assert.equal(ibanIndex(ring1, " de89 3704 0044 0532 0130 00 "), a, "gleiche Normalisierung");
  assert.notEqual(ibanIndex(ring1, "DE89370400440532013001"), a);
  assert.notEqual(blindIndex(ring1, "bic", "DE89370400440532013000"), a);
  assert.notEqual(ibanIndex(createKeyring("k1", { k1: generateMasterKey() }), "DE89370400440532013000"), a);
});

test("Fingerabdruck: Änderung nur bei gleicher Key-ID und anderem Wert", () => {
  const before = ibanIndex(ring1, "DE89370400440532013000");
  assert.equal(blindIndexChanged(before, ibanIndex(ring1, "DE89370400440532013000")), false, "gleich");
  assert.equal(blindIndexChanged(before, ibanIndex(ring1, "DE02120300000000202051")), true, "geändert");
  assert.equal(blindIndexChanged(null, before), false, "erste Hinterlegung");
  assert.equal(blindIndexChanged(before, null), false, "geleert");
  // Nach Rotation (k1 → k2) andere Werte, aber keine Änderung der IBAN
  assert.equal(blindIndexChanged(before, ibanIndex(ring12, "DE89370400440532013000")), false, "Rotation");
  assert.throws(() => blindIndexChanged(before, "kaputt"), isCryptoError, "beschädigt");
  assert.throws(() => blindIndexChanged(before, `${before}.extra`), isCryptoError, "zusätzliche Teile");
});

test("ibanChanged erkennt Änderungen auch während einer Rotation", () => {
  const before = ibanIndex(ring1, "DE89370400440532013000");
  assert.equal(ibanChanged(ring12, before, "DE89 3704 0044 0532 0130 00"), false, "gleich, alter Key noch da");
  assert.equal(ibanChanged(ring12, before, "DE02120300000000202051"), true, "geändert während Rotation");
  assert.equal(ibanChanged(ring1, null, "DE02120300000000202051"), false, "erste Hinterlegung");
  assert.equal(ibanChanged(ring1, before, ""), false, "Löschen ist keine Änderung");
  assert.equal(ibanChanged(ring1, before, "  "), false, "nur Leerzeichen");
  assert.throws(() => ibanChanged(createKeyring("k2", { k2: K2 }), before, "DE89370400440532013000"), isCryptoError, "alter Key weg → blockieren");
  assert.throws(() => ibanChanged(ring1, "garbage", "DE89370400440532013000"), isCryptoError, "beschädigter Fingerabdruck");
});

test("normalizeIban entfernt auch unsichtbare Zeichen", () => {
  assert.equal(normalizeIban(" de89\u200b 3704-0044 0532 0130 00\n"), "DE89370400440532013000");
});

test("Prüfwert (KCV): gleicher Key gleicher Wert, anderer Key anderer Wert", () => {
  assert.match(keyCheckValue(ring1), /^[0-9a-f]{16}$/);
  assert.equal(keyCheckValue(createKeyring("x", { x: K1 })), keyCheckValue(ring1));
  assert.notEqual(keyCheckValue(ring12), keyCheckValue(ring1));
  assert.equal(keyCheckValue(ring12, "k1"), keyCheckValue(ring1));
  assert.throws(() => keyCheckValue(ring1, "k9"), isCryptoError);
});

test("Keyring aus Umgebungswerten: doppelte IDs mit verschiedenen Keys brechen ab", () => {
  const ring = parseKeyringEnv({ current: K2, currentId: "k2", old: ` k1:${K1} ` });
  assert.equal(ring.currentId, "k2");
  assert.equal(keyCheckValue(ring, "k1"), keyCheckValue(ring1));
  assert.throws(() => parseKeyringEnv({ current: K2, currentId: "k1", old: `k1:${K1}` }), isCryptoError, "gleiche ID, anderer Key");
  assert.throws(() => parseKeyringEnv({ current: K1, currentId: "k2", old: `k1:${K1},k1:${K2}` }), isCryptoError, "doppelt in old");
  assert.doesNotThrow(() => parseKeyringEnv({ current: K1, currentId: "k1", old: `k1:${K1}` }), "gleicher Wert ist ok");
  assert.throws(() => parseKeyringEnv({ current: "", currentId: "k1" }), isCryptoError, "fehlt");
  assert.throws(() => parseKeyringEnv({ current: K1, currentId: "k1", old: "ohne-trenner" }), isCryptoError);
  assert.throws(() => createKeyring("k2", { k1: K1, k2: K1 }), isCryptoError, "gleicher Key unter zwei IDs");
});

test("withDataKey lehnt async-Callbacks ab, withDataKeyAsync hält den Schlüssel bis zum Ende", async () => {
  const { wrapped } = createDataKey(ring1, ALICE);
  let unhandled = 0;
  const onUnhandled = () => unhandled++;
  process.on("unhandledRejection", onUnhandled);
  assert.throws(
    () => withDataKey(ring1, ALICE, wrapped, async (dek) => { await null; return encryptField(dek, ALICE, "iban", "x"); }),
    isCryptoError,
  );
  await new Promise((r) => setTimeout(r, 20));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, 0, "keine unbehandelte Ablehnung");
  const enc = await withDataKeyAsync(ring1, ALICE, wrapped, async (dek) => {
    await new Promise((r) => setTimeout(r, 5));
    return encryptField(dek, ALICE, "iban", "DE89370400440532013000");
  });
  assert.equal(withDataKey(ring1, ALICE, wrapped, (dek) => decryptField(dek, ALICE, "iban", enc)), "DE89370400440532013000");
  assert.throws(() => encryptField(Buffer.alloc(32), ALICE, "iban", "x"), isCryptoError, "Null-Schlüssel");
});

test("withDataKey überschreibt den Datenschlüssel danach", () => {
  const { wrapped } = createDataKey(ring1, ALICE);
  let kept;
  const enc = withDataKey(ring1, ALICE, wrapped, (dek) => {
    kept = dek;
    return encryptField(dek, ALICE, "plz", "93053");
  });
  assert.ok(kept.every((b) => b === 0), "nach Gebrauch genullt");
  assert.equal(withDataKey(ring1, ALICE, wrapped, (dek) => decryptField(dek, ALICE, "plz", enc)), "93053");
});

test("Testvektoren: gespeicherte Formate bleiben lesbar (Schutz vor stillen Formatänderungen)", () => {
  // Fester Test-Key (nur für diesen Test). Ändert sich HKDF-info, AAD oder Kodierung, schlägt das fehl –
  // dann wären auch gespeicherte Daten in der Produktion nicht mehr lesbar.
  const ring = createKeyring("kat", { kat: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=" });
  const id = "00000000-0000-4000-a000-0000000000aa";
  assert.equal(keyCheckValue(ring), "dc84b4763e85b500");
  const wrapped = "w2.kat.dc84b4763e85b500.64LO2xRV8zmg_RrSAvFvbGGxLsPAV33cWkrnKah1I_5IQOwJmTsluhHrGzQNiYSdkzvwsHiaVaimrdtD";
  const iban = "e1.H8ZfHRQdfiu9jaq0i3Ek5dLBl1RCUEvzO9X_LzAXcnj0xmsNZwXz70oLONOVFrD_mP0";
  assert.equal(withDataKey(ring, id, wrapped, (dek) => decryptField(dek, id, "iban", iban)), "DE89370400440532013000");
  assert.equal(ibanIndex(ring, "DE89370400440532013000"), "h1.kat.f7e7f18c34c32e9e6b2035e0fe96c531b4309e4869662ab392cc1a1ced22a597");
});

test("ungültige Master Keys und IDs werden abgelehnt", () => {
  assert.throws(() => createKeyring("k1", { k1: Buffer.alloc(16).toString("base64") }), isCryptoError, "zu kurz");
  assert.throws(() => createKeyring("k1", { k1: "kein base64 !!" }), isCryptoError);
  assert.throws(() => createKeyring("K 1", { "K 1": K1 }), isCryptoError, "ungültige ID");
  assert.throws(() => createKeyring("k2", { k1: K1 }), isCryptoError, "aktueller Key fehlt");
  const { dek } = createDataKey(ring1, ALICE);
  assert.throws(() => encryptField(dek, "kein-uuid", "iban", "x"), isCryptoError);
  assert.throws(() => encryptField(dek, "------------------------------------", "iban", "x"), isCryptoError);
  assert.throws(() => encryptField(dek, "00000000-0000-0000-0000-000000000000", "iban", "x"), isCryptoError);
  assert.throws(() => encryptField(Buffer.alloc(16), ALICE, "iban", "x"), isCryptoError, "DEK zu kurz");
  assert.throws(() => decryptField(Buffer.alloc(16), ALICE, "iban", "e1.x"), isCryptoError, "DEK zu kurz");
});

test("Fehlermeldungen enthalten keinen Klartext und keine Schlüssel", () => {
  const { dek } = createDataKey(ring1, ALICE);
  const enc = encryptField(dek, ALICE, "iban", "DE89370400440532013000");
  try {
    decryptField(dek, BOB, "iban", enc);
    assert.fail("hätte werfen müssen");
  } catch (err) {
    assert.ok(isCryptoError(err));
    for (const secret of ["DE89", K1, enc.slice(3, 20), dek.toString("base64")]) {
      assert.ok(!String(err.message).includes(secret));
    }
  }
});
