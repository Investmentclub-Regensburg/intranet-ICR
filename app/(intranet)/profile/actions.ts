"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isAlumniProfile, isCancelledProfile } from "@/lib/profile-status";
import {
  MemberSecretsConflictError,
  emptySecretValues,
  readMemberSecretsWithMeta,
  saveMemberSecrets,
} from "@/lib/member-secrets-server";
import { pruefeProfil, type FeldFehler, type ProfilAbschnitt } from "@/lib/member-forms";
import { speichereNamen } from "@/lib/member-names-server";
import { speichereStudiengang, studiengangAusProfil, studiengangStandPasst } from "@/lib/member-studiengang-server";
import { studiengangAenderung } from "@/lib/studiengaenge";
import { CANCELLATION_TEXT_MAX, isCancellationReason } from "@/lib/cancellation-reasons";
import { authErrorMessage } from "@/lib/auth-messages";
import { RATE_LIMITED_MESSAGE, withinRateLimits } from "@/lib/bot-protection";
import { isValidEmail } from "@/lib/events";
import {
  KEINE_AENDERUNG,
  SENDE_ABSTAND_SEKUNDEN,
  emailChangeStand,
  type EmailChangeRow,
  type EmailChangeStand,
} from "@/lib/email-change";

export type ProfileActionState = {
  success: boolean;
  error: string;
};

export type ProfileDataState = ProfileActionState & {
  /** Meldungen je Feld (Mangel nach lib/member-rules.ts). */
  fehler?: FeldFehler;
};

const GEAENDERT_MELDUNG = "Deine Daten wurden inzwischen geändert. Bitte lade die Seite neu.";

/** Felder je Abschnitt, wie sie das Formular sendet. */
const FORM_FIELDS: Record<ProfilAbschnitt, readonly string[]> = {
  personal: ["vorname", "nachname", "strasse", "hausnummer", "plz", "ort", "land", "handyLand", "handynummer", "geburtsdatum"],
  bank: ["iban"],
};

/**
 * Profil speichern (eigene Daten). Geprüft wird nur über lib/member-rules.ts (lib/member-forms.ts,
 * Kontext `mitglied`), gespeichert werden die normalisierten Werte des bearbeiteten Abschnitts
 * (`section` = personal | bank). Pflichtfelder lassen sich nicht leeren. Name und Geburtsdatum ändert das
 * Mitglied selbst (Entscheidung Hannes 11). Sperren: Version der verschlüsselten Zeile und der Name beim Laden
 * des Formulars (`vornameVorher`/`nachnameVorher`).
 *
 * Studiengang (Abschnitt personal, Klartext in profiles): Auswahl wie bei der Registrierung (`studiengang`,
 * `studiengangSonstiges`), Sperre über `studiengangVorher`. Nur eine geänderte Auswahl wird geprüft und gespeichert
 * (studiengangAenderung); ein unveränderter Altwert bleibt stehen. Eigene Änderung: kein Protokolleintrag.
 */
export async function updateProfile(
  _prev: ProfileDataState,
  formData: FormData
): Promise<ProfileDataState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const user = auth.user;

  const section = formData.get("section");
  if (section !== "personal" && section !== "bank") {
    return { success: false, error: "Ungültige Anfrage." };
  }

  // Für Updates nutzen wir den Service-Role-Client (Ziel ist ausschließlich die eigene Zeile über user.id).
  const admin = createServiceClient();

  // Zuerst den passenden Profil-Datensatz auflösen (analog zur Kündigungs-Logik)
  let { data: profileRow, error: profileLookupError } = await admin
    .from("profiles")
    .select('id, Rolle, Status, Vorname, Nachname, "Studiengang / Fach"')
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow && !profileLookupError) {
    const fallback = await admin
      .from("profiles")
      .select('id, Rolle, Status, Vorname, Nachname, "Studiengang / Fach"')
      .eq("id", user.id)
      .maybeSingle();
    profileRow = fallback.data;
    profileLookupError = fallback.error;
  }

  if (profileLookupError) {
    console.error("Profil laden:", profileLookupError.code);
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const profile = (profileRow ?? null) as Record<string, unknown> | null;
  const profileId = String(profile?.id ?? "").trim();
  if (!profileId) {
    return {
      success: false,
      error:
        "Kein passender Profil-Datensatz gefunden. Bitte kontaktiere den Vorstand/Support.",
    };
  }

  // Optimistische Sperre: Version beim Laden des Formulars (0 = noch keine Zeile).
  const versionRaw = formData.get("version");
  const erwarteteVersion = typeof versionRaw === "string" && /^\d{1,9}$/.test(versionRaw) ? Number(versionRaw) : null;
  if (erwarteteVersion === null) return { success: false, error: "Ungültige Anfrage." };

  let bestand;
  let version = 0;
  // Seite oder jetziges Lesen ohne Spalte land (Übergang): übermitteltes Land nicht speichern (sonst würde die
  // Vorgabe DE ein gespeichertes Land überschreiben).
  let landUnbekannt = formData.get("landUnbekannt") === "1";
  try {
    const gelesen = await readMemberSecretsWithMeta(admin, profileId);
    bestand = gelesen?.values ?? emptySecretValues();
    version = gelesen?.version ?? 0;
    if (gelesen && !gelesen.landBekannt) landUnbekannt = true;
  } catch (err) {
    console.error("updateProfile: lesen", err instanceof Error ? err.message : "unbekannt");
    return { success: false, error: "Deine Daten können gerade nicht gelesen werden. Bitte wende dich an den Vorstand." };
  }

  if (version !== erwarteteVersion) return { success: false, error: GEAENDERT_MELDUNG };
  // Name im Klartext: Stand beim Laden des Formulars muss noch gelten.
  const namenVorher = {
    vorname: typeof profile?.Vorname === "string" ? profile.Vorname : null,
    nachname: typeof profile?.Nachname === "string" ? profile.Nachname : null,
  };
  if (
    section === "personal" &&
    (String(formData.get("vornameVorher") ?? "") !== (namenVorher.vorname ?? "").trim() ||
      String(formData.get("nachnameVorher") ?? "") !== (namenVorher.nachname ?? "").trim())
  ) {
    return { success: false, error: GEAENDERT_MELDUNG };
  }

  // Studiengang (nur Abschnitt personal): Stand beim Laden muss noch gelten, dann nur eine geänderte Auswahl prüfen.
  const studiengangVorher = studiengangAusProfil(profile);
  if (section === "personal" && !studiengangStandPasst(formData.get("studiengangVorher"), studiengangVorher)) {
    return { success: false, error: GEAENDERT_MELDUNG };
  }
  const studiengang =
    section === "personal"
      ? studiengangAenderung(studiengangVorher, formData.get("studiengang"), formData.get("studiengangSonstiges"))
      : ({ art: "unveraendert" } as const);

  const eingabe: Record<string, unknown> = {};
  for (const key of FORM_FIELDS[section]) eingabe[key] = formData.get(key);
  const pruefung = pruefeProfil(
    section,
    { ...eingabe },
    { ...bestand, vorname: namenVorher.vorname, nachname: namenVorher.nachname },
    isAlumniProfile(profile),
    undefined,
    landUnbekannt
  );
  if (!pruefung.gueltig || studiengang.art === "fehler") {
    const fehler: FeldFehler = { ...pruefung.fehler };
    if (studiengang.art === "fehler") fehler[studiengang.feld] = studiengang.fehler;
    const erster =
      pruefung.ersterFehler ?? (studiengang.art === "fehler" ? studiengang.fehler : null) ?? "Bitte prüf deine Angaben.";
    return { success: false, error: erster, fehler };
  }
  // Ohne Änderung wird nichts geschrieben (keine neue Version, kein Protokoll).
  const namenGeaendert = Object.keys(pruefung.namen).length > 0;
  if (Object.keys(pruefung.aenderungen).length === 0 && !namenGeaendert && studiengang.art !== "neu") {
    return { success: true, error: "" };
  }

  // Verschlüsselt speichern (member_secrets). IBAN-Änderungen erkennt saveMemberSecrets selbst und meldet sie
  // dem Vorstand. Nur die Felder des Abschnitts: eine zwischenzeitliche Korrektur des Vorstands im anderen
  // Abschnitt bleibt erhalten.
  if (Object.keys(pruefung.aenderungen).length > 0) {
    try {
      await saveMemberSecrets(admin, profileId, pruefung.aenderungen, { erwarteteVersion });
    } catch (err) {
      if (err instanceof MemberSecretsConflictError) return { success: false, error: GEAENDERT_MELDUNG };
      console.error("updateProfile:", err instanceof Error ? err.message : "unbekannt");
      return { success: false, error: "Änderungen konnten nicht gespeichert werden." };
    }
  }

  if (namenGeaendert) {
    const ergebnis = await speichereNamen(admin, profileId, user.id, namenVorher, pruefung.namen);
    if (ergebnis === "konflikt") return { success: false, error: GEAENDERT_MELDUNG };
    if (ergebnis === "fehler") return { success: false, error: "Dein Name konnte nicht gespeichert werden." };
    // Name steht auch in Kopfzeile und Seitenleiste.
    revalidatePath("/", "layout");
  }

  if (studiengang.art === "neu") {
    // Ohne Vorstand: kein Protokolleintrag (eigene Änderung, siehe Datenschutzerklärung).
    const ergebnis = await speichereStudiengang(admin, profileId, studiengangVorher, studiengang.wert);
    if (ergebnis === "konflikt") return { success: false, error: GEAENDERT_MELDUNG };
    if (ergebnis === "fehler") return { success: false, error: "Dein Studiengang konnte nicht gespeichert werden." };
  }

  revalidatePath("/profile");
  return { success: true, error: "" };
}

export async function cancelMembership(input?: {
  reason?: string | null;
  reasonText?: string | null;
}): Promise<ProfileActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const user = auth.user;
  const supabase = await getCachedSupabase();

  // Grund ist freiwillig; nur bekannte Werte, Freitext gekürzt.
  const reason = isCancellationReason(input?.reason) ? input.reason : null;
  const reasonText = String(input?.reasonText ?? "").trim().slice(0, CANCELLATION_TEXT_MAX) || null;

  const admin = createServiceClient();

  // 1) Zielprofil robust auflösen (RLS-unabhängig via Service-Role).
  let { data: profileRow, error: profileLookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow && !profileLookupError) {
    const fallback = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    profileRow = fallback.data;
    profileLookupError = fallback.error;
  }

  if (profileLookupError) {
    console.error("Profil laden:", profileLookupError.code);
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const row = (profileRow ?? null) as Record<string, unknown> | null;
  const profileId = String(row?.id ?? "").trim();
  if (!profileId) {
    return {
      success: false,
      error:
        "Kein passender Profil-Datensatz gefunden. Bitte kontaktiere den Vorstand/Support.",
    };
  }

  // 2) In einem Schritt: Grund speichern, Status/Datum setzen, Bestätigungsmail einreihen (Datum und
  //    Beitragsstopp rechnet die Datenbank aus dem Berliner Datum). Vorstandsmail und Sperre des Kontos
  //    lösen Trigger aus.
  const { error: cancelError } = await admin.rpc("cancel_membership", {
    p_profile_id: profileId,
    p_reason: reason,
    p_reason_text: reasonText,
  });

  if (cancelError) {
    const message = String(cancelError.message ?? "");
    if (message.includes("letztes Vorstandsmitglied")) {
      return {
        success: false,
        error: "Du bist das letzte aktive Vorstandsmitglied. Bitte übergib das Amt, bevor du kündigst.",
      };
    }
    // Bereits gekündigt (z. B. Doppelklick): wie erfolgreich behandeln und abmelden.
    if (!message.includes("bereits gekündigt")) {
      console.error("cancelMembership:", cancelError.code);
      return { success: false, error: "Die Kündigung konnte nicht gespeichert werden." };
    }
  }

  // 3) Session beenden
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("cancelMembership (Abmeldung):", signOutError.code ?? signOutError.status);
    return {
      success: false,
      error: "Kündigung gespeichert, aber Abmeldung fehlgeschlagen. Bitte melde dich manuell ab.",
    };
  }

  // 4) Layout-Cache invalidieren
  revalidatePath("/", "layout");

  // 5) Harte Weiterleitung zum Login
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Alumni-Status beantragen
// ---------------------------------------------------------------------------

export type AlumniRequestStatus = "none" | "pending" | "approved" | "rejected";

/** Status des letzten Alumni-Antrags des eingeloggten Nutzers (RLS: nur eigene Zeilen). */
export async function getAlumniRequestStatus(): Promise<AlumniRequestStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "none";

  const { data, error } = await supabase
    .from("alumni_requests")
    .select("status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "none";

  const status = String((data as { status?: unknown }).status ?? "").trim().toLowerCase();
  if (status === "pending" || status === "approved" || status === "rejected") return status;
  return "none";
}

/**
 * Legt einen Alumni-Antrag an. Der DB-Trigger auf alumni_requests benachrichtigt den Vorstand.
 * Läuft bewusst über den User-Client (RLS: auth.uid() = user_id).
 */
export async function requestAlumniStatus(): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht eingeloggt." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select('id, Vorname, Nachname, "E-Mail", Rolle, Status')
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      success: false,
      error: "Profil nicht gefunden. Bitte kontaktiere den Vorstand.",
    };
  }

  const raw = profile as Record<string, unknown>;
  const rolle = String(raw.Rolle ?? "").trim().toLowerCase();
  if (rolle === "alumni") {
    return { success: false, error: "Du bist bereits Alumni." };
  }
  if (isCancelledProfile(raw)) {
    return {
      success: false,
      error: "Für gekündigte Mitgliedschaften kann kein Alumni-Status beantragt werden.",
    };
  }

  const email = String(raw["E-Mail"] ?? user.email ?? "").trim();
  if (!email) {
    return { success: false, error: "E-Mail im Profil fehlt." };
  }

  const { error } = await supabase.from("alumni_requests").insert({
    user_id: user.id,
    profile_id: String(raw.id ?? "") || null,
    vorname: String(raw.Vorname ?? "").trim(),
    nachname: String(raw.Nachname ?? "").trim(),
    email,
  });

  if (error) {
    // Partial Unique Index: nur ein offener Antrag pro Nutzer.
    if (error.code === "23505") {
      return { success: false, error: "Du hast bereits einen offenen Antrag gestellt." };
    }
    console.error("requestAlumniStatus:", error);
    return { success: false, error: "Antrag konnte nicht gespeichert werden." };
  }

  revalidatePath("/profile");
  revalidatePath("/admin/alumni-requests");
  return { success: true, error: "" };
}

export type EmailChangeState = ProfileActionState & {
  /** Neue Adresse, an die die Bestätigung ging (bis zur Bestätigung „ausstehend“). */
  pendingEmail?: string;
  /** Stand der Bestätigung nach der Anfrage (beide Postfächer offen). */
  stand?: EmailChangeStand;
};

/** Stand einer Änderung für das Fenster: aktuelle Adresse, wartende neue Adresse, bestätigte Postfächer. */
export type EmailChangeInfo = {
  email: string;
  neueAdresse: string | null;
  stand: EmailChangeStand;
};

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Liest den Stand über public.email_change_stand() (nur eigenes Konto, nur Booleans/Zahl). Fehlt die Funktion
 * (Migration noch nicht eingespielt), gilt eine wartende Adresse als „0 von 2“, damit das Fenster trotzdem geht.
 */
async function leseEmailChange(supabase: SupabaseServer, email: string, neueAdresse: string | null): Promise<EmailChangeInfo> {
  const pending = neueAdresse && neueAdresse !== email ? neueAdresse : null;
  if (!pending) return { email, neueAdresse: null, stand: KEINE_AENDERUNG };
  const { data, error } = await supabase.rpc("email_change_stand");
  if (error) {
    console.error("emailChangeStand:", error.code);
    return {
      email,
      neueAdresse: pending,
      stand: emailChangeStand({ offen: true, alt_bestaetigt: false, neu_bestaetigt: false, gesendet_vor_sekunden: null }, pending),
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as EmailChangeRow | null | undefined;
  const stand = emailChangeStand(row, pending);
  return { email, neueAdresse: stand.offen ? pending : null, stand };
}

/** Aktueller Stand der eigenen Änderung (Profil beim Laden, Fenster fragt nach, solange es offen ist). */
export async function readEmailChange(): Promise<EmailChangeInfo | null> {
  const auth = await requireUser();
  if (!auth.ok) return null;
  const supabase = await getCachedSupabase();
  return leseEmailChange(supabase, auth.user.email ?? "", auth.user.new_email ?? null);
}

/**
 * Beide Bestätigungsmails noch einmal senden. GoTrue erzeugt dabei neue Links für beide Adressen und setzt den
 * Stand auf „0 von 2“ zurück (sendEmailChange); alte Links gelten nicht mehr. Die Sendebremse von GoTrue
 * (GOTRUE_SMTP_MAX_FREQUENCY) prüfen wir vorher selbst, damit die Meldung die Wartezeit nennen kann.
 */
export async function resendEmailChange(): Promise<ProfileActionState & { info?: EmailChangeInfo; wartenSekunden?: number }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const supabase = await getCachedSupabase();
  const vorher = await leseEmailChange(supabase, auth.user.email ?? "", auth.user.new_email ?? null);
  if (!vorher.neueAdresse) {
    return { success: false, error: "Es wartet keine Änderung mehr. Starte sie bitte neu.", info: vorher };
  }
  if (vorher.stand.erneutInSekunden > 0) {
    return { success: false, error: "", wartenSekunden: vorher.stand.erneutInSekunden, info: vorher };
  }

  const allowed = await withinRateLimits([
    { scope: "email-change-resend", value: auth.user.id, max: 5, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { success: false, error: RATE_LIMITED_MESSAGE, info: vorher };

  const { error } = await supabase.auth.updateUser({ email: vorher.neueAdresse });
  if (error) {
    if (error.code === "email_exists") return { success: false, error: EMAIL_TAKEN_MESSAGE, info: vorher };
    console.error("resendEmailChange:", error.code ?? error.status);
    return {
      success: false,
      error: authErrorMessage(error, "Die Mails konnten nicht gesendet werden. Bitte versuch es später erneut."),
      info: vorher,
    };
  }
  return {
    success: true,
    error: "",
    info: { ...vorher, stand: { ...KEINE_AENDERUNG, offen: true, erneutInSekunden: SENDE_ABSTAND_SEKUNDEN } },
  };
}

/**
 * E-Mail-Adresse ändern: startet die Änderung im Auth-Konto. Supabase schickt die Bestätigungsmail
 * (Vorlage „Change Email Address“, bei „Secure email change“ an alte und neue Adresse); erst nach der
 * Bestätigung ändert sich die Adresse. Das Profil zieht der Trigger on_auth_user_email_changed nach.
 */
export async function requestEmailChange(formData: FormData): Promise<EmailChangeState> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const user = auth.user;

  const email = String(formData.get("email") ?? "").normalize("NFC").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { success: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
  }
  // Beidseitig NFC + klein (Regeln für Aufrufer, Punkt 6).
  if (email === (user.email ?? "").normalize("NFC").trim().toLowerCase()) {
    return { success: false, error: "Das ist bereits deine aktuelle E-Mail-Adresse." };
  }

  const allowed = await withinRateLimits([
    { scope: "email-change", value: user.id, max: 5, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { success: false, error: RATE_LIMITED_MESSAGE };

  // Adresse eines anderen Profils: sonst könnte das Profil nach der Bestätigung nicht nachziehen.
  const admin = createServiceClient();
  // Groß-/Kleinschreibung egal (ilike, Platzhalter maskiert); „*“ ist für PostgREST ebenfalls ein Platzhalter,
  // dann exakt vergleichen (Supabase speichert Adressen klein).
  const byEmail = admin.from("profiles").select("id");
  const { data: taken, error: takenError } = await (email.includes("*")
    ? byEmail.eq("E-Mail", email)
    : byEmail.ilike("E-Mail", email.replace(/([\\%_])/g, "\\$1"))
  )
    .neq("user_id", user.id)
    .limit(1);
  if (takenError) {
    console.error("requestEmailChange: Prüfung", takenError.code);
    return { success: false, error: "Die Änderung konnte gerade nicht gestartet werden. Bitte versuch es später erneut." };
  }
  if (taken && taken.length > 0) {
    return { success: false, error: EMAIL_TAKEN_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    if (error.code === "email_exists") return { success: false, error: EMAIL_TAKEN_MESSAGE };
    console.error("requestEmailChange:", error.code ?? error.status);
    return {
      success: false,
      error: authErrorMessage(error, "Die Änderung konnte nicht gestartet werden. Bitte versuch es später erneut."),
    };
  }

  revalidatePath("/profile");
  return {
    success: true,
    error: "",
    pendingEmail: email,
    stand: { ...KEINE_AENDERUNG, offen: true, erneutInSekunden: SENDE_ABSTAND_SEKUNDEN },
  };
}

const EMAIL_TAKEN_MESSAGE = "Diese E-Mail-Adresse wird bereits von einem anderen Konto verwendet.";
