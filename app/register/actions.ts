"use server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { assertKeyRegistered, buildRegistrationSecrets, type MemberSecretValues } from "@/lib/member-secrets-server";
import { DEFAULT_COUNTRY, countryFromSelectValue } from "@/lib/country-codes";
import { FIELD_LIMITS, checkText } from "@/lib/member-fields";
import {
  REGISTRIERUNG_SCHRITTE,
  istRegistrierungSchritt,
  pruefeRegistrierung,
  pruefeRegistrierungSchritt,
  type FeldFehler,
} from "@/lib/member-forms";
import { authErrorMessage, checkPasswordLength } from "@/lib/auth-messages";
import { isPendingProfile } from "@/lib/profile-status";
import { RATE_LIMITED_MESSAGE, checkTurnstile, clientIp, withinRateLimits } from "@/lib/bot-protection";

/** Bei Fehler zurückgegebene Formulardaten (ohne Passwörter) für erneute Anzeige. */
export type RegisterSavedState = {
  vorname: string;
  nachname: string;
  email: string;
  geburtstag: string;
  strasse: string;
  hausnummer: string;
  ort: string;
  plz: string;
  /** Land der Anschrift (ISO). */
  land: string;
  /** Land der Handy-Vorwahl (ISO). */
  landesvorwahl: string;
  handynummer: string;
  student: string;
  studiengang: string;
  abschluss: string;
  semester: string;
  iban: string;
  bic: string;
  hochschultyp: string;
  sepa: boolean;
};

export type RegisterActionState = {
  error: string;
  /** Meldungen je Feld (lib/member-rules.ts), Schlüssel = Feldname der Regeln. */
  fieldErrors?: FeldFehler;
  redirect?: string;
  saved?: RegisterSavedState;
  confirmationMessage?: string;
};

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const text = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };
  const email = text("email").trim();
  const password = text("password");
  const passwordRepeat = text("passwordRepeat");
  const vorname = text("vorname").trim();
  const nachname = text("nachname").trim();
  const geburtstagRaw = text("geburtstag").trim();
  const strasse = text("strasse").trim();
  const hausnummer = text("hausnummer").trim();
  const ort = text("ort").trim();
  const plz = text("plz").trim();
  const landRaw = text("land").trim();
  // Die Auswahl liefert den ISO-Code (eindeutig auch für +1); alte Formulare schicken noch die Vorwahl.
  const handyLand = countryFromSelectValue(text("landesvorwahl") || DEFAULT_COUNTRY);
  const handynummerRaw = text("handynummer").trim();
  const student = text("student");
  const studiengang = text("studiengang").trim();
  const abschluss = text("abschluss").trim();
  const semester = text("semester").trim();
  const iban = text("iban").trim();
  const bic = text("bic").trim();
  const hochschultyp = text("hochschultyp");
  const sepa = formData.get("sepa") === "on";

  /** Bei Fehler zurückgeben, damit die Eingaben im Formular erhalten bleiben (keine Passwörter). */
  const saved: RegisterSavedState = {
    vorname,
    nachname,
    email,
    geburtstag: geburtstagRaw,
    strasse,
    hausnummer,
    ort,
    plz,
    land: landRaw || DEFAULT_COUNTRY,
    landesvorwahl: handyLand ?? DEFAULT_COUNTRY,
    handynummer: handynummerRaw,
    student,
    studiengang,
    abschluss,
    semester,
    iban,
    bic,
    hochschultyp,
    sepa,
  };

  // Mitgliederdaten ausschließlich nach lib/member-rules.ts (Kontext „registrierung“): Pflichtfelder,
  // Formate, E-Mail (isValidEmail), Handy → E.164, IBAN nur SEPA, BIC optional, PLZ je Land.
  const pruefung = pruefeRegistrierung({
    vorname,
    nachname,
    email,
    geburtsdatum: geburtstagRaw,
    strasse,
    hausnummer,
    plz,
    ort,
    land: landRaw || DEFAULT_COUNTRY,
    // Unbekannter Wert der Auswahl: Rohwert weitergeben, die Regel meldet ihn.
    handyLand: handyLand ?? text("landesvorwahl"),
    handynummer: handynummerRaw,
    iban,
    bic,
  });
  if (!pruefung.gueltig) {
    return { error: pruefung.ersterFehler ?? "Bitte prüf deine Angaben.", fieldErrors: pruefung.fehler, saved };
  }

  // Übrige Pflichtangaben (Passwort, Studium)
  const required: Record<string, unknown> = { password, passwordRepeat, student };
  // Studiendaten sind nur Pflicht, wenn "Student = Ja"
  if (student === "Ja") {
    required.studiengang = studiengang;
    required.abschluss = abschluss;
    required.semester = semester;
    required.hochschultyp = hochschultyp;
  }
  if (Object.values(required).some((v) => !v)) {
    return { error: "Bitte alle Pflichtfelder ausfüllen.", saved };
  }

  if (!sepa) {
    return { error: "Die SEPA-Bestätigung ist erforderlich.", saved };
  }

  const fieldError =
    checkText(studiengang, "Studiengang", FIELD_LIMITS.studium) ??
    checkText(abschluss, "Abschluss", FIELD_LIMITS.studium) ??
    checkText(hochschultyp, "Hochschulart", FIELD_LIMITS.studium);
  if (fieldError) {
    return { error: fieldError, saved };
  }

  if (password !== passwordRepeat) {
    return { error: "Die Passwörter stimmen nicht überein.", saved };
  }

  const passwordError = checkPasswordLength(password);
  if (passwordError) {
    return { error: passwordError, saved };
  }

  const semesterNumber = Number(semester);
  if (
    student === "Ja" &&
    (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 99)
  ) {
    return { error: "Bitte gib ein gültiges Semester als Zahl ein.", saved };
  }

  // Bremse gegen Massen-Registrierungen je IP, dann Turnstile (VOR signUp).
  const allowed = await withinRateLimits([
    { scope: "signup-ip", value: await clientIp(), max: 5, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { error: RATE_LIMITED_MESSAGE, saved };

  const captcha = await checkTurnstile(formData);
  if (!captcha.ok) return { error: captcha.error, saved };

  // Die Datenbank nimmt sensible Registrierungsdaten nur verschlüsselt an. Deshalb VOR dem Anlegen des
  // Kontos prüfen, dass verschlüsselt werden kann – sonst entstünde ein Konto ohne Angaben.
  if (!(await canStoreRegistrationData())) {
    return {
      error: "Die Registrierung ist gerade nicht möglich. Bitte versuche es später erneut oder melde dich beim Vorstand.",
      saved,
    };
  }

  const supabase = await createClient();

  // Keys exakt wie vom SQL-Trigger erwartet (provision_profile_for_auth_user). Geprüfte, getrimmte
  // Werte übergeben (nicht die Roh-Formulardaten). Sensible Angaben nur verschlüsselt (siehe unten).
  const registration = {
    Vorname: pruefung.werte.vorname,
    Nachname: pruefung.werte.nachname,
    Fach: studiengang || null,
    Abschluss: abschluss || null,
    Semester: student === "Ja" ? String(semesterNumber) : "",
    "Uni/OTH": hochschultyp || null,
    "Sepa-Bestätigung": formData.get("sepa") === "on" || formData.get("sepa") === "true",
    // Der letzte Schritt lautet „Mit der Registrierung akzeptierst du die Vereinssatzung“.
    "Vereinsatzung-Bestätigung": true,
  };
  // Normalisierte Werte der Regeln (E.164, IBAN ohne Leerzeichen, PLZ ohne Länderpräfix, Land).
  const sensitive: Partial<MemberSecretValues> = pruefung.aenderungen;

  // Am Konto (und damit im Session-Cookie) stehen nur die Namen. Alles andere geht unten in
  // pending_registrations und wird bei der E-Mail-Bestätigung ins Profil übernommen.
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: pruefung.werte.email,
    password,
    options: {
      ...(captcha.captchaToken ? { captchaToken: captcha.captchaToken } : {}),
      data: { Vorname: pruefung.werte.vorname, Nachname: pruefung.werte.nachname },
    },
  });

  if (signUpError) {
    console.error("registerAction:", signUpError.code ?? signUpError.status);
    return {
      error: authErrorMessage(
        signUpError,
        "Registrierung fehlgeschlagen. Bitte prüfe deine Angaben oder versuche es später erneut."
      ),
      saved,
    };
  }

  if (!authData.user) {
    return { error: "Registrierung fehlgeschlagen. Bitte erneut versuchen.", saved };
  }

  // Leere identities = Adresse ist schon registriert (Supabase verrät das nicht); dann nichts ablegen.
  if (authData.user.identities?.length) {
    const stored = await storePendingRegistration(authData.user.id, registration, sensitive);
    if (!stored) {
      return {
        error:
          "Dein Konto wurde angelegt, deine Angaben konnten aber nicht gespeichert werden. Bitte melde dich beim Vorstand.",
        saved,
      };
    }
  }

  if (!authData.session) {
    return {
      error: "",
      confirmationMessage:
        "Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse, bevor du dich anmeldest.",
    };
  }

  // Sofortige Session (E-Mail-Bestätigung aus): Zugang erst nach Freigabe durch den Vorstand,
  // falls das neue Profil als Antrag (Status applicant) angelegt wurde.
  const { data: newProfile } = await supabase
    .from("profiles")
    .select('"Status"')
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (isPendingProfile((newProfile ?? null) as Record<string, unknown> | null)) {
    await supabase.auth.signOut();
    return {
      error: "",
      confirmationMessage:
        "Registrierung erfolgreich. Der Vorstand prüft deinen Mitgliedsantrag; danach kannst du dich anmelden.",
    };
  }

  return { error: "", redirect: "/dashboard" };
}

/**
 * Prüfung eines Schritts bei „Weiter“ (öffentlich, ohne Anmeldung): nur prüfen, nichts speichern, nichts
 * loggen. Dieselben Regeln wie beim Absenden (die Handy-Typprüfung braucht die Metadaten auf dem Server).
 * Bremse je IP wie bei den anderen öffentlichen Actions; maßgeblich bleibt die Prüfung beim Absenden.
 */
export async function pruefeRegistrierungsSchritt(
  schritt: unknown,
  felder: unknown
): Promise<{ fehler: FeldFehler; error?: string }> {
  if (!istRegistrierungSchritt(schritt) || !felder || typeof felder !== "object") {
    return { fehler: {}, error: "Ungültige Anfrage." };
  }
  const allowed = await withinRateLimits([
    { scope: "register-step-ip", value: await clientIp(), max: 300, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { fehler: {}, error: RATE_LIMITED_MESSAGE };

  // Nur bekannte Schlüssel des Schritts übernehmen, nur Zeichenketten bis 300 Zeichen.
  const eingabe: Record<string, string> = {};
  const schluessel: readonly string[] = [...REGISTRIERUNG_SCHRITTE[schritt], ...(schritt === "contact" ? ["handyLand"] : [])];
  for (const key of schluessel) {
    if (!Object.prototype.hasOwnProperty.call(felder, key)) continue;
    const v = (felder as Record<string, unknown>)[key];
    if (typeof v === "string") eingabe[key] = v.slice(0, 300);
  }
  if (schritt === "contact") eingabe.handyLand = countryFromSelectValue(eingabe.handyLand || DEFAULT_COUNTRY) ?? (eingabe.handyLand ?? "");
  return { fehler: pruefeRegistrierungSchritt(schritt, eingabe) };
}

/** Verschlüsselung möglich (Master Key vorhanden und registriert)? */
async function canStoreRegistrationData(): Promise<boolean> {
  try {
    await assertKeyRegistered(createServiceClient());
    return true;
  } catch (err) {
    console.error("registerAction: Verschlüsselung prüfen", err instanceof Error ? err.message : "unbekannt");
    return false;
  }
}

/**
 * Registrierungsdaten bis zur E-Mail-Bestätigung in pending_registrations ablegen (nur Service Role;
 * die user_id stammt aus dem gerade erfolgten signUp, nicht aus dem Formular). Die sensiblen Felder nur
 * verschlüsselt (secrets); die Datenbank übernimmt sie bei der Bestätigung nach member_secrets.
 * Kein Rückfall auf Zusatzdaten am Konto (die stünden im Klartext im Session-Cookie).
 */
async function storePendingRegistration(
  userId: string,
  data: Record<string, unknown>,
  sensitive: Partial<MemberSecretValues>,
): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const secrets = await buildRegistrationSecrets(admin, userId, sensitive);
    if (!secrets) return false;
    const { error } = await admin.from("pending_registrations").upsert({ user_id: userId, data, secrets });
    if (error) {
      console.error("registerAction: pending_registrations", error.code);
      return false;
    }
    return true;
  } catch (err) {
    console.error("registerAction: storePendingRegistration", err instanceof Error ? err.message : "unbekannt");
    return false;
  }
}
