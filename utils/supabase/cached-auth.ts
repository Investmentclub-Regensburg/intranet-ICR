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

/** Spalten der Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4). */
const DATEN_CHECK_SPALTEN = "daten_bestaetigt_am, daten_erinnern_ab";

/** Postgres/PostgREST „Spalte fehlt“ (42703) für eine der Spalten der Abfrage. */
function istFehlendeDatenCheckSpalte(error: { code?: string; message?: string }): boolean {
  const message = String(error.message ?? "");
  return /daten_(bestaetigt_am|erinnern_ab)/.test(message) && (error.code === "42703" || /does not exist/i.test(message));
}

/**
 * User + Profil (nur Layout-relevante Felder), einmal pro Request gecacht.
 */
export const getCachedAuth = cache(async () => {
  const user = await getCachedUser();
  if (!user) return { user: null, profile: null, datenCheckSpalten: false };

  const supabase = await getCachedSupabase();
  // Nur, was Layout, Rollenprüfung, Statusprüfung und die Abfrage „Stimmen deine Daten noch?“ brauchen – keine
  // sensiblen Felder. Der Studiengang (Klartext) entscheidet mit über die Fälligkeit der Abfrage (Pflicht seit
  // 20.11.2026, lib/member-data-check.ts → istAbfrageFaellig `pflichtLuecke`).
  const spalten = 'id, user_id, "Vorname", "Nachname", "E-Mail", "Rolle", "Status", letzter_news_aufruf, "Studiengang / Fach"';
  let { data: profile, error } = await supabase
    .from("profiles")
    .select(`${spalten}, ${DATEN_CHECK_SPALTEN}`)
    .eq("user_id", user.id)
    .maybeSingle();
  // Übergang (Migration 20261118140000 noch nicht eingespielt): ohne die Spalten weiter, die Abfrage ist dann
  // nie fällig. Sonst wäre jede Anmeldung gesperrt (fail-closed unten).
  let datenCheckSpalten = true;
  if (error && istFehlendeDatenCheckSpalte(error)) {
    datenCheckSpalten = false;
    ({ data: profile, error } = await supabase.from("profiles").select(spalten).eq("user_id", user.id).maybeSingle());
  }

  const p = (profile ?? null) as Record<string, unknown> | null;
  // Ohne Profil oder bei einem Datenbankfehler kein Zugriff (fail-closed).
  if (error) return { user: null, profile: null, datenCheckSpalten: false };
  if (!p || isCancelledProfile(p) || isPendingProfile(p)) {
    // Zusätzliche Schutzebene: Zugriff auf Intranet sofort entziehen
    // (gekündigt oder Mitgliedsantrag noch nicht vom Vorstand freigegeben).
    // In Middleware wird die Session zusätzlich mit Cookie-Write invalidiert.
    await supabase.auth.signOut();
    return { user: null, profile: null, datenCheckSpalten: false };
  }

  return { user, profile, datenCheckSpalten };
});
