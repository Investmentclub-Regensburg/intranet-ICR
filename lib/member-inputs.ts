/**
 * Reine Eingabehilfen für die Mitgliederformulare (Browser und Server, ohne React): Formatieren beim Tippen
 * mit Cursor-Regel, BIC-Länderhinweis, Ziffern-Tastatur für die PLZ. ENTSCHEIDET NICHTS – gültig ist nur,
 * was lib/member-rules.ts auf dem Server sagt. Nur lib/member-rules-client.ts und lib/iban.ts importieren
 * (keine `max`-Metadaten, kein node:crypto).
 */
import { formatiereHandyEingabe, ibanInViererbloecken } from "./member-rules-client";
import { validateBICFormat, validateIBAN } from "./iban";

export type HandyWert = { land: string; nummer: string };

/**
 * Handy beim Tippen: formatiert (AsYouType über `formatiereHandyEingabe`), solange der Cursor am Ende steht
 * und nicht gelöscht wird. Steht der Cursor mittendrin oder wird gelöscht, bleibt die Eingabe roh (sonst
 * spränge der Cursor bzw. ließe sich ein Leerzeichen nicht löschen); formatiert wird dann beim Verlassen.
 */
export function handyBeimTippen(roh: string, land: string, cursorAmEnde: boolean, loeschen: boolean): HandyWert {
  if (!cursorAmEnde || loeschen) return { land, nummer: roh };
  return formatiereHandyEingabe(roh, land);
}

/**
 * Handy beim Verlassen des Felds: nur formatieren, wenn die Person die Nummer oder das Land in dieser
 * Bearbeitung selbst geändert hat. Ein bloßer Fokus ändert nichts (eine gespeicherte Altnummer bleibt Zeichen
 * für Zeichen stehen und gilt dann als unverändert, Regeln für Aufrufer Punkt 1).
 */
export function handyBeimVerlassen(wert: HandyWert, bearbeitet: boolean): HandyWert {
  return bearbeitet ? formatiereHandyEingabe(wert.nummer, wert.land) : wert;
}

/** Gleiche Handy-Eingabe nach Formatierung (Land + Nummer)? Für „hat sich die Nummer geändert?“. */
export function gleicheHandyEingabe(a: HandyWert, b: HandyWert): boolean {
  const fa = formatiereHandyEingabe(a.nummer.trim(), a.land.trim().toUpperCase());
  const fb = formatiereHandyEingabe(b.nummer.trim(), b.land.trim().toUpperCase());
  return fa.land === fb.land && fa.nummer.trim() === fb.nummer.trim();
}

/**
 * IBAN beim Tippen: Viererblöcke, solange der Cursor am Ende steht; sonst roh (formatiert wird beim
 * Verlassen). `cursor` = Position nach der Formatierung (gleiches Zeichen wie vorher).
 */
export function ibanBeimTippen(roh: string, cursor: number): { wert: string; cursor: number } {
  if (cursor < roh.length) return { wert: roh, cursor };
  const wert = ibanInViererbloecken(roh);
  return { wert, cursor: wert.length };
}

/**
 * BIC-Länder, die zu einem IBAN-Land gehören, obwohl der Code abweicht (wie lib/member-rules.ts
 * `BIC_LAENDER_ZU_IBAN`; ein Test hält beide gleich).
 */
const BIC_LAENDER_ZU_IBAN: Readonly<Record<string, readonly string[]>> = {
  GB: ["GB", "JE", "GG", "IM"],
  FR: ["FR", "GF", "GP", "MQ", "RE", "YT", "PM", "BL", "MF", "NC", "PF", "WF"],
  FI: ["FI", "AX"],
};

/** Nicht blockierender Hinweis, wenn das BIC-Land (Stellen 5–6) nicht zum Land einer gültigen IBAN passt. */
export function bicLandHinweis(iban: string, bic: string): string | null {
  const i = iban.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const b = bic.toUpperCase().replace(/\s/g, "");
  if (!i || !b || !validateIBAN(i) || !validateBICFormat(b)) return null;
  const ibanLand = i.slice(0, 2);
  const erlaubt = BIC_LAENDER_ZU_IBAN[ibanLand] ?? [ibanLand];
  return erlaubt.includes(b.slice(4, 6)) ? null : "Die BIC gehört zu einem anderen Land als die IBAN.";
}

/** Länder, deren PLZ nur aus Ziffern besteht (ggf. mit optionalem Leerzeichen): Ziffern-Tastatur am Handy. */
const PLZ_NUR_ZIFFERN = new Set([
  "DE", "AT", "CH", "LI", "LU", "BE", "DK", "NO", "SE", "FI", "IS", "FR", "MC", "IT", "SM", "ES", "CZ", "SK",
  "HU", "SI", "HR", "RO", "BG", "GR", "CY", "EE", "LV", "LT",
]);

/** `inputMode` fürs PLZ-Feld: Ziffern-Tastatur bei rein numerischen PLZ, sonst Text. */
export function plzInputMode(land: string | null | undefined): "numeric" | "text" {
  return PLZ_NUR_ZIFFERN.has(String(land ?? "").toUpperCase() || "DE") ? "numeric" : "text";
}
