import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Name eines Mitglieds ändern (Klartext in profiles."Vorname"/"Nachname", Entscheidung Hannes 11). Nur mit
 * Service Role und nach geprüfter Eingabe (lib/member-rules.ts über lib/member-forms.ts).
 *
 * Datenbankfunktion save_member_name (Migration 20261118130000): Compare-and-set gegen den gelesenen Namen
 * (profiles hat keine Version) und – bei einer Korrektur durch den Vorstand – der Protokolleintrag in
 * member_data_corrections (nur Feldnamen) in EINER Transaktion. false = inzwischen geändert, nichts geschrieben.
 *
 * Gespiegelt: Die Namen stehen seit der Registrierung auch in den Konto-Metadaten (auth user_metadata). Das
 * Intranet liest sie dort nicht, sie werden aber mitgezogen, damit keine zwei Namen im Umlauf sind (Fehler
 * dort blockieren nicht). Kopien in Anträgen (alumni_requests, bvh_login_requests) sind Momentaufnahmen und
 * bleiben.
 */
export type NamenStand = { vorname: string | null; nachname: string | null };

export async function speichereNamen(
  admin: SupabaseClient,
  profileId: string,
  userId: string | null,
  vorher: NamenStand,
  neu: { vorname?: string; nachname?: string },
  options: { correctedBy?: string } = {},
): Promise<"ok" | "konflikt" | "fehler"> {
  if (neu.vorname === undefined && neu.nachname === undefined) return "ok";

  const { data, error } = await admin.rpc("save_member_name", {
    p_profile_id: profileId,
    p_expected_vorname: vorher.vorname,
    p_expected_nachname: vorher.nachname,
    p_vorname: neu.vorname ?? vorher.vorname,
    p_nachname: neu.nachname ?? vorher.nachname,
    p_corrected_by: options.correctedBy ?? null,
  });
  if (error) {
    console.error("speichereNamen:", error.code);
    return "fehler";
  }
  if (data !== true) return "konflikt";

  if (userId) {
    const { data: konto, error: kontoError } = await admin.auth.admin.getUserById(userId);
    if (!kontoError && konto?.user) {
      const meta = { ...(konto.user.user_metadata ?? {}) } as Record<string, unknown>;
      if (neu.vorname !== undefined) meta.Vorname = neu.vorname;
      if (neu.nachname !== undefined) meta.Nachname = neu.nachname;
      const { error: metaError } = await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
      if (metaError) console.error("speichereNamen: Konto", metaError.code ?? metaError.status);
    }
  }
  return "ok";
}
