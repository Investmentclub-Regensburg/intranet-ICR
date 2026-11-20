"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isActiveMemberProfile, isAlumniProfile } from "@/lib/profile-status";
import {
  MemberSecretsConflictError,
  emptySecretValues,
  readMemberSecretsWithMeta,
  saveMemberSecrets,
  type MemberSecretValues,
} from "@/lib/member-secrets-server";
import { speichereNamen } from "@/lib/member-names-server";
import type { FeldFehler } from "@/lib/member-forms";
import { istAbfrageFaellig, spaeterBis } from "@/lib/member-data-check";
import { withinRateLimits } from "@/lib/bot-protection";
import {
  bestaetigeStand,
  bestaetigungsAenderungen,
  bewerteBestand,
  datenCheckEinstellungen,
  eingabeMitBestand,
  pruefeDatenCheckAenderung,
  type DatenBestand,
} from "@/lib/member-data-check-server";

/**
 * Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4). Jede Action liest frisch und prüft auf dem
 * Server neu (nie dem Browser glauben); geschrieben wird nur die eigene Zeile mit Service Role. Kein Mailversand.
 * Kein revalidatePath: Die Seite /daten-bestaetigen leitet ohne fällige Abfrage weiter und würde sonst vor dem Danke
 * verschwinden; der Browser geht danach selbst zum Rückkehrziel.
 */

export type DatenCheckState = {
  success: boolean;
  error: string;
  /** Meldungen je Feld (Mangel nach lib/member-rules.ts). */
  fehler?: FeldFehler;
  /**
   * Mit `fehler`: true = der ganze Bestand (danach) ist bewertet, `fehler` ist alles; false = nur Formularfehler
   * (siehe `pruefeDatenCheckAenderung`).
   */
  vollstaendig?: boolean;
};

const GEAENDERT_MELDUNG = "Deine Daten wurden inzwischen geändert. Bitte lade die Seite neu.";
const LESEN_MELDUNG = "Deine Daten können gerade nicht gelesen werden. Bitte wende dich an den Vorstand.";
const MAENGEL_MELDUNG = "Bitte korrigiere zuerst die markierten Angaben.";

type EigenesProfil = {
  id: string;
  profil: Record<string, unknown>;
  namen: { vorname: string | null; nachname: string | null };
};

type Geladen = EigenesProfil & {
  bestand: DatenBestand;
  version: number;
  landBekannt: boolean;
  alumni: boolean;
};

/** Eigenes Profil (wie updateProfile: user_id, sonst id = user_id) frisch mit Service Role. */
async function eigenesProfil(admin: SupabaseClient, userId: string): Promise<EigenesProfil | "fehler" | null> {
  const spalten = "id, Rolle, Status, Vorname, Nachname, daten_bestaetigt_am, daten_erinnern_ab";
  let { data, error } = await admin.from("profiles").select(spalten).eq("user_id", userId).maybeSingle();
  if (!data && !error) {
    const fallback = await admin.from("profiles").select(spalten).eq("id", userId).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    console.error("Datenabfrage: Profil", error.code);
    return "fehler";
  }
  const profil = (data ?? null) as Record<string, unknown> | null;
  const id = String(profil?.id ?? "").trim();
  if (!profil || !id) return null;
  return {
    id,
    profil,
    namen: {
      vorname: typeof profil.Vorname === "string" ? profil.Vorname : null,
      nachname: typeof profil.Nachname === "string" ? profil.Nachname : null,
    },
  };
}

async function lade(admin: SupabaseClient, userId: string): Promise<Geladen | DatenCheckState> {
  const p = await eigenesProfil(admin, userId);
  if (p === "fehler") return { success: false, error: "Profil konnte nicht geladen werden." };
  if (!p || !isActiveMemberProfile(p.profil)) return { success: false, error: "Kein passendes Profil gefunden." };
  try {
    const gelesen = await readMemberSecretsWithMeta(admin, p.id);
    const values: MemberSecretValues = gelesen?.values ?? emptySecretValues();
    return {
      ...p,
      bestand: { ...values, vorname: p.namen.vorname, nachname: p.namen.nachname },
      version: gelesen?.version ?? 0,
      landBekannt: gelesen ? gelesen.landBekannt : true,
      alumni: isAlumniProfile(p.profil),
    };
  } catch (err) {
    console.error("Datenabfrage: lesen", err instanceof Error ? err.message : "unbekannt");
    return { success: false, error: LESEN_MELDUNG };
  }
}

function istGeladen(x: Geladen | DatenCheckState): x is Geladen {
  return "bestand" in x;
}

/** Stand beim Öffnen des Fensters (Version + Name) gilt noch? */
function standPasst(g: Geladen, version: unknown, vornameVorher: unknown, nachnameVorher: unknown): boolean {
  if (typeof version !== "number" || !Number.isInteger(version) || version !== g.version) return false;
  return (
    String(vornameVorher ?? "") === (g.namen.vorname ?? "").trim() &&
    String(nachnameVorher ?? "") === (g.namen.nachname ?? "").trim()
  );
}

/** Verschlüsselte Felder (Versionssperre) und Name (Compare-and-set) speichern, dann bestätigen. */
async function speichereUndBestaetige(
  admin: SupabaseClient,
  g: Geladen,
  userId: string,
  secrets: Partial<MemberSecretValues>,
  namen: { vorname?: string; nachname?: string },
): Promise<DatenCheckState> {
  // Version nach dem eigenen Speichern: save_member_secrets erhöht sie um genau 1 (neue Zeile = 1).
  let erwartet = g.version;
  if (Object.keys(secrets).length > 0) {
    try {
      await saveMemberSecrets(admin, g.id, secrets, { erwarteteVersion: g.version });
      erwartet = g.version + 1;
    } catch (err) {
      if (err instanceof MemberSecretsConflictError) return { success: false, error: GEAENDERT_MELDUNG };
      console.error("Datenabfrage: speichern", err instanceof Error ? err.message : "unbekannt");
      return { success: false, error: "Änderungen konnten nicht gespeichert werden." };
    }
  }
  const ergebnis = await speichereNamen(admin, g.id, userId, g.namen, namen);
  if (ergebnis === "konflikt") return { success: false, error: GEAENDERT_MELDUNG };
  if (ergebnis === "fehler") return { success: false, error: "Dein Name konnte nicht gespeichert werden." };

  // Bestätigung nur für genau den geprüften Stand (Review A2): sonst „inzwischen geändert“.
  const bestaetigt = await bestaetigeStand(admin, g.id, erwartet);
  if (bestaetigt === "konflikt") return { success: false, error: GEAENDERT_MELDUNG };
  if (bestaetigt === "fehler") return { success: false, error: "Die Bestätigung konnte nicht gespeichert werden." };
  return { success: true, error: "" };
}

/**
 * „Stimmt alles“: Bestand frisch lesen und neu bewerten. Bei Mängeln nichts bestätigen. Sonst die normalisierten
 * Werte schreiben, soweit sie vom Gespeicherten abweichen (z. B. Handy E.164), und den Zeitstempel setzen.
 * `version`/`vornameVorher`/`nachnameVorher`: Stand beim Öffnen des Fensters (was die Person gesehen hat).
 */
export async function confirmMemberData(input: {
  version: number;
  vornameVorher: string;
  nachnameVorher: string;
}): Promise<DatenCheckState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const admin = createServiceClient();
  const g = await lade(admin, auth.user.id);
  if (!istGeladen(g)) return g;
  if (!standPasst(g, input?.version, input?.vornameVorher, input?.nachnameVorher)) {
    return { success: false, error: GEAENDERT_MELDUNG };
  }
  const b = bewerteBestand(g.bestand, g.alumni);
  if (!b.gueltig) return { success: false, error: MAENGEL_MELDUNG, fehler: b.fehler, vollstaendig: true };
  const { secrets, namen } = bestaetigungsAenderungen(g.bestand, b.werte, g.alumni, g.landBekannt);
  return speichereUndBestaetige(admin, g, auth.user.id, secrets, namen);
}

/**
 * „Ändern“ im Fenster: dieselben Regeln und Speicherwege wie das Profil (lib/member-forms.ts pruefeProfil,
 * saveMemberSecrets mit Versionssperre, speichereNamen), für beide Abschnitte zusammen. Gilt danach alles als
 * gültig, ist die Bestätigung erfolgt. Sonst wird nichts gespeichert und die Mängel stehen am Feld.
 */
export async function saveMemberDataCheck(formData: FormData): Promise<DatenCheckState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const admin = createServiceClient();
  const g = await lade(admin, auth.user.id);
  if (!istGeladen(g)) return g;

  const versionRaw = formData.get("version");
  const version = typeof versionRaw === "string" && /^\d{1,9}$/.test(versionRaw) ? Number(versionRaw) : null;
  if (version === null) return { success: false, error: "Ungültige Anfrage." };
  if (!standPasst(g, version, formData.get("vornameVorher"), formData.get("nachnameVorher"))) {
    return { success: false, error: GEAENDERT_MELDUNG };
  }

  // Die Seite schickt nur geänderte Felder; der Rest kommt aus dem frisch gelesenen Bestand.
  const eingabe = eingabeMitBestand((feld) => formData.get(feld), g.bestand);
  // Land unbekannt bestimmt nur der Server (gelesen ohne Spalte land), nie das Formular (Review A3).
  const landUnbekannt = !g.landBekannt;
  const r = pruefeDatenCheckAenderung(eingabe, g.bestand, g.alumni, landUnbekannt);
  if (!r.gueltig) {
    return { success: false, error: r.ersterFehler ?? MAENGEL_MELDUNG, fehler: r.fehler, vollstaendig: r.vollstaendig };
  }
  return speichereUndBestaetige(admin, g, auth.user.id, r.secrets, r.namen);
}

export type DatenCheckPruefung = {
  success: boolean;
  /** Meldungen je Feld nach denselben Regeln wie beim Speichern. */
  fehler: FeldFehler;
  /**
   * true: die Eingabe war als Formular gültig und der Bestand danach ist vollständig bewertet (`fehler` ist dann
   * alles). false: nur die Formularfehler; Mängel unveränderter Felder behält die Seite aus der ersten Bewertung.
   */
  vollstaendig: boolean;
};

/**
 * Prüfen während der Eingabe (beim Verlassen eines geänderten Felds): dieselbe Prüfung wie „Speichern“
 * (`pruefeDatenCheckAenderung`), aber ohne zu speichern. Liefert nur Meldungen je Feld, nie Werte. Eigenes
 * Rate-Limit (großzügig, je Konto), damit die Entschlüsselung nicht beliebig oft angestoßen werden kann.
 */
export async function pruefeMemberDataCheck(formData: FormData): Promise<DatenCheckPruefung> {
  const nichts: DatenCheckPruefung = { success: false, fehler: {}, vollstaendig: false };
  const auth = await requireUser();
  if (!auth.ok) return nichts;
  const erlaubt = await withinRateLimits([
    { scope: "data-check-pruefen", value: auth.user.id, max: 150, windowSeconds: 10 * 60 },
  ]);
  // Gebremst: einfach keine neue Bewertung (die Markierungen bleiben, „Speichern“ prüft ohnehin neu).
  if (!erlaubt) return nichts;
  const admin = createServiceClient();
  const g = await lade(admin, auth.user.id);
  if (!istGeladen(g)) return nichts;
  const eingabe = eingabeMitBestand((feld) => formData.get(feld), g.bestand);
  const r = pruefeDatenCheckAenderung(eingabe, g.bestand, g.alumni, !g.landBekannt);
  return { success: true, fehler: r.fehler, vollstaendig: r.vollstaendig };
}

/**
 * „Später“: nur, wenn die Abfrage fällig ist, die Daten gültig sind und die Grenze (4 Wochen nach Stichtag bzw.
 * Einschalten) nicht erreicht ist. Setzt daten_erinnern_ab auf jetzt + 7 Tage (höchstens bis zur Grenze).
 */
export async function postponeMemberDataCheck(): Promise<DatenCheckState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const admin = createServiceClient();
  const g = await lade(admin, auth.user.id);
  if (!istGeladen(g)) return g;

  const einstellungen = datenCheckEinstellungen();
  const jetzt = new Date();
  const faellig = istAbfrageFaellig({
    eingeschaltet: einstellungen.eingeschaltet,
    aktiv: true,
    bestaetigtAm: g.profil.daten_bestaetigt_am as string | null,
    erinnernAb: g.profil.daten_erinnern_ab as string | null,
    jetzt,
  });
  if (!faellig) return { success: true, error: "" };
  if (!bewerteBestand(g.bestand, g.alumni).gueltig) {
    return { success: false, error: MAENGEL_MELDUNG };
  }
  const bis = spaeterBis({ jetzt, start: einstellungen.start });
  if (!bis) return { success: false, error: "Später geht nicht mehr. Bitte bestätige deine Daten." };

  const { error } = await admin.from("profiles").update({ daten_erinnern_ab: bis.toISOString() }).eq("id", g.id);
  if (error) {
    console.error("Datenabfrage: später", error.code);
    return { success: false, error: "Das hat nicht geklappt. Bitte versuch es noch einmal." };
  }
  return { success: true, error: "" };
}
