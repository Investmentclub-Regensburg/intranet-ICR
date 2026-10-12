"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isCancelledProfile } from "@/lib/profile-status";
import { MemberSecretsConflictError, saveMemberSecrets } from "@/lib/member-secrets-server";
import { CANCELLATION_TEXT_MAX, isCancellationReason } from "@/lib/cancellation-reasons";
import {
  FIELD_LIMITS,
  checkBic,
  checkIban,
  checkPhone,
  checkPlz,
  checkText,
  firstError,
} from "@/lib/member-fields";

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

  // Eingaben prüfen (gleiche Regeln wie bei der Registrierung); leere Felder bleiben erlaubt.
  const validationError = firstError(
    checkText(strasse, "Straße", FIELD_LIMITS.strasse),
    checkText(hausnummer, "Hausnummer", FIELD_LIMITS.hausnummer),
    checkText(ort, "Ort", FIELD_LIMITS.ort),
    plz ? checkPlz(plz) : null,
    mobil ? checkPhone(mobil) : null,
    iban ? checkIban(iban) : null,
    bic ? checkBic(bic) : null
  );
  if (validationError) {
    return { success: false, error: validationError };
  }

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

  // Verschlüsselt speichern (member_secrets) und in der Übergangsphase Klartext mitschreiben.
  // IBAN-Änderungen erkennt saveMemberSecrets selbst und meldet sie dem Vorstand.
  try {
    // Nur die Felder des bearbeiteten Abschnitts speichern (ohne Angabe: alle, wie bisher). Sonst würde
    // ein offenes Formular eine zwischenzeitliche Korrektur des Vorstands im anderen Abschnitt zurückdrehen.
    const section = formData.get("section");
    const personal = { strasse, hausnummer, plz, ort, handynummer: mobil };
    const bank = { iban, bic };
    await saveMemberSecrets(
      admin,
      profileId,
      section === "personal" ? personal : section === "bank" ? bank : { ...personal, ...bank }
    );
  } catch (err) {
    if (err instanceof MemberSecretsConflictError) {
      return { success: false, error: "Deine Daten wurden gerade an anderer Stelle geändert. Bitte lade die Seite neu." };
    }
    console.error("updateProfile:", err instanceof Error ? err.message : "unbekannt");
    return { success: false, error: "Änderungen konnten nicht gespeichert werden." };
  }

  revalidatePath("/profile");
  return { success: true, error: "" };
}

export async function cancelMembership(input?: {
  reason?: string | null;
  reasonText?: string | null;
}): Promise<ProfileActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const user = auth.user;
  const supabase = await getCachedSupabase();

  // Grund ist freiwillig; nur bekannte Werte, Freitext gekürzt.
  const reason = isCancellationReason(input?.reason) ? input.reason : null;
  const reasonText = String(input?.reasonText ?? "").trim().slice(0, CANCELLATION_TEXT_MAX) || null;

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
    console.error("Profil laden:", profileLookupError.code);
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const row = (profileRow ?? null) as Record<string, unknown> | null;
  const profileId = String(row?.id ?? "").trim();
  if (!profileId) {
    return {
      success: false,
      error:
        "Kein passender Profil-Datensatz gefunden. Bitte kontaktiere den Vorstand/Support.",
    };
  }

  // 2) In einem Schritt: Grund speichern, Status/Datum setzen, Bestätigungsmail einreihen (Datum und
  //    Beitragsstopp rechnet die Datenbank aus dem Berliner Datum). Vorstandsmail und Sperre des Kontos
  //    lösen Trigger aus.
  const { error: cancelError } = await admin.rpc("cancel_membership", {
    p_profile_id: profileId,
    p_reason: reason,
    p_reason_text: reasonText,
  });

  if (cancelError) {
    const message = String(cancelError.message ?? "");
    if (message.includes("letztes Vorstandsmitglied")) {
      return {
        success: false,
        error: "Du bist das letzte aktive Vorstandsmitglied. Bitte übergib das Amt, bevor du kündigst.",
      };
    }
    // Bereits gekündigt (z. B. Doppelklick): wie erfolgreich behandeln und abmelden.
    if (!message.includes("bereits gekündigt")) {
      console.error("cancelMembership:", cancelError.code);
      return { success: false, error: "Die Kündigung konnte nicht gespeichert werden." };
    }
  }

  // 3) Session beenden
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("cancelMembership (Abmeldung):", signOutError.code ?? signOutError.status);
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
