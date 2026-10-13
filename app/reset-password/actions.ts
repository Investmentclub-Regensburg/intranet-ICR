"use server";

import { createClient } from "@/utils/supabase/server";
import { authErrorMessage, checkPasswordLength } from "@/lib/auth-messages";

export type ResetPasswordState = {
  error: string;
  redirect?: string;
};

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const newPassword = (formData.get("newPassword") as string) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string) ?? "";

  if (!newPassword || !confirmPassword) {
    return { error: "Bitte beide Felder ausfüllen." };
  }

  const lengthError = checkPasswordLength(newPassword);
  if (lengthError) {
    return { error: lengthError };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Die Passwörter stimmen nicht überein." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error:
        "Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Reset-Link an.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    console.error("resetPasswordAction:", error.code ?? error.status);
    return {
      error: authErrorMessage(error, "Das Passwort konnte nicht geändert werden. Bitte erneut versuchen."),
    };
  }

  // Alle anderen Sitzungen dieses Kontos beenden (z. B. auf fremden Geräten).
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    console.error("resetPasswordAction (andere Sitzungen beenden):", signOutError.code ?? signOutError.status);
  }

  return { error: "", redirect: "/dashboard" };
}
