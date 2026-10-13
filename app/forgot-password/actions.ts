"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { authErrorMessage } from "@/lib/auth-messages";
import { getSiteOrigin } from "@/lib/site-url";
import { RATE_LIMITED_MESSAGE, checkTurnstile, clientIp, withinRateLimits } from "@/lib/bot-protection";

export type ForgotPasswordState = {
  error: string;
  success: boolean;
  email?: string;
};

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = (formData.get("email") as string)?.trim();
  if (!email || email.length > 254) {
    return { error: "Bitte E-Mail-Adresse eingeben.", success: false, email: "" };
  }

  // Bremse gegen Mail-Bombing: je E-Mail-Adresse und je IP.
  const allowed = await withinRateLimits([
    { scope: "reset-email", value: email, max: 3, windowSeconds: 60 * 60 },
    { scope: "reset-ip", value: await clientIp(), max: 10, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { error: RATE_LIMITED_MESSAGE, success: false, email };

  const captcha = await checkTurnstile(formData);
  if (!captcha.ok) return { error: captcha.error, success: false, email };

  const supabase = await createClient();
  const origin = getSiteOrigin((await headers()).get("origin"));
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
    ...(captcha.captchaToken ? { captchaToken: captcha.captchaToken } : {}),
  });

  if (error) {
    console.error("forgotPasswordAction:", error.code ?? error.status);
    return {
      error: authErrorMessage(
        error,
        "Die Anfrage konnte gerade nicht verarbeitet werden. Bitte versuche es später erneut."
      ),
      success: false,
      email,
    };
  }

  return { error: "", success: true, email };
}
