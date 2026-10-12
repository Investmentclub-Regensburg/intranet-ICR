/**
 * Verschlüsselung sensibler Mitgliedsdaten (Envelope Encryption).
 *
 *  - Master Key (Umgebungsvariable, je Umgebung eigener Key) → per HKDF abgeleitet:
 *      * KEK: verschlüsselt die Datenschlüssel der Mitglieder
 *      * Index-Key: HMAC-Fingerabdrücke (z. B. IBAN-Änderung erkennen, ohne Klartext)
 *  - Je Mitglied ein eigener Datenschlüssel (DEK, 32 Byte), gespeichert nur verschlüsselt.
 *  - Felder: AES-256-GCM, gebunden an Mitglied und Feldname (AAD) – ein Wert lässt sich nicht in ein
 *    anderes Feld oder zu einem anderen Mitglied kopieren, ohne dass die Entschlüsselung scheitert.
 *
 * Formate (Text, in der Datenbank speicherbar):
 *   Datenschlüssel: "w2.<keyId>.<kcv>.<base64url(iv | tag | ciphertext)>"
 *   Feldwert:       "e1.<base64url(iv | tag | ciphertext)>"
 *   Fingerabdruck:  "h1.<keyId>.<hex>"
 * kcv = Key Check Value (Prüfwert des Master Keys): Ein falscher Key unter bekannter ID fällt sofort auf,
 * statt still neue Daten mit dem falschen Key zu speichern. Die gültigen Prüfwerte stehen in der
 * Datenbank (Tabelle der registrierten Master Keys) und werden vor dem ersten Verschlüsseln geprüft.
 *
 * Bewusst ohne Abhängigkeiten (nur node:crypto), damit `node --test` die Datei direkt laden kann.
 * Umgebungsvariablen liest lib/member-crypto-server.ts.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SECRET_FIELDS = [
  "iban",
  "bic",
  "geburtsdatum",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "handynummer",
] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

export type Keyring = {
  /** Key, mit dem neue Datenschlüssel verschlüsselt werden. */
  currentId: string;
  /** Alle bekannten Master Keys (aktuell und ältere für Rotation), nach ID. */
  keys: ReadonlyMap<string, { kek: Buffer; indexKey: Buffer; kcv: string }>;
};

/** Fehler ohne Inhalte (nie Klartext, Schlüssel oder Chiffrat in die Meldung). */
export class MemberCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberCryptoError";
  }
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[a-z0-9-]{1,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deriveKey(master: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), info, KEY_BYTES));
}

/**
 * Keyring aus Master Keys bauen. `masters`: ID → Master Key (Base64, genau 32 Byte).
 */
export function createKeyring(currentId: string, masters: Record<string, string>): Keyring {
  const keys = new Map<string, { kek: Buffer; indexKey: Buffer; kcv: string }>();
  for (const [id, b64] of Object.entries(masters)) {
    if (!KEY_ID_PATTERN.test(id)) throw new MemberCryptoError(`Ungültige Key-ID: ${id}`);
    const master = Buffer.from(b64.trim(), "base64");
    if (master.length !== KEY_BYTES || master.toString("base64") !== b64.trim()) {
      throw new MemberCryptoError(`Master Key ${id}: muss Base64 mit genau ${KEY_BYTES} Byte sein`);
    }
    const kcvKey = deriveKey(master, "icr-intranet/kcv/v1");
    keys.set(id, {
      kek: deriveKey(master, "icr-intranet/kek/v1"),
      indexKey: deriveKey(master, "icr-intranet/blind-index/v1"),
      kcv: createHmac("sha256", kcvKey).update("kcv").digest("hex").slice(0, 16),
    });
    kcvKey.fill(0);
    master.fill(0);
  }
  if (!keys.has(currentId)) throw new MemberCryptoError(`Aktueller Master Key ${currentId} fehlt`);
  const kcvs = [...keys.values()].map((k) => k.kcv);
  if (new Set(kcvs).size !== kcvs.length) {
    throw new MemberCryptoError("Derselbe Master Key ist unter mehreren IDs gesetzt");
  }
  return { currentId, keys };
}

/**
 * Keyring aus Umgebungswerten (reine Funktion, testbar):
 *   current/currentId – aktueller Master Key; old – ältere Keys "id:base64,id:base64" (Rotation).
 * Doppelte IDs mit verschiedenen Keys sind ein Konfigurationsfehler und brechen ab.
 */
export function parseKeyringEnv(env: {
  current?: string;
  currentId?: string;
  old?: string;
}): Keyring {
  const current = env.current?.trim();
  const currentId = env.currentId?.trim();
  if (!current || !currentId) {
    throw new MemberCryptoError("MEMBER_DATA_MASTER_KEY und MEMBER_DATA_MASTER_KEY_ID müssen gesetzt sein");
  }
  const masters: Record<string, string> = {};
  const add = (id: string, value: string) => {
    if (id in masters && masters[id] !== value) {
      throw new MemberCryptoError(`Key-ID ${id} ist mehrfach mit verschiedenen Keys gesetzt`);
    }
    masters[id] = value;
  };
  for (const entry of (env.old ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) throw new MemberCryptoError("MEMBER_DATA_OLD_MASTER_KEYS: Format id:base64");
    add(trimmed.slice(0, sep), trimmed.slice(sep + 1).trim());
  }
  add(currentId, current);
  return createKeyring(currentId, masters);
}

/** Prüfwert (KCV) eines Master Keys – zum Eintragen in die Datenbank und zum Abgleich. */
export function keyCheckValue(keyring: Keyring, keyId: string = keyring.currentId): string {
  const key = keyring.keys.get(keyId);
  if (!key) throw new MemberCryptoError(`Master Key ${keyId} nicht vorhanden`);
  return key.kcv;
}

function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function open(key: Buffer, payload: string, aad: string): Buffer {
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES || raw.toString("base64url") !== payload) {
    throw new MemberCryptoError("Chiffrat beschädigt");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
  } catch {
    throw new MemberCryptoError("Entschlüsselung fehlgeschlagen");
  }
}

function assertMemberId(memberId: string): void {
  if (!UUID_PATTERN.test(memberId)) throw new MemberCryptoError("Ungültige Mitglieds-ID");
}

function assertDataKey(dek: Buffer): void {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES || dek.every((b) => b === 0)) {
    throw new MemberCryptoError("Datenschlüssel ungültig (bereits überschrieben?)");
  }
}

const dekAad = (memberId: string, keyId: string, kcv: string) =>
  `icr-intranet/dek/w2/${keyId}/${kcv}/${memberId.toLowerCase()}`;
const fieldAad = (memberId: string, field: SecretField) =>
  `icr-intranet/field/v1/${memberId.toLowerCase()}/${field}`;

function parseWrapped(wrapped: string): { keyId: string; kcv: string; payload: string } {
  const parts = wrapped.split(".");
  if (parts.length !== 4 || parts[0] !== "w2") throw new MemberCryptoError("Unbekanntes Schlüsselformat");
  return { keyId: parts[1], kcv: parts[2], payload: parts[3] };
}

/** Neuen Datenschlüssel für ein Mitglied erzeugen; `wrapped` wird gespeichert, `dek` nie. */
export function createDataKey(keyring: Keyring, memberId: string): { dek: Buffer; wrapped: string } {
  assertMemberId(memberId);
  const dek = randomBytes(KEY_BYTES);
  return { dek, wrapped: wrapDataKey(keyring, memberId, dek) };
}

function wrapDataKey(keyring: Keyring, memberId: string, dek: Buffer): string {
  const id = keyring.currentId;
  const key = keyring.keys.get(id)!;
  return `w2.${id}.${key.kcv}.${seal(key.kek, dek, dekAad(memberId, id, key.kcv))}`;
}

/** Gespeicherten Datenschlüssel entschlüsseln (mit dem Master Key, mit dem er verschlüsselt wurde). */
export function unwrapDataKey(keyring: Keyring, memberId: string, wrapped: string): Buffer {
  assertMemberId(memberId);
  const { keyId, kcv, payload } = parseWrapped(wrapped);
  const key = keyring.keys.get(keyId);
  if (!key) throw new MemberCryptoError(`Master Key ${keyId} nicht vorhanden`);
  if (key.kcv !== kcv) throw new MemberCryptoError(`Master Key ${keyId} passt nicht zu den gespeicherten Daten`);
  const dek = open(key.kek, payload, dekAad(memberId, keyId, kcv));
  if (dek.length !== KEY_BYTES) throw new MemberCryptoError("Datenschlüssel ungültig");
  return dek;
}

/**
 * Datenschlüssel nur für die Dauer von `fn` im Speicher halten und danach überschreiben (synchron).
 * Für async-Code `withDataKeyAsync` verwenden – hier wirft ein Promise als Rückgabe, weil der Schlüssel
 * sonst schon vor dem ersten `await` überschrieben wäre.
 */
export function withDataKey<T>(
  keyring: Keyring,
  memberId: string,
  wrapped: string,
  fn: (dek: Buffer) => T extends PromiseLike<unknown> ? never : T,
): T {
  const dek = unwrapDataKey(keyring, memberId, wrapped);
  try {
    const result = fn(dek) as T;
    if (result !== null && typeof (result as { then?: unknown })?.then === "function") {
      // Spätere Ablehnung abfangen (sonst unhandledRejection → Absturz der Instanz).
      (result as unknown as PromiseLike<unknown>).then(undefined, () => {});
      throw new MemberCryptoError("withDataKey: für async-Code withDataKeyAsync verwenden");
    }
    return result;
  } finally {
    dek.fill(0);
  }
}

/** Wie `withDataKey`, überschreibt den Schlüssel aber erst nach Abschluss des Promise. */
export async function withDataKeyAsync<T>(
  keyring: Keyring,
  memberId: string,
  wrapped: string,
  fn: (dek: Buffer) => Promise<T>,
): Promise<T> {
  const dek = unwrapDataKey(keyring, memberId, wrapped);
  try {
    return await fn(dek);
  } finally {
    dek.fill(0);
  }
}

/** Key-ID, mit der ein gespeicherter Datenschlüssel verschlüsselt ist (für Rotation). */
export function wrappedKeyId(wrapped: string): string {
  return parseWrapped(wrapped).keyId;
}

/** Rotation: Datenschlüssel mit dem aktuellen Master Key neu verschlüsseln (Feldwerte bleiben). */
export function rewrapDataKey(keyring: Keyring, memberId: string, wrapped: string): string {
  return withDataKey(keyring, memberId, wrapped, (dek) => wrapDataKey(keyring, memberId, dek));
}

/** Feld verschlüsseln. Leer/null → null (nichts zu speichern). */
export function encryptField(
  dek: Buffer,
  memberId: string,
  field: SecretField,
  value: string | null | undefined,
): string | null {
  assertMemberId(memberId);
  assertDataKey(dek);
  if (value === null || value === undefined || value === "") return null;
  return `e1.${seal(dek, Buffer.from(value, "utf8"), fieldAad(memberId, field))}`;
}

/** Feld entschlüsseln. null → null. Wirft bei Manipulation, falschem Feld/Mitglied/Schlüssel. */
export function decryptField(
  dek: Buffer,
  memberId: string,
  field: SecretField,
  value: string | null | undefined,
): string | null {
  assertMemberId(memberId);
  assertDataKey(dek);
  if (value === null || value === undefined) return null;
  if (!value.startsWith("e1.")) throw new MemberCryptoError("Unbekanntes Feldformat");
  return open(dek, value.slice(3), fieldAad(memberId, field)).toString("utf8");
}

/**
 * Fingerabdruck eines Werts: "h1.<keyId>.<hex>" (HMAC-SHA256). Gleiche Eingabe und gleicher Master Key
 * ergeben denselben Wert, ohne dass sich der Klartext zurückrechnen lässt. Je Feld getrennt.
 * Die Key-ID steht im Wert: Nach einer Rotation ändert sich der Fingerabdruck, das ist aber KEINE
 * Änderung des Werts – vergleichen nur über `blindIndexChanged` (gleiche Key-ID, anderer Hash).
 */
export function blindIndex(keyring: Keyring, field: SecretField, normalizedValue: string): string {
  return blindIndexWithKey(keyring, keyring.currentId, field, normalizedValue);
}

function blindIndexWithKey(keyring: Keyring, keyId: string, field: SecretField, normalizedValue: string): string {
  const key = keyring.keys.get(keyId);
  if (!key) throw new MemberCryptoError(`Master Key ${keyId} nicht vorhanden`);
  const hex = createHmac("sha256", key.indexKey).update(`${field}\u0000${normalizedValue}`, "utf8").digest("hex");
  return `h1.${keyId}.${hex}`;
}

/**
 * IBAN für Fingerabdruck und Vergleich normalisieren: Großbuchstaben, alles außer A–Z und 0–9 entfernt
 * (auch unsichtbare Zeichen). Reihenfolge: erst normalisieren, dann GENAU diesen String validieren und
 * speichern.
 */
export function normalizeIban(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Fingerabdruck einer IBAN – überall dieselbe Normalisierung (Profil, Admin, Registrierung). */
export function ibanIndex(keyring: Keyring, rawIban: string): string {
  return blindIndex(keyring, "iban", normalizeIban(rawIban));
}

function parseIndex(value: string | null | undefined): { keyId: string; hex: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "h1" || !/^[0-9a-f]{64}$/.test(parts[2])) {
    // Beschädigter Wert darf eine echte Änderung nicht verstecken.
    throw new MemberCryptoError("Fingerabdruck beschädigt");
  }
  return { keyId: parts[1], hex: parts[2] };
}

/**
 * true nur, wenn beide Fingerabdrücke mit demselben Master Key berechnet wurden und sich unterscheiden.
 * Erste Hinterlegung (vorher leer), Löschen (nachher leer) und Neuberechnung nach Rotation zählen nicht
 * als Änderung. Bei verschiedenen Key-IDs kann nur die App entscheiden: `ibanChanged`.
 */
export function blindIndexChanged(before: string | null | undefined, after: string | null | undefined): boolean {
  const b = parseIndex(before);
  const a = parseIndex(after);
  if (!b || !a || b.keyId !== a.keyId) return false;
  return !timingSafeEqual(Buffer.from(b.hex, "utf8"), Buffer.from(a.hex, "utf8"));
}

/**
 * Hat sich die IBAN gegenüber dem gespeicherten Fingerabdruck geändert? Rechnet die neue IBAN mit dem
 * Master Key des alten Fingerabdrucks – erkennt Änderungen also auch während einer Rotation.
 * Vorher keine IBAN → false (erste Hinterlegung); neue IBAN leer → false (Löschen ist keine
 * Mandatsänderung). Fehlt der alte Master Key (Rotationsreihenfolge verletzt), wird geworfen: Speichern
 * blockieren, bis der alte Key wieder eingetragen ist.
 */
export function ibanChanged(keyring: Keyring, beforeIndex: string | null | undefined, newIban: string): boolean {
  const b = parseIndex(beforeIndex);
  const normalized = normalizeIban(newIban);
  if (!b || normalized === "") return false;
  const recomputed = parseIndex(blindIndexWithKey(keyring, b.keyId, "iban", normalized))!;
  return !timingSafeEqual(Buffer.from(b.hex, "utf8"), Buffer.from(recomputed.hex, "utf8"));
}

/** Neuen Master Key erzeugen (Base64, 32 Byte) – für Einrichtung und Rotation. */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}
