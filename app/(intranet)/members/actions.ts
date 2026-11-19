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

/** Alle aktiven Mitglieder (Name + Studiengang) für das Verzeichnis; die Seite lädt sie auf dem Server. */
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
