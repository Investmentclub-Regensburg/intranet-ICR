"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isCancelledProfile } from "@/lib/profile-status";

export type ProfileActionState = {
  success: boolean;
  error: string;
};

export async function updateProfile(
  _prev: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const user = auth.user;

  const strasse = (formData.get("strasse") as string | null)?.trim() ?? "";
  const hausnummer = (formData.get("hausnummer") as string | null)?.trim() ?? "";
  const plz = (formData.get("plz") as string | null)?.trim() ?? "";
  const ort = (formData.get("ort") as string | null)?.trim() ?? "";
  const mobil = (formData.get("mobil") as string | null)?.trim() ?? "";
  const ibanRaw = (formData.get("iban") as string | null) ?? "";
  const bicRaw = (formData.get("bic") as string | null) ?? "";

  const iban = ibanRaw.replace(/\s/g, "").toUpperCase();
  const bic = bicRaw.replace(/\s/g, "").toUpperCase();

  // Für Updates nutzen wir den Service-Role-Client (Ziel ist ausschließlich die eigene Zeile über user.id).
  const admin = createServiceClient();

  // Zuerst den passenden Profil-Datensatz auflösen (analog zur Kündigungs-Logik)
  let { data: profileRow, error: profileLookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow && !profileLookupError) {
    const fallback = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    profileRow = fallback.data;
    profileLookupError = fallback.error;
  }

  if (profileLookupError) {
    console.error("Profil laden:", profileLookupError);
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const profileId = String((profileRow as { id?: unknown } | null)?.id ?? "").trim();
  if (!profileId) {
    return {
      success: false,
      error:
        "Kein passender Profil-Datensatz gefunden. Bitte kontaktiere den Vorstand/Support.",
    };
  }

  const { error } = await admin
    .from("profiles")
    .update({
      "Straße": strasse,
      Hausnummer: hausnummer,
      PLZ: plz,
      Ort: ort,
      Handynummer: mobil,
      IBAN: iban,
      BIC: bic,
    })
    .eq("id", profileId);

  if (error) {
    console.error("updateProfile:", error);
    return { success: false, error: "Änderungen konnten nicht gespeichert werden." };
  }

  revalidatePath("/profile");
  return { success: true, error: "" };
}

export async function cancelMembership(): Promise<ProfileActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const user = auth.user;
  const supabase = await getCachedSupabase();

  const cancelledAt = new Date().toISOString();
  const admin = createServiceClient();

  // 1) Zielprofil robust auflösen (RLS-unabhängig via Service-Role).
  let { data: profileRow, error: profileLookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow && !profileLookupError) {
    const fallback = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    profileRow = fallback.data;
    profileLookupError = fallback.error;
  }

  if (profileLookupError) {
    console.error("Profil laden:", profileLookupError);
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const profileId = String((profileRow as { id?: unknown } | null)?.id ?? "").trim();
  if (!profileId) {
    return {
      success: false,
      error:
        "Kein passender Profil-Datensatz gefunden. Bitte kontaktiere den Vorstand/Support.",
    };
  }

  // 2) Datenbank-Update: explizit auf den gefundenen Datensatz.
  const { data: updatedRow, error: updateError } = await admin
    .from("profiles")
    .update({
      Status: "cancelled",
      "Datum_Kündigung": cancelledAt,
    })
    .eq("id", profileId)
    .select('"Status", "Datum_Kündigung"')
    .maybeSingle();

  if (updateError) {
    console.error("cancelMembership:", updateError);
    return { success: false, error: "Die Kündigung konnte nicht gespeichert werden." };
  }

  const updatedStatus = String(
    ((updatedRow as Record<string, unknown> | null)?.Status as string | undefined) ?? ""
  )
    .trim()
    .toLowerCase();
  const updatedCancelDate = String(
    ((updatedRow as Record<string, unknown> | null)?.["Datum_Kündigung"] as string | undefined) ??
      ""
  ).trim();

  if (updatedStatus !== "cancelled" || !updatedCancelDate) {
    return {
      success: false,
      error:
        "Kündigung konnte nicht bestätigt werden (Status/Datum nicht gesetzt). Bitte erneut versuchen.",
    };
  }

  // 3) Session killen
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("cancelMembership (Abmeldung):", signOutError);
    return {
      success: false,
      error: "Kündigung gespeichert, aber Abmeldung fehlgeschlagen. Bitte melde dich manuell ab.",
    };
  }

  // 4) Layout-Cache invalidieren
  revalidatePath("/", "layout");

  // 5) Harte Weiterleitung zum Login
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Alumni-Status beantragen
// ---------------------------------------------------------------------------

export type AlumniRequestStatus = "none" | "pending" | "approved" | "rejected";

/** Status des letzten Alumni-Antrags des eingeloggten Nutzers (RLS: nur eigene Zeilen). */
export async function getAlumniRequestStatus(): Promise<AlumniRequestStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "none";

  const { data, error } = await supabase
    .from("alumni_requests")
    .select("status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "none";

  const status = String((data as { status?: unknown }).status ?? "").trim().toLowerCase();
  if (status === "pending" || status === "approved" || status === "rejected") return status;
  return "none";
}

/**
 * Legt einen Alumni-Antrag an. Der DB-Trigger auf alumni_requests benachrichtigt den Vorstand.
 * Läuft bewusst über den User-Client (RLS: auth.uid() = user_id).
 */
export async function requestAlumniStatus(): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht eingeloggt." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select('id, Vorname, Nachname, "E-Mail", Rolle, Status')
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      success: false,
      error: "Profil nicht gefunden. Bitte kontaktiere den Vorstand.",
    };
  }

  const raw = profile as Record<string, unknown>;
  const rolle = String(raw.Rolle ?? "").trim().toLowerCase();
  if (rolle === "alumni") {
    return { success: false, error: "Du bist bereits Alumni." };
  }
  if (isCancelledProfile(raw)) {
    return {
      success: false,
      error: "Für gekündigte Mitgliedschaften kann kein Alumni-Status beantragt werden.",
    };
  }

  const email = String(raw["E-Mail"] ?? user.email ?? "").trim();
  if (!email) {
    return { success: false, error: "E-Mail im Profil fehlt." };
  }

  const { error } = await supabase.from("alumni_requests").insert({
    user_id: user.id,
    profile_id: String(raw.id ?? "") || null,
    vorname: String(raw.Vorname ?? "").trim(),
    nachname: String(raw.Nachname ?? "").trim(),
    email,
  });

  if (error) {
    // Partial Unique Index: nur ein offener Antrag pro Nutzer.
    if (error.code === "23505") {
      return { success: false, error: "Du hast bereits einen offenen Antrag gestellt." };
    }
    console.error("requestAlumniStatus:", error);
    return { success: false, error: "Antrag konnte nicht gespeichert werden." };
  }

  revalidatePath("/profile");
  revalidatePath("/admin/alumni-requests");
  return { success: true, error: "" };
}
