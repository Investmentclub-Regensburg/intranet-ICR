"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { EXPORT_ROLES, requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isUuid } from "@/lib/validation";
import {
  BVH_MITGLIEDER_CSV_HEADER,
  formatBirthdayIso,
  genderFromAnrede,
  joinCsvRow,
  vorstandFromRolle,
} from "@/lib/bvh-mitglieder-csv";

export type RequestBvhResult = { ok: boolean; error?: string };

/** Status der BVH-Anfrage des aktuellen Users (für Anzeige „Erledigt“ → „Login per E-Mail versendet“). */
export type BvhLoginStatus = { hasRequested: boolean; handled: boolean };

export async function getBvhLoginStatusForCurrentUser(): Promise<BvhLoginStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { hasRequested: false, handled: false };

  const { data, error } = await supabase
    .from("bvh_login_requests")
    .select("handled")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data)
    return { hasRequested: false, handled: false };

  return {
    hasRequested: true,
    handled: Boolean((data as { handled?: boolean }).handled),
  };
}

/** Stellt eine Anfrage für BVH-Login-Daten (speichert in bvh_login_requests). */
export async function requestBvhLogin(): Promise<RequestBvhResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: profile } = await supabase
    .from("profiles")
    .select('id, Vorname, Nachname, "E-Mail"')
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return { ok: false, error: "Profil nicht gefunden." };

  const raw = profile as Record<string, unknown>;
  const vorname = String(raw.Vorname ?? raw.vorname ?? "").trim();
  const nachname = String(raw.Nachname ?? raw.nachname ?? "").trim();
  const email = String(raw["E-Mail"] ?? (raw as Record<string, unknown>)["e-mail"] ?? "").trim();

  if (!email) return { ok: false, error: "E-Mail im Profil fehlt." };

  // Höchstens eine offene Anfrage pro Konto (verhindert Massenanfragen).
  const { count: openCount, error: openError } = await createServiceClient()
    .from("bvh_login_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("handled", false);
  if (openError) {
    console.error("requestBvhLogin (offene Anfragen):", openError);
    return { ok: false, error: "Anfrage konnte nicht gespeichert werden." };
  }
  if ((openCount ?? 0) > 0) {
    return { ok: false, error: "Du hast bereits eine offene Anfrage." };
  }

  const { error } = await supabase.from("bvh_login_requests").insert({
    user_id: user.id,
    vorname,
    nachname,
    email,
  });

  if (error) {
    console.error("requestBvhLogin:", error);
    return { ok: false, error: "Anfrage konnte nicht gespeichert werden." };
  }
  revalidatePath("/admin/bvh-login");
  revalidatePath("/magazines");
  return { ok: true };
}

export type BvhLoginRequestRow = {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  handled: boolean;
  created_at: string;
};

/** Liste aller BVH-Anfragen (nur Admin/Vorstand). */
export async function getBvhLoginRequests(): Promise<BvhLoginRequestRow[]> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return [];

  const admin = createServiceClient();

  const { data, error } = await admin
    .from("bvh_login_requests")
    .select("id, user_id, vorname, nachname, email, handled, created_at")
    .order("created_at", { ascending: false });

  if (error) return [];

  // Angezeigt werden die Profildaten des anfragenden Kontos, nicht die im Antrag gespeicherten Felder.
  const userIds = [...new Set((data ?? []).map((r) => String(r.user_id ?? "")).filter(isUuid))];
  const byUserId = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select('user_id, Vorname, Nachname, "E-Mail"')
      .in("user_id", userIds);
    for (const p of profs ?? []) byUserId.set(String(p.user_id ?? ""), p as Record<string, unknown>);
  }

  return (data ?? []).map((r) => {
    const p = byUserId.get(String(r.user_id ?? ""));
    return {
      id: String(r.id),
      vorname: String((p ? p.Vorname : r.vorname) ?? ""),
      nachname: String((p ? p.Nachname : r.nachname) ?? ""),
      email: String((p ? p["E-Mail"] : r.email) ?? ""),
      handled: Boolean(r.handled),
      created_at: String(r.created_at ?? ""),
    };
  });
}

/** Anfrage als „akzeptiert“ markieren (Button ausgrauen; Freischaltung erfolgt manuell auf BVH-Seite). */
export async function markBvhRequestHandled(id: string): Promise<{ error?: string }> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(id)) return { error: "Anfrage nicht gefunden." };

  const admin = createServiceClient();

  const { error } = await admin
    .from("bvh_login_requests")
    .update({ handled: true })
    .eq("id", id);

  if (error) {
    console.error("markBvhRequestHandled:", error);
    return { error: "Anfrage konnte nicht aktualisiert werden." };
  }
  revalidatePath("/admin/bvh-login");
  return {};
}

/**
 * CSV für BVH-Mitglieder-Upload: nur Anfragen mit handled = false.
 * Kopfzeile und Spaltenreihenfolge exakt laut BVH-Template.
 */
export async function buildBvhUnhandledRequestsCsv(): Promise<{
  csv: string | null;
  error: string;
}> {
  const auth = await requireRole(EXPORT_ROLES, "Nur der Vorstand darf diesen Export erstellen.");
  if (!auth.ok) return { csv: null, error: auth.error };

  const admin = createServiceClient();

  const { data: reqs, error: reqErr } = await admin
    .from("bvh_login_requests")
    .select("user_id")
    .eq("handled", false)
    .order("created_at", { ascending: true });

  if (reqErr) {
    console.error("buildBvhUnhandledRequestsCsv (Anfragen):", reqErr);
    return { csv: null, error: "Anfragen konnten nicht geladen werden." };
  }
  if (!reqs?.length) {
    return {
      csv: `${BVH_MITGLIEDER_CSV_HEADER}\n`,
      error: "",
    };
  }

  const userIds = [
    ...new Set(
      (reqs as { user_id?: string }[])
        .map((r) => r.user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  let profiles: Record<string, unknown>[] = [];
  if (userIds.length > 0) {
    const { data: profData, error: profErr } = await admin
      .from("profiles")
      .select(
        'user_id, Vorname, Nachname, "E-Mail", Handynummer, Geburtsdatum, Anrede, "Straße", Hausnummer, PLZ, Ort, Rolle'
      )
      .in("user_id", userIds);
    if (profErr) {
      console.error("buildBvhUnhandledRequestsCsv (Profile):", profErr);
      return { csv: null, error: "Profile konnten nicht geladen werden." };
    }
    profiles = (profData ?? []) as Record<string, unknown>[];
  }

  const byUserId = new Map<string, Record<string, unknown>>();
  for (const p of profiles) {
    const uid = String((p as Record<string, unknown>).user_id ?? "");
    if (uid) byUserId.set(uid, p as Record<string, unknown>);
  }

  const lines: string[] = [BVH_MITGLIEDER_CSV_HEADER];
  const seen = new Set<string>();

  for (const r of reqs as { user_id?: string }[]) {
    const uid = r.user_id ?? "";
    const prof = uid ? byUserId.get(uid) : undefined;
    // Nur Daten aus dem Profil des anfragenden Kontos exportieren; je Konto eine Zeile.
    if (!prof || seen.has(uid)) continue;
    seen.add(uid);

    const email = String(prof["E-Mail"] ?? prof["e-mail"] ?? "").trim();
    const firstName = String(prof.Vorname ?? prof.vorname ?? "").trim();
    const lastName = String(prof.Nachname ?? prof.nachname ?? "").trim();
    const phone = String(prof?.Handynummer ?? prof?.handynummer ?? "").trim();
    const birthday = formatBirthdayIso(prof?.Geburtsdatum ?? prof?.geburtsdatum);
    const gender = genderFromAnrede(
      String(prof?.Anrede ?? prof?.anrede ?? "").trim() || undefined
    );
    const pcode = String(prof?.PLZ ?? prof?.plz ?? "").trim();
    const place = String(prof?.Ort ?? prof?.ort ?? "").trim();
    const street = String(prof?.["Straße"] ?? prof?.Strasse ?? "").trim();
    const snumber = String(prof?.Hausnummer ?? prof?.hausnummer ?? "").trim();
    const addition = "";
    const vorstand = vorstandFromRolle(
      String(prof?.Rolle ?? prof?.rolle ?? "member")
    );
    const deleteFlag = "0";

    lines.push(
      joinCsvRow([
        email,
        firstName,
        lastName,
        gender,
        phone,
        birthday,
        "DE",
        pcode,
        place,
        street,
        snumber,
        addition,
        vorstand,
        deleteFlag,
      ])
    );
  }

  return { csv: lines.join("\n") + "\n", error: "" };
}
