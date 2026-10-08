"use server";

import { createClient } from "@/utils/supabase/server";
import { isCancelledProfile } from "@/lib/profile-status";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { LOGIN_FAILED_MESSAGE, MAX_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-messages";

export async function loginAction(
  _prevState: { error: string; redirect?: string },
  formData: FormData
): Promise<{ error: string; redirect?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Bitte E-Mail und Passwort eingeben." };
  }
  if (email.length > 254 || password.length > MAX_PASSWORD_LENGTH) {
    return { error: LOGIN_FAILED_MESSAGE };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    // Einheitliche Meldung: verrät nicht, ob ein Konto existiert oder noch unbestätigt ist.
    return { error: authErrorMessage(error, LOGIN_FAILED_MESSAGE) };
  }

  const user = data.user;
  if (!user) {
    return { error: "Login fehlgeschlagen. Bitte erneut versuchen." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return { error: "Profil konnte nicht geladen werden. Bitte erneut versuchen." };
  }

  if (isCancelledProfile((profile ?? null) as Record<string, unknown> | null)) {
    await supabase.auth.signOut();
    return {
      error:
        "Dein Account ist gekündigt und für das Intranet gesperrt. Bitte kontaktiere den Vorstand bei Rückfragen.",
    };
  }

  return { error: "", redirect: safeRedirectPath(formData.get("next")) };
}
