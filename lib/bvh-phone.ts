/**
 * Telefonnummer für den BVH-Mitglieder-Upload (Spalte phone).
 *
 * Die Spalte beim BVH fasst nur 15 Zeichen. Ist eine Nummer länger, bricht der ganze Upload ab
 * („String or binary data would be truncated … column 'phone'“). Bei uns steht die Nummer meist als
 * „+49 176 12345678“ (Vorwahl + Leerzeichen + Eingabe) und ist damit oft 16 Zeichen lang.
 */
export const BVH_PHONE_MAX_LENGTH = 15;

/**
 * Nur Ziffern, ein führendes + bleibt (00 am Anfang wird zu +). Nach +49 entfällt die 0 der Vorwahl
 * („+49 (0)941 …“, „+49 0176 …“); andere Länder bleiben unverändert (in Italien gehört die 0 zur Nummer).
 * Ist die Nummer danach noch zu lang, bleibt das Feld leer: Telefon ist beim BVH optional.
 */
export function formatBvhPhone(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  let digits = value.replace(/\D/g, "");
  const international = value.startsWith("+") || digits.startsWith("00");
  if (international) digits = digits.replace(/^00/, "").replace(/^490+/, "49");
  if (!digits) return "";
  const phone = international ? `+${digits}` : digits;
  return phone.length <= BVH_PHONE_MAX_LENGTH ? phone : "";
}
