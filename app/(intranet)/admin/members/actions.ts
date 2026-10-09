"use server";

import { revalidatePath } from "next/cache";
import { requireRole, roleOf } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isUuid } from "@/lib/validation";

export type AdminMemberRow = {
  id: string;
  name: string;
  studiengang: string;
  email: string;
  handynummer: string;
  rolle: string;
  /** Kleinbuchstaben, z. B. active | cancelled | applicant */
  status: string;
};

export async function getAdminMembers(): Promise<AdminMemberRow[]> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return [];

  const admin = createServiceClient();

  const { data, error } = await admin
    .from("profiles")
    .select(
      'id, Vorname, Nachname, "Studiengang / Fach", "E-Mail", Handynummer, Rolle, Status'
    )
    .order("Nachname", { ascending: true })
    .order("Vorname", { ascending: true });

  if (error) return [];

  return (data ?? []).map((p) => {
    const raw = p as Record<string, unknown>;
    const v = String(raw.Vorname ?? raw.vorname ?? "").trim();
    const n = String(raw.Nachname ?? raw.nachname ?? "").trim();
    const name = [v, n].filter(Boolean).join(" ") || "—";
    const sg = raw["Studiengang / Fach"] ?? (raw as Record<string, unknown>)["Studiengang / Fach"];
    const em = raw["E-Mail"] ?? (raw as Record<string, unknown>)["e-mail"];
    const hn = raw.Handynummer ?? raw.handynummer;
    const rl = raw.Rolle ?? raw.rolle;
    const st = raw.Status ?? raw.status;
    return {
      id: String(raw.id ?? ""),
      name,
      studiengang: String(sg ?? "").trim(),
      email: String(em ?? "").trim(),
      handynummer: String(hn ?? "").trim(),
      rolle: String(rl ?? "member").trim().toLowerCase(),
      status: String(st ?? "active").trim().toLowerCase(),
    };
  });
}

/** UI-Wert fuer "ausgetreten" - kein Rollenwert, setzt Status + Datum_Kündigung. */
const CANCELLED_UI = "cancelled";
const ALLOWED_ROLES = ["member", "admin", "board", "alumni"];

export async function updateMemberRole(
  profileId: string,
  newRole: string
): Promise<{ error: string }> {
  const auth = await requireRole(["board"], "Nur Vorstand (board) darf Rollen ändern.");
  if (!auth.ok) return { error: auth.error };

  if (!isUuid(profileId) || typeof newRole !== "string") {
    return { error: "Ungültige Auswahl." };
  }

  const roleValue = newRole.trim().toLowerCase();
  if (roleValue !== CANCELLED_UI && !ALLOWED_ROLES.includes(roleValue)) {
    return { error: "Ungültige Auswahl." };
  }

  const admin = createServiceClient();

  // Den letzten aktiven Vorstand nicht entfernen (sonst kann niemand mehr Rollen vergeben).
  if (roleValue !== "board") {
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("Rolle, Status")
      .eq("id", profileId)
      .maybeSingle();
    if (targetError) {
      console.error("updateMemberRole (Ziel laden):", targetError);
      return { error: "Änderung konnte nicht gespeichert werden." };
    }
    if (!target) return { error: "Mitglied nicht gefunden." };

    if (roleOf(target as Record<string, unknown>) === "board") {
      const { data: boards, error: boardError } = await admin
        .from("profiles")
        .select("id, Status")
        .eq("Rolle", "board");
      if (boardError) {
        console.error("updateMemberRole (Vorstand zählen):", boardError);
        return { error: "Änderung konnte nicht gespeichert werden." };
      }
      const activeBoards = (boards ?? []).filter(
        (b) => String((b as Record<string, unknown>).Status ?? "").trim().toLowerCase() !== "cancelled"
      );
      if (activeBoards.length <= 1) {
        return { error: "Es muss mindestens ein Vorstandsmitglied bleiben." };
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const update =
    roleValue === CANCELLED_UI
      ? { Status: "cancelled", Datum_Kündigung: today, Rolle: "member" }
      : { Rolle: roleValue, Status: "active", Datum_Kündigung: null };

  const { error } = await admin.from("profiles").update(update).eq("id", profileId);
  if (error) {
    console.error("updateMemberRole:", error);
    return { error: "Änderung konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { error: "" };
}
