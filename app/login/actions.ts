"use server";

import { createClient } from "@/utils/supabase/server";
import { isCancelledProfile } from "@/lib/profile-status";
import { safeNextPath } from "@/lib/safe-redirect";

export async function loginAction(
  _prevState: { error: string; redirect?: string },
  formData: FormData
): Promise<{ error: string; redirect?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Bitte E-Mail und Passwort eingeben." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: error.message };
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

  return { error: "", redirect: safeNextPath(formData.get("next")) ?? "/dashboard" };
}
