/**
 * Passwortregel und neutrale Fehlermeldungen für Login, Registrierung und Passwort-Reset.
 * Rohe Fehlertexte von Supabase gehen nicht an den Browser (sie verraten z. B., ob ein
 * Konto existiert); erkannte Fälle bekommen eine verständliche deutsche Meldung.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function checkPasswordLength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
  }
  return null;
}

export const LOGIN_FAILED_MESSAGE =
  "Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen. Falls du dich gerade registriert hast, bestätige zuerst deine E-Mail-Adresse.";

type AuthErrorLike = { code?: string; status?: number } | null | undefined;

/** Meldung für Fehler beim Setzen/Ändern eines Passworts oder bei der Registrierung. */
export function authErrorMessage(error: AuthErrorLike, fallback: string): string {
  switch (error?.code) {
    case "weak_password":
      return "Das Passwort ist zu schwach. Bitte ein längeres, schwer zu erratendes Passwort wählen.";
    case "same_password":
      return "Das neue Passwort muss sich vom bisherigen unterscheiden.";
    case "email_address_invalid":
      return "Bitte eine gültige E-Mail-Adresse angeben.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Zu viele Versuche. Bitte warte einen Moment und versuche es dann erneut.";
    default:
      if (error?.status === 429) {
        return "Zu viele Versuche. Bitte warte einen Moment und versuche es dann erneut.";
      }
      return fallback;
  }
}
