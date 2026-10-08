"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isUuid } from "@/lib/validation";

export type AlumniRequestDecision = "approved" | "rejected";

export type AlumniRequestRow = {
  id: string;
  userId: string;
  profileId: string | null;
  vorname: string;
  nachname: string;
  email: string;
  /** pending | approved | rejected */
  status: string;
  createdAt: string;
  handledAt: string | null;
};

/** Profil-Stammdaten zu Auth-User-IDs (maßgeblich statt der im Antrag gespeicherten Werte). */
async function loadProfilesByUserId(
  admin: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const ids = [...new Set(userIds.filter(isUuid))];
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from("profiles")
    .select('id, user_id, "Vorname", "Nachname", "E-Mail"')
    .in("user_id", ids);
  if (error) {
    console.error("loadProfilesByUserId:", error);
    return map;
  }
  for (const p of data ?? []) {
    const raw = p as Record<string, unknown>;
    map.set(String(raw.user_id ?? ""), raw);
  }
  return map;
}

/** Alle Alumni-Anträge, neueste zuerst (Admin/Vorstand). */
export async function getAlumniRequests(): Promise<AlumniRequestRow[]> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return [];

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("alumni_requests")
    .select("id, user_id, profile_id, vorname, nachname, email, status, created_at, handled_at")
    .order("created_at", { ascending: false });

  if (error) return [];

  const rows = (data ?? []) as Record<string, unknown>[];
  const profiles = await loadProfilesByUserId(
    admin,
    rows.map((r) => String(r.user_id ?? ""))
  );

  return rows.map((raw) => {
    // Angezeigt werden die Daten des Profils, zu dem das antragstellende Konto gehört.
    const p = profiles.get(String(raw.user_id ?? ""));
    return {
      id: String(raw.id ?? ""),
      userId: String(raw.user_id ?? ""),
      profileId: p ? String(p.id ?? "") || null : raw.profile_id ? String(raw.profile_id) : null,
      vorname: String((p ? p["Vorname"] : raw.vorname) ?? "").trim(),
      nachname: String((p ? p["Nachname"] : raw.nachname) ?? "").trim(),
      email: String((p ? p["E-Mail"] : raw.email) ?? "").trim(),
      status: String(raw.status ?? "pending").trim().toLowerCase(),
      createdAt: String(raw.created_at ?? ""),
      handledAt: raw.handled_at ? String(raw.handled_at) : null,
    };
  });
}

/**
 * Antrag entscheiden. Nur Vorstand (board) – konsistent mit updateMemberRole.
 * Freigabe setzt profiles.Rolle = alumni (Status bleibt active).
 *
 * Maßgeblich ist immer das Profil des antragstellenden Kontos (user_id), nicht die
 * im Antrag gespeicherten Felder: Vor der Entscheidung werden profile_id, Name und
 * E-Mail des Antrags aus dem Profil übernommen, damit Rollenwechsel und
 * Benachrichtigungsmail (DB-Trigger) das richtige Profil bzw. die richtige Adresse treffen.
 */
export async function decideAlumniRequest(
  requestId: string,
  decision: AlumniRequestDecision
): Promise<{ error: string }> {
  const auth = await requireRole(["board"], "Nur Vorstand (board) darf Alumni-Anträge entscheiden.");
  if (!auth.ok) return { error: auth.error };
  const user = auth.user;

  if (!isUuid(requestId)) return { error: "Antrag nicht gefunden." };
  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Ungültige Entscheidung." };
  }

  const admin = createServiceClient();

  const { data: request, error: loadError } = await admin
    .from("alumni_requests")
    .select("id, user_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (loadError) {
    console.error("decideAlumniRequest (laden):", loadError);
    return { error: "Antrag konnte nicht geladen werden." };
  }
  if (!request) return { error: "Antrag nicht gefunden." };

  const raw = request as Record<string, unknown>;
  if (String(raw.status ?? "").toLowerCase() !== "pending") {
    return { error: "Dieser Antrag wurde bereits entschieden." };
  }

  const userId = String(raw.user_id ?? "");
  const profile = (await loadProfilesByUserId(admin, [userId])).get(userId);
  const profileId = profile ? String(profile.id ?? "") : "";
  if (!profile || !profileId) {
    return { error: "Zum Antrag gehört kein Profil. Bitte manuell prüfen." };
  }

  // 1) Antrag auf die Profildaten festziehen (noch ohne Statuswechsel, löst keine Mail aus).
  const { error: syncError } = await admin
    .from("alumni_requests")
    .update({
      profile_id: profileId,
      vorname: String(profile["Vorname"] ?? "").trim(),
      nachname: String(profile["Nachname"] ?? "").trim(),
      email: String(profile["E-Mail"] ?? "").trim(),
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (syncError) {
    console.error("decideAlumniRequest (Antrag abgleichen):", syncError);
    return { error: "Entscheidung konnte nicht gespeichert werden." };
  }

  // 2) Rolle am Profil des antragstellenden Kontos setzen.
  if (decision === "approved") {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ Rolle: "alumni", Status: "active", Datum_Kündigung: null })
      .eq("id", profileId);
    if (roleError) {
      console.error("decideAlumniRequest (Rolle):", roleError);
      return { error: "Rolle konnte nicht gesetzt werden." };
    }
  }

  // 3) Der DB-Trigger schließt offene Anträge bei Rollenwechsel bereits – hier zusätzlich
  //    explizit mit Entscheidung und Bearbeiter (idempotent).
  const { error: updateError } = await admin
    .from("alumni_requests")
    .update({
      status: decision,
      handled_at: new Date().toISOString(),
      handled_by: user.id,
    })
    .eq("id", requestId);

  if (updateError) {
    console.error("decideAlumniRequest (Antrag):", updateError);
    return { error: "Entscheidung konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/alumni-requests");
  revalidatePath("/admin/members");
  revalidatePath("/profile");
  return { error: "" };
}
