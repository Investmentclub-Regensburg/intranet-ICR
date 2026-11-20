// Mitgliederverzeichnis (Verein › Mitglieder): Liste aller aktiven Mitglieder für die Seite, nur auf dem Server.
// Bewusst keine Server-Action (Review N2): Die Seite lädt die Liste beim Rendern; ein eigener Action-Endpunkt
// würde die Sperre der Datenabfrage umgehen. Datenumfang wie bisher: nur Name und Studiengang.
import "server-only";
import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isActiveMemberProfile } from "@/lib/profile-status";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";
import type { MemberRow } from "@/components/members/directory";

export const VERZEICHNIS_FEHLER = "Mitglieder konnten nicht geladen werden.";

/**
 * Verzeichnis zeigt nur aktive Mitglieder (inkl. Alumni) – keine Gekündigten, keine offenen Anträge. Profile ohne
 * Status (Altdaten) bleiben sichtbar.
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

/** Alle aktiven Mitglieder, nach Nachname und Vorname. Fehler (auch fehlende Anmeldung) als eigene Meldung. */
export async function getMemberDirectory(): Promise<{ members: MemberRow[] } | { error: string }> {
  await sperreBeiDatenmaengeln();
  const auth = await requireUser();
  if (!auth.ok) return { error: VERZEICHNIS_FEHLER };

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("profiles")
    .select('Vorname, Nachname, "Studiengang / Fach", Status')
    .order("Nachname", { ascending: true })
    .order("Vorname", { ascending: true });

  if (error) {
    console.error("getMemberDirectory:", error.code);
    return { error: VERZEICHNIS_FEHLER };
  }
  return { members: toDirectory(data as Record<string, unknown>[] | null) };
}
