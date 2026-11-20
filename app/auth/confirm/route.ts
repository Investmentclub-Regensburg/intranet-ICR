import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { siteRedirectUrl } from "@/lib/site-url";
import { emailConfirmZiel } from "@/lib/email-change";

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
      siteRedirectUrl("/login?error=Invalid_or_expired_token", request.url)
    );
  }

  const redirectTo =
    type === "recovery"
      ? siteRedirectUrl("/reset-password", request.url)
      : siteRedirectUrl(safeRedirectPath(nextParam), request.url);
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

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  // E-Mail-Änderung (je ein Link an alte und neue Adresse): Ziel ist das Fenster im Profil (lib/email-change.ts).
  // Nur der zweite Link liefert eine Sitzung; beim ersten antwortet Supabase ohne Sitzung und ohne Nutzer. Ohne
  // eigene Anmeldung in diesem Browser (z. B. Link am Handy) geht es über die Anmeldung dorthin. Abgelaufene oder
  // schon benutzte Links landen angemeldet im selben Fenster (mit Meldung).
  if (type === "email_change") {
    const sitzung = !error && Boolean(data.session);
    let angemeldet = sitzung;
    if (!angemeldet) {
      const { data: current } = await supabase.auth.getUser();
      angemeldet = Boolean(current.user);
    }
    const path = emailConfirmZiel({ ok: !error, sitzung, angemeldet });
    const target = NextResponse.redirect(siteRedirectUrl(path, request.url));
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    return target;
  }

  if (error) {
    return NextResponse.redirect(
      siteRedirectUrl("/login?error=Invalid_or_expired_token", request.url)
    );
  }

  return response;
}
