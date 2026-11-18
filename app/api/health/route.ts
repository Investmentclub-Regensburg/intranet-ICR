/**
 * Leichter Lebenszeichen-Check für den Container (HEALTHCHECK im Dockerfile, Coolify).
 * Prüft nur, dass der Next-Server antwortet – bewusst ohne Datenbank, damit ein Supabase-Ausfall den
 * Container nicht neu starten lässt. Die Middleware läuft hier nicht (Matcher in middleware.ts).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
