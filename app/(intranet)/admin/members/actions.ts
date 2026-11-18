"use server";

import { revalidatePath } from "next/cache";
import { requireRole, roleOf } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isUuid } from "@/lib/validation";
import { berlinToday } from "@/lib/berlin-date";
import {
  MemberSecretsConflictError,
  emptySecretValues,
  readMemberSecretsMany,
  readMemberSecretsWithMeta,
  saveMemberSecrets,
  type MemberSecretValues,
  type MemberSecretsResult,
} from "@/lib/member-secrets-server";
import {
  KORREKTUR_FELDER,
  bicHinweis,
  korrekturWerte,
  pruefeKorrektur,
  type FeldFehler,
  type KorrekturWerte,
} from "@/lib/member-forms";
import { maskIban } from "@/components/profile/profile-format";
import { speichereNamen, type NamenStand } from "@/lib/member-names-server";
import { adminMitgliederZeilen, type AdminMemberRow } from "@/lib/member-overview";

export type { AdminMemberRow } from "@/lib/member-overview";

/** PostgREST-/Postgres-Fehler „Spalte daten_bestaetigt_am fehlt“ (Migration 20261118140000 noch nicht da). */
function fehltBestaetigtSpalte(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = String(error.message ?? "");
  return /daten_bestaetigt_am/.test(message) && (error.code === "42703" || /does not exist/i.test(message));
}

/**
 * Mitgliederliste für admin und Vorstand. Der Vorstand (board) bekommt zusätzlich je aktivem Mitglied die
 * NAMEN der Felder mit Mangel (`datenMaengel`, nie Werte); berechnet aus den ohnehin entschlüsselten Werten.
 * Für admin fehlt die Eigenschaft ganz (lib/member-overview.ts).
 */
export async function getAdminMembers(): Promise<AdminMemberRow[]> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return [];

  const admin = createServiceClient();

  const spalten = 'id, Vorname, Nachname, "Studiengang / Fach", "E-Mail", Rolle, Status';
  const lesen = (mitBestaetigung: boolean) =>
    admin
      .from("profiles")
      .select(mitBestaetigung ? `${spalten}, daten_bestaetigt_am` : spalten)
      .order("Nachname", { ascending: true })
      .order("Vorname", { ascending: true });

  let bestaetigtBekannt = true;
  let { data, error } = await lesen(true);
  if (error && fehltBestaetigtSpalte(error)) {
    // Übergang: App vor der Migration. Liste ohne Filter „Nicht bestätigt“ statt leerer Seite.
    console.warn("getAdminMembers: Spalte daten_bestaetigt_am fehlt (Migration 20261118140000), Liste ohne Bestätigungsstand");
    bestaetigtBekannt = false;
    ({ data, error } = await lesen(false));
  }
  if (error) return [];
  const profiles = (data ?? []) as unknown as Record<string, unknown>[];

  // Handynummer und Mängel aus member_secrets (verschlüsselt).
  let secrets: Map<string, MemberSecretsResult> | null = null;
  try {
    secrets = await readMemberSecretsMany(
      admin,
      profiles.map((p) => ({ id: String(p.id ?? "") }))
    );
  } catch (err) {
    console.error("getAdminMembers: member_secrets", err instanceof Error ? err.message : "unbekannt");
  }

  return adminMitgliederZeilen(profiles, secrets, { vorstand: auth.role === "board", bestaetigtBekannt });
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

/**
 * Daten für den Korrekturdialog (Vorstand). Handy aufgeteilt in Länderauswahl + Nummer (Altwerte roh mit DE),
 * Land der Anschrift mit Standard DE. Die IBAN nur gekürzt – ersetzt wird sie durch Neueingabe.
 */
export type MemberCorrectionData = KorrekturWerte & {
  name: string;
  ibanMasked: string;
  /** Nicht blockierender Hinweis zur BIC (Land weicht von der IBAN ab), sonst null. */
  bicHinweis: string | null;
  /** Version der verschlüsselten Zeile beim Öffnen (0 = keine): optimistische Sperre. */
  version: number;
  /** Ohne Spalte land geladen (Übergang): ein übermitteltes Land wird ignoriert. */
  landUnbekannt: boolean;
};

export type MemberCorrectionInput = Record<keyof KorrekturWerte, string> & {
  /** Neue IBAN; leer = unverändert. */
  iban: string;
};

async function loadCorrectionValues(
  admin: ReturnType<typeof createServiceClient>,
  profileId: string
): Promise<
  | { name: string; namen: NamenStand; userId: string | null; values: MemberSecretValues; version: number; landBekannt: boolean }
  | { error: string }
> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select('"Vorname", "Nachname", user_id')
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("loadCorrectionValues:", error.code);
    return { error: "Mitglied konnte nicht geladen werden." };
  }
  if (!profile) return { error: "Mitglied nicht gefunden." };
  const p = profile as unknown as Record<string, unknown>;
  const name = [p.Vorname, p.Nachname].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || "—";
  const namen: NamenStand = {
    vorname: typeof p.Vorname === "string" ? p.Vorname : null,
    nachname: typeof p.Nachname === "string" ? p.Nachname : null,
  };
  const userId = typeof p.user_id === "string" ? p.user_id : null;
  try {
    const gelesen = await readMemberSecretsWithMeta(admin, profileId);
    return {
      name,
      namen,
      userId,
      values: gelesen?.values ?? emptySecretValues(),
      version: gelesen?.version ?? 0,
      landBekannt: gelesen?.landBekannt ?? true,
    };
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
      ...korrekturWerte({ ...v, ...loaded.namen }),
      ibanMasked: v.iban ? maskIban(v.iban) : "",
      bicHinweis: bicHinweis(v.bic, v.iban),
      version: loaded.version,
      landUnbekannt: !loaded.landBekannt,
    },
  };
}

const GEAENDERT_MELDUNG = "Die Daten wurden inzwischen geändert. Bitte den Dialog schließen und neu öffnen.";

/** Nur Zeichenketten aus dem Client übernehmen (feste Feldliste). */
function korrekturText(obj: unknown, feld: string): string {
  const v = obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, feld)
    ? (obj as Record<string, unknown>)[feld]
    : undefined;
  return typeof v === "string" ? v : "";
}

/**
 * Korrektur der verschlüsselten Mitgliedsdaten durch den Vorstand (z. B. Geburtsdatum, Tippfehler in der
 * Adresse). Geprüft wird nur über lib/member-rules.ts (`pruefeVorstandskorrektur` über lib/member-forms.ts):
 * nur die Felder, die der Vorstand gegenüber `base` (Werte beim Öffnen) geändert hat; alte Fehler in anderen
 * Feldern blockieren nicht. Gespeichert werden die normalisierten Werte – und nur, wenn die Felder in der
 * Datenbank noch `base` entsprechen (sonst hätte z. B. das Mitglied inzwischen geändert). Protokoll in
 * member_data_corrections (nur Feldnamen).
 */
export async function correctMemberData(
  profileId: string,
  input: MemberCorrectionInput,
  base: MemberCorrectionData
): Promise<{ error: string; unchanged?: boolean; fehler?: FeldFehler }> {
  const auth = await requireRole(["board"], "Nur der Vorstand darf Mitgliedsdaten korrigieren.");
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(profileId) || !input || typeof input !== "object" || !base || typeof base !== "object") {
    return { error: "Ungültige Auswahl." };
  }
  const actorId = String(auth.profile?.id ?? "");
  if (!isUuid(actorId)) return { error: "Dein Profil konnte nicht zugeordnet werden." };

  const eingabe = {} as MemberCorrectionInput;
  const basis = {} as KorrekturWerte;
  for (const feld of KORREKTUR_FELDER) {
    eingabe[feld] = korrekturText(input, feld);
    basis[feld] = korrekturText(base, feld);
  }
  eingabe.iban = korrekturText(input, "iban");
  const baseVersion = (base as { version?: unknown }).version;
  if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 0) {
    return { error: "Ungültige Auswahl." };
  }

  const admin = createServiceClient();
  const loaded = await loadCorrectionValues(admin, profileId);
  if ("error" in loaded) return loaded;
  const current = loaded.values;

  // Optimistische Sperre: Seit dem Öffnen darf sich nichts geändert haben (z. B. durch das Mitglied). Für die
  // verschlüsselten Felder über die Version, für den Namen (Klartext ohne Version) über den Namen selbst.
  if (loaded.version !== baseVersion) return { error: GEAENDERT_MELDUNG };
  if (
    basis.vorname !== (loaded.namen.vorname ?? "").trim() ||
    basis.nachname !== (loaded.namen.nachname ?? "").trim()
  ) {
    return { error: GEAENDERT_MELDUNG };
  }

  const landUnbekannt = (base as { landUnbekannt?: unknown }).landUnbekannt === true || !loaded.landBekannt;
  const pruefung = pruefeKorrektur(eingabe, basis, { ...current, ...loaded.namen }, undefined, landUnbekannt);
  if (!pruefung.gueltig) {
    return { error: pruefung.ersterFehler ?? "Bitte prüf die Angaben.", fehler: pruefung.fehler };
  }
  const namenGeaendert = Object.keys(pruefung.namen).length > 0;
  if (Object.keys(pruefung.aenderungen).length === 0 && !namenGeaendert) return { error: "", unchanged: true };

  if (Object.keys(pruefung.aenderungen).length > 0) {
    try {
      await saveMemberSecrets(admin, profileId, pruefung.aenderungen, {
        correctedBy: actorId,
        erwarteteVersion: baseVersion,
      });
    } catch (err) {
      if (err instanceof MemberSecretsConflictError) return { error: GEAENDERT_MELDUNG };
      console.error("correctMemberData:", err instanceof Error ? err.message : "unbekannt");
      return { error: "Korrektur konnte nicht gespeichert werden." };
    }
  }

  if (namenGeaendert) {
    // Protokoll (nur Feldnamen vorname/nachname) schreibt speichereNamen.
    const ergebnis = await speichereNamen(admin, profileId, loaded.userId, loaded.namen, pruefung.namen, {
      correctedBy: actorId,
    });
    if (ergebnis === "konflikt") return { error: GEAENDERT_MELDUNG };
    if (ergebnis === "fehler") return { error: "Der Name konnte nicht gespeichert werden." };
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
