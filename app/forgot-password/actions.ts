"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { authErrorMessage } from "@/lib/auth-messages";

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

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
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
