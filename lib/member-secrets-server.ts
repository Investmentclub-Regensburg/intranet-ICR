import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MemberCryptoError,
  SECRET_FIELDS,
  createDataKey,
  decryptField,
  encryptField,
  ibanChanged,
  ibanIndex,
  keyCheckValue,
  normalizeIban,
  withDataKey,
  type SecretField,
} from "@/lib/member-crypto";
import { getKeyring } from "@/lib/member-crypto-server";

/**
 * Lesen und Schreiben der verschlüsselten Mitgliedsdaten (Tabelle member_secrets, nur Service Role).
 * Regeln: docs/verschluesselung.md. Alle Funktionen erwarten den Service-Role-Client und einen bereits
 * geprüften Aufrufer.
 */

export type MemberSecretValues = Record<SecretField, string | null>;

type SecretsRow = {
  profile_id: string;
  wrapped_dek: string;
  version: number;
  iban_hash: string | null;
  iban_last4: string | null;
} & Record<SecretField, string | null>;

const ROW_COLUMNS = `profile_id, wrapped_dek, version, iban_hash, iban_last4, ${SECRET_FIELDS.join(", ")}`;

/**
 * Klartextspalten in profiles je verschlüsseltem Feld. Seit dem Abschluss (21.10.2026) leer und gesperrt;
 * nur noch das Skript scripts/verschluesselung.mjs (Prüflauf, Notfall-Weg) liest sie.
 */
export const PLAIN_COLUMNS: Record<SecretField, string> = {
  iban: "IBAN",
  bic: "BIC",
  geburtsdatum: "Geburtsdatum",
  strasse: "Straße",
  hausnummer: "Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  handynummer: "Handynummer",
};

let verifiedKey: { marker: string; until: number } | null = null;
const KEY_CHECK_TTL_MS = 5 * 60 * 1000;

/**
 * Pflichtprüfung vor dem Verschlüsseln: Der aktuelle Master Key muss mit Key-ID und Prüfwert in
 * member_crypto_keys registriert sein. Sonst wird nicht verschlüsselt (fail closed) – auch wenn die
 * Datenbank nicht erreichbar ist.
 */
export async function assertKeyRegistered(admin: SupabaseClient): Promise<void> {
  const keyring = getKeyring();
  const marker = `${keyring.currentId}:${keyCheckValue(keyring)}`;
  if (verifiedKey && verifiedKey.marker === marker && verifiedKey.until > Date.now()) return;
  const { data, error } = await admin
    .from("member_crypto_keys")
    .select("kcv, retired_at")
    .eq("key_id", keyring.currentId)
    .maybeSingle();
  if (error) throw new MemberCryptoError("Registrierte Master Keys nicht lesbar");
  const row = data as { kcv?: string; retired_at?: string | null } | null;
  if (!row || row.retired_at) {
    throw new MemberCryptoError(`Master Key ${keyring.currentId} ist nicht registriert`);
  }
  if (row.kcv !== keyCheckValue(keyring)) {
    throw new MemberCryptoError(`Master Key ${keyring.currentId} passt nicht zum registrierten Prüfwert`);
  }
  // Nach Ablauf erneut prüfen (z. B. Key in der Datenbank zurückgezogen).
  verifiedKey = { marker, until: Date.now() + KEY_CHECK_TTL_MS };
}

async function loadRow(admin: SupabaseClient, profileId: string): Promise<SecretsRow | null> {
  const { data, error } = await admin
    .from("member_secrets")
    .select(ROW_COLUMNS)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new MemberCryptoError("Verschlüsselte Daten nicht lesbar");
  return (data as SecretsRow | null) ?? null;
}

function decryptRow(row: SecretsRow): MemberSecretValues {
  return withDataKey(getKeyring(), row.profile_id, row.wrapped_dek, (dek) => {
    const values = {} as MemberSecretValues;
    for (const field of SECRET_FIELDS) values[field] = decryptField(dek, row.profile_id, field, row[field]);
    return values;
  });
}

/**
 * Entschlüsselte Werte eines Mitglieds. Ohne member_secrets-Zeile: null – das Mitglied hat keine sensiblen
 * Angaben (der Aufrufer nimmt emptySecretValues()). Wirft, wenn die Zeile nicht entschlüsselt werden kann
 * (falscher Key, Manipulation).
 */
export async function readMemberSecrets(
  admin: SupabaseClient,
  profileId: string,
): Promise<MemberSecretValues | null> {
  const row = await loadRow(admin, profileId);
  return row ? decryptRow(row) : null;
}

/**
 * Wie readMemberSecrets, zusätzlich Version und Metadaten der Zeile aus DERSELBEN Abfrage (für Schritte, die
 * sich auf genau den entschlüsselten Stand beziehen, z. B. Klartext leeren). null ohne Zeile.
 */
export async function readMemberSecretsWithMeta(
  admin: SupabaseClient,
  profileId: string,
): Promise<{
  values: MemberSecretValues;
  version: number;
  wrapped_dek: string;
  iban_hash: string | null;
  iban_last4: string | null;
} | null> {
  const row = await loadRow(admin, profileId);
  if (!row) return null;
  return {
    values: decryptRow(row),
    version: row.version,
    wrapped_dek: row.wrapped_dek,
    iban_hash: row.iban_hash,
    iban_last4: row.iban_last4,
  };
}

/** Ergebnis je Mitglied beim Lesen mehrerer Mitglieder: Werte oder "unreadable" (Zeile nicht entschlüsselbar). */
export type MemberSecretsResult = MemberSecretValues | "unreadable";

const BULK_CHUNK = 100;

/**
 * Entschlüsselte Werte mehrerer Mitglieder (Admin-Tabelle, Exporte). Ohne member_secrets-Zeile sind alle
 * Felder leer. Eine nicht entschlüsselbare Zeile ergibt "unreadable". Wirft, wenn member_secrets nicht
 * lesbar ist.
 */
export async function readMemberSecretsMany(
  admin: SupabaseClient,
  profiles: ReadonlyArray<{ id: string }>,
): Promise<Map<string, MemberSecretsResult>> {
  const ids = [...new Set(profiles.map((p) => p.id).filter(Boolean))];
  const rows = new Map<string, SecretsRow>();
  for (let i = 0; i < ids.length; i += BULK_CHUNK) {
    const { data, error } = await admin
      .from("member_secrets")
      .select(ROW_COLUMNS)
      .in("profile_id", ids.slice(i, i + BULK_CHUNK));
    if (error) throw new MemberCryptoError("Verschlüsselte Daten nicht lesbar");
    for (const row of (data ?? []) as unknown as SecretsRow[]) rows.set(row.profile_id, row);
  }

  // Fehlender Master Key betrifft alle Zeilen: werfen statt jede Zeile als "unreadable" zu melden.
  if (rows.size > 0) getKeyring();
  const result = new Map<string, MemberSecretsResult>();
  for (const profile of profiles) {
    const row = rows.get(profile.id);
    if (!row) {
      result.set(profile.id, emptySecretValues());
      continue;
    }
    try {
      result.set(profile.id, decryptRow(row));
    } catch {
      result.set(profile.id, "unreadable");
    }
  }
  return result;
}

/** Alle Felder leer: Mitglied ohne member_secrets-Zeile. */
export function emptySecretValues(): MemberSecretValues {
  const values = {} as MemberSecretValues;
  for (const field of SECRET_FIELDS) values[field] = null;
  return values;
}

/** Klartextspalten aus profiles in das Format der verschlüsselten Felder bringen (nur Skript, PLAIN_COLUMNS). */
export function plainToSecretValues(profile: Record<string, unknown> | null | undefined): MemberSecretValues {
  const values = {} as MemberSecretValues;
  for (const field of SECRET_FIELDS) {
    const raw = profile?.[PLAIN_COLUMNS[field]];
    const text = raw === null || raw === undefined ? "" : String(raw).trim();
    values[field] = text === "" ? null : text;
  }
  return values;
}

export class MemberSecretsConflictError extends Error {
  constructor() {
    super("Die Daten wurden gleichzeitig an anderer Stelle geändert.");
    this.name = "MemberSecretsConflictError";
  }
}

/**
 * Felder eines Mitglieds verschlüsselt speichern. `changes` enthält nur die geänderten Felder; alle übrigen
 * bleiben erhalten. Legt die Zeile bei Bedarf an (dann sind die übrigen Felder leer).
 * Erkennt IBAN-Änderungen (ibanChanged) und meldet sie über die Datenbank; die erste Hinterlegung zählt nicht.
 * `correctedBy`: Profil-ID des Vorstandsmitglieds bei einer Korrektur im Admin-Bereich (wird protokolliert).
 */
export async function saveMemberSecrets(
  admin: SupabaseClient,
  profileId: string,
  changes: Partial<MemberSecretValues>,
  options: { correctedBy?: string } = {},
): Promise<void> {
  await assertKeyRegistered(admin);
  const keyring = getKeyring();

  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await loadRow(admin, profileId);

    const current = row ? decryptRow(row) : emptySecretValues();
    const next: MemberSecretValues = { ...current };
    for (const field of SECRET_FIELDS) {
      if (field in changes) {
        const value = changes[field];
        next[field] = value === undefined || value === null || value.trim() === "" ? null : value.trim();
      }
    }
    if (next.iban) next.iban = normalizeIban(next.iban);

    const newIndex = next.iban ? ibanIndex(keyring, next.iban) : null;
    const changed = row && next.iban ? ibanChanged(keyring, row.iban_hash, next.iban) : false;

    const created = row ? null : createDataKey(keyring, profileId);
    const wrapped = row ? row.wrapped_dek : created!.wrapped;
    const encrypt = (dek: Buffer) => {
      const out = {} as Record<SecretField, string | null>;
      for (const field of SECRET_FIELDS) out[field] = encryptField(dek, profileId, field, next[field]);
      return out;
    };
    let secrets: Record<SecretField, string | null>;
    if (created) {
      try {
        secrets = encrypt(created.dek);
      } finally {
        created.dek.fill(0);
      }
    } else {
      secrets = withDataKey(keyring, profileId, wrapped, encrypt);
    }

    // Nur die Namen der geänderten Felder (für das Korrekturprotokoll), keine Werte.
    const changedFields: Record<string, null> = {};
    for (const field of SECRET_FIELDS) {
      if (field in changes) changedFields[field] = null;
    }

    const { error } = await admin.rpc("save_member_secrets", {
      p_profile_id: profileId,
      p_expected_version: row ? row.version : null,
      p_wrapped_dek: wrapped,
      p_secrets: secrets,
      p_iban_hash: newIndex,
      p_iban_last4: next.iban ? next.iban.slice(-4) : null,
      p_iban_changed: changed,
      p_plain: changedFields,
      p_corrected_by: options.correctedBy ?? null,
    });
    if (!error) return;
    if (!String(error.message ?? "").includes("member_secrets_conflict")) {
      console.error("saveMemberSecrets:", error.code);
      throw new MemberCryptoError("Verschlüsselte Daten konnten nicht gespeichert werden");
    }
  }
  throw new MemberSecretsConflictError();
}

/**
 * Registrierung: Chiffrate für pending_registrations (Mitglieds-ID = neue user_id = künftige profile_id).
 * null, wenn der Master Key nicht verfügbar oder nicht registriert ist – die Registrierung wird dann
 * abgewiesen (die Datenbank nimmt sensible Angaben nur verschlüsselt an).
 */
export async function buildRegistrationSecrets(
  admin: SupabaseClient,
  userId: string,
  values: Partial<MemberSecretValues>,
): Promise<Record<string, unknown> | null> {
  try {
    await assertKeyRegistered(admin);
    const keyring = getKeyring();
    const { dek, wrapped } = createDataKey(keyring, userId);
    try {
      const iban = values.iban ? normalizeIban(values.iban) : null;
      const fields: Record<string, string | null> = {};
      for (const field of SECRET_FIELDS) {
        const raw = field === "iban" ? iban : values[field];
        fields[field] = encryptField(dek, userId, field, raw ? String(raw).trim() : null);
      }
      return {
        wrapped_dek: wrapped,
        fields,
        iban_hash: iban ? ibanIndex(keyring, iban) : null,
        iban_last4: iban ? iban.slice(-4) : null,
      };
    } finally {
      dek.fill(0);
    }
  } catch (err) {
    console.error("buildRegistrationSecrets:", err instanceof Error ? err.message : "unbekannt");
    return null;
  }
}
