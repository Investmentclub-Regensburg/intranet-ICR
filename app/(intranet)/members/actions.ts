"use server";

import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";

export type MemberRow = {
  name: string;
  studiengang: string;
};

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
    .select('Vorname, Nachname, "Studiengang / Fach"')
    .or(`Vorname.ilike."${pattern}",Nachname.ilike."${pattern}"`);

  if (error) return [];

  return (data ?? []).map((p) => {
    const raw = p as Record<string, unknown>;
    const v = String(raw.Vorname ?? "").trim();
    const n = String(raw.Nachname ?? "").trim();
    const name = [v, n].filter(Boolean).join(" ") || "—";
    const studiengang = String(raw["Studiengang / Fach"] ?? "").trim();
    return { name, studiengang };
  });
}

export async function getAllMembers(): Promise<MemberRow[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];

  const admin = createServiceClient();

  const { data, error } = await admin
    .from("profiles")
    .select('Vorname, Nachname, "Studiengang / Fach"')
    .order("Nachname", { ascending: true })
    .order("Vorname", { ascending: true });

  if (error) return [];

  return (data ?? []).map((p) => {
    const raw = p as Record<string, unknown>;
    const v = String(raw.Vorname ?? "").trim();
    const n = String(raw.Nachname ?? "").trim();
    const name = [v, n].filter(Boolean).join(" ") || "—";
    const studiengang = String(raw["Studiengang / Fach"] ?? "").trim();
    return { name, studiengang };
  });
}
