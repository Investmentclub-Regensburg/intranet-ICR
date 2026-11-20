/**
 * E-Mail-Adresse ändern: Stand der Bestätigung in beiden Postfächern (Fenster in Profil › Meine Daten).
 *
 * GoTrue schickt bei `double_confirm_changes` einen Link an die bisherige und einen an die neue Adresse; erst nach
 * beiden gilt die neue Adresse. Den Stand liefert die DB-Funktion `public.email_change_stand()` (nur Booleans und
 * eine Zahl, nur für das eigene Konto). Hier liegt nur reine Logik (ohne Supabase), damit sie testbar ist.
 */

/** Gültigkeit der Links in Sekunden (GOTRUE_MAILER_OTP_EXP im Stack, Vorgabe 3600). */
export const LINK_GUELTIG_SEKUNDEN = 3600;
/** Sendebremse von GoTrue in Sekunden (GOTRUE_SMTP_MAX_FREQUENCY im Stack: 20s). */
export const SENDE_ABSTAND_SEKUNDEN = 20;

/** Zeile von `email_change_stand()`. */
export type EmailChangeRow = {
  offen: boolean | null;
  alt_bestaetigt: boolean | null;
  neu_bestaetigt: boolean | null;
  gesendet_vor_sekunden: number | null;
};

export type EmailChangeStand = {
  /** Eine Änderung wartet auf Bestätigung (und ihre Links sind noch gültig). */
  offen: boolean;
  /** Link an die bisherige Adresse bestätigt. */
  alt: boolean;
  /** Link an die neue Adresse bestätigt. */
  neu: boolean;
  /** Bestätigte Postfächer (0 oder 1; nach dem zweiten ist die Änderung durch und `offen` false). */
  anzahl: 0 | 1;
  /** Sekunden, bis GoTrue wieder senden darf (0 = sofort). */
  erneutInSekunden: number;
};

export const KEINE_AENDERUNG: EmailChangeStand = { offen: false, alt: false, neu: false, anzahl: 0, erneutInSekunden: 0 };

/**
 * Stand aus der Zeile der DB-Funktion und der neuen Adresse (`user.new_email`). Abgelaufene Links zählen nicht
 * mehr als offene Änderung: GoTrue leert `email_change` dann nicht, die Links sind aber wertlos, und eine neue
 * Anfrage ersetzt die alte.
 */
export function emailChangeStand(row: EmailChangeRow | null | undefined, neueAdresse: string | null | undefined): EmailChangeStand {
  if (!row || row.offen !== true || !String(neueAdresse ?? "").trim()) return KEINE_AENDERUNG;
  const vor = typeof row.gesendet_vor_sekunden === "number" && Number.isFinite(row.gesendet_vor_sekunden)
    ? Math.max(0, Math.floor(row.gesendet_vor_sekunden))
    : null;
  if (vor !== null && vor > LINK_GUELTIG_SEKUNDEN) return KEINE_AENDERUNG;
  const alt = row.alt_bestaetigt === true;
  // Beide zugleich kann GoTrue nicht melden (nach dem zweiten Link ist die Änderung durch); falls doch, zählt
  // nur die bisherige Adresse, damit die Anzeige nie „2 von 2“ bei offener Änderung zeigt.
  const neu = !alt && row.neu_bestaetigt === true;
  return {
    offen: true,
    alt,
    neu,
    anzahl: alt || neu ? 1 : 0,
    erneutInSekunden: vor === null ? 0 : Math.max(0, SENDE_ABSTAND_SEKUNDEN - vor),
  };
}

/** Hinweis aus dem Link in der Mail (`/profile?email=…`, gesetzt von /auth/confirm). */
export type EmailHinweis = "bestaetigt" | "geaendert" | "fehler";

export function emailHinweisAusParam(wert: unknown): EmailHinweis | null {
  if (wert === "bestaetigt" || wert === "ausstehend") return "bestaetigt";
  if (wert === "geaendert") return "geaendert";
  if (wert === "fehler") return "fehler";
  return null;
}

/** Ansicht des Fensters: Eingabe der neuen Adresse, beide Postfächer, Erfolg oder ungültiger Link. */
export type FensterAnsicht = "eingabe" | "postfaecher" | "erfolg" | "fehler";

/** Mit welcher Ansicht das Fenster beim Laden des Profils aufgeht (null = zu). */
export function startAnsicht(hinweis: EmailHinweis | null, stand: EmailChangeStand): FensterAnsicht | null {
  if (hinweis === "geaendert") return stand.offen ? "postfaecher" : "erfolg";
  // Erster Link bestätigt, aber keine offene Änderung (z. B. Link eines anderen Kontos in diesem Browser): kein
  // Fenster, das einen falschen Stand zeigen würde.
  if (hinweis === "bestaetigt") return stand.offen ? "postfaecher" : null;
  if (hinweis === "fehler") return stand.offen ? "postfaecher" : "fehler";
  return null;
}

/** Postfach, dessen Haken sich beim Öffnen zeichnet (nur direkt nach dem Klick auf einen Link). */
export function geradeBestaetigt(hinweis: EmailHinweis | null, stand: EmailChangeStand): "alt" | "neu" | null {
  if (hinweis !== "bestaetigt" || !stand.offen) return null;
  if (stand.alt) return "alt";
  if (stand.neu) return "neu";
  return null;
}

/**
 * Neu bestätigtes Postfach zwischen zwei Ständen (Abfrage im offenen Fenster, z. B. Link am Handy geklickt).
 * Ein neuer Versand setzt beide zurück; dann gibt es nichts zu zeichnen.
 */
export function neuBestaetigt(vorher: EmailChangeStand, nachher: EmailChangeStand): "alt" | "neu" | null {
  if (!nachher.offen) return null;
  if (nachher.alt && !vorher.alt) return "alt";
  if (nachher.neu && !vorher.neu) return "neu";
  return null;
}

/**
 * Ziel nach dem Klick auf einen Bestätigungslink (`/auth/confirm?type=email_change`).
 * - zweiter Link: GoTrue liefert eine Sitzung → Erfolg im Profil
 * - erster Link, angemeldet → Profil mit Fenster „1 von 2“
 * - erster Link, nicht angemeldet → Anmeldung, danach dasselbe Fenster (`next` prüft die Login-Seite wie immer)
 * - Fehler (abgelaufen, schon benutzt): angemeldet ins Fenster mit Meldung, sonst wie bisher zur Anmeldung
 */
export function emailConfirmZiel({ ok, sitzung, angemeldet }: { ok: boolean; sitzung: boolean; angemeldet: boolean }): string {
  if (!ok) return angemeldet ? "/profile?email=fehler" : "/login?error=Invalid_or_expired_token";
  if (sitzung) return "/profile?email=geaendert";
  if (angemeldet) return "/profile?email=bestaetigt";
  return `/login?email=ausstehend&next=${encodeURIComponent("/profile?email=bestaetigt")}`;
}
