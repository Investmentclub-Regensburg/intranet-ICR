/**
 * IBAN- und BIC-Validierung (Format + Prüfsumme).
 * Bewusst ohne Abhängigkeiten: wird auch im Browser (Registrierung) und aus Node-Skripten geladen.
 *
 * Länderliste = SEPA-Raum laut „EPC List of SEPA Scheme Countries“ (EPC409-09 v8.0, 24.12.2025):
 * 27 EU-Staaten, Island, Liechtenstein, Norwegen, Schweiz, Vereinigtes Königreich, Monaco, San Marino,
 * Andorra, Vatikanstadt, Albanien, Montenegro, Moldau, Nordmazedonien, Serbien (41 Länder) sowie
 * Gibraltar mit eigenem IBAN-Präfix „GI“. Gebiete ohne eigenes Präfix nutzen das des Mutterlands
 * (z. B. Jersey/Guernsey/Isle of Man → GB, französische Überseegebiete → FR, Åland → FI).
 * Längen laut SWIFT „IBAN Registry“ (Release 99, Dezember 2024), am 18.11.2026 gegen die Tabelle der
 * IBAN-Formate (Wikipedia, zitiert dasselbe Register) abgeglichen.
 */
export const SEPA_IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, // Andorra
  AL: 28, // Albanien
  AT: 20, // Österreich
  BE: 16, // Belgien
  BG: 22, // Bulgarien
  CH: 21, // Schweiz
  CY: 28, // Zypern
  CZ: 24, // Tschechien
  DE: 22, // Deutschland
  DK: 18, // Dänemark
  EE: 20, // Estland
  ES: 24, // Spanien
  FI: 18, // Finnland (inkl. Åland)
  FR: 27, // Frankreich (inkl. Überseegebiete)
  GB: 22, // Vereinigtes Königreich (inkl. Jersey, Guernsey, Isle of Man)
  GI: 23, // Gibraltar
  GR: 27, // Griechenland
  HR: 21, // Kroatien
  HU: 28, // Ungarn
  IE: 22, // Irland
  IS: 26, // Island
  IT: 27, // Italien
  LI: 21, // Liechtenstein
  LT: 20, // Litauen
  LU: 20, // Luxemburg
  LV: 21, // Lettland
  MC: 27, // Monaco
  MD: 24, // Moldau
  ME: 22, // Montenegro
  MK: 19, // Nordmazedonien
  MT: 31, // Malta
  NL: 18, // Niederlande
  NO: 15, // Norwegen
  PL: 28, // Polen
  PT: 25, // Portugal
  RO: 24, // Rumänien
  RS: 22, // Serbien
  SE: 24, // Schweden
  SI: 19, // Slowenien
  SK: 24, // Slowakei
  SM: 27, // San Marino
  VA: 22, // Vatikanstadt
};

/** Ergebnis der ausführlichen IBAN-Prüfung (Codes stabil, siehe lib/member-rules.ts). */
export type IbanCheck = "ok" | "format" | "nicht_sepa" | "laenge" | "pruefziffer";

/**
 * Berechnet mod 97 für große Zahlen (IBAN-Checksumme).
 * Verarbeitet zeichenweise, um BigInt/Überlauf zu vermeiden.
 */
function mod97(str: string): number {
  let remainder = 0;
  for (let i = 0; i < str.length; i++) {
    remainder = (remainder * 10 + parseInt(str[i], 10)) % 97;
  }
  return remainder;
}

/** Prüfsumme mod 97 einer bereits bereinigten IBAN (Großbuchstaben, ohne Leerzeichen). */
export function ibanChecksumValid(cleaned: string): boolean {
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  return mod97(numeric) === 1;
}

/** Liegt das Land (ISO-Code) im SEPA-Raum? */
export function isSepaIbanCountry(country: string): boolean {
  return Object.prototype.hasOwnProperty.call(SEPA_IBAN_LENGTHS, country);
}

/**
 * Ausführliche Prüfung für Mitgliederdaten: nur SEPA-Länder, Länge je Land, Prüfsumme.
 * Erwartet die normalisierte IBAN (`normalizeIban` aus lib/member-crypto).
 */
export function checkSepaIban(cleaned: string): IbanCheck {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(cleaned)) return "format";
  const country = cleaned.slice(0, 2);
  if (!isSepaIbanCountry(country)) return "nicht_sepa";
  if (cleaned.length !== SEPA_IBAN_LENGTHS[country]) return "laenge";
  return ibanChecksumValid(cleaned) ? "ok" : "pruefziffer";
}

/**
 * Validiert IBAN (Format + Prüfsumme). Länder außerhalb des SEPA-Raums werden wie bisher ohne
 * Längenprüfung angenommen (Finanzexport, Registrierung); für Mitgliederdaten gilt `checkSepaIban`.
 */
export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
    return false;
  }

  const expectedLength = SEPA_IBAN_LENGTHS[cleaned.slice(0, 2)];
  if (expectedLength && cleaned.length !== expectedLength) {
    return false;
  }

  return ibanChecksumValid(cleaned);
}

/**
 * Validiert BIC-Format (8 oder 11 Zeichen, alphanumerisch).
 */
export function validateBICFormat(bic: string): boolean {
  const cleaned = bic.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned);
}
