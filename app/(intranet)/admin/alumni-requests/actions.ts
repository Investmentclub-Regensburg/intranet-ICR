"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getCachedAuth } from "@/utils/supabase/cached-auth";

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

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Alle Alumni-Anträge, neueste zuerst (Admin/Vorstand). */
export async function getAlumniRequests(): Promise<AlumniRequestRow[]> {
  const { user, profile } = await getCachedAuth();
  if (!user) return [];
  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  if (role !== "admin" && role !== "board") return [];

  const { data, error } = await adminClient()
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
  const { user, profile } = await getCachedAuth();
  if (!user) return { error: "Nicht eingeloggt." };
  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();
  if (role !== "board") return { error: "Nur Vorstand (board) darf Alumni-Anträge entscheiden." };

  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Ungültige Entscheidung." };
  }

  const admin = adminClient();

  const { data: request, error: loadError } = await admin
    .from("alumni_requests")
    .select("id, user_id, profile_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (loadError) return { error: loadError.message };
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
    if (roleError) return { error: `Rolle konnte nicht gesetzt werden: ${roleError.message}` };
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

  if (updateError) return { error: updateError.message };

  revalidatePath("/admin/alumni-requests");
  revalidatePath("/admin/members");
  revalidatePath("/profile");
  return { error: "" };
}
