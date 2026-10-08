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
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const p = (profile ?? null) as Record<string, unknown> | null;
  if (isCancelledProfile(p) || isPendingProfile(p)) {
    // Zusätzliche Schutzebene: Zugriff auf Intranet sofort entziehen
    // (gekündigt oder Mitgliedsantrag noch nicht vom Vorstand freigegeben).
    // In Middleware wird die Session zusätzlich mit Cookie-Write invalidiert.
    await supabase.auth.signOut();
    return { user: null, profile: null };
  }

  return { user, profile };
});
