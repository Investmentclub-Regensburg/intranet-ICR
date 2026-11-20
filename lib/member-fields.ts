/**
 * Längengrenzen und Grundprüfung von Texten in Mitgliederangaben. Die Prüfung der Mitgliederdaten (Handy,
 * IBAN, BIC, Anschrift, Geburtsdatum, E-Mail) liegt seit dem Paket „Mitgliederdaten“ ausschließlich in
 * lib/member-rules.ts; hier bleiben nur die Bausteine, die die Regeln und die Studienangaben der
 * Registrierung nutzen.
 */
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

/** `null`, wenn der Text in Ordnung ist, sonst eine Fehlermeldung (Länge, Steuerzeichen, Formelanfang). */
export function checkText(value: string, label: string, max: number): string | null {
  if (value.length > max) return `${label} ist zu lang (max. ${max} Zeichen).`;
  if (CONTROL_CHARS.test(value)) return `${label} enthält ungültige Zeichen.`;
  if (FORMULA_START.test(value)) return `${label} darf nicht mit = + - oder @ beginnen.`;
  return null;
}

/**
 * Führendes Hochkomma (Excel-Altlast: „'+49 176 …“ markiert eine Zelle als Text), auch typografisch (’ ‘ ´ `):
 * harmlos, wird vor der Prüfung einer Handynummer entfernt (Klickrunde 20.11.2026). Nur am Anfang; ein
 * Hochkomma mitten in der Nummer bleibt ein Formatfehler. Rein, ohne Importe (Server und Browser).
 */
const HOCHKOMMA_AM_ANFANG = /^\s*['‘’´`]+/;

export function ohneHochkommaAmAnfang(text: string): string {
  return text.replace(HOCHKOMMA_AM_ANFANG, "");
}
