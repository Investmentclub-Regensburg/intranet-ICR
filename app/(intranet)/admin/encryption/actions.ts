"use server";

import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { assertKeyRegistered } from "@/lib/member-secrets-server";
import { isUuid } from "@/lib/validation";
import {
  backfillMemberSecrets,
  clearPlaintextBatch,
  finishPlainClearing,
  verifyMemberSecrets,
  type BackfillReport,
  type ClearReport,
  type VerifyReport,
} from "@/lib/member-secrets-backfill";

/** Profile je Aufruf (Laufzeitgrenze der Serverfunktion); die Seite ruft so lange auf, bis nichts übrig ist. */
const BATCH_SIZE = 25;

/** Prüflauf (ändert nichts). Nur Vorstand. */
export async function runEncryptionVerify(): Promise<{ report?: VerifyReport; error?: string }> {
  const auth = await requireRole(["board"], "Nur der Vorstand.");
  if (!auth.ok) return { error: auth.error };
  try {
    return { report: await verifyMemberSecrets(createServiceClient()) };
  } catch (err) {
    console.error("runEncryptionVerify:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Prüfung fehlgeschlagen. Ist der Master Key konfiguriert?" };
  }
}

/** Eine Portion Backfill. Nur Vorstand; bricht ab, wenn der Master Key nicht registriert ist. */
export async function runEncryptionBackfillBatch(
  cursor: string | null
): Promise<{ report?: BackfillReport; error?: string }> {
  const auth = await requireRole(["board"], "Nur der Vorstand.");
  if (!auth.ok) return { error: auth.error };
  if (cursor !== null && !isUuid(cursor)) return { error: "Ungültiger Fortschritt." };
  const admin = createServiceClient();
  try {
    await assertKeyRegistered(admin);
  } catch (err) {
    console.error("runEncryptionBackfillBatch:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Master Key fehlt oder ist nicht registriert – nichts verschlüsselt." };
  }
  try {
    return { report: await backfillMemberSecrets(admin, BATCH_SIZE, cursor) };
  } catch (err) {
    console.error("runEncryptionBackfillBatch:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Backfill fehlgeschlagen." };
  }
}

/**
 * Eine Portion „Klartext leeren“ (Phase 3b). Nur Vorstand. Jedes Profil wird vor dem Leeren erneut geprüft;
 * die Datenbank leert nur bei unverändertem Klartext und vorhandener verschlüsselter Fassung.
 */
export async function runPlaintextClearBatch(
  cursor: string | null
): Promise<{ report?: ClearReport; error?: string }> {
  const auth = await requireRole(["board"], "Nur der Vorstand.");
  if (!auth.ok) return { error: auth.error };
  if (cursor !== null && !isUuid(cursor)) return { error: "Ungültiger Fortschritt." };
  const admin = createServiceClient();
  try {
    await assertKeyRegistered(admin);
    return { report: await clearPlaintextBatch(admin, BATCH_SIZE, cursor) };
  } catch (err) {
    console.error("runPlaintextClearBatch:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Leeren fehlgeschlagen – nichts weiter geändert." };
  }
}

/** Endzustand setzen: ab dann kein Klartext mehr (Datenbank prüft, dass keiner übrig ist). Nur Vorstand. */
export async function runFinishPlainClearing(): Promise<{ error?: string }> {
  const auth = await requireRole(["board"], "Nur der Vorstand.");
  if (!auth.ok) return { error: auth.error };
  try {
    return await finishPlainClearing(createServiceClient());
  } catch (err) {
    console.error("runFinishPlainClearing:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Abschließen fehlgeschlagen." };
  }
}
