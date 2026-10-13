import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase-Client mit Service-Role-Key (umgeht RLS).
 *
 * Regel: Nur serverseitig verwenden und erst NACHDEM requireUser()/requireRole()
 * aus utils/supabase/guards.ts den Aufrufer geprüft hat. Jede exportierte Funktion
 * in einer "use server"-Datei ist per POST aufrufbar – auch ohne die Seite zu öffnen.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase-Service-Konfiguration fehlt.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
