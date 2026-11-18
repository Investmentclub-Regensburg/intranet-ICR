import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Name eines Mitglieds ändern (Klartext in profiles."Vorname"/"Nachname", Entscheidung Hannes 11). Nur mit
 * Service Role und nach geprüfter Eingabe (lib/member-rules.ts über lib/member-forms.ts).
 *
 * Sperre: profiles hat keine Version/updated_at. Geschrieben wird deshalb nur, wenn Vor- und Nachname in der
 * Datenbank noch genau dem Stand entsprechen, den der Aufrufer gelesen hat (Compare-and-set in derselben
 * update-Anweisung); sonst „konflikt“, nichts geändert.
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
  const patch: Record<string, string> = {};
  if (neu.vorname !== undefined) patch.Vorname = neu.vorname;
  if (neu.nachname !== undefined) patch.Nachname = neu.nachname;
  if (Object.keys(patch).length === 0) return "ok";

  let query = admin.from("profiles").update(patch).eq("id", profileId);
  query = vorher.vorname === null ? query.is("Vorname", null) : query.eq("Vorname", vorher.vorname);
  query = vorher.nachname === null ? query.is("Nachname", null) : query.eq("Nachname", vorher.nachname);
  const { data, error } = await query.select("id");
  if (error) {
    console.error("speichereNamen:", error.code);
    return "fehler";
  }
  if (!data || data.length === 0) return "konflikt";

  // Protokoll der Korrektur durch den Vorstand: nur Feldnamen.
  if (options.correctedBy) {
    const fields = [neu.nachname !== undefined ? "nachname" : null, neu.vorname !== undefined ? "vorname" : null].filter(
      (f): f is string => f !== null,
    );
    const { error: logError } = await admin
      .from("member_data_corrections")
      .insert({ profile_id: profileId, corrected_by: options.correctedBy, fields });
    if (logError) console.error("speichereNamen: Protokoll", logError.code);
  }

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
