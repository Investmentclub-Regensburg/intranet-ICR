import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Auth-Callback für E-Mail-Links (z. B. Passwort-Reset).
 * Supabase leitet hierher mit ?code=...&next=... weiter.
 * Code wird gegen eine Session getauscht, dann Redirect zu next.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/reset-password");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Auth callback exchangeCodeForSession:", error.message);
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
