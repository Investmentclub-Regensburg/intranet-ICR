import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Session-Cookies müssen auf die Redirect-Response geschrieben werden,
 * sonst hat der Browser beim Aufruf von /reset-password keine Session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL("/login?error=Invalid_or_expired_token", request.url)
    );
  }

  const redirectTo =
    type === "recovery"
      ? new URL("/reset-password", request.url)
      : new URL(safeRedirectPath(nextParam), request.url);
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=Invalid_or_expired_token", request.url)
    );
  }

  return response;
}
