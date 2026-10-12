import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SECRET_FIELDS,
  ibanChanged,
  normalizeIban,
  wrappedKeyId,
  type SecretField,
} from "@/lib/member-crypto";
import { getKeyring } from "@/lib/member-crypto-server";
import {
  PLAIN_COLUMNS,
  plainToSecretValues,
  readMemberSecrets,
  readMemberSecretsMany,
  saveMemberSecrets,
  type MemberSecretValues,
} from "@/lib/member-secrets-server";

/**
 * Phase 3 (docs/verschluesselung.md): Bestandsdaten verschlüsseln und prüfen. Läuft nur in der App (der
 * Master Key verlässt Vercel nie). Ergebnisse enthalten nur Profil-IDs und Feldnamen, nie Werte.
 */

const PROFILE_COLUMNS = ["id", ...Object.values(PLAIN_COLUMNS).map((c) => `"${c}"`)].join(", ");
/** Seitengröße beim Laden (unter dem PostgREST-Limit max_rows = 1000). */
const PAGE = 500;

type PlainProfile = Record<string, unknown> & { id: string };
type SecretMeta = { profile_id: string; wrapped_dek: string; iban_hash: string | null; iban_last4: string | null };

/** Vergleichsform: leer = null, IBAN normalisiert (wie beim Verschlüsseln), sonst getrimmt. */
function comparable(field: SecretField, value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return field === "iban" ? normalizeIban(text) : text;
}

/** Felder, in denen verschlüsselte Fassung und Klartext abweichen. */
export function differingFields(secret: MemberSecretValues, plain: MemberSecretValues): SecretField[] {
  return SECRET_FIELDS.filter((f) => comparable(f, secret[f]) !== comparable(f, plain[f]));
}

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/**
 * Klartext-IBAN, die beim Normalisieren mehr verliert als Leerzeichen und Kleinschreibung (z. B. Freitext,
 * Bindestriche, Zusätze) oder keine IBAN-Form hat. Solche Profile verschlüsselt der Backfill nicht; der
 * Vorstand korrigiert sie vorher (Verwaltung → Mitglieder → Stift).
 */
export function ibanNeedsReview(plainIban: string | null): boolean {
  const text = (plainIban ?? "").trim();
  if (!text) return false;
  const compact = text.replace(/\s/g, "").toUpperCase();
  return compact !== normalizeIban(text) || !IBAN_SHAPE.test(compact);
}

function hasSensitivePlain(profile: PlainProfile): boolean {
  return Object.values(plainToSecretValues(profile)).some((v) => v !== null);
}

/** Alle Zeilen einer Abfrage seitenweise laden; bricht ab, wenn die Zahl nicht zur Gesamtzahl passt. */
async function loadAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown; count: number | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`${label} nicht lesbar`);
    if (total === null) total = count;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  if (total === null || rows.length !== total) throw new Error(`${label}: unvollständig geladen`);
  return rows;
}

async function loadProfiles(admin: SupabaseClient): Promise<PlainProfile[]> {
  const rows = await loadAll<PlainProfile>(
    (from, to) => admin.from("profiles").select(PROFILE_COLUMNS, { count: "exact" }).order("id").range(from, to),
    "Profile",
  );
  return rows.map((p) => ({ ...p, id: String(p.id) }));
}

async function loadSecretMeta(admin: SupabaseClient): Promise<Map<string, SecretMeta>> {
  const rows = await loadAll<SecretMeta>(
    (from, to) =>
      admin
        .from("member_secrets")
        .select("profile_id, wrapped_dek, iban_hash, iban_last4", { count: "exact" })
        .order("profile_id")
        .range(from, to),
    "member_secrets",
  );
  return new Map(rows.map((r) => [String(r.profile_id), r]));
}

/** Profile mit offener Registrierung (Daten werden gerade übernommen – nicht anfassen). */
async function loadPendingIds(admin: SupabaseClient): Promise<Set<string>> {
  const rows = await loadAll<{ user_id: string }>(
    (from, to) =>
      admin.from("pending_registrations").select("user_id", { count: "exact" }).order("user_id").range(from, to),
    "pending_registrations",
  );
  return new Set(rows.map((r) => String(r.user_id)));
}

export type VerifyReport = {
  profiles: number;
  /** Profile mit mindestens einem sensiblen Klartextwert. */
  withSensitivePlain: number;
  secretsRows: number;
  /** Profile mit sensiblem Klartext, aber ohne member_secrets-Zeile (Backfill fehlt). */
  missing: number;
  /** Klartext-IBAN, die vor dem Verschlüsseln geprüft werden muss (ibanNeedsReview). */
  ibanReview: string[];
  unreadable: string[];
  /** Abweichungen: Profil-ID und Feldnamen (auch Fingerabdruck/letzte 4 Stellen/Key). */
  mismatches: { id: string; fields: string[] }[];
};

/**
 * Prüflauf (ändert nichts): alle Zeilen entschlüsseln und feldweise mit dem Klartext vergleichen, dazu
 * IBAN-Fingerabdruck, letzte 4 Stellen und registrierten Key prüfen. Vor dem Leeren des Klartexts muss
 * gelten: missing = 0 und alle Listen leer. Gilt nur für den Zeitpunkt der Prüfung – das Leeren prüft
 * jedes Profil selbst noch einmal.
 */
export async function verifyMemberSecrets(admin: SupabaseClient): Promise<VerifyReport> {
  const [profiles, meta] = await Promise.all([loadProfiles(admin), loadSecretMeta(admin)]);
  const { data: keys, error: keyError } = await admin.from("member_crypto_keys").select("key_id, retired_at");
  if (keyError) throw new Error("member_crypto_keys nicht lesbar");
  const activeKeys = new Set(
    (keys ?? []).filter((k) => !(k as { retired_at: string | null }).retired_at).map((k) => String(k.key_id)),
  );

  const withRow = profiles.filter((p) => meta.has(p.id));
  const decrypted = await readMemberSecretsMany(admin, withRow);
  const keyring = withRow.length ? getKeyring() : null;

  const report: VerifyReport = {
    profiles: profiles.length,
    withSensitivePlain: profiles.filter(hasSensitivePlain).length,
    secretsRows: meta.size,
    missing: 0,
    ibanReview: [],
    unreadable: [],
    mismatches: [],
  };
  for (const profile of profiles) {
    const plain = plainToSecretValues(profile);
    const row = meta.get(profile.id);
    if (!row) {
      if (hasSensitivePlain(profile)) report.missing++;
      if (ibanNeedsReview(plain.iban)) report.ibanReview.push(profile.id);
      continue;
    }
    const secret = decrypted.get(profile.id);
    if (!secret || secret === "unreadable") {
      report.unreadable.push(profile.id);
      continue;
    }
    const fields: string[] = differingFields(secret, plain);
    let keyId = "";
    try {
      keyId = wrappedKeyId(row.wrapped_dek);
    } catch {
      // Unlesbares Format: als Key-Abweichung melden.
    }
    if (!activeKeys.has(keyId)) fields.push("key");
    if (secret.iban) {
      if (!row.iban_hash || ibanChanged(keyring!, row.iban_hash, secret.iban)) fields.push("iban_hash");
      if (row.iban_last4 !== normalizeIban(secret.iban).slice(-4)) fields.push("iban_last4");
    } else if (row.iban_hash || row.iban_last4) {
      fields.push("iban_hash");
    }
    if (ibanNeedsReview(plain.iban)) report.ibanReview.push(profile.id);
    if (fields.length) report.mismatches.push({ id: profile.id, fields });
  }
  return report;
}

export type BackfillReport = {
  created: number;
  /** Noch ohne Zeile nach dieser Portion (ohne die übersprungenen Profile). */
  remaining: number;
  /** Letzte bearbeitete Profil-ID: nächste Portion beginnt danach. null = fertig. */
  cursor: string | null;
  /** Nicht verschlüsselt: IBAN muss erst geprüft werden. */
  ibanReview: string[];
  /** Offene Registrierung: übersprungen, später erneut. */
  pending: string[];
  /** Nach dem Anlegen nicht identisch → Zeile wieder entfernt, Klartext unverändert. */
  rolledBack: { id: string; fields: SecretField[] }[];
  /** Fehler, ohne dass eine Zeile entstanden ist. */
  failed: string[];
  /** Zeile entstanden, Prüfung oder Rücknahme aber fehlgeschlagen – der Prüflauf muss sie bewerten. */
  unverified: string[];
};

/**
 * Backfill in Portionen ab `cursor` (Profil-ID, sortiert): Für Profile mit sensiblem Klartext und ohne
 * member_secrets-Zeile die Zeile aus dem Klartext anlegen (saveMemberSecrets ohne Änderungen – kein
 * Klartext-Schreiben, kein IBAN-Event), zurücklesen, entschlüsseln und mit dem frisch gelesenen Klartext
 * vergleichen. Bei Abweichung wird die neue Zeile wieder gelöscht (Klartext bleibt maßgeblich).
 */
export async function backfillMemberSecrets(
  admin: SupabaseClient,
  batchSize: number,
  cursor: string | null,
): Promise<BackfillReport> {
  const [profiles, meta, pendingIds] = await Promise.all([
    loadProfiles(admin),
    loadSecretMeta(admin),
    loadPendingIds(admin),
  ]);
  const todo = profiles.filter((p) => (!cursor || p.id > cursor) && !meta.has(p.id) && hasSensitivePlain(p));
  const batch = todo.slice(0, batchSize);
  const report: BackfillReport = {
    created: 0,
    remaining: todo.length - batch.length,
    cursor: todo.length > batch.length ? batch[batch.length - 1].id : null,
    ibanReview: [],
    pending: [],
    rolledBack: [],
    failed: [],
    unverified: [],
  };

  for (const profile of batch) {
    if (pendingIds.has(profile.id)) {
      report.pending.push(profile.id);
      continue;
    }
    if (ibanNeedsReview(plainToSecretValues(profile).iban)) {
      report.ibanReview.push(profile.id);
      continue;
    }
    let written = false;
    try {
      await saveMemberSecrets(admin, profile.id, {});
      written = true;
      const secret = await readMemberSecrets(admin, profile.id);
      const { data: fresh, error } = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", profile.id).maybeSingle();
      if (error || !fresh || !secret) throw new Error("Zurücklesen fehlgeschlagen");
      const fields = differingFields(secret, plainToSecretValues(fresh as unknown as Record<string, unknown>));
      if (fields.length) {
        // Nur die gerade angelegte Zeile (Version 1) entfernen – nie eine inzwischen geänderte.
        const { data: removed, error: removeError } = await admin
          .from("member_secrets")
          .delete()
          .eq("profile_id", profile.id)
          .eq("version", 1)
          .select("profile_id");
        if (removeError) console.error("backfillMemberSecrets: Rücknahme", profile.id, removeError.code);
        if (removed?.length) report.rolledBack.push({ id: profile.id, fields });
        else report.unverified.push(profile.id);
        continue;
      }
      report.created++;
    } catch (err) {
      console.error("backfillMemberSecrets:", profile.id, err instanceof Error ? err.message : "unbekannt");
      (written ? report.unverified : report.failed).push(profile.id);
    }
  }
  return report;
}
