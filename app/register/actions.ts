"use server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { assertKeyRegistered, buildRegistrationSecrets } from "@/lib/member-secrets-server";
import { plainClearedAt } from "@/lib/member-secrets-backfill";
import { validateIBAN, validateBICFormat } from "@/lib/iban";
import {
  FIELD_LIMITS,
  checkBirthDate,
  checkDialCode,
  checkPhone,
  checkPlz,
  checkText,
  firstError,
} from "@/lib/member-fields";
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
  redirect?: string;
  saved?: RegisterSavedState;
  confirmationMessage?: string;
};

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const passwordRepeat = formData.get("passwordRepeat") as string;
  const vorname = (formData.get("vorname") as string)?.trim();
  const nachname = (formData.get("nachname") as string)?.trim();
  const geburtstagRaw = (formData.get("geburtstag") as string)?.trim();
  const strasse = (formData.get("strasse") as string)?.trim();
  const hausnummer = (formData.get("hausnummer") as string)?.trim();
  const ort = (formData.get("ort") as string)?.trim();
  const plz = (formData.get("plz") as string)?.trim();
  const landesvorwahl = (formData.get("landesvorwahl") as string)?.trim() || "+49";
  const handynummerRaw = (formData.get("handynummer") as string)?.trim();
  const handynummer = handynummerRaw
    ? `${landesvorwahl} ${handynummerRaw}`.trim()
    : "";
  const student = formData.get("student") as string;
  const studiengang = (formData.get("studiengang") as string)?.trim();
  const abschluss = (formData.get("abschluss") as string)?.trim();
  const semester = (formData.get("semester") as string)?.trim();
  const iban = (formData.get("iban") as string)?.trim();
  const bic = (formData.get("bic") as string)?.trim();
  const hochschultyp = formData.get("hochschultyp") as string;
  const sepa = formData.get("sepa") === "on";

  /** Bei Fehler zurückgeben, damit die Eingaben im Formular erhalten bleiben (keine Passwörter). */
  const saved: RegisterSavedState = {
    vorname: vorname ?? "",
    nachname: nachname ?? "",
    email: email ?? "",
    geburtstag: geburtstagRaw ?? "",
    strasse: strasse ?? "",
    hausnummer: hausnummer ?? "",
    ort: ort ?? "",
    plz: plz ?? "",
    landesvorwahl: landesvorwahl ?? "+49",
    handynummer: handynummerRaw ?? "",
    student: student ?? "",
    studiengang: studiengang ?? "",
    abschluss: abschluss ?? "",
    semester: semester ?? "",
    iban: iban ?? "",
    bic: bic ?? "",
    hochschultyp: hochschultyp ?? "",
    sepa,
  };

  // Validierung Pflichtfelder
  const required: Record<string, unknown> = {
    email,
    password,
    passwordRepeat,
    vorname,
    nachname,
    geburtstag: geburtstagRaw,
    strasse,
    hausnummer,
    ort,
    plz,
    handynummer: handynummerRaw,
    student,
    iban,
    bic,
  };

  // Studiendaten sind nur Pflicht, wenn "Student = Ja"
  if (student === "Ja") {
    required.studiengang = studiengang;
    required.abschluss = abschluss;
    required.semester = semester;
    required.hochschultyp = hochschultyp;
  }
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    return { error: "Bitte alle Pflichtfelder ausfüllen.", saved };
  }

  if (!sepa) {
    return { error: "Die SEPA-Bestätigung ist erforderlich.", saved };
  }

  // Format und Länge der Angaben prüfen (gleiche Regeln wie im Profil).
  const fieldError = firstError(
    email!.length > 254 ? "Die E-Mail-Adresse ist zu lang." : null,
    checkText(vorname!, "Vorname", FIELD_LIMITS.name),
    checkText(nachname!, "Nachname", FIELD_LIMITS.name),
    checkText(strasse!, "Straße", FIELD_LIMITS.strasse),
    checkText(hausnummer!, "Hausnummer", FIELD_LIMITS.hausnummer),
    checkText(ort!, "Ort", FIELD_LIMITS.ort),
    checkPlz(plz!),
    checkDialCode(landesvorwahl),
    checkPhone(handynummerRaw!),
    checkText(studiengang ?? "", "Studiengang", FIELD_LIMITS.studium),
    checkText(abschluss ?? "", "Abschluss", FIELD_LIMITS.studium),
    checkText(hochschultyp ?? "", "Hochschulart", FIELD_LIMITS.studium)
  );
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

  if (checkBirthDate(geburtstagRaw!)) {
    return { error: "Bitte wähle ein gültiges Geburtsdatum im Picker aus.", saved };
  }

  const semesterNumber = Number(semester);
  if (
    student === "Ja" &&
    (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 99)
  ) {
    return { error: "Bitte gib ein gültiges Semester als Zahl ein.", saved };
  }

  const ibanClean = iban!.replace(/\s/g, "");
  const bicClean = bic!.replace(/\s/g, "");

  if (!validateIBAN(ibanClean)) {
    return { error: "Die IBAN ist ungültig.", saved };
  }

  if (!validateBICFormat(bicClean)) {
    return { error: "Die BIC ist ungültig (8 oder 11 Zeichen).", saved };
  }

  // Bremse gegen Massen-Registrierungen je IP, dann Turnstile (VOR signUp).
  const allowed = await withinRateLimits([
    { scope: "signup-ip", value: await clientIp(), max: 5, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { error: RATE_LIMITED_MESSAGE, saved };

  const captcha = await checkTurnstile(formData);
  if (!captcha.ok) return { error: captcha.error, saved };

  // Nach dem Abschluss der Verschlüsselung nimmt die Datenbank Registrierungsdaten nur noch verschlüsselt an.
  // Deshalb VOR dem Anlegen des Kontos prüfen, dass verschlüsselt werden kann – sonst entstünde ein Konto
  // ohne Angaben.
  if (!(await canStoreRegistrationData())) {
    return {
      error: "Die Registrierung ist gerade nicht möglich. Bitte versuche es später erneut oder melde dich beim Vorstand.",
      saved,
    };
  }

  const supabase = await createClient();

  // Keys exakt wie vom SQL-Trigger erwartet (provision_profile_for_auth_user). Geprüfte, getrimmte
  // Werte übergeben (nicht die Roh-Formulardaten).
  const registration = {
    Vorname: vorname,
    Nachname: nachname,
    Geburtsdatum: geburtstagRaw,
    "Straße": strasse,
    Hausnr: hausnummer,
    Ort: ort,
    PLZ: plz,
    Handynummer: handynummer, // Vorwahl + Nummer (bereits aus formData zusammengesetzt)
    Fach: studiengang || null,
    Abschluss: abschluss || null,
    Semester: student === "Ja" ? String(semesterNumber) : "",
    "Uni/OTH": hochschultyp || null,
    IBAN: ibanClean,
    BIC: bicClean,
    "Sepa-Bestätigung": formData.get("sepa") === "on" || formData.get("sepa") === "true",
    // Der letzte Schritt lautet „Mit der Registrierung akzeptierst du die Vereinssatzung“.
    "Vereinsatzung-Bestätigung": true,
  };

  // Am Konto (und damit im Session-Cookie) stehen nur die Namen. Alles andere geht unten in
  // pending_registrations und wird bei der E-Mail-Bestätigung ins Profil übernommen.
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: email!,
    password: password!,
    options: {
      ...(captcha.captchaToken ? { captchaToken: captcha.captchaToken } : {}),
      data: { Vorname: vorname, Nachname: nachname },
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
    const stored = await storePendingRegistration(authData.user.id, registration);
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

/** Verschlüsselung möglich – oder (Übergangsphase, Klartext noch erlaubt) nicht nötig. */
async function canStoreRegistrationData(): Promise<boolean> {
  try {
    const admin = createServiceClient();
    try {
      await assertKeyRegistered(admin);
      return true;
    } catch {
      return !(await plainClearedAt(admin));
    }
  } catch (err) {
    console.error("registerAction: Verschlüsselung prüfen", err instanceof Error ? err.message : "unbekannt");
    return false;
  }
}

/**
 * Registrierungsdaten bis zur E-Mail-Bestätigung in pending_registrations ablegen (nur Service Role;
 * die user_id stammt aus dem gerade erfolgten signUp, nicht aus dem Formular). Die sensiblen Felder
 * zusätzlich verschlüsselt (secrets); die Datenbank übernimmt sie bei der Bestätigung nach member_secrets.
 * Kein Rückfall mehr auf Zusatzdaten am Konto (die stünden im Klartext im Session-Cookie).
 */
async function storePendingRegistration(userId: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : null);
    const secrets = await buildRegistrationSecrets(admin, userId, {
      iban: text("IBAN"),
      bic: text("BIC"),
      geburtsdatum: text("Geburtsdatum"),
      strasse: text("Straße"),
      hausnummer: text("Hausnr"),
      plz: text("PLZ"),
      ort: text("Ort"),
      handynummer: text("Handynummer"),
    });
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
