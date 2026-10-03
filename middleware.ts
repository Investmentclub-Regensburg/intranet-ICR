import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCancelledProfile } from "@/lib/profile-status";
import { safeNextPath } from "@/lib/safe-redirect";

// Alle Seiten der Route-Group (intranet) – nur mit Login erreichbar.
const INTRANET_PREFIXES = [
  "/dashboard",
  "/admin",
  "/events",
  "/calendar",
  "/news",
  "/members",
  "/board-members",
  "/profile",
  "/insights",
  "/magazines",
  "/contact",
  "/whatsapp",
];

export async function middleware(request: NextRequest) {
  // 1. Initialisiere die Response
  let supabaseResponse = NextResponse.next({
    request,
  });

  // 2. Baue den Supabase Client für die Middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3. Hole den User sicher aus der Datenbank (nicht nur aus dem manipulierbaren Cookie)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectWithSupabaseCookies = (to: string) => {
    const response = NextResponse.redirect(new URL(to, request.url));
    for (const cookie of supabaseResponse.cookies.getAll()) {
      response.cookies.set(cookie);
    }
    return response;
  };

  // Kritische Zugriffssperre: gekündigte Accounts sofort abmelden + blockieren.
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select('"Status"')
      .eq("user_id", user.id)
      .maybeSingle();

    if (isCancelledProfile((profile ?? null) as Record<string, unknown> | null)) {
      await supabase.auth.signOut();
      return redirectWithSupabaseCookies("/login");
    }
  }

  // 4. Definiere die Zonen
  // Wichtig: /reset-password darf NICHT bei isAuthRoute stehen – sonst würde
  // "if (isAuthRoute && user) -> dashboard" den User nach dem E-Mail-Link sofort ins Intranet schicken.
  const { pathname, search } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password");
  const isProtectedRoute =
    INTRANET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.startsWith("/reset-password");

  // 5. Die strikten Regeln (Kein Ping-Pong mehr)
  if (isAuthRoute && user) {
    // Eingeloggt, aber will zum Login? Ab ins Dashboard (oder zur ursprünglich angefragten Seite).
    return redirectWithSupabaseCookies(safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/dashboard");
  }

  if (isProtectedRoute && !user) {
    // Nicht eingeloggt? Ab zum Login – und danach zurück zur angefragten Seite (z. B. geteilter Event-Link).
    if (pathname.startsWith("/reset-password")) return redirectWithSupabaseCookies("/login");
    return redirectWithSupabaseCookies(`/login?next=${encodeURIComponent(pathname + search)}`);
  }

  // Alles in Ordnung, lass ihn passieren
  return supabaseResponse;
}

// 6. Optimiere den Matcher, damit die Middleware nicht bei jedem Bild oder CSS-File feuert
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
