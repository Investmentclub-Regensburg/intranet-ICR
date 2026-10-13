"use server";

import { createClient } from "@/utils/supabase/server";
import { isCancelledProfile, isPendingProfile } from "@/lib/profile-status";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { LOGIN_FAILED_MESSAGE, MAX_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-messages";
import { RATE_LIMITED_MESSAGE, checkTurnstile, clientIp, withinRateLimits } from "@/lib/bot-protection";

const CANCELLED_MESSAGE =
  "Dein Account ist gekündigt und für das Intranet gesperrt. Bitte kontaktiere den Vorstand bei Rückfragen.";

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

  // Bremse gegen Passwort-Raten: je IP und je E-Mail-Adresse.
  const allowed = await withinRateLimits([
    { scope: "login-ip", value: await clientIp(), max: 30, windowSeconds: 15 * 60 },
    { scope: "login-email", value: email, max: 10, windowSeconds: 15 * 60 },
  ]);
  if (!allowed) return { error: RATE_LIMITED_MESSAGE };

  const captcha = await checkTurnstile(formData);
  if (!captcha.ok) return { error: captcha.error };

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
    ...(captcha.captchaToken ? { options: { captchaToken: captcha.captchaToken } } : {}),
  });

  if (error) {
    // Gekündigte Konten sind in Supabase Auth gesperrt (Migration 20261009140000).
    if (error.code === "user_banned") return { error: CANCELLED_MESSAGE };
    // Einheitliche Meldung: verrät nicht, ob ein Konto existiert oder noch unbestätigt ist.
    return { error: authErrorMessage(error, LOGIN_FAILED_MESSAGE) };
  }

  const user = data.user;
  if (!user) {
    return { error: "Login fehlgeschlagen. Bitte erneut versuchen." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select('"Status"')
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "Profil konnte nicht geladen werden. Bitte erneut versuchen." };
  }

  if (isCancelledProfile((profile ?? null) as Record<string, unknown> | null)) {
    await supabase.auth.signOut();
    return { error: CANCELLED_MESSAGE };
  }

  if (isPendingProfile((profile ?? null) as Record<string, unknown> | null)) {
    await supabase.auth.signOut();
    return {
      error:
        "Dein Mitgliedsantrag wird noch vom Vorstand geprüft. Sobald er freigegeben ist, kannst du dich anmelden.",
    };
  }

  return { error: "", redirect: safeRedirectPath(formData.get("next")) };
}
