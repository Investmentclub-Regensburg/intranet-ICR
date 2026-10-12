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
  readMemberSecretsWithMeta,
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
type SecretMeta = {
  profile_id: string;
  wrapped_dek: string;
  iban_hash: string | null;
  iban_last4: string | null;
  plain_cleared_at: string | null;
};

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

/**
 * Hat das Profil sensiblen Klartext? Jeder nicht leere Wert zählt – auch nur Leerzeichen oder Tabs –, gleiche
 * Regel wie in der Datenbank (finish_plain_clearing). So wird auch so ein Rest geleert statt das Abschließen
 * zu blockieren.
 */
function hasSensitivePlain(profile: Record<string, unknown>): boolean {
  return Object.values(PLAIN_COLUMNS).some((column) => {
    const raw = profile[column];
    return raw !== null && raw !== undefined && String(raw) !== "";
  });
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
        .select("profile_id, wrapped_dek, iban_hash, iban_last4, plain_cleared_at", { count: "exact" })
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
  /** Profile, deren Klartext geleert ist. */
  cleared: number;
  /** Endzustand (Klartext geleert, keine Klartext-Schreibvorgänge mehr) seit, sonst null. */
  finishedAt: string | null;
  /** Profile mit sensiblem Klartext, aber ohne member_secrets-Zeile (Backfill fehlt). */
  missing: number;
  /** Konten (user_id) mit sensiblen Registrierungsangaben in auth.users-Metadaten – blockiert Abschließen. */
  authMeta: string[];
  /** Offene Registrierungen nur mit Klartext – blockiert Abschließen. */
  pendingPlainOnly: string[];
  /** Offene Registrierungen mit nicht übernommenen Chiffraten (z. B. verknüpftes Altprofil) – nur Hinweis. */
  pendingUnadopted: string[];
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
async function loadActiveKeys(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("member_crypto_keys").select("key_id, retired_at");
  if (error) throw new Error("member_crypto_keys nicht lesbar");
  return new Set(
    (data ?? []).filter((k) => !(k as { retired_at: string | null }).retired_at).map((k) => String(k.key_id)),
  );
}

/**
 * Probleme einer Zeile: Key, IBAN-Fingerabdruck, letzte 4 Stellen und – solange Klartext da ist – Gleichheit
 * mit dem Klartext. Ein geleertes Profil bzw. eines im Endzustand ohne Klartext wird nicht mehr verglichen.
 */
function rowProblems(
  row: Pick<SecretMeta, "wrapped_dek" | "iban_hash" | "iban_last4" | "plain_cleared_at">,
  secret: MemberSecretValues,
  profile: PlainProfile,
  activeKeys: Set<string>,
  finishedAt: string | null,
): string[] {
  const plain = plainToSecretValues(profile);
  // Ohne Klartext und geleert (bzw. Endzustand, z. B. neue Registrierung): nichts zu vergleichen.
  const cleared = (Boolean(row.plain_cleared_at) || Boolean(finishedAt)) && !hasSensitivePlain(profile);
  const fields: string[] = cleared ? [] : differingFields(secret, plain);
  let keyId = "";
  try {
    keyId = wrappedKeyId(row.wrapped_dek);
  } catch {
    // Unlesbares Format: als Key-Abweichung melden.
  }
  if (!activeKeys.has(keyId)) fields.push("key");
  if (secret.iban) {
    if (!row.iban_hash || ibanChanged(getKeyring(), row.iban_hash, secret.iban)) fields.push("iban_hash");
    if (row.iban_last4 !== normalizeIban(secret.iban).slice(-4)) fields.push("iban_last4");
  } else if (row.iban_hash || row.iban_last4) {
    fields.push("iban_hash");
  }
  return fields;
}

async function loadLeftovers(
  admin: SupabaseClient,
): Promise<Pick<VerifyReport, "authMeta" | "pendingPlainOnly" | "pendingUnadopted">> {
  const { data, error } = await admin.rpc("member_plain_leftovers");
  if (error) throw new Error("member_plain_leftovers nicht lesbar");
  const d = (data ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    authMeta: ids(d.auth_meta),
    pendingPlainOnly: ids(d.pending_plain_only),
    pendingUnadopted: ids(d.pending_unadopted),
  };
}

/** Endzustand gesetzt (Klartext geleert, keine Klartext-Schreibvorgänge mehr)? */
export async function plainClearedAt(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.from("member_crypto_state").select("plain_cleared_at").maybeSingle();
  if (error) throw new Error("member_crypto_state nicht lesbar");
  return (data as { plain_cleared_at: string | null } | null)?.plain_cleared_at ?? null;
}

export async function verifyMemberSecrets(admin: SupabaseClient): Promise<VerifyReport> {
  const [profiles, meta, activeKeys, finishedAt, leftovers] = await Promise.all([
    loadProfiles(admin),
    loadSecretMeta(admin),
    loadActiveKeys(admin),
    plainClearedAt(admin),
    loadLeftovers(admin),
  ]);
  const withRow = profiles.filter((p) => meta.has(p.id));
  const decrypted = await readMemberSecretsMany(admin, withRow);

  const report: VerifyReport = {
    profiles: profiles.length,
    withSensitivePlain: profiles.filter(hasSensitivePlain).length,
    secretsRows: meta.size,
    cleared: 0,
    finishedAt,
    ...leftovers,
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
    if (row.plain_cleared_at && !hasSensitivePlain(profile)) report.cleared++;
    const secret = decrypted.get(profile.id);
    if (!secret || secret === "unreadable") {
      report.unreadable.push(profile.id);
      continue;
    }
    const fields = rowProblems(row, secret, profile, activeKeys, finishedAt);
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

export type ClearReport = {
  cleared: number;
  remaining: number;
  cursor: string | null;
  /** Nicht geleert: Zeile weicht ab, IBAN-Format offen, nicht lesbar oder Klartext inzwischen geändert. */
  skipped: { id: string; reason: string }[];
};

/** Klartextwerte genau so, wie die Datenbank sie liefert (für den Abgleich in clear_member_plaintext). */
function rawPlain(profile: Record<string, unknown>): Record<SecretField, string | null> {
  const out = {} as Record<SecretField, string | null>;
  for (const field of SECRET_FIELDS) {
    const raw = profile[PLAIN_COLUMNS[field]];
    out[field] = raw === null || raw === undefined ? null : String(raw);
  }
  return out;
}

/**
 * Phase 3b: Klartext in Portionen leeren. Nur Profile mit member_secrets-Zeile, deren Zeile in Ordnung ist
 * und exakt dem Klartext entspricht (gleiche Prüfung wie der Prüflauf, hier je Profil frisch). Die Datenbank
 * leert nur, wenn der Klartext noch genau dem hier gelesenen Stand entspricht. Profile ohne Zeile werden nie
 * geleert.
 */
export async function clearPlaintextBatch(
  admin: SupabaseClient,
  batchSize: number,
  cursor: string | null,
): Promise<ClearReport> {
  const [profiles, meta, activeKeys, pendingIds] = await Promise.all([
    loadProfiles(admin),
    loadSecretMeta(admin),
    loadActiveKeys(admin),
    loadPendingIds(admin),
  ]);
  const todo = profiles.filter((p) => (!cursor || p.id > cursor) && meta.has(p.id) && hasSensitivePlain(p));
  const batch = todo.slice(0, batchSize);
  const report: ClearReport = {
    cleared: 0,
    remaining: todo.length - batch.length,
    cursor: todo.length > batch.length ? batch[batch.length - 1].id : null,
    skipped: [],
  };

  for (const profile of batch) {
    if (pendingIds.has(profile.id)) {
      report.skipped.push({ id: profile.id, reason: "Registrierung noch offen" });
      continue;
    }
    if (ibanNeedsReview(plainToSecretValues(profile).iban)) {
      report.skipped.push({ id: profile.id, reason: "IBAN-Format prüfen" });
      continue;
    }
    // Zeile frisch lesen: entschlüsselte Werte, Fingerabdruck und Version aus derselben Abfrage.
    let current: Awaited<ReturnType<typeof readMemberSecretsWithMeta>>;
    try {
      current = await readMemberSecretsWithMeta(admin, profile.id);
    } catch {
      report.skipped.push({ id: profile.id, reason: "nicht lesbar" });
      continue;
    }
    if (!current) {
      report.skipped.push({ id: profile.id, reason: "keine verschlüsselte Fassung" });
      continue;
    }
    const problems = rowProblems(
      { ...current, plain_cleared_at: meta.get(profile.id)!.plain_cleared_at },
      current.values,
      profile,
      activeKeys,
      null,
    );
    if (problems.length) {
      report.skipped.push({ id: profile.id, reason: `abweichend: ${problems.join(", ")}` });
      continue;
    }
    const { error } = await admin.rpc("clear_member_plaintext", {
      p_profile_id: profile.id,
      p_expected: rawPlain(profile),
      p_expected_version: current.version,
    });
    if (error) {
      const changed = String(error.message ?? "").includes("member_plain_changed");
      if (!changed) console.error("clearPlaintextBatch:", profile.id, error.code);
      report.skipped.push({ id: profile.id, reason: changed ? "inzwischen geändert, erneut versuchen" : "Fehler" });
      continue;
    }
    report.cleared++;
  }
  return report;
}

/** Endzustand setzen (Datenbank prüft selbst, dass kein Klartext mehr übrig ist). */
export async function finishPlainClearing(admin: SupabaseClient): Promise<{ error?: string }> {
  const { error } = await admin.rpc("finish_plain_clearing");
  if (!error) return {};
  const message = String(error.message ?? "");
  const match = message.match(/finish_plain_clearing: ([^\n]*)/);
  console.error("finishPlainClearing:", error.code);
  return { error: match ? match[1] : "Abschließen fehlgeschlagen." };
}
