/**
 * CSV-Ausgabe für Exporte (BVH-Mitglieder, SEPA-CSV).
 *
 * 1. Formel-Schutz: Zellen, die mit = + - @ Tab oder CR beginnen, werden von
 *    Tabellenprogrammen als Formel interpretiert. Solche Zellen bekommen ein
 *    führendes Apostroph – außer es handelt sich um reine Zahlen-/Telefonangaben
 *    wie "+49 170 1234567" oder "-12,50" (die können keine Formel enthalten).
 * 2. Quoting nach RFC 4180 (Trennzeichen, Anführungszeichen, Zeilenumbrüche).
 */

const FORMULA_START = /^[=+\-@\t\r]/;
// Nur Ziffern, Leerzeichen und ( ) . , / - nach optionalem Vorzeichen – z. B. Telefonnummern, Beträge.
const NUMERIC_LIKE = /^[+-]?\d[\d ()./,-]*$/;

export function neutralizeFormula(value: string): string {
  if (FORMULA_START.test(value) && !NUMERIC_LIKE.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(value: unknown, delimiter = ","): string {
  const s = neutralizeFormula(value == null ? "" : String(value));
  if (s.includes('"') || s.includes(delimiter) || /[\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function joinCsvRow(fields: unknown[], delimiter = ","): string {
  return fields.map((f) => escapeCsvCell(f, delimiter)).join(delimiter);
}
