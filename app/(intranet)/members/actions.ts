"use server";

import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isActiveMemberProfile } from "@/lib/profile-status";

export type MemberRow = {
  name: string;
  studiengang: string;
};

/**
 * Verzeichnis zeigt nur aktive Mitglieder (inkl. Alumni) – keine Gekündigten,
 * keine offenen Anträge. Profile ohne Status (Altdaten) bleiben sichtbar.
 */
function toDirectory(rows: Record<string, unknown>[] | null): MemberRow[] {
  return (rows ?? [])
    .filter((raw) => isActiveMemberProfile(raw))
    .map((raw) => {
      const v = String(raw.Vorname ?? "").trim();
      const n = String(raw.Nachname ?? "").trim();
      const name = [v, n].filter(Boolean).join(" ") || "—";
      const studiengang = String(raw["Studiengang / Fach"] ?? "").trim();
      return { name, studiengang };
    });
}

export async function searchMembers(query: string): Promise<MemberRow[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];

  const admin = createServiceClient();

  const q = (typeof query === "string" ? query : "").trim().slice(0, 100);
  if (!q) return [];

  // Eingabe für den PostgREST-`or`-Filter absichern: Backslash und Quote escapen
  // (Reihenfolge wichtig) und LIKE-Wildcards entfernen, damit der Filter nicht
  // manipuliert oder zu einer Voll-Tabellen-Suche aufgeweitet werden kann.
  const safe = q
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[%_]/g, "");
  const pattern = `%${safe}%`;
  const { data, error } = await admin
    .from("profiles")
    .select('Vorname, Nachname, "Studiengang / Fach", Status')
    .or(`Vorname.ilike."${pattern}",Nachname.ilike."${pattern}"`);

  if (error) return [];

  return toDirectory(data as Record<string, unknown>[] | null);
}

export async function getAllMembers(): Promise<MemberRow[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];

  const admin = createServiceClient();

  const { data, error } = await admin
    .from("profiles")
    .select('Vorname, Nachname, "Studiengang / Fach", Status')
    .order("Nachname", { ascending: true })
    .order("Vorname", { ascending: true });

  if (error) return [];

  return toDirectory(data as Record<string, unknown>[] | null);
}
