"use server";

import { revalidatePath } from "next/cache";
import { requireRole, roleOf } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isUuid } from "@/lib/validation";
import { berlinToday } from "@/lib/berlin-date";
import {
  MemberSecretsConflictError,
  readMemberSecrets,
  readMemberSecretsMany,
  saveMemberSecrets,
  plainToSecretValues,
  PLAIN_COLUMNS,
  type MemberSecretValues,
  type MemberSecretsResult,
} from "@/lib/member-secrets-server";
import {
  FIELD_LIMITS,
  checkBic,
  checkBirthDate,
  checkIban,
  checkPhone,
  checkPlz,
  checkText,
  firstError,
} from "@/lib/member-fields";
import { maskIban } from "@/components/profile/profile-format";

export type AdminMemberRow = {
  id: string;
  name: string;
  studiengang: string;
  email: string;
  handynummer: string;
  /** Verschlüsselte Daten dieses Mitglieds nicht lesbar (Handynummer fehlt dann). */
  secretsUnreadable: boolean;
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

  // Handynummer aus member_secrets (verschlüsselt); ohne Zeile aus dem Klartext (Übergangsphase).
  let secrets: Map<string, MemberSecretsResult> | null = null;
  try {
    secrets = await readMemberSecretsMany(
      admin,
      (data ?? []).map((p) => ({ ...(p as Record<string, unknown>), id: String((p as { id?: unknown }).id ?? "") }))
    );
  } catch (err) {
    console.error("getAdminMembers: member_secrets", err instanceof Error ? err.message : "unbekannt");
  }

  return (data ?? []).map((p) => {
    const raw = p as Record<string, unknown>;
    const v = String(raw.Vorname ?? raw.vorname ?? "").trim();
    const n = String(raw.Nachname ?? raw.nachname ?? "").trim();
    const name = [v, n].filter(Boolean).join(" ") || "—";
    const sg = raw["Studiengang / Fach"] ?? (raw as Record<string, unknown>)["Studiengang / Fach"];
    const em = raw["E-Mail"] ?? (raw as Record<string, unknown>)["e-mail"];
    const sv = secrets?.get(String(raw.id ?? ""));
    const unreadable = !secrets || sv === "unreadable";
    const hn = sv && sv !== "unreadable" ? sv.handynummer : null;
    const rl = raw.Rolle ?? raw.rolle;
    const st = raw.Status ?? raw.status;
    return {
      id: String(raw.id ?? ""),
      name,
      studiengang: String(sg ?? "").trim(),
      email: String(em ?? "").trim(),
      handynummer: String(hn ?? "").trim(),
      secretsUnreadable: unreadable,
      rolle: String(rl ?? "member").trim().toLowerCase(),
      status: String(st ?? "active").trim().toLowerCase(),
    };
  });
}

export type CancellationRow = {
  id: string;
  name: string;
  /** ISO-Zeitpunkt */
  cancelledAt: string;
  reason: string | null;
  reasonText: string | null;
};

/** Kündigungen mit freiwilligem Grund (Selbstkündigung im Intranet), neueste zuerst. Nur Vorstand. */
export async function getCancellations(): Promise<CancellationRow[]> {
  const auth = await requireRole(["board"]);
  if (!auth.ok) return [];

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("membership_cancellations")
    .select('id, cancelled_at, reason, reason_text, profiles("Vorname", "Nachname")')
    .order("cancelled_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("getCancellations:", error.code);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as Record<string, unknown> | null;
    const name = [p?.Vorname, p?.Nachname].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || "—";
    return {
      id: String(r.id ?? ""),
      name,
      cancelledAt: String(r.cancelled_at ?? ""),
      reason: r.reason ? String(r.reason) : null,
      reasonText: r.reason_text ? String(r.reason_text) : null,
    };
  });
}

/** Daten für den Korrekturdialog (Vorstand). Die IBAN nur gekürzt – ersetzt wird sie durch Neueingabe. */
export type MemberCorrectionData = {
  name: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  handynummer: string;
  geburtsdatum: string;
  bic: string;
  ibanMasked: string;
};

/** Bearbeitbare Felder (ohne IBAN). */
const CORRECTION_FIELDS = ["strasse", "hausnummer", "plz", "ort", "handynummer", "geburtsdatum", "bic"] as const;
type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export type MemberCorrectionInput = Record<CorrectionField, string> & {
  /** Neue IBAN; leer = unverändert. */
  iban: string;
};

/** Gleiche Normalisierung für Formular, Ausgangswerte und gespeicherte Werte (sonst Scheinänderungen). */
function normalizeCorrection(field: CorrectionField, value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return field === "bic" ? text.replace(/\s/g, "").toUpperCase() : text;
}

async function loadCorrectionValues(
  admin: ReturnType<typeof createServiceClient>,
  profileId: string
): Promise<{ name: string; values: MemberSecretValues } | { error: string }> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select(['"Vorname"', '"Nachname"', ...Object.values(PLAIN_COLUMNS).map((c) => `"${c}"`)].join(", "))
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("loadCorrectionValues:", error.code);
    return { error: "Mitglied konnte nicht geladen werden." };
  }
  if (!profile) return { error: "Mitglied nicht gefunden." };
  const p = profile as unknown as Record<string, unknown>;
  const name = [p.Vorname, p.Nachname].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || "—";
  try {
    // Mit member_secrets-Zeile gilt nur sie; ohne Zeile der Klartext (Übergangsphase).
    const values = (await readMemberSecrets(admin, profileId)) ?? plainToSecretValues(p);
    return { name, values };
  } catch (err) {
    console.error("loadCorrectionValues:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Die verschlüsselten Daten dieses Mitglieds sind nicht lesbar. Bitte IT-Vorstand informieren." };
  }
}

export async function getMemberCorrectionData(
  profileId: string
): Promise<{ data: MemberCorrectionData } | { error: string }> {
  const auth = await requireRole(["board"], "Nur der Vorstand darf Mitgliedsdaten korrigieren.");
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(profileId)) return { error: "Ungültige Auswahl." };

  const loaded = await loadCorrectionValues(createServiceClient(), profileId);
  if ("error" in loaded) return loaded;
  const v = loaded.values;
  return {
    data: {
      name: loaded.name,
      strasse: v.strasse ?? "",
      hausnummer: v.hausnummer ?? "",
      plz: v.plz ?? "",
      ort: v.ort ?? "",
      handynummer: v.handynummer ?? "",
      geburtsdatum: v.geburtsdatum ?? "",
      bic: v.bic ?? "",
      ibanMasked: v.iban ? maskIban(v.iban) : "",
    },
  };
}

/**
 * Korrektur der verschlüsselten Mitgliedsdaten durch den Vorstand (z. B. Geburtsdatum, Tippfehler in der
 * Adresse). Speichert über saveMemberSecrets mit Protokoll (member_data_corrections, nur Feldnamen).
 * `base` sind die Werte beim Öffnen des Dialogs: Gespeichert werden nur Felder, die der Vorstand gegenüber
 * `base` geändert hat – und nur, wenn sie in der Datenbank noch `base` entsprechen (sonst hätte z. B. das
 * Mitglied inzwischen geändert und die Korrektur würde das still zurückdrehen).
 */
export async function correctMemberData(
  profileId: string,
  input: MemberCorrectionInput,
  base: MemberCorrectionData
): Promise<{ error: string; unchanged?: boolean }> {
  const auth = await requireRole(["board"], "Nur der Vorstand darf Mitgliedsdaten korrigieren.");
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(profileId) || !input || typeof input !== "object" || !base || typeof base !== "object") {
    return { error: "Ungültige Auswahl." };
  }
  const actorId = String(auth.profile?.id ?? "");
  if (!isUuid(actorId)) return { error: "Dein Profil konnte nicht zugeordnet werden." };

  const changes: Partial<MemberSecretValues> = {};
  for (const field of CORRECTION_FIELDS) {
    const value = normalizeCorrection(field, input[field]);
    if (value !== normalizeCorrection(field, base[field])) changes[field] = value;
  }
  const iban = (typeof input.iban === "string" ? input.iban : "").replace(/\s/g, "").toUpperCase();
  if (iban) changes.iban = iban;

  if (changes.geburtsdatum === "") {
    return { error: "Das Geburtsdatum kann nicht gelöscht werden. Bitte ein vollständiges Datum eingeben." };
  }
  // Nur geänderte Felder prüfen (unveränderte Altdaten sollen eine Korrektur nicht blockieren).
  const has = (field: keyof MemberSecretValues) => typeof changes[field] === "string" && changes[field] !== "";
  const validationError = firstError(
    "strasse" in changes ? checkText(changes.strasse!, "Straße", FIELD_LIMITS.strasse) : null,
    "hausnummer" in changes ? checkText(changes.hausnummer!, "Hausnummer", FIELD_LIMITS.hausnummer) : null,
    "ort" in changes ? checkText(changes.ort!, "Ort", FIELD_LIMITS.ort) : null,
    has("plz") ? checkPlz(changes.plz!) : null,
    has("handynummer") ? checkPhone(changes.handynummer!) : null,
    has("geburtsdatum") ? checkBirthDate(changes.geburtsdatum!) : null,
    has("iban") ? checkIban(changes.iban!) : null,
    has("bic") ? checkBic(changes.bic!) : null
  );
  if (validationError) return { error: validationError };

  const admin = createServiceClient();
  const loaded = await loadCorrectionValues(admin, profileId);
  if ("error" in loaded) return loaded;

  const current = loaded.values;
  const stale =
    CORRECTION_FIELDS.some(
      (field) => field in changes && normalizeCorrection(field, current[field]) !== normalizeCorrection(field, base[field])
    ) || (changes.iban !== undefined && (current.iban ? maskIban(current.iban) : "") !== (base.ibanMasked ?? ""));
  if (stale) {
    return { error: "Die Daten wurden inzwischen geändert. Bitte den Dialog schließen und neu öffnen." };
  }
  if (changes.iban && changes.iban === (current.iban ?? "").replace(/\s/g, "").toUpperCase()) delete changes.iban;
  if (Object.keys(changes).length === 0) return { error: "", unchanged: true };

  try {
    await saveMemberSecrets(admin, profileId, changes, { correctedBy: actorId });
  } catch (err) {
    if (err instanceof MemberSecretsConflictError) {
      return { error: "Die Daten wurden gerade an anderer Stelle geändert. Bitte erneut öffnen." };
    }
    console.error("correctMemberData:", err instanceof Error ? err.message : "unbekannt");
    return { error: "Korrektur konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/members");
  return { error: "" };
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

  const today = berlinToday();

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
