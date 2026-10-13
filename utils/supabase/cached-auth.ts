import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { isCancelledProfile, isPendingProfile } from "@/lib/profile-status";

/**
 * Ein Supabase-Client pro Request (wird von Layouts und Seiten geteilt).
 * Vermeidet mehrfache createClient()- und Auth-Aufrufe pro Seitenaufruf.
 */
export const getCachedSupabase = cache(async () => createClient());

/**
 * Aktueller User, einmal pro Request gecacht.
 */
export const getCachedUser = cache(async () => {
  const supabase = await getCachedSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * User + Profil (nur Layout-relevante Felder), einmal pro Request gecacht.
 */
export const getCachedAuth = cache(async () => {
  const user = await getCachedUser();
  if (!user) return { user: null, profile: null };

  const supabase = await getCachedSupabase();
  const { data: profile, error } = await supabase
    .from("profiles")
    // Nur, was Layout, Rollenprüfung und Statusprüfung brauchen – keine sensiblen Felder.
    .select('id, user_id, "Vorname", "Nachname", "E-Mail", "Rolle", "Status", letzter_news_aufruf')
    .eq("user_id", user.id)
    .maybeSingle();

  const p = (profile ?? null) as Record<string, unknown> | null;
  // Ohne Profil oder bei einem Datenbankfehler kein Zugriff (fail-closed).
  if (error) return { user: null, profile: null };
  if (!p || isCancelledProfile(p) || isPendingProfile(p)) {
    // Zusätzliche Schutzebene: Zugriff auf Intranet sofort entziehen
    // (gekündigt oder Mitgliedsantrag noch nicht vom Vorstand freigegeben).
    // In Middleware wird die Session zusätzlich mit Cookie-Write invalidiert.
    await supabase.auth.signOut();
    return { user: null, profile: null };
  }

  return { user, profile };
});
