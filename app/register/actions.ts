"use server";
import { createClient } from "@/utils/supabase/server";
import { validateIBAN, validateBICFormat } from "@/lib/iban";
import {
  FIELD_LIMITS,
  checkDialCode,
  checkPhone,
  checkPlz,
  checkText,
  firstError,
} from "@/lib/member-fields";
import { authErrorMessage, checkPasswordLength } from "@/lib/auth-messages";
import { isPendingProfile } from "@/lib/profile-status";

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

/**
 * Validiert Datum im ISO-Format YYYY-MM-DD (vom Date-Picker).
 */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

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

  if (!isValidDate(geburtstagRaw!)) {
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

  // Turnstile Bot-Schutz validieren (VOR signUp)
  const turnstileToken = formData.get("cf-turnstile-response") as string | null;
  if (!turnstileToken?.trim()) {
    return { error: "Bot-Schutz fehlgeschlagen. Bitte bestätige, dass du kein Bot bist.", saved };
  }

  const isLocalhostBypass =
    turnstileToken === "localhost-bypass" && process.env.NODE_ENV === "development";

  // Ist in Supabase Auth (Attack Protection) CAPTCHA mit Turnstile aktiviert, prüft Supabase
  // das Token selbst – dann wird es nur durchgereicht (Turnstile-Tokens sind einmalig gültig).
  // So greift der Bot-Schutz auch bei Registrierungen, die die App umgehen.
  const supabaseVerifiesCaptcha = process.env.SUPABASE_AUTH_CAPTCHA === "true";

  if (!isLocalhostBypass && !supabaseVerifiesCaptcha) {
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      return {
        error: "Registrierung ist aktuell nicht verfügbar. Bitte kontaktiere den Vorstand.",
        saved,
      };
    }

    try {
      const turnstileRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: turnstileToken,
        }),
      });

      const turnstileData = (await turnstileRes.json()) as { success?: boolean };
      if (!turnstileRes.ok || !turnstileData.success) {
        return { error: "Bot-Schutz fehlgeschlagen. Bitte versuche es erneut.", saved };
      }
    } catch {
      return {
        error: "Bot-Schutz konnte nicht geprüft werden. Bitte versuche es später erneut.",
        saved,
      };
    }
  }

  const supabase = await createClient();

  // options.data: Keys exakt wie vom SQL-Trigger erwartet (raw_user_meta_data->>'Vorname' etc.).
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: email!,
    password: password!,
    options: {
      ...(supabaseVerifiesCaptcha && !isLocalhostBypass ? { captchaToken: turnstileToken } : {}),
      // Geprüfte, getrimmte Werte übergeben (nicht die Roh-Formulardaten).
      data: {
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
      },
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
