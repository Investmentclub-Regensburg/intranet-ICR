import "server-only";
import type { User } from "@supabase/supabase-js";
import { getCachedAuth } from "@/utils/supabase/cached-auth";

/**
 * Zentrale Login- und Rollenprüfung für Server Actions und Server-Funktionen.
 *
 * Jede exportierte Funktion in einer "use server"-Datei beginnt mit
 * `requireUser()` oder `requireRole([...])` – vor jedem Datenbankzugriff,
 * insbesondere vor createServiceClient().
 *
 * Gekündigte Konten filtert bereits getCachedAuth().
 */

export const ROLES = ["member", "admin", "board", "alumni"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Wer Exporte mit Bank- und Adressdaten erstellen darf (SEPA-Export, BVH-CSV).
 * Bewusst nur der Vorstand; bei Bedarf hier zentral anpassen.
 */
export const EXPORT_ROLES: readonly Role[] = ["board"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Rolle aus dem Profil; unbekannte oder fehlende Werte zählen als einfaches Mitglied. */
export function roleOf(profile: Record<string, unknown> | null | undefined): Role {
  const raw = String(profile?.["Rolle"] ?? "").trim().toLowerCase();
  return isRole(raw) ? raw : "member";
}

export type AuthOk = {
  ok: true;
  user: User;
  profile: Record<string, unknown> | null;
  role: Role;
};
export type AuthFail = { ok: false; error: string };
export type AuthResult = AuthOk | AuthFail;

/** Eingeloggt (und nicht gekündigt)? */
export async function requireUser(): Promise<AuthResult> {
  const { user, profile } = await getCachedAuth();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };
  const p = (profile ?? null) as Record<string, unknown> | null;
  return { ok: true, user, profile: p, role: roleOf(p) };
}

/** Eingeloggt und eine der erlaubten Rollen? */
export async function requireRole(
  allowed: readonly Role[],
  message = "Keine Berechtigung."
): Promise<AuthResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!allowed.includes(auth.role)) return { ok: false, error: message };
  return auth;
}
