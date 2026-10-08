/**
 * Serverseitige Prüfung von Mitgliederangaben (Profil-Update, Registrierung).
 * Alle Funktionen liefern `null`, wenn der Wert in Ordnung ist, sonst eine Fehlermeldung.
 * Leere Werte prüfen die Aufrufer selbst (Pflichtfelder unterscheiden sich).
 */
import { validateBICFormat, validateIBAN } from "./iban";

export const FIELD_LIMITS = {
  name: 100,
  strasse: 100,
  hausnummer: 20,
  ort: 100,
  plz: 10,
  telefon: 30,
  studium: 150,
} as const;

// Steuerzeichen (inkl. Tab/Zeilenumbruch) haben in Stammdaten nichts zu suchen.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
// Zeichen, mit denen Tabellenprogramme eine Formel beginnen.
const FORMULA_START = /^[=+\-@]/;

const PLZ_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/;
const PHONE_RE = /^\+?[0-9 ()/-]{4,30}$/;
const DIAL_CODE_RE = /^\+[0-9]{1,4}$/;

export function checkText(value: string, label: string, max: number): string | null {
  if (value.length > max) return `${label} ist zu lang (max. ${max} Zeichen).`;
  if (CONTROL_CHARS.test(value)) return `${label} enthält ungültige Zeichen.`;
  if (FORMULA_START.test(value)) return `${label} darf nicht mit = + - oder @ beginnen.`;
  return null;
}

export function checkPlz(value: string): string | null {
  return PLZ_RE.test(value) ? null : "Bitte eine gültige PLZ angeben.";
}

export function checkPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "").length;
  return PHONE_RE.test(value) && digits >= 4 ? null : "Bitte eine gültige Handynummer angeben.";
}

export function checkDialCode(value: string): string | null {
  return DIAL_CODE_RE.test(value) ? null : "Bitte eine gültige Ländervorwahl wählen.";
}

/** IBAN ohne Leerzeichen, Großbuchstaben. */
export function checkIban(value: string): string | null {
  return validateIBAN(value) ? null : "Die IBAN ist ungültig.";
}

/** BIC ohne Leerzeichen, Großbuchstaben. */
export function checkBic(value: string): string | null {
  return validateBICFormat(value) ? null : "Die BIC ist ungültig (8 oder 11 Zeichen).";
}

/** Erste Fehlermeldung aus einer Liste von Prüfungen (null = alles in Ordnung). */
export function firstError(...results: (string | null)[]): string | null {
  return results.find((r) => r !== null) ?? null;
}
