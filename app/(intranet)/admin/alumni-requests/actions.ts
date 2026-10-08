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

/** Alle Alumni-Anträge, neueste zuerst (Admin/Vorstand). */
export async function getAlumniRequests(): Promise<AlumniRequestRow[]> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return [];

  const { data, error } = await createServiceClient()
    .from("alumni_requests")
    .select("id, user_id, profile_id, vorname, nachname, email, status, created_at, handled_at")
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((r) => {
    const raw = r as Record<string, unknown>;
    return {
      id: String(raw.id ?? ""),
      userId: String(raw.user_id ?? ""),
      profileId: raw.profile_id ? String(raw.profile_id) : null,
      vorname: String(raw.vorname ?? "").trim(),
      nachname: String(raw.nachname ?? "").trim(),
      email: String(raw.email ?? "").trim(),
      status: String(raw.status ?? "pending").trim().toLowerCase(),
      createdAt: String(raw.created_at ?? ""),
      handledAt: raw.handled_at ? String(raw.handled_at) : null,
    };
  });
}

/**
 * Antrag entscheiden. Nur Vorstand (board) – konsistent mit updateMemberRole.
 * Freigabe setzt profiles.Rolle = alumni (Status bleibt active).
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
    .select("id, user_id, profile_id, status")
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

  if (decision === "approved") {
    const profileId = raw.profile_id ? String(raw.profile_id) : "";
    const userId = String(raw.user_id ?? "");

    let update = admin
      .from("profiles")
      .update({ Rolle: "alumni", Status: "active", Datum_Kündigung: null });
    update = profileId ? update.eq("id", profileId) : update.eq("user_id", userId);

    const { error: roleError } = await update;
    if (roleError) {
      console.error("decideAlumniRequest (Rolle):", roleError);
      return { error: "Rolle konnte nicht gesetzt werden." };
    }
  }

  // Der DB-Trigger schließt offene Anträge bei Rollenwechsel bereits – hier zusätzlich
  // explizit mit Entscheidung und Bearbeiter (idempotent).
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
