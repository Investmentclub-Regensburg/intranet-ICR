/** Datum im Format YYYY-MM-DD (für SEPA-Felder wie DtOfSgntr), sonst Fallback. */
export function sepaDate(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function sanitizeForSEPA(text: string | null | undefined): string {
  if (!text) return "";

  let sanitized = text
    // 1. Deutsche Umlaute sicher umwandeln
    .replace(/Ä/g, "Ae")
    .replace(/ä/g, "ae")
    .replace(/Ö/g, "Oe")
    .replace(/ö/g, "oe")
    .replace(/Ü/g, "Ue")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  // 2. Akzente (é, à, ô etc.) radikal entfernen
  sanitized = sanitized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3. Alles löschen, was nicht dem offiziellen SEPA-Zeichensatz entspricht
  // Erlaubt sind A-Z, a-z, 0-9, Leerzeichen und / - ? : ( ) . , ' +
  sanitized = sanitized.replace(/[^a-zA-Z0-9 \/\-\?\:\(\)\.,'\+]/g, " ");

  // 4. Doppelte Leerzeichen, die durch das Löschen entstanden sind, bereinigen
  return sanitized.replace(/\s+/g, " ").trim();
}

/**
 * Strikte Namensbereinigung für bankseitig sensible Felder.
 * Entfernt zusätzlich Bindestriche und Apostrophe.
 */
export function sanitizeNameForBank(text: string | null | undefined): string {
  return sanitizeForSEPA(text).replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Erzeugt konservative Kennungen (A-Z, 0-9) mit fixer Maximallänge.
 */
export function buildSepaIdentifier(
  text: string | null | undefined,
  maxLength = 35
): string {
  const safe = sanitizeForSEPA(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return safe.slice(0, maxLength);
}

/**
 * Erzeugt rein numerische Kennungen mit fixer Maximallänge.
 */
export function buildNumericIdentifier(
  text: string | null | undefined,
  maxLength = 35
): string {
  const safe = (text ?? "").replace(/\D/g, "");
  return safe.slice(0, maxLength);
}

/**
 * Escaped XML-Sonderzeichen in dynamischen Inhalten und entfernt Zeichen,
 * die in XML 1.0 nicht erlaubt sind (Steuerzeichen außer Tab/LF/CR).
 */
export function escapeXml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

